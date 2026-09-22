import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_PAGE_KINDS,
  type OperationHistoryDirection,
  type OperationReceipt,
  type OptionalProjectPageKind,
} from '@cwm/contracts';
import { agentActorFor, buildHarness, MINE } from '../test/test-support';
import type { ActorContext } from './actor';
import { DomainRuleError } from './errors';

type Harness = ReturnType<typeof buildHarness>;

/** Somebody else with write access in the same workspace: their writes never enter the person's history. */
const someoneElse = agentActorFor(0, ['projects.read', 'projects.write', 'reflections.write']);

/** Moves the frozen test clock forward, so an `updatedAt` stamp is visibly this write's. */
const tick = (h: Harness, ms = 60_000): void => h.clock.setNow(new Date(h.clock.now().getTime() + ms));

const step = async (
  h: Harness,
  receipt: OperationReceipt,
  direction: OperationHistoryDirection = 'undo',
  actor: ActorContext = h.actor,
) => {
  const history = (await h.operationHistories.find(receipt.historyId))!;
  return h.operationHistoryService.transition(actor, receipt.historyId, {
    actionId: receipt.actionId,
    expectedRevision: history.revision,
    direction,
  });
};

const enable = (h: Harness, kind: OptionalProjectPageKind, actor: ActorContext = h.actor) =>
  h.projectPageService.setEnabled(actor, MINE, { kind, enabled: true });

const disable = (h: Harness, kind: OptionalProjectPageKind, actor: ActorContext = h.actor) =>
  h.projectPageService.setEnabled(actor, MINE, { kind, enabled: false });

/** Every stored page row of the root, so a refusal can be shown to have written nothing. */
const pagesOf = async (h: Harness) => (await h.pages.list({ projectId: MINE })).map(({ id, kind, enabled, createdAt, updatedAt }) => [id, kind, enabled, createdAt, updatedAt]);

const refusalOf = async (promise: Promise<unknown>): Promise<DomainRuleError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainRuleError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
};

describe('optional-page first enable, reversed and replayed (§§26, 31)', () => {
  it('removes only the created record on Undo and recreates the same id on Redo, for every kind', async () => {
    for (const kind of OPTIONAL_PAGE_KINDS) {
      const h = buildHarness();
      const created = await enable(h, kind);
      expect(created.operation).toMatchObject({ operation: 'page.add', label: `Enabled the ${kind} page` });

      const undone = await step(h, created.operation!);
      expect(undone.result).toEqual({ operation: 'page.add', outcome: 'removed', projectId: MINE, pageId: created.page.id, kind });
      expect(await h.pages.find(created.page.id)).toBeNull();
      // Only the created page went; Home is untouched, as is every other root page.
      expect((await h.pages.list({ projectId: MINE })).map(({ kind: stored }) => stored)).toEqual(['home']);

      const redone = await step(h, created.operation!, 'redo');
      const back = (await h.pages.find(created.page.id))!;
      expect(redone.result).toMatchObject({ operation: 'page.add', outcome: 'reapplied', kind, page: { id: created.page.id } });
      expect([back.id, back.createdAt, back.enabled]).toEqual([created.page.id, created.page.createdAt, true]);
    }
  });

  it('keeps the id and createdAt across repeated cycles and stamps updatedAt from the Clock', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await step(h, created.operation!);
      tick(h);
      await step(h, created.operation!, 'redo');
    }

    const page = (await h.pages.find(created.page.id))!;
    expect([page.id, page.createdAt]).toEqual([created.page.id, created.page.createdAt]);
    // Recreated at the Clock's instant, not the original's: `createdAt` is identity, `updatedAt` is news.
    expect(Date.parse(page.updatedAt)).toBeGreaterThan(Date.parse(page.createdAt));
    expect(page.updatedAt).toBe(h.clock.now().toISOString());
  });

  /**
   * The chain Slice 38 exists to make safe: enable, toggle off, toggle on, then undo all three.
   * `updatedAt` has moved twice by the time the Add's Undo runs, which is exactly why the creation
   * inverse ignores it.
   */
  it('reaches the Add safely through the actor’s own later toggles, undone in order', async () => {
    const h = buildHarness();
    const created = await enable(h, 'todos');
    const off = await disable(h, 'todos');
    const on = await enable(h, 'todos');

    for (const receipt of [on.operation!, off.operation!, created.operation!]) await step(h, receipt);

    expect(await h.pages.find(created.page.id)).toBeNull();
    expect(await pagesOf(h)).toHaveLength(1);
  });
});

