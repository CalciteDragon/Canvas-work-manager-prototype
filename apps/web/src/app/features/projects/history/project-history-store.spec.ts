import { TestBed } from '@angular/core/testing';
import type {
  OperationActionId,
  OperationHistoryEntry,
  OperationHistoryId,
  OperationHistoryRefusalDetails,
  OperationHistorySummary,
  OperationHistoryTransitionResult,
  OperationReceipt,
  Project,
  ProjectId,
} from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import type { OperationWriteReport } from '../../../core/history/operation-history-reporter';
import { ProjectHistoryStore } from './project-history-store';

const ROOT = 'project-renovation' as ProjectId;
const KITCHEN = 'project-kitchen' as ProjectId;
const OTHER = 'project-other' as ProjectId;
const HISTORY = 'history-root' as OperationHistoryId;
const KITCHEN_HISTORY = 'history-kitchen' as OperationHistoryId;
const expiresAt = '2026-09-23T10:00:00.000Z';

const entry = (id: string, label: string, blockedBy: OperationHistoryEntry['blockedBy'] = null): OperationHistoryEntry => ({
  actionId: id as OperationActionId, operation: 'section.update', label, expiresAt, blockedBy,
});
const summaryOf = (overrides: Partial<OperationHistorySummary> = {}): OperationHistorySummary => ({
  projectId: ROOT, historyId: HISTORY, revision: 3, undo: entry('operation-3', 'Resized the Notes section'), redo: null, blockedBy: null, ...overrides,
});
const empty = (projectId = ROOT): OperationHistorySummary => ({ projectId, historyId: null, revision: 0, undo: null, redo: null, blockedBy: null });
const receipt = (historyId: OperationHistoryId, revision: number, label = 'Completed "Tile"'): OperationReceipt => ({
  historyId, actionId: `operation-${revision}` as OperationActionId, operation: 'task.update', revision, label, createdAt: expiresAt, expiresAt,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

/** A store over a summary route that answers each request only when the test says so. */
const setup = () => {
  const gateway = new FakeWorkManagerGateway({
    projects: [{ id: KITCHEN, name: 'Kitchen' } as Project],
  });
  const reads: Array<ReturnType<typeof deferred<OperationHistorySummary>> & { projectId: ProjectId }> = [];
  const summary = vi.fn((projectId: ProjectId) => {
    const read = { ...deferred<OperationHistorySummary>(), projectId };
    reads.push(read);
    return read.promise;
  });
  gateway.history.summary = summary;
  const transitions: Array<ReturnType<typeof deferred<OperationHistoryTransitionResult>>> = [];
  const transition = vi.fn(() => {
    const next = deferred<OperationHistoryTransitionResult>();
    transitions.push(next);
    return next.promise;
  });
  gateway.history.transition = transition;
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [ProjectHistoryStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }, { provide: LIVE_UPDATES, useValue: live }],
  });
  const store = TestBed.inject(ProjectHistoryStore);
  /** Answers the oldest unanswered read. */
  const answer = async (value: OperationHistorySummary | Error) => {
    const read = reads.find((candidate) => !(candidate as { done?: boolean }).done)!;
    (read as { done?: boolean }).done = true;
    if (value instanceof Error) read.reject(value); else read.resolve(value);
    await flush();
  };
  const pending = () => reads.filter((read) => !(read as { done?: boolean }).done).length;
  return { gateway, store, live, summary, transition, transitions, answer, pending, reads };
};

/** One whole write that committed `report`: begin, commit, end. */
const commit = (store: ProjectHistoryStore, report: OperationWriteReport) => {
  const write = store.begin();
  write.committed(report);
  write.end();
};

const refusal = (details: OperationHistoryRefusalDetails) => new GatewayError('rule_violation', 409, `${details.reason}: refused`, details);

afterEach(() => TestBed.resetTestingModule());

