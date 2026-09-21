import {
  nameOf,
  ownedKindOf,
  ProjectSectionSchema,
  SectionRestoreOperationSchema,
  type OperationHistoryDirection,
  type PlacementSnapshot,
  type ProjectPage,
  type ProjectSection,
  type RedoResult,
  type Reflection,
  type SectionRestoreOperation,
  type Task,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
  type UndoRowChange,
} from '@cwm/contracts';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import {
  directionWord,
  isPlacementOf,
  refuseOnConflicts,
  type SectionHistoryRepositories,
} from './operation-execution';
import { rowsOf, writeRow, type OwnedRow } from './owned-rows';
import { listPlacements, renumberPlacements, resolveRestoreIndex, type PagePlacement } from './page-placements';
import { reflectionStructureOf, taskStructureOf } from './section-removal-undo';

/**
 * **Capture, Undo and Redo for `section.restore`** (Slice 37,
 * docs/decisions/2026-09-section-restore-and-shortcut-history.md).
 *
 * Restore stays what it was: a durable, receipt-free recovery that needs no history to invoke,
 * survives the 24-hour action lifetime and appends the section to the end of its page. What is new
 * is that a Restore which actually changed something also **records an action**, so the same actor
 * can take it back before undoing the removal underneath it. Undoing a Restore is therefore not a
 * removal: it writes the captured markers back and nothing else — no removal policy, no deletion,
 * no generation bump, no rows the Restore did not itself revive.
 *
 * Shared functions, not a service, for the reason every other executor is: `SectionService`
 * captures through them and `OperationHistoryService` executes through them, and neither composes
 * the other.
 */

/** Assembles and validates the operation from state read around the Restore's own writes. */
export const captureSectionRestore = (input: {
  section: ProjectSection;
  /** The archived marker and stale position the tombstone carried **before** this Restore. */
  archivedAt: string;
  oldPosition: number;
  placement: PlacementSnapshot;
  rows: readonly UndoRowChange[];
}): SectionRestoreOperation =>
  SectionRestoreOperationSchema.parse({
    version: 1,
    type: 'section.restore',
    sectionId: input.section.id,
    projectId: input.section.projectId,
    pageId: input.section.pageId,
    archivedAt: input.archivedAt,
    archiveGeneration: input.section.archiveGeneration,
    oldPosition: input.oldPosition,
    placement: input.placement,
    rows: [...input.rows],
  });

const nextStepFor = (problem: UndoConflict['problem']): UndoConflictNextStep => {
  switch (problem) {
    case 'missing':
      return 'nothing-to-restore';
    case 'not-archived':
      return 'nothing-to-undo';
    case 'archived-differently':
      return 'change-by-hand-or-archive';
    case 'field-changed':
      return 'change-by-hand';
    case 'archived-subject':
    case 'archive-state-changed':
      return 'restore-state-and-retry';
    case 'new-dependent':
      return 'restore-or-move-dependent-and-retry';
    case 'moved':
    case 'page-changed':
    case 'reparented':
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
  nextStep: nextStepFor(problem),
});

/**
 * The one conflict a Restore action can never recover from, so it retires rather than blocks
 * (docs/decisions/2026-09-operation-history-retired-actions.md): the section's `archiveGeneration`
 * has moved on, which only a later removal does and nothing moves back. Every other conflict —
 * a hand-edited marker, a move, a new row, a missing row — describes a state someone can restore.
 */
const isPermanent = (operation: SectionRestoreOperation) => (conflict: UndoConflict): boolean =>
  conflict.entityType === 'section' && conflict.id === operation.sectionId && conflict.problem === 'archived-differently';

const refuse = (
  direction: OperationHistoryDirection,
  operation: SectionRestoreOperation,
  section: ProjectSection | null,
  conflicts: readonly UndoConflict[],
): void =>
  refuseOnConflicts(
    conflicts,
    (shown) =>
      `${directionWord(direction)} of the restore of ${section === null ? `section [${operation.sectionId}]` : nameOf(section)} ` +
      `was refused: ${shown}`,
    isPermanent(operation),
  );

/** The structural state a row currently has, whichever kind it is. */
const structureOf = (change: UndoRowChange, row: OwnedRow): Record<string, unknown> =>
  change.kind === 'task' ? taskStructureOf(row as Task) : reflectionStructureOf(row as Reflection);

const rowTitle = (change: UndoRowChange, row: OwnedRow): string =>
  change.kind === 'task' ? (row as Task).title.trim() || 'Untitled task' : (row as Reflection).title?.trim() || 'Untitled reflection';

/** The problems one recorded row has against the structure the other direction left behind. */
const rowProblems = (change: UndoRowChange, current: OwnedRow, expected: Record<string, unknown>): UndoConflict[] => {
  const present = structureOf(change, current);
  const conflicts: UndoConflict[] = [];
  const conflict = (problem: UndoConflict['problem']) =>
    conflicts.push(makeConflict(change.kind, change.id, problem, rowTitle(change, current)));
  if (present['sectionId'] !== expected['sectionId']) conflict('moved');
  if (
    present['archivedAt'] !== expected['archivedAt'] ||
    present['archivedWithSectionId'] !== expected['archivedWithSectionId'] ||
    present['archivedWithTaskId'] !== expected['archivedWithTaskId']
  ) {
    conflict('archive-state-changed');
  }
  if (present['parentTaskId'] !== expected['parentTaskId']) conflict('reparented');
  return conflicts;
};

