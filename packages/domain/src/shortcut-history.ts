import {
  nameOf,
  SectionShortcutSchema,
  ShortcutAddOperationSchema,
  ShortcutMoveOperationSchema,
  ShortcutRemoveOperationSchema,
  ShortcutUpdateOperationSchema,
  type OperationHistoryDirection,
  type PlacementSnapshot,
  type Project,
  type ProjectId,
  type ProjectPage,
  type ProjectPageId,
  type ProjectSection,
  type RedoResult,
  type SectionShortcut,
  type SectionShortcutId,
  type ShortcutAddOperation,
  type ShortcutFieldChange,
  type ShortcutMoveOperation,
  type ShortcutRemoveOperation,
  type ShortcutUpdateOperation,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  SectionRepository,
  SectionShortcutRepository,
} from '@cwm/repositories';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import { directionWord, isPlacementOf, refuseOnConflicts } from './operation-execution';
import { listPlacements, renumberPlacements, resolveRestoreIndex, type PagePlacement } from './page-placements';

/**
 * **Capture, Undo and Redo for the four Home shortcut placements** (Slice 37, §§27, 31).
 *
 * A shortcut owns a placement and nothing else, and that is the whole shape of this module: every
 * inverse here writes `sectionShortcuts` and the combined page order, and **never** the source
 * section, its config or its rows. A later edit to the source is therefore not a conflict — it is
 * simply irrelevant to a reference — while a source that has gone missing, left the root tree or
 * moved onto the destination page itself is, because integrity would no longer allow the placement.
 *
 * The repository dependency is deliberately narrower than `SectionHistoryRepositories`: no task or
 * reflection repository appears, so a reviewer can see from the type that a shortcut transition
 * cannot reach a row.
 */

/** The four repositories a placement inverse reads and writes. Rows are deliberately absent. */
export interface ShortcutHistoryRepositories {
  shortcuts: SectionShortcutRepository;
  sections: SectionRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
}

type ShortcutPlacementOperation = ShortcutAddOperation | ShortcutRemoveOperation;
type ShortcutOperation = ShortcutPlacementOperation | ShortcutUpdateOperation | ShortcutMoveOperation;

/** Builds the operation stored for a created placement, with the placement Redo returns it to. */
export const captureShortcutAdd = (
  projectId: ProjectId,
  shortcut: SectionShortcut,
  placement: PlacementSnapshot,
): ShortcutAddOperation =>
  ShortcutAddOperationSchema.parse({ version: 1, type: 'shortcut.add', projectId, shortcut, placement });

/** Builds the operation stored for a deleted placement, captured while it was still live. */
export const captureShortcutRemove = (
  projectId: ProjectId,
  shortcut: SectionShortcut,
  placement: PlacementSnapshot,
): ShortcutRemoveOperation =>
  ShortcutRemoveOperationSchema.parse({ version: 1, type: 'shortcut.remove', projectId, shortcut, placement });

/** Builds the operation stored for the presentation fields one gesture actually changed. */
export const captureShortcutUpdate = (
  input: Omit<ShortcutUpdateOperation, 'version' | 'type'>,
): ShortcutUpdateOperation => ShortcutUpdateOperationSchema.parse({ version: 1, type: 'shortcut.update', ...input });

/** Builds the operation stored for a completed move, with both stable-neighbour snapshots. */
export const captureShortcutMove = (input: Omit<ShortcutMoveOperation, 'version' | 'type'>): ShortcutMoveOperation =>
  ShortcutMoveOperationSchema.parse({ version: 1, type: 'shortcut.move', ...input });

