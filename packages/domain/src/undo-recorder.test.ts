import { UndoRecordSchema, type SectionId, type UndoOperation, type UndoRecord } from '@cwm/contracts';
import { SEED_NOW } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { actorFor, agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { RepositoryUndoRecorder, UNDO_RECORD_LIFETIME_MS, UNDO_RECORD_LIMIT } from './undo-recorder';

type Harness = ReturnType<typeof buildHarness>;

/** A record that expired exactly at the harness clock's now — expiry is inclusive. */
const EXPIRED = { createdAt: '2026-01-01T00:00:00.000Z', expiresAt: SEED_NOW };

const operation = (sectionId: string, projectId: string = MINE): UndoOperation => ({
  version: 1,
  type: 'section.remove',
  section: {
    id: sectionId as SectionId,
    projectId: projectId as never,
    pageId: `page-${projectId}` as never,
    type: 'rich-text',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: SEED_NOW,
    updatedAt: SEED_NOW,
  },
  placement: { pageId: `page-${projectId}` as never, index: 0 },
  appliedPolicy: 'none',
  rows: [],
  postSectionArchivedAt: SEED_NOW,
});

const record = (harness: Harness, sectionId: string) =>
  harness.store.runUnitOfWork(() =>
    harness.undoRecorder.record(harness.actor, { projectId: MINE, label: `Removed ${sectionId}`, operation: operation(sectionId) }),
  );

/** Inserts records straight into the collection, as a long-running workspace would hold them. */
const seedRecords = (harness: Harness, count: number, overrides: (index: number) => Partial<UndoRecord> = () => ({})) =>
  harness.store.runUnitOfWork(async () => {
    for (let index = 1; index <= count; index += 1) {
      await harness.undoRecords.insert(
        UndoRecordSchema.parse({
          id: `undo-seeded-${index}`,
          workspaceId: harness.actor.workspaceId,
          projectId: MINE,
          actor: 'user',
          actorUserId: harness.actor.userId,
          sequence: index,
          label: 'Seeded',
          createdAt: SEED_NOW,
          expiresAt: '2026-12-31T00:00:00.000Z',
          operation: operation(`section-seeded-${index}`),
          ...overrides(index),
        }),
      );
    }
  });

describe('RepositoryUndoRecorder', () => {
  it('stores one record and returns a receipt with a 24-hour expiry from the clock', async () => {
    const harness = buildHarness();

    const receipt = await record(harness, 'section-a');

    const expiresAt = new Date(Date.parse(SEED_NOW) + UNDO_RECORD_LIFETIME_MS).toISOString();
    expect(receipt).toEqual({
      undoId: 'undo-1',
      operation: 'section.remove',
      label: 'Removed section-a',
      createdAt: SEED_NOW,
      expiresAt,
    });
    expect(UNDO_RECORD_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);
    expect(await harness.undoRecords.find(receipt.undoId)).toMatchObject({
      workspaceId: harness.actor.workspaceId,
      projectId: MINE,
      actor: 'user',
      actorUserId: harness.actor.userId,
      sequence: 1,
      createdAt: SEED_NOW,
      expiresAt,
    });
  });

  it('attributes an agent record to its connection', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.write']);

    const receipt = await harness.store.runUnitOfWork(() =>
      harness.undoRecorder.record(agent, { projectId: MINE, label: 'Removed', operation: operation('section-a') }),
    );

    expect(await harness.undoRecords.find(receipt.undoId)).toMatchObject({
      actor: 'agent',
      actorAgentConnectionId: 'agent-claude',
    });
  });

  describe('outstandingFor', () => {
    it('returns the highest-sequence live receipt for the exact actor and section', async () => {
      const harness = buildHarness();
      const older = await record(harness, 'section-shared');
      const newest = await record(harness, 'section-shared');

      await expect(harness.undoRecorder.outstandingFor(harness.actor, 'section-shared' as SectionId)).resolves.toEqual(newest);
      expect(newest.undoId).not.toBe(older.undoId);
    });

    it('does not reveal an outstanding receipt to a different actor when that actor owns the highest sequence', async () => {
      const harness = buildHarness();
      const sectionId = 'section-shared' as SectionId;
      const userReceipt = await record(harness, sectionId);
      const agent = agentActorFor(0, ['projects.write']);
      const agentReceipt = await harness.store.runUnitOfWork(() =>
        harness.undoRecorder.record(agent, { projectId: MINE, label: 'Agent removal', operation: operation(sectionId) }),
      );

      await expect(harness.undoRecorder.outstandingFor(harness.actor, sectionId)).resolves.toBeNull();
      await expect(harness.undoRecorder.outstandingFor(agent, sectionId)).resolves.toEqual(agentReceipt);
      expect(userReceipt.undoId).not.toBe(agentReceipt.undoId);
    });

    it.each([
      ['consumed', { consumedAt: SEED_NOW }],
      ['expired', EXPIRED],
    ])('does not resurrect a lower-sequence receipt when the newest record is %s', async (_, state) => {
      const harness = buildHarness();
      const sectionId = 'section-shared' as SectionId;
      const first = await record(harness, sectionId);
      const newest = await record(harness, sectionId);
      const current = await harness.undoRecords.find(newest.undoId);
      expect(current).not.toBeNull();
      await harness.store.runUnitOfWork(() => harness.undoRecords.update(UndoRecordSchema.parse({ ...current, ...state })));

      await expect(harness.undoRecorder.outstandingFor(harness.actor, sectionId)).resolves.toBeNull();
      expect(first.undoId).not.toBe(newest.undoId);
    });

    it('is a read-only lookup over the workspace record collection', async () => {
      const harness = buildHarness();
      const receipt = await record(harness, 'section-shared');
      const before = harness.store.snapshot();
      const writes = harness.store.persistCalls;

      await expect(harness.undoRecorder.outstandingFor(harness.actor, 'section-shared' as SectionId)).resolves.toEqual(receipt);

      expect(harness.store.snapshot()).toEqual(before);
      expect(harness.store.persistCalls).toBe(writes);
    });
  });

  it('increments the sequence per workspace', async () => {
    const harness = buildHarness();
    await record(harness, 'section-a');
    await record(harness, 'section-b');
    await harness.store.runUnitOfWork(() =>
      harness.undoRecorder.record(actorFor(1), { projectId: THEIRS, label: 'Theirs', operation: operation('section-t', THEIRS) }),
    );

    const records = await harness.undoRecords.list();
    expect(records.map(({ workspaceId, sequence }) => [workspaceId, sequence])).toEqual([
      [harness.actor.workspaceId, 1],
      [harness.actor.workspaceId, 2],
      [actorFor(1).workspaceId, 1],
    ]);
  });

  it('computes the sequence before pruning, so a pruned highest sequence is never reused', async () => {
    const harness = buildHarness();
    // The highest record is also the only expired one.
    await seedRecords(harness, 3, (index) => (index === 3 ? EXPIRED : {}));

    await record(harness, 'section-new');

    const records = await harness.undoRecords.list();
    expect(records.map(({ sequence }) => sequence)).toEqual([1, 2, 4]);
  });

  it('prunes expired records, then the lowest sequences, so the workspace ends at exactly the limit', async () => {
    const harness = buildHarness();
    await seedRecords(harness, UNDO_RECORD_LIMIT + 2, (index) => ({
      ...(index === 10 ? EXPIRED : {}),
      // Consumed records count toward the cap.
      ...(index % 2 === 0 ? { consumedAt: SEED_NOW } : {}),
    }));

    await record(harness, 'section-new');

    const sequences = (await harness.undoRecords.list({ workspaceId: harness.actor.workspaceId })).map(
      ({ sequence }) => sequence,
    );
    expect(UNDO_RECORD_LIMIT).toBe(50);
    expect(sequences).toHaveLength(UNDO_RECORD_LIMIT);
    // 52 seeded + 1 new: #10 expired, then #1 and #2 are the lowest sequences.
    expect(sequences).not.toContain(10);
    expect(sequences).not.toContain(1);
    expect(sequences).not.toContain(2);
    expect(sequences.at(-1)).toBe(UNDO_RECORD_LIMIT + 3);
  });

  it('prunes every lower-sequence record for the same section along with a pruned record', async () => {
    const harness = buildHarness();
    // #5 expires; #2 and #4 name the same section as #5, so they go with it. #7 is newer and stays.
    const sectionOf = (index: number) => ([2, 4, 5, 7].includes(index) ? 'section-shared' : `section-seeded-${index}`);
    await seedRecords(harness, 8, (index) => ({
      operation: operation(sectionOf(index)),
      ...(index === 5 ? EXPIRED : {}),
    }));

    await record(harness, 'section-new');

    const sequences = (await harness.undoRecords.list()).map(({ sequence }) => sequence);
    expect(sequences).toEqual([1, 3, 6, 7, 8, 9]);
  });

  it('leaves other workspaces untouched when pruning', async () => {
    const harness = buildHarness();
    // Long expired, but in another workspace: the recorder prunes only the acting one.
    await harness.store.runUnitOfWork(async () => {
      await harness.undoRecords.insert(
        UndoRecordSchema.parse({
          id: 'undo-theirs',
          workspaceId: actorFor(1).workspaceId,
          projectId: THEIRS,
          actor: 'user',
          actorUserId: actorFor(1).userId,
          sequence: 1,
          label: 'Theirs',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-02T00:00:00.000Z',
          operation: operation('section-t', THEIRS),
        }),
      );
    });

    await record(harness, 'section-new');

    expect(await harness.undoRecords.find('undo-theirs' as never)).not.toBeNull();
  });

  it('opens no unit of its own: its writes roll back with the caller’s', async () => {
    const harness = buildHarness();
    const recorder = new RepositoryUndoRecorder({ undoRecords: harness.undoRecords, clock: harness.clock, ids: harness.ids });

    await expect(
      harness.store.runUnitOfWork(async () => {
        await recorder.record(harness.actor, { projectId: MINE, label: 'Removed', operation: operation('section-a') });
        throw new Error('the mutation failed after recording');
      }),
    ).rejects.toThrow('the mutation failed');

    expect(await harness.undoRecords.list()).toEqual([]);
  });
});