/** Every row the section owns now, archived ones included, indexed by id. */
const ownedRows = async (
  repositories: SectionHistoryRepositories,
  operation: SectionRestoreOperation,
  section: ProjectSection,
): Promise<OwnedRow[]> => {
  const owned = ownedKindOf(section.type);
  return owned === undefined ? [] : rowsOf(repositories, operation.sectionId, owned);
};

/** The conflicts every direction shares: the recorded rows must still be where the other side left them. */
const recordedRowConflicts = (
  operation: SectionRestoreOperation,
  rows: readonly OwnedRow[],
  side: 'before' | 'after',
): UndoConflict[] => {
  const byId = new Map<string, OwnedRow>(rows.map((row) => [row.id as string, row]));
  const conflicts: UndoConflict[] = [];
  for (const change of operation.rows) {
    const current = byId.get(change.id);
    if (current === undefined) conflicts.push(makeConflict(change.kind, change.id, 'missing'));
    else conflicts.push(...rowProblems(change, current, change[side] as Record<string, unknown>));
  }
  return conflicts;
};

/**
 * A row the transition would silently absorb, which is the thing an exact inverse must never do.
 *
 * Undoing a Restore archives the section, and a **live** row it holds that this Restore did not
 * revive would disappear under it. Redoing one revives the recorded rows, and a row now carrying
 * this section's archive marker that the Restore did not record would come back with them.
 */
const absorbedRowConflicts = (
  operation: SectionRestoreOperation,
  rows: readonly OwnedRow[],
  direction: OperationHistoryDirection,
): UndoConflict[] => {
  const recorded = new Set<string>(operation.rows.map((change) => change.id));
  const conflicts: UndoConflict[] = [];
  for (const row of rows) {
    if (recorded.has(row.id as string)) continue;
    const absorbed = direction === 'undo'
      ? row.archivedAt === undefined
      : row.archivedWithSectionId === operation.sectionId;
    if (!absorbed) continue;
    const kind = 'status' in row ? 'task' : 'reflection';
    const title = kind === 'task' ? (row as Task).title.trim() || 'Untitled task' : (row as Reflection).title?.trim() || 'Untitled reflection';
    conflicts.push(makeConflict(kind, row.id as string, 'new-dependent', title));
  }
  return conflicts;
};

/** The subject's page, which must still exist in the recorded project. */
const pageOf = async (
  repositories: SectionHistoryRepositories,
  operation: SectionRestoreOperation,
): Promise<ProjectPage | null> => {
  const page = await repositories.pages.find(operation.pageId);
  return page === null || page.projectId !== operation.projectId ? null : page;
};

/**
 * The placement check a move check would make: the section must still sit where the Restore left
 * it, judged by the neighbour `resolveRestoreIndex` would have used. Shared with `section-edit-undo`
 * in spirit rather than in code, because that copy is typed to a section edit operation.
 */
const stillAt = (placements: readonly PagePlacement[], sectionId: string, snapshot: PlacementSnapshot): boolean => {
  const index = placements.findIndex((placement) => placement.kind === 'section' && placement.value.id === sectionId);
  if (index < 0) return false;
  const survives = (ref: { kind: string; id: string }) => placements.some((placement) => isPlacementOf(placement, ref));
  if (snapshot.previous !== undefined && survives(snapshot.previous)) return isPlacementOf(placements[index - 1], snapshot.previous);
  if (snapshot.next !== undefined && survives(snapshot.next)) return isPlacementOf(placements[index + 1], snapshot.next);
  return true;
};

/** A placement that had neighbours but could only use the index lost its exact location. */
const lostLocation = (snapshot: PlacementSnapshot, strategy: 'previous' | 'next' | 'index'): boolean =>
  strategy === 'index' && (snapshot.previous !== undefined || snapshot.next !== undefined);

/** Writes each recorded row's `before` or `after` structure verbatim over its other fields. */
const writeRecordedRows = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionRestoreOperation,
  section: ProjectSection,
  side: 'before' | 'after',
): Promise<void> => {
  const owned = ownedKindOf(section.type);
  if (owned === undefined) return;
  for (const change of operation.rows) {
    const row = change.kind === 'task' ? await repositories.tasks.find(change.id) : await repositories.reflections.find(change.id);
    if (row === null) continue; // Unreachable: a missing row is a conflict before any write.
    const next = { ...row } as Record<string, unknown>;
    for (const key of ['sectionId', 'parentTaskId', 'archivedAt', 'archivedWithSectionId', 'archivedWithTaskId']) delete next[key];
    await writeRow(repositories, clock, owned, { ...next, ...change[side] } as OwnedRow);
  }
};

const affectedRowIds = (operation: SectionRestoreOperation): string[] => operation.rows.map((change) => change.id);

