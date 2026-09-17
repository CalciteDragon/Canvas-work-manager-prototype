import type { ProjectId, SectionId, UndoOperation } from '@cwm/contracts';
import { SEED_NOW } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import type { ActorContext } from './actor';
import { OPERATION_HISTORY_LIMIT } from './operation-history';
import { OPERATION_ACTION_LIFETIME_MS } from './operation-recorder';

type Harness = ReturnType<typeof buildHarness>;

const update = (sectionId: string, projectId: string = MINE): UndoOperation => ({
  version: 1,
  type: 'section.update',
  sectionId: sectionId as SectionId,
  projectId: projectId as ProjectId,
  pageId: `page-${projectId}` as never,
  changes: [{ field: 'collapsed', before: false, after: true }],
});

/** Records inside a unit, the way every caller does. */
const record = (harness: Harness, actor: ActorContext, operation: UndoOperation, projectId: string = MINE) =>
  harness.store.runUnitOfWork(() => harness.historyRecorder.record(actor, { projectId: projectId as ProjectId, label: 'Changed', operation }));

describe('RepositoryOperationRecorder', () => {
  it('records into the acting actor’s own project history and returns a receipt with a 24-hour expiry', async () => {
    const harness = buildHarness();

    const receipt = await record(harness, harness.actor, update('section-a'));

    const expiresAt = new Date(Date.parse(SEED_NOW) + OPERATION_ACTION_LIFETIME_MS).toISOString();
    expect(receipt).toEqual({
      historyId: 'history-1', actionId: 'operation-1', operation: 'section.update', revision: 1,
      label: 'Changed', createdAt: SEED_NOW, expiresAt,
    });
    expect(harness.store.snapshot().operationHistories).toEqual([{
      id: 'history-1', workspaceId: harness.actor.workspaceId, projectId: MINE, actor: 'user', actorUserId: harness.actor.userId,
      cursor: 1, orderHighWaterMark: 1, revision: 1,
    }]);
    expect(harness.store.snapshot().operationActions).toEqual([{
      id: 'operation-1', historyId: 'history-1', order: 1, state: 'applied', label: 'Changed',
      createdAt: SEED_NOW, expiresAt, operation: update('section-a'),
    }]);
  });

  it('keeps one history per exact actor and project: an agent never enters a person’s stack', async () => {
    const harness = buildHarness();
    const kitchen = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Kitchen',
    });
    const agent = agentActorFor(0, ['projects.write']);
    const system: ActorContext = { actor: 'system', workspaceId: harness.actor.workspaceId };

    const mine = await record(harness, harness.actor, update('section-a'));
    const again = await record(harness, harness.actor, update('section-b'));
    const agents = await record(harness, agent, update('section-a'));
    const systems = await record(harness, system, update('section-a'));
    // A descendant's write records in the descendant's history, not its root's.
    const descendant = await record(harness, harness.actor, update('section-k', kitchen.id), kitchen.id);
    const theirs = await record(harness, harness.other, update('section-t', THEIRS), THEIRS);

    expect(again).toMatchObject({ historyId: mine.historyId, revision: 2 });
    expect(new Set([mine.historyId, agents.historyId, systems.historyId, descendant.historyId, theirs.historyId]).size).toBe(5);
    expect(harness.store.snapshot().operationHistories.find(({ id }) => id === agents.historyId)).toMatchObject({
      actor: 'agent', actorAgentConnectionId: agent.agentConnectionId, cursor: 1,
    });
    expect(harness.store.snapshot().operationHistories.find(({ id }) => id === agents.historyId)).not.toHaveProperty('actorUserId');
  });

  it('a rolled-back unit records nothing, and opens no unit of its own', async () => {
    const harness = buildHarness();
    await record(harness, harness.actor, update('section-a'));
    const before = harness.store.snapshot();

    await expect(harness.store.runUnitOfWork(async () => {
      await harness.historyRecorder.record(harness.actor, { projectId: MINE, label: 'Rolled back', operation: update('section-b') });
      throw new Error('caller failed');
    })).rejects.toThrow('caller failed');

    expect(harness.store.snapshot()).toEqual(before);
  });

  it('discards the redo branch on record and never reuses an order', async () => {
    const harness = buildHarness();
    const first = await record(harness, harness.actor, update('section-a'));
    await record(harness, harness.actor, update('section-b'));
    await harness.store.runUnitOfWork(async () => {
      const history = (await harness.operationHistories.find(first.historyId))!;
      const actions = await harness.operationActions.list({ historyId: history.id });
      // Undo the top action by hand: the cursor below it, the action undone.
      await harness.operationActions.update({ ...actions[1]!, state: 'undone' });
      await harness.operationHistories.update({ ...history, cursor: 1, revision: history.revision + 1 });
    });

    const third = await record(harness, harness.actor, update('section-c'));

    expect(harness.store.snapshot().operationActions.map(({ id, order }) => [id, order])).toEqual([['operation-1', 1], ['operation-3', 3]]);
    expect(third).toMatchObject({ revision: 4 });
  });

  it('prunes expired actions and then the oldest, so a history holds at most the limit', async () => {
    const harness = buildHarness();
    await record(harness, harness.actor, update('section-expiring'));
    harness.clock.setNow(new Date(Date.parse(SEED_NOW) + 1_000));
    for (let index = 0; index < OPERATION_HISTORY_LIMIT; index += 1) await record(harness, harness.actor, update(`section-${index}`));
    expect(harness.store.snapshot().operationActions).toHaveLength(OPERATION_HISTORY_LIMIT);
    expect(harness.store.snapshot().operationActions.map(({ order }) => order)[0]).toBe(2);

    harness.clock.setNow(new Date(Date.parse(SEED_NOW) + OPERATION_ACTION_LIFETIME_MS + 500));
    const survivor = await record(harness, harness.actor, update('section-late'));

    // Only the very first action had expired; the fifty after it are a second later.
    expect(harness.store.snapshot().operationActions).toHaveLength(OPERATION_HISTORY_LIMIT);
    expect(harness.store.snapshot().operationActions.at(-1)).toMatchObject({ id: survivor.actionId, order: OPERATION_HISTORY_LIMIT + 2 });
    expect(harness.store.snapshot().operationHistories[0]).toMatchObject({ orderHighWaterMark: OPERATION_HISTORY_LIMIT + 2 });
  });

  it('leaves other histories untouched when pruning', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.write']);
    const agents = await record(harness, agent, update('section-agent'));
    harness.clock.setNow(new Date(Date.parse(SEED_NOW) + OPERATION_ACTION_LIFETIME_MS * 2));

    await record(harness, harness.actor, update('section-a'));

    expect(await harness.operationActions.find(agents.actionId)).not.toBeNull();
  });

  describe('outstandingRemovalFor', () => {
    const retained = async (harness: Harness) => {
      const section = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'Prose' } });
      const { operation } = await harness.sectionWriteService.remove(harness.actor, section.id);
      return { section: (await harness.sections.find(section.id))!, operation };
    };

    it('returns the exact actor’s applied, unexpired removal while the section still carries its generation', async () => {
      const harness = buildHarness();
      const { section, operation } = await retained(harness);

      expect(await harness.historyRecorder.outstandingRemovalFor(harness.actor, section.id, section)).toEqual(operation);
      expect(await harness.historyRecorder.outstandingRemovalFor(agentActorFor(0, ['projects.write']), section.id, section)).toBeNull();
      expect(await harness.historyRecorder.outstandingRemovalFor(harness.other, section.id, section)).toBeNull();
    });

    it.each([
      ['undone', async (harness: Harness, operation: Awaited<ReturnType<typeof retained>>['operation']) => { await harness.undo(harness.actor, operation); }],
      ['expired', async (harness: Harness, operation: Awaited<ReturnType<typeof retained>>['operation']) => { harness.clock.setNow(new Date(operation.expiresAt)); }],
    ])('returns nothing once the removal is %s', async (_, change) => {
      const harness = buildHarness();
      const { section, operation } = await retained(harness);
      await change(harness, operation);

      expect(await harness.historyRecorder.outstandingRemovalFor(harness.actor, section.id, (await harness.sections.find(section.id))!)).toBeNull();
    });

    it('returns nothing when a later removal advanced the generation, and never an older record of the section', async () => {
      const harness = buildHarness();
      const { section } = await retained(harness);
      const later = { ...section, archiveGeneration: section.archiveGeneration + 1 };

      expect(await harness.historyRecorder.outstandingRemovalFor(harness.actor, section.id, later)).toBeNull();
      // The actor's newest action for the section decides: here a later edit, so no removal answers.
      await record(harness, harness.actor, update(section.id));
      expect(await harness.historyRecorder.outstandingRemovalFor(harness.actor, section.id, section)).toBeNull();
    });

    it('recovers a disposable removal from any of the actor’s histories when the section row is gone', async () => {
      const harness = buildHarness();
      const view = await harness.sectionService.add(harness.actor, MINE, { type: 'timeline' });
      const { operation } = await harness.sectionWriteService.remove(harness.actor, view.id);

      expect(await harness.historyRecorder.outstandingRemovalFor(harness.actor, view.id, null)).toEqual(operation);
      expect(await harness.historyRecorder.outstandingRemovalFor(harness.other, view.id, null)).toBeNull();
    });

    it('is a read-only lookup', async () => {
      const harness = buildHarness();
      const { section } = await retained(harness);
      harness.clock.setNow(new Date(Date.parse(SEED_NOW) + OPERATION_ACTION_LIFETIME_MS * 3));
      const before = harness.store.snapshot();

      await harness.historyRecorder.outstandingRemovalFor(harness.actor, section.id, section);

      expect(harness.store.snapshot()).toEqual(before);
    });
  });
});