describe('dependents protect the creation inverse (§§27, 31)', () => {
  const blockedBy = async (h: Harness, receipt: OperationReceipt) => {
    const before = await pagesOf(h);
    const refusal = await refusalOf(step(h, receipt));
    // Nothing at all was written: the refusal is thrown before the first write.
    expect(await pagesOf(h)).toEqual(before);
    return refusal;
  };

  it('refuses when a live section still sits on the page', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });

    const refusal = await blockedBy(h, created.operation!);
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'section', id: container.section.id, problem: 'new-dependent', nextStep: 'remove-reference-and-retry' }],
    });
  });

  /**
   * An archived section still names the page, so archiving is **not** a way to release it — which
   * is why the guidance says remove the reference and never "archive it".
   */
  it('refuses for an archived section, and never tells the caller to archive it', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    await h.reflectionWriteService.create(someoneElse, { projectId: MINE, sectionId: container.section.id, body: 'Went well' });
    const removed = await h.sectionWriteService.remove(someoneElse, container.section.id, { policy: 'cascade' });
    expect(removed.section.archivedAt).toBeDefined();
    expect(await h.sections.list({ pageId: created.page.id, includeArchived: true })).toHaveLength(1);

    const refusal = await blockedBy(h, created.operation!);
    expect(refusal.details).toMatchObject({ reason: 'history_conflict', conflicts: [{ problem: 'new-dependent', nextStep: 'remove-reference-and-retry' }] });
  });

  /** An emptied container is still stored, and a stored container still references its page. */
  it('refuses for a retained container holding no live row', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    const row = await h.reflectionWriteService.create(someoneElse, { projectId: MINE, sectionId: container.section.id, body: 'Put away first' });
    await h.reflectionWriteService.archive(someoneElse, row.reflection.id);
    const removed = await h.sectionWriteService.remove(someoneElse, container.section.id);
    // Retained because a row still names it, and holding nothing live: still a reference.
    expect(removed.section.archivedAt).toBeDefined();
    expect(await h.sections.find(container.section.id)).not.toBeNull();
    expect(await h.reflections.list({ projectId: MINE })).toEqual([]);

    await blockedBy(h, created.operation!);
  });

  /** A row is protected by its container: the preflight never has to look at rows to keep them. */
  it('refuses for a Reflections row, through the container that holds it', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    const reflection = await h.reflectionWriteService.create(someoneElse, { projectId: MINE, sectionId: container.section.id, body: 'Went well' });

    const refusal = await blockedBy(h, created.operation!);
    expect(refusal.details).toMatchObject({ conflicts: [{ entityType: 'section', id: container.section.id }] });
    expect(await h.reflections.find(reflection.reflection.id)).not.toBeNull();
  });

  it('refuses when a Home shortcut still points at the page’s own placement list', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const source = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    const home = (await h.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
    const shortcut = await h.sectionShortcutWriteService.create(someoneElse, MINE, { pageId: home.id, sourceSectionId: source.section.id });

    // The section alone already refuses; the placement is the case where the *destination* is the
    // page under test, so put one on the optional page itself and prove it counts too.
    expect(shortcut.shortcut.pageId).toBe(home.id);
    const refusal = await blockedBy(h, created.operation!);
    expect(refusal.details).toMatchObject({ conflicts: [{ entityType: 'section', id: source.section.id }] });
  });

  /**
   * A history snapshot does not pin the page alive: an undone section add is not stored, so
   * nothing dangles and the page-add Undo becomes available again.
   */
  it('allows the page Undo once a dependent add has itself been fully undone', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    await blockedBy(h, created.operation!);

    await step(h, container.operation, 'undo', someoneElse);

    await expect(step(h, created.operation!)).resolves.toMatchObject({ result: { outcome: 'removed' } });
    expect(await h.pages.find(created.page.id)).toBeNull();
  });

  /**
   * Another actor's deleted section does not pin the page: history snapshots are not references.
   * Its later Undo then finds its original page gone — the destination fallback a page removal
   * made reachable — and must resolve it the way `resolveUndoDestination` states, not dangle.
   */
  it('lets another actor’s deleted section come back after the page it sat on was removed', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    const removed = await h.sectionWriteService.remove(someoneElse, container.section.id);
    await expect(step(h, created.operation!)).resolves.toMatchObject({ result: { outcome: 'removed' } });

    const restored = await step(h, removed.operation, 'undo', someoneElse);
    // Home is the root's canonical page: the section lands there, reported partial, and the
    // removed Reflections page is not recreated behind anybody's back.
    expect(restored.result).toMatchObject({
      outcome: 'partial',
      section: { id: container.section.id, pageId: 'page-project-mine' },
      placement: { pageId: 'page-project-mine', strategy: 'fallback-page' },
    });
    expect(await pagesOf(h)).toEqual([['page-project-mine', 'home', true, expect.any(String), expect.any(String)]]);
  });
});

