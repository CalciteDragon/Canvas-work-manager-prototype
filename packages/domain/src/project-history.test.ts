import { describe, expect, it } from 'vitest';
import type { OperationHistoryDirection, OperationReceipt, Project, ProjectId } from '@cwm/contracts';
import { agentActorFor, buildHarness, MINE } from '../test/test-support';
import type { ActorContext } from './actor';
import { DomainRuleError } from './errors';

type Harness = ReturnType<typeof buildHarness>;

/** Somebody else with project write access in the same workspace: never in the person's history. */
const someoneElse = agentActorFor(0, ['projects.read', 'projects.write']);

/** Moves the frozen test clock forward, so each stamp is visibly its own write's. */
const tick = (h: Harness, ms = 60_000): void => h.clock.setNow(new Date(h.clock.now().getTime() + ms));

const step = async (h: Harness, receipt: OperationReceipt, direction: OperationHistoryDirection = 'undo', actor: ActorContext = h.actor) => {
  const history = (await h.operationHistories.find(receipt.historyId))!;
  return h.operationHistoryService.transition(actor, receipt.historyId, {
    actionId: receipt.actionId,
    expectedRevision: history.revision,
    direction,
  });
};

const refusalOf = async (promise: Promise<unknown>): Promise<DomainRuleError & { details?: Record<string, unknown> }> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainRuleError) return error as DomainRuleError & { details?: Record<string, unknown> };
    throw error;
  }
  throw new Error('expected a refusal');
};

const createRoot = (h: Harness, name: string) =>
  h.projectService.create(h.actor, { workspaceId: h.actor.workspaceId, kind: 'root', name });

const createChild = (h: Harness, parentProjectId: ProjectId, name: string) =>
  h.projectService.create(h.actor, { workspaceId: h.actor.workspaceId, kind: 'subproject', parentProjectId, name });

const project = async (h: Harness, id: ProjectId): Promise<Project> => (await h.projects.find(id))!;

/** Everything a refused transition must leave alone: projects, history rows and activity. */
const state = (h: Harness) => {
  const document = h.store.snapshot();
  return JSON.stringify([document.projects, document.operationHistories, document.operationActions, document.activityEvents]);
};