describe('ProjectHistoryStore — reading the summary', () => {
  it('is loading until the first read, then ready with the entry’s label', async () => {
    const { store, answer } = setup();
    store.load(ROOT);
    expect(store.undoControl()).toEqual({ name: 'Loading history…', enabled: false });
    expect(store.redoControl()).toEqual({ name: 'Loading history…', enabled: false });
    await answer(summaryOf());
    expect(store.undoControl()).toEqual({ name: 'Undo: Resized the Notes section', enabled: true });
    expect(store.redoControl()).toEqual({ name: 'Nothing to redo', enabled: false });
  });

  it('a failed read is unavailable with a Retry that re-reads', async () => {
    const { store, answer, summary } = setup();
    store.load(ROOT);
    await answer(new GatewayError('unreachable', 0, 'down'));
    expect(store.undoControl().name).toBe('History unavailable');
    expect(store.retryAvailable()).toBe(true);
    store.retry();
    expect(store.undoControl().name).toBe('Loading history…');
    expect(summary).toHaveBeenCalledTimes(2);
    await answer(summaryOf());
    expect(store.undoControl().enabled).toBe(true);
  });

  it('drops a read from an earlier project and a lower revision of the same history', async () => {
    const { store, answer, live } = setup();
    store.load(OTHER);
    store.load(ROOT);
    await answer(summaryOf({ projectId: OTHER, undo: entry('operation-9', 'Other project') }));
    expect(store.undoControl().name).toBe('Loading history…');
    await answer(summaryOf({ revision: 5, undo: entry('operation-5', 'Newest') }));
    live.emit({ type: 'project.section_updated', entityId: ROOT, projectId: ROOT });
    await answer(summaryOf({ revision: 4, undo: entry('operation-4', 'Older') }));
    expect(store.undoControl().name).toBe('Undo: Newest');
  });

  it('re-reads on a frame for this project, any project-record frame, a reload and a reconnect, coalesced', async () => {
    const { store, answer, live, summary, pending } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    live.emit({ type: 'task.task_updated', entityId: 'task-1', projectId: KITCHEN, rootProjectId: ROOT });
    expect(summary).toHaveBeenCalledTimes(1);

    live.emit({ type: 'task.task_updated', entityId: 'task-1', projectId: ROOT, rootProjectId: ROOT });
    live.emit({ type: 'project.archived', entityType: 'project', entityId: OTHER, projectId: OTHER, rootProjectId: OTHER });
    live.emitConnected();
    // One in flight, one queued, however many frames arrive.
    expect(summary).toHaveBeenCalledTimes(2);
    await answer(summaryOf());
    expect(summary).toHaveBeenCalledTimes(3);
    await answer(summaryOf());
    expect(pending()).toBe(0);

    live.emit({ type: 'prototype.reloaded', entityId: 'workspace' });
    expect(store.undoControl().name).toBe('Loading history…');
    expect(summary).toHaveBeenCalledTimes(4);
  });
});