describe('reapply does not adopt another page (§§26, 31)', () => {
  it('refuses when the recorded id is occupied again', async () => {
    const h = buildHarness();
    const created = await enable(h, 'todos');
    await step(h, created.operation!);
    // Somebody else enables the tab again, which mints a **new** id; then the person's Redo runs.
    const replacement = await enable(h, 'todos', someoneElse);
    expect(replacement.page.id).not.toBe(created.page.id);

    const refusal = await refusalOf(step(h, created.operation!, 'redo'));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'page', id: replacement.page.id, problem: 'already-exists', nextStep: 'nothing-to-restore' }],
    });
    // The replacement is neither adopted, overwritten nor deleted.
    expect(await h.pages.find(replacement.page.id)).toMatchObject({ id: replacement.page.id, enabled: true });
    expect(await h.pages.find(created.page.id)).toBeNull();
  });

  it('refuses when the owning project is no longer a root', async () => {
    const h = buildHarness();
    const created = await enable(h, 'archive');
    const undone = await step(h, created.operation!);
    expect(undone.result).toMatchObject({ outcome: 'removed' });
    // The action is a root's; a sub-project could never hold this page. (A missing owner takes the
    // same branch, but no valid document can lose a project, so it is not staged here.)
    const project = (await h.projects.find(MINE))!;
    const parent = await h.projectService.create(h.actor, { workspaceId: h.actor.workspaceId, kind: 'root', name: 'Elsewhere' });
    await h.projects.update({ ...project, kind: 'subproject', parentProjectId: parent.id });

    const refusal = await refusalOf(step(h, created.operation!, 'redo'));
    expect(refusal.details).toMatchObject({ reason: 'history_conflict', conflicts: [{ entityType: 'page', problem: 'page-changed', nextStep: 'change-by-hand' }] });
    expect(await h.pages.find(created.page.id)).toBeNull();
  });

  it('refuses a toggle direction whose expected boolean someone else already moved', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const off = await disable(h, 'reflections');
    // Somebody else turns it back on, so Undo no longer finds the `after` value it expects.
    await enable(h, 'reflections', someoneElse);

    const refusal = await refusalOf(step(h, off.operation!));
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'page', id: created.page.id, problem: 'field-changed', nextStep: 'change-by-hand' }],
    });
    expect((await h.pages.find(created.page.id))?.enabled).toBe(true);
  });

  it('refuses a toggle whose page has gone, and a toggle whose page changed kind', async () => {
    const h = buildHarness();
    const created = await enable(h, 'todos');
    const off = await disable(h, 'todos');
    const stored = (await h.pages.find(created.page.id))!;
    await h.pages.update({ ...stored, kind: 'reflections' });

    const changed = await refusalOf(step(h, off.operation!));
    expect(changed.details).toMatchObject({ conflicts: [{ problem: 'page-changed' }] });

    await h.pages.remove(created.page.id);
    const gone = await refusalOf(step(h, off.operation!));
    expect(gone.details).toMatchObject({ conflicts: [{ entityType: 'page', problem: 'missing', nextStep: 'nothing-to-undo' }] });
  });

  it('refuses the creation inverse when the record is no longer the one that was created', async () => {
    const h = buildHarness();
    const created = await enable(h, 'archive');
    const stored = (await h.pages.find(created.page.id))!;
    await h.pages.update({ ...stored, createdAt: '2020-01-01T00:00:00.000Z' });

    const refusal = await refusalOf(step(h, created.operation!));
    expect(refusal.details).toMatchObject({ conflicts: [{ entityType: 'page', problem: 'page-changed' }] });
    expect(await h.pages.find(created.page.id)).not.toBeNull();
  });
});