const nextStepFor = (problem: UndoConflict['problem'], entityType: UndoConflict['entityType']): UndoConflictNextStep => {
  switch (problem) {
    // A missing **placement** means the thing this direction would delete is already gone; a
    // missing **source** means the reference has nothing to point at and must be put back.
    case 'missing':
      return entityType === 'shortcut' ? 'nothing-to-undo' : 'nothing-to-restore';
    case 'already-exists':
      return 'nothing-to-restore';
    case 'field-changed':
      return 'change-by-hand';
    case 'moved':
    case 'page-changed':
      return 'move-back-and-retry';
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

const subjectIdOf = (operation: ShortcutOperation): SectionShortcutId =>
  operation.type === 'shortcut.add' || operation.type === 'shortcut.remove' ? operation.shortcut.id : operation.shortcutId;

const pageIdOf = (operation: ShortcutOperation): ProjectPageId =>
  operation.type === 'shortcut.add' || operation.type === 'shortcut.remove' ? operation.shortcut.pageId : operation.pageId;

/**
 * Only an occupied id on a recreation is permanent: the placement id can never be free again,
 * exactly as it cannot for a section add Redo. A missing or relocated **source** is not — the
 * source can be restored, moved back or unarchived, and a reference to a currently unavailable
 * source is a state the product already renders.
 */
const refuse = (
  direction: OperationHistoryDirection,
  operation: ShortcutOperation,
  conflicts: readonly UndoConflict[],
): void =>
  refuseOnConflicts(
    conflicts,
    (shown) =>
      `${directionWord(direction)} of the ${operation.type.replace('shortcut.', '')} on shortcut ` +
      `[${subjectIdOf(operation)}] was refused: ${shown}`,
    (conflict) => conflict.entityType === 'shortcut' && conflict.id === subjectIdOf(operation) && conflict.problem === 'already-exists',
  );

/** The destination Home page an action names, which must still be that project's Home page. */
const destinationOf = async (
  repositories: ShortcutHistoryRepositories,
  operation: ShortcutOperation,
): Promise<ProjectPage | null> => {
  const page = await repositories.pages.find(pageIdOf(operation));
  if (page === null || page.projectId !== operation.projectId || page.kind !== 'home') return null;
  return page;
};

/** The root of a project's ancestry, walked over the repository rather than a cached workspace list. */
const rootProjectOf = async (projects: ProjectRepository, project: Project): Promise<ProjectId> => {
  let current = project;
  const seen = new Set<ProjectId>([current.id]);
  while (current.parentProjectId !== undefined && !seen.has(current.parentProjectId)) {
    const parent = await projects.find(current.parentProjectId);
    if (parent === null) return current.id;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
};

/**
 * Whether a placement may point at this source **right now**, which is the integrity question
 * `SectionShortcutService` asks on an ordinary create minus the live-source rule: recovery of a
 * reference is allowed onto an archived or hidden source, where it renders as the existing
 * unavailable placeholder rather than as a second Add.
 */
const sourceConflicts = async (
  repositories: ShortcutHistoryRepositories,
  operation: ShortcutPlacementOperation,
  page: ProjectPage,
): Promise<UndoConflict[]> => {
  const sourceId = operation.shortcut.sourceSectionId;
  const source: ProjectSection | null = await repositories.sections.find(sourceId);
  if (source === null) return [makeConflict('section', sourceId, 'missing')];
  const [sourceProject, destinationProject] = await Promise.all([
    repositories.projects.find(source.projectId),
    repositories.projects.find(operation.projectId),
  ]);
  if (sourceProject === null || destinationProject === null) return [makeConflict('section', sourceId, 'missing')];
  if (sourceProject.workspaceId !== destinationProject.workspaceId) {
    return [makeConflict('section', sourceId, 'page-changed', nameOf(source))];
  }
  if ((await rootProjectOf(repositories.projects, sourceProject)) !== operation.projectId) {
    return [makeConflict('section', sourceId, 'page-changed', nameOf(source))];
  }
  // §27 and document integrity: a page never holds a shortcut to a section it owns.
  if (source.pageId === page.id) return [makeConflict('section', sourceId, 'page-changed', nameOf(source))];
  return [];
};

/** The placement record's own editable state, which a delete must not silently discard. */
const substantivePlacement = (shortcut: SectionShortcut): string =>
  JSON.stringify([shortcut.pageId, shortcut.sourceSectionId, shortcut.columnSpan, shortcut.collapsed]);

/** A placement that had neighbours but could only use the index lost its exact location. */
const lostLocation = (snapshot: PlacementSnapshot, strategy: 'previous' | 'next' | 'index'): boolean =>
  strategy === 'index' && (snapshot.previous !== undefined || snapshot.next !== undefined);

/** The subject must still sit where the other direction left it, judged by its recorded neighbours. */
const stillAt = (placements: readonly PagePlacement[], shortcutId: string, snapshot: PlacementSnapshot): boolean => {
  const index = placements.findIndex((placement) => placement.kind === 'shortcut' && placement.value.id === shortcutId);
  if (index < 0) return false;
  const survives = (ref: { kind: string; id: string }) => placements.some((placement) => isPlacementOf(placement, ref));
  if (snapshot.previous !== undefined && survives(snapshot.previous)) return isPlacementOf(placements[index - 1], snapshot.previous);
  if (snapshot.next !== undefined && survives(snapshot.next)) return isPlacementOf(placements[index + 1], snapshot.next);
  return true;
};

/** Deletes the recorded placement, refusing if it is not the one that was recorded. */
const deletePlacement = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutPlacementOperation,
  direction: OperationHistoryDirection,
): Promise<{ shortcutId: SectionShortcutId; projectId: ProjectId; pageId: ProjectPageId }> => {
  const page = await destinationOf(repositories, operation);
  const current = await repositories.shortcuts.find(operation.shortcut.id);
  const conflicts: UndoConflict[] = [];
  if (page === null) conflicts.push(makeConflict('shortcut', operation.shortcut.id, 'page-changed'));
  if (current === null) conflicts.push(makeConflict('shortcut', operation.shortcut.id, 'missing'));
  else if (current.pageId !== operation.shortcut.pageId) conflicts.push(makeConflict('shortcut', current.id, 'page-changed'));
  else if (substantivePlacement(current) !== substantivePlacement(operation.shortcut)) {
    conflicts.push(makeConflict('shortcut', current.id, 'field-changed'));
  }
  refuse(direction, operation, conflicts);
  if (page === null) throw new EntityNotFoundError('projectPage', operation.shortcut.pageId);

  await repositories.shortcuts.remove(operation.shortcut.id);
  await renumberPlacements(repositories, clock, await listPlacements(repositories, page.id));
  return { shortcutId: operation.shortcut.id, projectId: operation.projectId, pageId: page.id };
};

/** Recreates the recorded placement with the same id, at the placement this direction wants. */
const recreatePlacement = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutPlacementOperation,
  direction: OperationHistoryDirection,
): Promise<{
  shortcut: SectionShortcut;
  placement: { pageId: ProjectPageId; index: number; strategy: 'previous' | 'next' | 'index'; pageEnabled: boolean };
  partial: boolean;
}> => {
  const page = await destinationOf(repositories, operation);
  const existing = await repositories.shortcuts.find(operation.shortcut.id);
  const conflicts: UndoConflict[] = [];
  if (existing !== null) conflicts.push(makeConflict('shortcut', operation.shortcut.id, 'already-exists'));
  if (page === null) conflicts.push(makeConflict('shortcut', operation.shortcut.id, 'page-changed'));
  else conflicts.push(...(await sourceConflicts(repositories, operation, page)));
  refuse(direction, operation, conflicts);
  if (page === null) throw new EntityNotFoundError('projectPage', operation.shortcut.pageId);

  const placements = await listPlacements(repositories, page.id);
  const { index, strategy } = resolveRestoreIndex(operation.placement, placements);
  // `createdAt` is the original's: recreating a reference is the same reference returning, not a
  // second Add, and a fresh timestamp would make it sort as new work in every read that orders by it.
  const restored = SectionShortcutSchema.parse({
    ...operation.shortcut,
    position: index,
    updatedAt: clock.now().toISOString(),
  });
  await repositories.shortcuts.insert(restored);
  const ordered = [...placements];
  ordered.splice(index, 0, { kind: 'shortcut', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'shortcut', id: restored.id });
  return {
    shortcut: (await repositories.shortcuts.find(restored.id)) ?? restored,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
    partial: lostLocation(operation.placement, strategy),
  };
};

/** Undo of an add: the placement goes, and nothing about the source it pointed at moves. */
export const revertShortcutAdd = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutAddOperation,
): Promise<UndoResult> => ({
  operation: 'shortcut.add',
  outcome: 'removed',
  ...(await deletePlacement(repositories, clock, operation, 'undo')),
});