/**
 * Undo of one Restore: the section goes back to being archived, at the captured marker, generation
 * and stale position, and exactly the recorded rows go back down with it. Nothing else moves — a
 * row archived independently is untouched, unrelated fields survive, and `archiveGeneration` is
 * never rolled backwards or forwards.
 */
export const revertSectionRestore = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionRestoreOperation,
): Promise<UndoResult> => {
  const section = await repositories.sections.find(operation.sectionId);
  const page = await pageOf(repositories, operation);
  const conflicts: UndoConflict[] = [];
  if (section === null) conflicts.push(makeConflict('section', operation.sectionId, 'missing'));
  else if (section.archiveGeneration !== operation.archiveGeneration) {
    conflicts.push(makeConflict('section', operation.sectionId, 'archived-differently', nameOf(section)));
  } else if (section.archivedAt !== undefined) {
    conflicts.push(makeConflict('section', operation.sectionId, 'archive-state-changed', nameOf(section)));
  } else if (section.projectId !== operation.projectId || section.pageId !== operation.pageId || page === null) {
    conflicts.push(makeConflict('section', operation.sectionId, 'page-changed', nameOf(section)));
  }

  if (section !== null && conflicts.length === 0 && page !== null) {
    if (!stillAt(await listPlacements(repositories, page.id), operation.sectionId, operation.placement)) {
      conflicts.push(makeConflict('section', operation.sectionId, 'moved', nameOf(section)));
    }
    const rows = await ownedRows(repositories, operation, section);
    conflicts.push(...recordedRowConflicts(operation, rows, 'after'), ...absorbedRowConflicts(operation, rows, 'undo'));
  }
  refuse('undo', operation, section, conflicts);
  if (section === null) throw new EntityNotFoundError('section', operation.sectionId);
  if (page === null) throw new EntityNotFoundError('projectPage', operation.pageId);

  await writeRecordedRows(repositories, clock, operation, section, 'before');
  const archived = ProjectSectionSchema.parse({
    ...section,
    archivedAt: operation.archivedAt,
    position: operation.oldPosition,
    updatedAt: clock.now().toISOString(),
  });
  await repositories.sections.update(archived);
  // Read after the section is archived, so it has already left the live combined order and the
  // siblings it was sitting between close up densely.
  await renumberPlacements(repositories, clock, await listPlacements(repositories, page.id));

  return {
    operation: 'section.restore',
    outcome: 'restored',
    section: (await repositories.sections.find(operation.sectionId)) ?? archived,
    affectedRowIds: affectedRowIds(operation),
  };
};

/**
 * Redo of one Restore: the section comes back live with its recorded rows, at the placement this
 * Restore **committed** rather than appended to the end. The first ordinary Restore appends because
 * its old index means nothing; a Redo has a committed placement to return to, and returning to it
 * is what makes an Undo/Redo pair land where the actor left things.
 */
export const reapplySectionRestore = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionRestoreOperation,
): Promise<RedoResult> => {
  const section = await repositories.sections.find(operation.sectionId);
  const page = await pageOf(repositories, operation);
  const conflicts: UndoConflict[] = [];
  if (section === null) conflicts.push(makeConflict('section', operation.sectionId, 'missing'));
  else if (section.archiveGeneration !== operation.archiveGeneration) {
    conflicts.push(makeConflict('section', operation.sectionId, 'archived-differently', nameOf(section)));
  } else if (section.archivedAt === undefined) {
    conflicts.push(makeConflict('section', operation.sectionId, 'not-archived', nameOf(section)));
  } else if (section.archivedAt !== operation.archivedAt) {
    conflicts.push(makeConflict('section', operation.sectionId, 'archive-state-changed', nameOf(section)));
  } else if (section.projectId !== operation.projectId || section.pageId !== operation.pageId || page === null) {
    conflicts.push(makeConflict('section', operation.sectionId, 'page-changed', nameOf(section)));
  }

  if (section !== null && conflicts.length === 0) {
    const rows = await ownedRows(repositories, operation, section);
    conflicts.push(...recordedRowConflicts(operation, rows, 'before'), ...absorbedRowConflicts(operation, rows, 'redo'));
  }
  refuse('redo', operation, section, conflicts);
  if (section === null) throw new EntityNotFoundError('section', operation.sectionId);
  if (page === null) throw new EntityNotFoundError('projectPage', operation.pageId);

  // Read while the section is still archived, so it is not already in the list at its stale position.
  const current = await listPlacements(repositories, page.id);
  const { index, strategy } = resolveRestoreIndex(operation.placement, current);
  const restored = ProjectSectionSchema.parse({ ...section, position: index, updatedAt: clock.now().toISOString() });
  delete (restored as { archivedAt?: string }).archivedAt;
  await repositories.sections.update(restored);
  const ordered = [...current];
  ordered.splice(index, 0, { kind: 'section', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: restored.id });
  await writeRecordedRows(repositories, clock, operation, restored, 'after');

  return {
    operation: 'section.restore',
    outcome: lostLocation(operation.placement, strategy) ? 'partial' : 'reapplied',
    section: (await repositories.sections.find(operation.sectionId)) ?? restored,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
    affectedRowIds: affectedRowIds(operation),
  };
};