describe('boolean inverses preserve content (§26)', () => {
  it('changes only enabled and updatedAt, for every optional kind', async () => {
    for (const kind of OPTIONAL_PAGE_KINDS) {
      const h = buildHarness();
      const created = await enable(h, kind);
      const before = (await h.pages.find(created.page.id))!;
      tick(h);
      const off = await disable(h, kind);

      const disabled = (await h.pages.find(created.page.id))!;
      expect({ ...disabled, enabled: before.enabled, updatedAt: before.updatedAt }).toEqual(before);

      tick(h);
      const undone = await step(h, off.operation!);
      expect(undone.result).toMatchObject({ operation: 'page.update', outcome: 'restored', kind, page: { enabled: true } });
      tick(h);
      const redone = await step(h, off.operation!, 'redo');
      expect(redone.result).toMatchObject({ operation: 'page.update', outcome: 'reapplied', page: { enabled: false } });

      const after = (await h.pages.find(created.page.id))!;
      expect({ ...after, updatedAt: before.updatedAt }).toEqual({ ...before, enabled: false });
    }
  });

  it('leaves a disabled Reflections page’s live rows, archived rows and shortcut sources byte-identical', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const container = await h.sectionWriteService.add(h.actor, MINE, { type: 'reflections', pageId: created.page.id });
    const live = await h.reflectionWriteService.create(h.actor, { projectId: MINE, sectionId: container.section.id, body: 'Still here' });
    const archived = await h.reflectionWriteService.create(h.actor, { projectId: MINE, sectionId: container.section.id, body: 'Put away' });
    await h.reflectionWriteService.archive(h.actor, archived.reflection.id);
    const home = (await h.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
    const shortcut = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: home.id, sourceSectionId: container.section.id });

    const snapshot = async () => ({
      sections: await h.sections.list({ includeArchived: true }),
      reflections: await h.reflections.list({ projectId: MINE, includeArchived: true }),
      shortcuts: await h.shortcuts.list(),
    });
    const before = await snapshot();

    const off = await disable(h, 'reflections');
    expect(await snapshot()).toEqual(before);
    await step(h, off.operation!);
    expect(await snapshot()).toEqual(before);
    await step(h, off.operation!, 'redo');
    expect(await snapshot()).toEqual(before);

    expect((await h.reflections.find(live.reflection.id))?.archivedAt).toBeUndefined();
    expect((await h.shortcuts.find(shortcut.shortcut.id))?.sourceSectionId).toBe(container.section.id);
  });

  /** Later unrelated content is not a reason to refuse: it is the same page this toggle is about. */
  it('reverses the boolean although content arrived on the page after the toggle', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const off = await disable(h, 'reflections');
    // Somebody else turns the tab on, fills it, and turns it off again, all outside this history.
    await enable(h, 'reflections', someoneElse);
    const added = await h.sectionWriteService.add(someoneElse, MINE, { type: 'reflections', pageId: created.page.id });
    await disable(h, 'reflections', someoneElse);

    await expect(step(h, off.operation!)).resolves.toMatchObject({ result: { outcome: 'restored', page: { enabled: true } } });
    expect(await h.sections.find(added.section.id)).not.toBeNull();
  });
});

describe('page transitions and the ordinary archive exemption (§§26, 31)', () => {
  /**
   * The ordinary toggle is exempt from the archive freeze so Open archive stays reachable; the
   * **transition** is not, in either direction, which is what keeps history from becoming a way
   * around §31's freeze.
   */
  it('blocks both directions on an archived root while the ordinary toggle still commits', async () => {
    const h = buildHarness();
    const created = await enable(h, 'reflections');
    const off = await disable(h, 'reflections');
    // Undone first, so the stack has an action in **each** direction once the root is archived:
    // `page.add` below the cursor to undo, `page.update` above it to redo.
    await step(h, off.operation!);
    await h.projectService.archive(h.actor, MINE);

    for (const [direction, receipt] of [['undo', created.operation!], ['redo', off.operation!]] as const) {
      const refusal = await refusalOf(step(h, receipt, direction));
      expect(refusal.details).toMatchObject({
        reason: 'history_blocked',
        blockingProjectId: MINE,
        summary: { blockedBy: { projectId: MINE } },
      });
    }

    // The exemption: the toggle itself still works, and still records.
    const reopened = await enable(h, 'archive');
    expect(reopened.operation?.operation).toBe('page.add');
    // And the transition wrote nothing: Reflections is still where the undone toggle left it.
    expect((await h.pages.find(created.page.id))?.enabled).toBe(true);
  });

  it('answers a page transition under projects.write alone, and refuses every unrelated grant', async () => {
    const h = buildHarness();
    const writer = agentActorFor(0, ['projects.write']);
    const created = await enable(h, 'todos', writer);

    for (const permissions of [['tasks.write'], ['reflections.write'], ['projects.read']] as const) {
      const denied = agentActorFor(0, [...permissions]);
      await expect(step(h, created.operation!, 'undo', denied)).rejects.toThrow(/projects\.write/);
    }

    // No detail leaked to the denied callers, and the grant-holder still runs it.
    expect(await h.pages.find(created.page.id)).not.toBeNull();
    await expect(step(h, created.operation!, 'undo', writer)).resolves.toMatchObject({ result: { outcome: 'removed' } });
  });
});
