import {
  PageAddOperationSchema,
  PageUpdateOperationSchema,
  ProjectPageSchema,
  isOptionalPageKind,
  nameOf,
  type OperationHistoryDirection,
  type OptionalProjectPageKind,
  type PageAddOperation,
  type PageUpdateOperation,
  type ProjectId,
  type ProjectPage,
  type ProjectPageId,
  type RedoResult,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
} from '@cwm/contracts';
import type { ProjectPageRepository, ProjectRepository, SectionRepository, SectionShortcutRepository } from '@cwm/repositories';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import { directionWord, refuseOnConflicts } from './operation-execution';

/**
 * **Capture, Undo and Redo for the two optional-page toggles** (Slice 38, §§26, 31;
 * docs/decisions/2026-09-optional-page-operation-history.md).
 *
 * §26 makes a toggle two different writes. The **first enable creates the record**
 * (docs/decisions/2026-09-optional-pages-are-created-on-first-enable.md), so its inverse is the
 * only deletion in this module — and it is exact: the same id, only when the page is still the one
 * that was created and nothing has come to reference it. Every later toggle writes one boolean,
 * so its inverse writes that boolean back and touches nothing else. Slice 34's creation rule is
 * why the first case deletes rather than disabling: a disable would leave a record the person never
 * made, and "off" and "never existed" are different states.
 *
 * The repository dependency is deliberately narrower than `SectionHistoryRepositories`: no task or
 * reflection repository appears, so a reviewer can see from the type that a page transition cannot
 * reach a row. A **section** is sufficient to protect all its rows — §27's ownership chain runs
 * `project → page → section → row`, so a page with no section has no row either — which is what
 * lets the preflight stop one level above the rows it is protecting.
 */

/** The four repositories a page inverse reads and writes. Rows are deliberately absent. */
export interface PageHistoryRepositories {
  pages: ProjectPageRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  projects: ProjectRepository;
}

type PageOperation = PageAddOperation | PageUpdateOperation;

/** Builds the operation stored for the enable that created an optional page's record. */
export const capturePageAdd = (page: ProjectPage): PageAddOperation =>
  PageAddOperationSchema.parse({ version: 1, type: 'page.add', page });

/** Builds the operation stored for one committed change of an existing page's boolean. */
export const capturePageUpdate = (input: Omit<PageUpdateOperation, 'version' | 'type'>): PageUpdateOperation =>
  PageUpdateOperationSchema.parse({ version: 1, type: 'page.update', ...input });

const nextStepFor = (problem: UndoConflict['problem'], entityType: UndoConflict['entityType']): UndoConflictNextStep => {
  switch (problem) {
    // A missing **page** means the record this direction would delete or write is already gone;
    // Undo has nothing left to undo, while Redo has nothing to put the boolean back on.
    case 'missing':
      return entityType === 'page' ? 'nothing-to-undo' : 'nothing-to-restore';
    case 'already-exists':
      return 'nothing-to-restore';
    // A page whose kind or owner changed, or whose boolean someone else moved, is a change outside
    // this actor's history: making it by hand is the repair, and §31 introduces no retirement here.
    case 'page-changed':
    case 'field-changed':
      return 'change-by-hand';
    // The dependency must actually go. Archiving it is **not** enough: an archived section still
    // names the page, and integrity still rejects deleting a page it points at.
    case 'new-dependent':
    case 'shortcut-reference':
      return 'remove-reference-and-retry';
    default:
      return 'change-by-hand';
  }
};

const makeConflict = (
  entityType: UndoConflict['entityType'],
  id: string,
  problem: UndoConflict['problem'],
  title?: string,
): UndoConflict => ({
  entityType,
  id,
  ...(problem === 'missing' || title === undefined ? {} : { title }),
  problem,
  nextStep: nextStepFor(problem, entityType),
});

/**
 * The optional kind a stored page record carries. `ProjectPageSchema` types `kind` as any of the
 * five, while both payloads have already refused Home and work, so this narrows what parsing
 * proved rather than asserting it — and a page whose kind changed under a live action is caught
 * here as a `TypeError` only if the conflict checks above somehow let it through.
 */
const optionalKindOf = (page: ProjectPage): OptionalProjectPageKind => {
  if (!isOptionalPageKind(page.kind)) throw new TypeError(`page [${page.id}] is not an optional page`);
  return page.kind;
};