describe('ProjectHistoryStore — reports and pending', () => {
  it('a same-history report re-reads and stays pending until a later read reaches its revision', async () => {
    const { store, answer, summary } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    const write = store.begin();
    expect(store.undoControl().name).toBe('Saving a change…');
    write.committed({ projectId: ROOT, receipt: receipt(HISTORY, 4) });
    write.end();
    expect(store.undoControl().name).toBe('Saving a change…');
    expect(summary).toHaveBeenCalledTimes(2);
    // A read at the old revision does not satisfy the receipt; the store asks again.
    await answer(summaryOf());
    expect(store.writePending()).toBe(true);
    expect(summary).toHaveBeenCalledTimes(3);
    await answer(summaryOf({ revision: 4, undo: entry('operation-4', 'Completed "Tile"') }));
    expect(store.undoControl()).toEqual({ name: 'Undo: Completed "Tile"', enabled: true });
  });

  it('a read that was in flight before the commit does not end pending or misfile a first write', async () => {
    const { store, answer, live, summary } = setup();
    store.load(ROOT);
    await answer(empty());
    live.emit({ type: 'task.task_updated', entityId: 'task-1', projectId: ROOT });
    commit(store, { projectId: ROOT, receipt: receipt(HISTORY, 1) });
    // The frame's read started before the commit, and answers the pre-write, empty history.
    await answer(empty());
    expect(store.writePending()).toBe(true);
    expect(store.feedback()).toBeNull();
    expect(summary).toHaveBeenCalledTimes(3);
    await answer(summaryOf({ revision: 1, undo: entry('operation-1', 'Completed "Tile"') }));
    expect(store.writePending()).toBe(false);
    expect(store.feedback()).toBeNull();
    expect(store.undoControl().name).toBe('Undo: Completed "Tile"');
  });

  it('with no held history, a report whose fresh summary names another history is cross-owner', async () => {
    const { store, answer } = setup();
    store.load(ROOT);
    // Still loading: the report is treated like a null held history.
    commit(store, { projectId: KITCHEN, receipt: receipt(KITCHEN_HISTORY, 1) });
    await answer(empty());
    await answer(empty());
    await Promise.resolve();
    expect(store.writePending()).toBe(false);
    expect(store.feedback()).toEqual({
      tone: 'status',
      message: 'Completed "Tile" was recorded in Kitchen’s history.',
      link: { projectId: KITCHEN, label: 'Open Kitchen' },
    });
    expect(store.undoControl().name).toBe('Nothing to undo');
  });

  it('a report naming a different, known history is cross-owner at once, without a read', async () => {
    const { store, answer, summary } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    commit(store, { projectId: KITCHEN, projectName: 'Kitchen', receipt: receipt(KITCHEN_HISTORY, 7) });
    expect(summary).toHaveBeenCalledTimes(1);
    expect(store.feedback()?.link).toEqual({ projectId: KITCHEN, label: 'Open Kitchen' });
    expect(store.undoControl().name).toBe('Undo: Resized the Notes section');
  });

  it('a null receipt owes nothing; a write that ends without a commit owes a read', async () => {
    const { store, answer, summary } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    commit(store, { projectId: ROOT, receipt: null });
    expect(summary).toHaveBeenCalledTimes(1);
    expect(store.writePending()).toBe(false);

    store.begin().end();
    expect(summary).toHaveBeenCalledTimes(2);
    expect(store.writePending()).toBe(true);
    await answer(summaryOf());
    expect(store.writePending()).toBe(false);
  });

  it('an end from before navigation does not unblock the new project, and ending twice is harmless', async () => {
    const { store, answer } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    const old = store.begin();
    store.load(KITCHEN);
    await answer(summaryOf({ projectId: KITCHEN, historyId: KITCHEN_HISTORY }));
    const current = store.begin();
    old.end();
    old.end();
    expect(store.undoControl().name).toBe('Saving a change…');
    current.committed({ projectId: KITCHEN, receipt: null });
    current.end();
    current.end();
    expect(store.undoControl().enabled).toBe(true);
  });

  it('a commit that lands after navigation reports nothing into the new project', async () => {
    const { store, answer, summary } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    const old = store.begin();
    store.load(KITCHEN);
    await answer(summaryOf({ projectId: KITCHEN, historyId: KITCHEN_HISTORY }));
    old.committed({ projectId: ROOT, receipt: receipt(HISTORY, 4) });
    old.end();
    expect(summary).toHaveBeenCalledTimes(2);
    expect(store.writePending()).toBe(false);
    expect(store.feedback()).toBeNull();
  });

  it('a failed write owes a read even when another write committed while it ran', async () => {
    const { store, answer, summary } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    const failing = store.begin();
    commit(store, { projectId: ROOT, receipt: null });
    failing.end();
    expect(summary).toHaveBeenCalledTimes(2);
    expect(store.writePending()).toBe(true);
    await answer(summaryOf());
    expect(store.writePending()).toBe(false);
  });

  it('stops holding the controls for a revision that never arrives, and a reload drops what was owed', async () => {
    const { store, answer, summary, live } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    commit(store, { projectId: ROOT, receipt: receipt(HISTORY, 9) });
    for (let read = 0; read < 4; read += 1) await answer(summaryOf());
    expect(summary).toHaveBeenCalledTimes(5);
    expect(store.writePending()).toBe(false);

    commit(store, { projectId: ROOT, receipt: receipt(HISTORY, 9) });
    live.emit({ type: 'prototype.reloaded', entityId: 'workspace' });
    await answer(summaryOf()); // the read the commit asked for, from the generation the reload ended
    await answer(summaryOf({ revision: 1 }));
    expect(store.writePending()).toBe(false);
    expect(store.undoControl().enabled).toBe(true);
  });

  it('navigation drops owed reads, and a failed owed read ends pending as unavailable', async () => {
    const { store, answer } = setup();
    store.load(ROOT);
    await answer(summaryOf());
    commit(store, { projectId: ROOT, receipt: receipt(HISTORY, 4) });
    store.load(KITCHEN);
    await answer(summaryOf({ revision: 4 })); // the dropped read from ROOT
    await answer(summaryOf({ projectId: KITCHEN, historyId: KITCHEN_HISTORY, revision: 1 }));
    expect(store.writePending()).toBe(false);

    commit(store, { projectId: KITCHEN, receipt: receipt(KITCHEN_HISTORY, 2) });
    await answer(new GatewayError('unreachable', 0, 'down'));
    expect(store.writePending()).toBe(false);
    expect(store.undoControl().name).toBe('History unavailable');
    expect(store.retryAvailable()).toBe(true);
  });
});