describe('project.update: captured fields reversed and replayed (§§26, 31, 39)', () => {
  it('records only the changed fields and restores exact prior values, clearing and setting optional ones', async () => {
    const h = buildHarness();
    await h.projectService.update(someoneElse, MINE, { description: 'Before', icon: '🍳' });
    const before = await project(h, MINE);
    tick(h);

    const written = await h.projectWriteService.update(h.actor, MINE, {
      name: 'Renamed',
      description: null,
      icon: '🚀',
      targetDate: '2026-12-01',
      projectLayoutMode: 'grid',
      progressFormula: 'manual',
      manualProgress: 40,
    });
    expect(written.operation).toMatchObject({ operation: 'project.update', label: 'Updated "Renamed"' });
    const [action] = await h.operationActions.list({ historyId: written.operation!.historyId });
    expect(action!.operation).toEqual({
      version: 1,
      type: 'project.update',
      projectId: MINE,
      archivedThroughout: false,
      changes: [
        { field: 'name', before: 'Project project-mine', after: 'Renamed' },
        { field: 'description', before: 'Before', after: null },
        { field: 'icon', before: '🍳', after: '🚀' },
        { field: 'targetDate', before: null, after: '2026-12-01' },
        { field: 'projectLayoutMode', before: 'flow', after: 'grid' },
        { field: 'progressFormula', before: 'count', after: 'manual' },
        { field: 'manualProgress', before: null, after: 40 },
      ],
    });

    tick(h);
    const undone = await step(h, written.operation!);
    expect(undone.result).toMatchObject({ operation: 'project.update', outcome: 'restored', project: { id: MINE } });
    const restored = await project(h, MINE);
    expect({ ...restored, updatedAt: before.updatedAt }).toEqual(before);
    expect(restored.updatedAt).toBe(h.clock.now().toISOString());

    const redone = await step(h, written.operation!, 'redo');
    expect(redone.result).toMatchObject({ operation: 'project.update', outcome: 'reapplied' });
    expect({ ...(await project(h, MINE)), updatedAt: written.project.updatedAt }).toEqual(written.project);
  });

  it('preserves the captured completedAt through completion and reopening with the clock advanced', async () => {
    const h = buildHarness();
    const completedAt = h.clock.now().toISOString();
    const completion = await h.projectWriteService.update(h.actor, MINE, { status: 'completed' });
    expect(completion.operation?.label).toBe('Completed "Project project-mine"');
    expect(completion.project.completedAt).toBe(completedAt);

    tick(h, 3_600_000);
    const reopening = await h.projectWriteService.update(h.actor, MINE, { status: 'active' });
    expect(reopening.project.completedAt).toBeUndefined();

    tick(h, 3_600_000);
    await step(h, reopening.operation!);
    // Undoing the reopening brings back the original finish time, not the transition's.
    expect((await project(h, MINE)).completedAt).toBe(completedAt);
    await step(h, completion.operation!);
    expect(await project(h, MINE)).toMatchObject({ status: 'active' });
    expect((await project(h, MINE)).completedAt).toBeUndefined();

    tick(h, 3_600_000);
    await step(h, completion.operation!, 'redo');
    expect((await project(h, MINE)).completedAt).toBe(completedAt);
  });

  it('keeps an unrelated field another actor changed, and refuses when they changed a recorded one', async () => {
    const h = buildHarness();
    const rename = await h.projectWriteService.update(h.actor, MINE, { name: 'Mine' });
    await h.projectService.update(someoneElse, MINE, { icon: '🧭' });

    await step(h, rename.operation!);
    expect(await project(h, MINE)).toMatchObject({ name: 'Project project-mine', icon: '🧭' });
    await step(h, rename.operation!, 'redo');
    expect(await project(h, MINE)).toMatchObject({ name: 'Mine', icon: '🧭' });

    await h.projectService.update(someoneElse, MINE, { name: 'Theirs' });
    const before = state(h);
    const refusal = await refusalOf(step(h, rename.operation!));
    expect(refusal.message).toMatch(/^history_conflict: /);
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'project', id: MINE, title: 'Theirs', problem: 'field-changed', nextStep: 'change-by-hand' }],
    });
    expect(state(h)).toEqual(before);
  });

  it('runs a same-field A→B→C chain in LIFO and FIFO order', async () => {
    const h = buildHarness();
    const first = await h.projectWriteService.update(h.actor, MINE, { name: 'B' });
    const second = await h.projectWriteService.update(h.actor, MINE, { name: 'C' });

    await step(h, second.operation!);
    expect((await project(h, MINE)).name).toBe('B');
    await step(h, first.operation!);
    expect((await project(h, MINE)).name).toBe('Project project-mine');
    await step(h, first.operation!, 'redo');
    await step(h, second.operation!, 'redo');
    expect((await project(h, MINE)).name).toBe('C');
  });

  it('refuses a manual formula coming back once its value is gone', async () => {
    const h = buildHarness();
    await h.projectService.update(someoneElse, MINE, { progressFormula: 'manual', manualProgress: 10 });
    const toCount = await h.projectWriteService.update(h.actor, MINE, { progressFormula: 'count' });
    await h.projectService.update(someoneElse, MINE, { manualProgress: null });
    const before = state(h);

    const refusal = await refusalOf(step(h, toCount.operation!));
    expect(refusal.details).toMatchObject({ reason: 'history_conflict', conflicts: [{ entityType: 'project', id: MINE, problem: 'field-changed' }] });
    expect(state(h)).toEqual(before);
  });
});