const subjectOf = (
  operation: PageOperation,
): { projectId: ProjectId; pageId: ProjectPageId; kind: OptionalProjectPageKind | undefined } =>
  operation.type === 'page.add'
    ? { projectId: operation.page.projectId, pageId: operation.page.id, kind: optionalKindOf(operation.page) }
    : { projectId: operation.projectId, pageId: operation.pageId, kind: operation.kind };

/**
 * Refuses on conflicts. **Nothing here is permanent**: this phase introduces no new
 * permanent-retirement rule, so every conflict blocks and stays repairable. Even an occupied id —
 * a same-kind page created since — is a state someone can undo or a page they can disable and
 * remove through their own history, and adopting or overwriting it is exactly what a creation
 * inverse must never do.
 */
const refuse = (direction: OperationHistoryDirection, operation: PageOperation, conflicts: readonly UndoConflict[]): void => {
  const { pageId, kind } = subjectOf(operation);
  refuseOnConflicts(
    conflicts,
    (shown) =>
      `${directionWord(direction)} of the ${operation.type.replace('page.', '')} on the ` +
      `${kind ?? 'optional'} page [${pageId}] was refused: ${shown}`,
    () => false,
  );
};

/** The owning project, which must still exist in the workspace scope and still be a root. */
const ownerConflicts = async (
  repositories: PageHistoryRepositories,
  operation: PageOperation,
): Promise<UndoConflict[]> => {
  const { projectId, pageId } = subjectOf(operation);
  const project = await repositories.projects.find(projectId);
  // A page whose owner has gone, or is no longer a root, cannot hold an optional tab at all: §26
  // gives a sub-project one work canvas and no pages to configure.
  if (project === null || project.kind !== 'root') return [makeConflict('page', pageId, 'page-changed')];
  return [];
};

/**
 * Everything canonical that still names this page, and would be left dangling by deleting it.
 *
 * **A section is sufficient to protect all its rows.** There is no cascade and no opportunistic
 * cleanup: any dependency refuses the whole transition, including an empty retained container
 * §31 kept out of Archive, because retained is still stored and still references the page.
 *
 * Archived sections count. `remove-reference-and-retry` is the guidance precisely because
 * archiving a section does not release its page — commit-time integrity would reject the deletion
 * either way, so telling someone to archive it would be advice that cannot work.
 *
 * History snapshots deliberately do **not** appear here. An action holding a section whose page
 * this is does not pin the page alive: that section is not stored, so nothing dangles, and a
 * later section add that has been fully undone therefore leaves page-add Undo available again.
 */
const dependentConflicts = async (
  repositories: PageHistoryRepositories,
  pageId: ProjectPageId,
): Promise<UndoConflict[]> => {
  const [sections, shortcuts] = await Promise.all([
    repositories.sections.list({ pageId, includeArchived: true }),
    repositories.shortcuts.list({ pageId }),
  ]);
  return [
    ...sections.map((section) => makeConflict('section', section.id, 'new-dependent', nameOf(section))),
    ...shortcuts.map((shortcut) => makeConflict('shortcut', shortcut.id, 'shortcut-reference')),
  ];
};

/** The identity a first-enable inverse must still find: the same record, unchanged and still on. */
const unchangedCreation = (current: ProjectPage, operation: PageAddOperation): boolean =>
  current.projectId === operation.page.projectId &&
  current.kind === operation.page.kind &&
  current.createdAt === operation.page.createdAt &&
  current.enabled === operation.page.enabled;

/**
 * **Undo of a first enable: exact removal, or nothing.**
 *
 * `updatedAt` is deliberately ignored. The actor's own later toggles bump it, and undoing them in
 * order brings `enabled` back to `true` while leaving the newer timestamp behind — so comparing it
 * would make a correct Undo chain refuse its own last step. Everything that identifies the record
 * as the one the enable created is compared instead.
 */
export const revertPageAdd = async (
  repositories: PageHistoryRepositories,
  _clock: Clock,
  operation: PageAddOperation,
): Promise<UndoResult> => {
  const conflicts = await ownerConflicts(repositories, operation);
  const current = await repositories.pages.find(operation.page.id);
  if (current === null) conflicts.push(makeConflict('page', operation.page.id, 'missing'));
  else if (!unchangedCreation(current, operation)) {
    conflicts.push(makeConflict('page', current.id, current.enabled === operation.page.enabled ? 'page-changed' : 'field-changed'));
  }
  // Only worth asking once the record is still the one that would be deleted.
  if (current !== null && conflicts.length === 0) conflicts.push(...(await dependentConflicts(repositories, operation.page.id)));
  refuse('undo', operation, conflicts);
  if (current === null) throw new EntityNotFoundError('projectPage', operation.page.id);

  await repositories.pages.remove(operation.page.id);
  return {
    operation: 'page.add',
    outcome: 'removed',
    projectId: operation.page.projectId,
    pageId: operation.page.id,
    kind: optionalKindOf(operation.page),
  };
};