/** Redo of an add: the same placement id, back at its recorded placement. */
export const reapplyShortcutAdd = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutAddOperation,
): Promise<RedoResult> => {
  const { shortcut, placement, partial } = await recreatePlacement(repositories, clock, operation, 'redo');
  return {
    operation: 'shortcut.add',
    outcome: partial ? 'partial' : 'reapplied',
    shortcutId: shortcut.id,
    projectId: operation.projectId,
    pageId: placement.pageId,
    shortcut,
    placement,
  };
};

/** Undo of a removal: the same placement id returns between the neighbours it had. */
export const revertShortcutRemove = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutRemoveOperation,
): Promise<UndoResult> => {
  const { shortcut, placement, partial } = await recreatePlacement(repositories, clock, operation, 'undo');
  return {
    operation: 'shortcut.remove',
    outcome: partial ? 'partial' : 'restored',
    shortcutId: shortcut.id,
    projectId: operation.projectId,
    pageId: placement.pageId,
    shortcut,
    placement,
  };
};

/** Redo of a removal: the placement goes again. */
export const reapplyShortcutRemove = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutRemoveOperation,
): Promise<RedoResult> => ({
  operation: 'shortcut.remove',
  outcome: 'removed',
  ...(await deletePlacement(repositories, clock, operation, 'redo')),
});

const valueForChange = (shortcut: SectionShortcut, field: ShortcutFieldChange['field']): boolean | number =>
  field === 'collapsed' ? shortcut.collapsed : shortcut.columnSpan;