describe('project.update: reparenting rechecks the hierarchy (§26)', () => {
  const twoRoots = async (h: Harness) => {
    const other = await createRoot(h, 'Other root');
    const child = await createChild(h, MINE, 'Kitchen');
    return { other, child };
  };

  it('moves a sub-project across roots and back, in the subject’s own history', async () => {
    const h = buildHarness();
    const { other, child } = await twoRoots(h);

    const moved = await h.projectWriteService.update(h.actor, child.id, { parentProjectId: other.id });
    expect(moved.operation).toMatchObject({ operation: 'project.update', label: 'Moved "Kitchen"' });
    const history = (await h.operationHistories.find(moved.operation!.historyId))!;
    expect(history.projectId).toBe(child.id);

    await step(h, moved.operation!);
    expect((await project(h, child.id)).parentProjectId).toBe(MINE);
    await step(h, moved.operation!, 'redo');
    expect((await project(h, child.id)).parentProjectId).toBe(other.id);
  });

  it('refuses a missing or newly cyclic destination without a partial move', async () => {
    const h = buildHarness();
    const { other, child } = await twoRoots(h);
    const grandchild = await createChild(h, child.id, 'Cabinets');
    const inner = await createChild(h, other.id, 'Inner');
    const moved = await h.projectWriteService.update(h.actor, grandchild.id, { parentProjectId: inner.id });

    // The former parent now sits under the subject: undoing would nest the subject inside itself.
    await h.projectService.update(someoneElse, child.id, { parentProjectId: grandchild.id });
    const before = state(h);
    const refusal = await refusalOf(step(h, moved.operation!));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'project', id: child.id, problem: 'reparented', nextStep: 'move-back-and-retry' }],
    });
    expect(state(h)).toEqual(before);
  });

  it('refuses a destination whose ancestry was archived since', async () => {
    const h = buildHarness();
    const { other, child } = await twoRoots(h);
    const moved = await h.projectWriteService.update(h.actor, child.id, { parentProjectId: other.id });
    await step(h, moved.operation!);
    await h.projectService.archive(someoneElse, other.id);
    const before = state(h);

    const refusal = await refusalOf(step(h, moved.operation!, 'redo'));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'project', id: other.id, problem: 'archive-state-changed', nextStep: 'restore-state-and-retry' }],
    });
    expect(state(h)).toEqual(before);
  });

  it('refuses when the recorded parent is not the current one', async () => {
    const h = buildHarness();
    const { other, child } = await twoRoots(h);
    const third = await createRoot(h, 'Third');
    const moved = await h.projectWriteService.update(h.actor, child.id, { parentProjectId: other.id });
    await h.projectService.update(someoneElse, child.id, { parentProjectId: third.id });

    const refusal = await refusalOf(step(h, moved.operation!));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'project', id: child.id, problem: 'reparented', nextStep: 'move-back-and-retry' }],
    });
  });
});