/**
 * **Redo of a first enable: the same page id returns.**
 *
 * `createdAt` is the original's, because this is the same tab coming back rather than a second
 * enable, and a fresh one would make it sort as new in every read that orders by it. Only
 * `updatedAt` comes from the clock. A page of that kind created since is a **conflict**, never
 * something to adopt, overwrite or delete: it is not the record this action made, and §26 gives a
 * root one page per kind.
 */
export const reapplyPageAdd = async (
  repositories: PageHistoryRepositories,
  clock: Clock,
  operation: PageAddOperation,
): Promise<RedoResult> => {
  const conflicts = await ownerConflicts(repositories, operation);
  const existing = await repositories.pages.find(operation.page.id);
  if (existing !== null) conflicts.push(makeConflict('page', operation.page.id, 'already-exists'));
  const replacement = (await repositories.pages.list({ projectId: operation.page.projectId, kind: operation.page.kind })).find(
    (page) => page.id !== operation.page.id,
  );
  if (replacement !== undefined) conflicts.push(makeConflict('page', replacement.id, 'already-exists'));
  refuse('redo', operation, conflicts);

  const recreated = ProjectPageSchema.parse({ ...operation.page, updatedAt: clock.now().toISOString() });
  await repositories.pages.insert(recreated);
  return {
    operation: 'page.add',
    outcome: 'reapplied',
    projectId: recreated.projectId,
    pageId: recreated.id,
    kind: optionalKindOf(recreated),
    page: recreated,
  };
};

/**
 * Writes one direction of a boolean change: **only `enabled` and `updatedAt`**.
 *
 * Sections, layout, rows and shortcut sources are untouched, archived content included, which is
 * what makes this reversal nondestructive in both directions. Later unrelated content is therefore
 * no reason to refuse — a page that filled up since is exactly the page this toggle is about.
 */
const writeToggle = async (
  repositories: PageHistoryRepositories,
  clock: Clock,
  operation: PageUpdateOperation,
  direction: OperationHistoryDirection,
): Promise<ProjectPage> => {
  const conflicts = await ownerConflicts(repositories, operation);
  const current = await repositories.pages.find(operation.pageId);
  if (current === null) conflicts.push(makeConflict('page', operation.pageId, 'missing'));
  else if (current.projectId !== operation.projectId || (operation.kind !== undefined && current.kind !== operation.kind)) {
    conflicts.push(makeConflict('page', current.id, 'page-changed'));
  } else if (current.enabled !== (direction === 'undo' ? operation.after : operation.before)) {
    // The value this direction expects to find is what the other direction left behind.
    conflicts.push(makeConflict('page', current.id, 'field-changed'));
  }
  refuse(direction, operation, conflicts);
  if (current === null) throw new EntityNotFoundError('projectPage', operation.pageId);

  const written = ProjectPageSchema.parse({
    ...current,
    enabled: direction === 'undo' ? operation.before : operation.after,
    updatedAt: clock.now().toISOString(),
  });
  await repositories.pages.update(written);
  return written;
};

const toggleResult = (operation: PageUpdateOperation, page: ProjectPage) => ({
  projectId: operation.projectId,
  pageId: operation.pageId,
  kind: optionalKindOf(page),
  page,
});

/** Undo of a toggle: the boolean goes back, and every section and row on the page stays put. */
export const revertPageUpdate = async (
  repositories: PageHistoryRepositories,
  clock: Clock,
  operation: PageUpdateOperation,
): Promise<UndoResult> => ({
  operation: 'page.update',
  outcome: 'restored',
  ...toggleResult(operation, await writeToggle(repositories, clock, operation, 'undo')),
});

/** Redo of a toggle: the boolean returns to what the write set, and nothing else moves. */
export const reapplyPageUpdate = async (
  repositories: PageHistoryRepositories,
  clock: Clock,
  operation: PageUpdateOperation,
): Promise<RedoResult> => ({
  operation: 'page.update',
  outcome: 'reapplied',
  ...toggleResult(operation, await writeToggle(repositories, clock, operation, 'redo')),
});