describe('ProjectHistoryStore — transitions', () => {
  const ready = async () => {
    const harness = setup();
    harness.store.load(ROOT);
    await harness.answer(summaryOf({ redo: entry('operation-9', 'Moved the Tasks shortcut') }));
    return harness;
  };

  it('sends the held action and revision once, adopts the result summary and says what ran', async () => {
    const { store, transition, transitions } = await ready();
    const undoing = store.undo();
    void store.undo();
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(HISTORY, { actionId: 'operation-3', direction: 'undo', expectedRevision: 3 });
    expect(store.undoControl().name).toBe('Undoing…');
    expect(store.redoControl().name).toBe('Saving a change…');
    transitions[0]!.resolve({
      direction: 'undo', actionId: 'operation-3' as OperationActionId, result: { operation: 'section.update' } as never,
      summary: summaryOf({ revision: 4, undo: null, redo: entry('operation-3', 'Resized the Notes section') }),
    });
    await undoing;
    expect(store.feedback()?.message).toBe('Undid: Resized the Notes section.');
    expect(store.undoControl().name).toBe('Nothing to undo');
    expect(store.redoControl()).toEqual({ name: 'Redo: Resized the Notes section', enabled: true });
  });

  it('redo cites the redo entry', async () => {
    const { store, transition } = await ready();
    void store.redo();
    expect(transition).toHaveBeenCalledWith(HISTORY, { actionId: 'operation-9', direction: 'redo', expectedRevision: 3 });
  });

  it('adopts each refusal’s summary and words its reason', async () => {
    const reasons: OperationHistoryRefusalDetails[] = [
      { reason: 'history_revision_stale' },
      { reason: 'history_not_next' },
      { reason: 'history_expired', expiresAt },
      { reason: 'history_blocked', blockingProjectId: OTHER, blockingProjectTitle: 'Legacy attic' },
      { reason: 'history_conflict', conflicts: [{ entityType: 'task', id: 'task-1', title: 'Tile', problem: 'field-changed', nextStep: 'change-by-hand' }] },
      { reason: 'history_unavailable', problem: 'no-compatible-page' },
      { reason: 'history_retired', conflicts: [{ entityType: 'task', id: 'task-1', title: 'Tile', problem: 'field-changed', nextStep: 'change-by-hand' }] },
    ].map((details) => ({
      ...details, historyId: HISTORY, actionId: 'operation-3', summary: summaryOf({ revision: 8, undo: entry('operation-8', 'After') }),
    }) as OperationHistoryRefusalDetails);
    for (const details of reasons) {
      const { store, transitions, summary } = await ready();
      const undoing = store.undo();
      transitions[0]!.reject(refusal(details));
      await undoing;
      expect(store.summary()?.revision, details.reason).toBe(8);
      expect(store.feedback()?.message.length, details.reason).toBeGreaterThan(10);
      expect(summary, details.reason).toHaveBeenCalledTimes(details.reason === 'history_expired' ? 2 : 1);
      TestBed.resetTestingModule();
    }
  });

  it('re-reads after a 404 or a transport failure rather than assuming', async () => {
    for (const error of [new GatewayError('not_found', 404, 'gone'), new GatewayError('unreachable', 0, 'lost')]) {
      const { store, transitions, summary } = await ready();
      const undoing = store.undo();
      transitions[0]!.reject(error);
      await undoing;
      expect(summary).toHaveBeenCalledTimes(2);
      expect(store.feedback()?.message).toMatch(error.code === 'not_found' ? /no longer available/ : /may not have completed/);
      TestBed.resetTestingModule();
    }
  });

  it('sends nothing for a control that is unavailable', async () => {
    const { store, transition } = await ready();
    const write = store.begin();
    await store.undo();
    write.end();
    expect(transition).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const blocked = setup();
    blocked.store.load(ROOT);
    await blocked.answer(summaryOf({ undo: entry('operation-3', 'x', { projectId: OTHER, title: 'Legacy attic' }) }));
    await blocked.store.undo();
    expect(blocked.transition).not.toHaveBeenCalled();
  });

  it('drops a late result without error once the store is destroyed', async () => {
    const { store, transitions } = await ready();
    const undoing = store.undo();
    TestBed.resetTestingModule();
    transitions[0]!.resolve({ direction: 'undo', actionId: 'operation-3' as OperationActionId, result: {} as never, summary: summaryOf({ revision: 4 }) });
    await expect(undoing).resolves.toBeUndefined();
    expect(store.summary()?.revision).toBe(3);
  });
});