describe('project.archive and project.reactivate (§31)', () => {
  it('archives child then root; the root’s own archive undoes while it is archived and redoes again', async () => {
    const h = buildHarness();
    const child = await createChild(h, MINE, 'Kitchen');
    const childArchive = await h.projectWriteService.archive(h.actor, child.id);
    expect(childArchive.operation).toMatchObject({ operation: 'project.archive', label: 'Archived "Kitchen"' });
    const rootArchive = await h.projectWriteService.archive(h.actor, MINE);
    expect(rootArchive.operation).toMatchObject({ operation: 'project.archive', label: 'Archived "Project project-mine"' });

    const summary = await h.operationHistoryService.summary(h.actor, MINE);
    // The summary still reports the observed archived project; this one action is eligible anyway.
    expect(summary.blockedBy).toEqual({ projectId: MINE, title: 'Project project-mine' });
    const undone = await step(h, rootArchive.operation!);
    expect(undone.result).toMatchObject({ operation: 'project.archive', outcome: 'restored', project: { status: 'active' } });

    const redone = await step(h, rootArchive.operation!, 'redo');
    expect(redone.result).toMatchObject({ operation: 'project.archive', outcome: 'reapplied', project: { status: 'archived' } });
  });

  it('an idempotent archive answers a null receipt and leaves the Redo branch alone', async () => {
    const h = buildHarness();
    const archived = await h.projectWriteService.archive(h.actor, MINE);
    await step(h, archived.operation!);
    await h.projectService.archive(someoneElse, MINE);
    const before = state(h);

    const again = await h.projectWriteService.archive(h.actor, MINE);
    expect(again.operation).toBeNull();
    expect(state(h)).toEqual(before);
    const noop = await h.projectWriteService.update(h.actor, MINE, { name: 'Project project-mine' });
    expect(noop.operation).toBeNull();
    expect(state(h)).toEqual(before);
    expect((await h.operationHistoryService.summary(h.actor, MINE)).redo).not.toBeNull();
  });

  it('refuses Redo of an archive once a live child appeared, writing nothing', async () => {
    const h = buildHarness();
    const archived = await h.projectWriteService.archive(h.actor, MINE);
    await step(h, archived.operation!);
    const child = await createChild(h, MINE, 'Late child');
    const before = state(h);

    const refusal = await refusalOf(step(h, archived.operation!, 'redo'));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'project', id: child.id, title: 'Late child', problem: 'new-dependent', nextStep: 'restore-or-move-dependent-and-retry' }],
    });
    expect(state(h)).toEqual(before);
  });

  it('reverses and replays an explicit reactivation, whose Redo runs while the project is archived', async () => {
    const h = buildHarness();
    const child = await createChild(h, MINE, 'Kitchen');
    await h.projectService.archive(someoneElse, child.id);
    const reactivated = await h.projectWriteService.update(h.actor, child.id, { status: 'on_hold' });
    expect(reactivated.operation).toMatchObject({ operation: 'project.reactivate', label: 'Reactivated "Kitchen"' });

    await step(h, reactivated.operation!);
    expect((await project(h, child.id)).status).toBe('archived');
    await step(h, reactivated.operation!, 'redo');
    expect((await project(h, child.id)).status).toBe('on_hold');
  });

  it('edits an archived subject and undoes/redoes the edit while it stays archived', async () => {
    const h = buildHarness();
    await h.projectService.archive(someoneElse, MINE);
    const rename = await h.projectWriteService.update(h.actor, MINE, { name: 'Shelved' });
    const [action] = await h.operationActions.list({ historyId: rename.operation!.historyId });
    expect(action!.operation).toMatchObject({ type: 'project.update', archivedThroughout: true });

    await step(h, rename.operation!);
    expect(await project(h, MINE)).toMatchObject({ name: 'Project project-mine', status: 'archived' });
    await step(h, rename.operation!, 'redo');
    expect(await project(h, MINE)).toMatchObject({ name: 'Shelved', status: 'archived' });
  });

  it('reverses a combined archive-plus-field PATCH as one action', async () => {
    const h = buildHarness();
    const combined = await h.projectWriteService.update(h.actor, MINE, { status: 'archived', name: 'Old mine' });
    expect(combined.operation).toMatchObject({ operation: 'project.archive' });
    expect(await h.operationActions.list({ historyId: combined.operation!.historyId })).toHaveLength(1);
    expect((await h.activity.list(h.actor)).filter((event) => event.entityId === MINE)).toHaveLength(1);

    await step(h, combined.operation!);
    expect(await project(h, MINE)).toMatchObject({ name: 'Project project-mine', status: 'active' });
  });

  it('keeps blocking through an archived ancestor, even for the subject’s own archive', async () => {
    const h = buildHarness();
    const child = await createChild(h, MINE, 'Kitchen');
    const archived = await h.projectWriteService.archive(h.actor, child.id);
    await h.projectService.archive(someoneElse, MINE);
    const before = state(h);

    const refusal = await refusalOf(step(h, archived.operation!));
    expect(refusal.details).toMatchObject({ reason: 'history_blocked', blockingProjectId: MINE });
    expect(state(h)).toEqual(before);
  });

  it('an archived cross-root reparent cannot Undo into a former parent archived since', async () => {
    const h = buildHarness();
    const other = await createRoot(h, 'Other root');
    const former = await createChild(h, MINE, 'Former parent');
    const subject = await createChild(h, former.id, 'Subject');
    await h.projectService.archive(someoneElse, subject.id);
    const moved = await h.projectWriteService.update(h.actor, subject.id, { parentProjectId: other.id });
    await h.projectService.archive(someoneElse, former.id);
    const before = state(h);

    const refusal = await refusalOf(step(h, moved.operation!));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'project', id: former.id, problem: 'archive-state-changed' }],
    });
    expect(state(h)).toEqual(before);

    await h.projectService.update(someoneElse, former.id, { status: 'active' });
    await step(h, moved.operation!);
    expect((await project(h, subject.id)).parentProjectId).toBe(former.id);
  });

  it('a new ordinary write clears only that actor’s Redo branch in that project', async () => {
    const h = buildHarness();
    const child = await createChild(h, MINE, 'Kitchen');
    const rootRename = await h.projectWriteService.update(h.actor, MINE, { name: 'Root B' });
    const childRename = await h.projectWriteService.update(h.actor, child.id, { name: 'Kitchen B' });
    await step(h, rootRename.operation!);
    await step(h, childRename.operation!);

    await h.projectWriteService.update(h.actor, child.id, { icon: '🔪' });
    expect((await h.operationHistoryService.summary(h.actor, child.id)).redo).toBeNull();
    expect((await h.operationHistoryService.summary(h.actor, MINE)).redo).toMatchObject({ actionId: rootRename.operation!.actionId });
  });
});