/** Writes one direction of a presentation update: exactly the recorded fields, nothing else. */
const writeUpdate = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutUpdateOperation,
  direction: OperationHistoryDirection,
): Promise<SectionShortcut> => {
  const page = await destinationOf(repositories, operation);
  const current = await repositories.shortcuts.find(operation.shortcutId);
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(makeConflict('shortcut', operation.shortcutId, 'missing'));
  else if (page === null || current.pageId !== operation.pageId) {
    conflicts.push(makeConflict('shortcut', operation.shortcutId, 'page-changed'));
  } else {
    // The value this direction expects to find is what the other direction left behind.
    const expected = direction === 'undo' ? 'after' : 'before';
    if (operation.changes.some((change) => valueForChange(current, change.field) !== change[expected])) {
      conflicts.push(makeConflict('shortcut', operation.shortcutId, 'field-changed'));
    }
  }
  refuse(direction, operation, conflicts);
  if (current === null) throw new EntityNotFoundError('sectionShortcut', operation.shortcutId);

  const next = { ...current };
  for (const change of operation.changes) {
    const value = direction === 'undo' ? change.before : change.after;
    if (change.field === 'collapsed') next.collapsed = value as boolean;
    else next.columnSpan = value as SectionShortcut['columnSpan'];
  }
  const written = SectionShortcutSchema.parse({ ...next, updatedAt: clock.now().toISOString() });
  await repositories.shortcuts.update(written);
  return written;
};

const updateResult = (operation: ShortcutUpdateOperation, shortcut: SectionShortcut) => ({
  shortcutId: operation.shortcutId,
  projectId: operation.projectId,
  pageId: operation.pageId,
  shortcut,
});

export const revertShortcutUpdate = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutUpdateOperation,
): Promise<UndoResult> => ({
  operation: 'shortcut.update',
  outcome: 'restored',
  ...updateResult(operation, await writeUpdate(repositories, clock, operation, 'undo')),
});

export const reapplyShortcutUpdate = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutUpdateOperation,
): Promise<RedoResult> => ({
  operation: 'shortcut.update',
  outcome: 'reapplied',
  ...updateResult(operation, await writeUpdate(repositories, clock, operation, 'redo')),
});

/** Moves one direction: from the placement the other direction left to the one this direction wants. */
const writeMove = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutMoveOperation,
  direction: OperationHistoryDirection,
) => {
  const page = await destinationOf(repositories, operation);
  const current = await repositories.shortcuts.find(operation.shortcutId);
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(makeConflict('shortcut', operation.shortcutId, 'missing'));
  else if (page === null || current.pageId !== operation.pageId) {
    conflicts.push(makeConflict('shortcut', operation.shortcutId, 'page-changed'));
  }
  const from = direction === 'undo' ? operation.placementAfter : operation.placementBefore;
  const to = direction === 'undo' ? operation.placementBefore : operation.placementAfter;
  const placements = page === null ? [] : await listPlacements(repositories, page.id);
  if (current !== null && conflicts.length === 0 && !stillAt(placements, operation.shortcutId, from)) {
    conflicts.push(makeConflict('shortcut', operation.shortcutId, 'moved'));
  }
  refuse(direction, operation, conflicts);
  if (current === null) throw new EntityNotFoundError('sectionShortcut', operation.shortcutId);
  if (page === null) throw new EntityNotFoundError('projectPage', operation.pageId);

  const without = placements.filter((placement) => !(placement.kind === 'shortcut' && placement.value.id === operation.shortcutId));
  const { index, strategy } = resolveRestoreIndex(to, without);
  const moved = SectionShortcutSchema.parse({ ...current, position: index, updatedAt: clock.now().toISOString() });
  await repositories.shortcuts.update(moved);
  const ordered = [...without];
  ordered.splice(index, 0, { kind: 'shortcut', value: moved });
  await renumberPlacements(repositories, clock, ordered, { kind: 'shortcut', id: operation.shortcutId });
  return {
    shortcut: (await repositories.shortcuts.find(operation.shortcutId)) ?? moved,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
    partial: lostLocation(to, strategy),
  };
};

export const revertShortcutMove = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutMoveOperation,
): Promise<UndoResult> => {
  const { shortcut, placement, partial } = await writeMove(repositories, clock, operation, 'undo');
  return {
    operation: 'shortcut.move',
    outcome: partial ? 'partial' : 'restored',
    shortcutId: operation.shortcutId,
    projectId: operation.projectId,
    pageId: operation.pageId,
    shortcut,
    placement,
  };
};

export const reapplyShortcutMove = async (
  repositories: ShortcutHistoryRepositories,
  clock: Clock,
  operation: ShortcutMoveOperation,
): Promise<RedoResult> => {
  const { shortcut, placement, partial } = await writeMove(repositories, clock, operation, 'redo');
  return {
    operation: 'shortcut.move',
    outcome: partial ? 'partial' : 'reapplied',
    shortcutId: operation.shortcutId,
    projectId: operation.projectId,
    pageId: operation.pageId,
    shortcut,
    placement,
  };
};
