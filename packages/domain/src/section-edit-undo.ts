import {
  nameOf,
  ProjectSectionSchema,
  SectionAddUndoOperationSchema,
  SectionMoveUndoOperationSchema,
  SectionUpdateUndoOperationSchema,
  type OperationHistoryDirection,
  type PlacementSnapshot,
  type ProjectId,
  type ProjectPage,
  type ProjectSection,
  type RedoResult,
  type SectionAddUndoOperation,
  type SectionFieldChange,
  type SectionMoveUndoOperation,
  type SectionUpdateUndoOperation,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
} from '@cwm/contracts';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import {
  directionWord,
  generationFloor,
  isPlacementOf,
  refuseOnConflicts,
  type SectionHistoryRepositories,
} from './operation-execution';
import { listPlacements, renumberPlacements, resolveRestoreIndex, type PagePlacement } from './page-placements';

/**
 * **Capture, Undo and Redo for the three explicit section edits** — `section.add`,
 * `section.move` and `section.update` (docs/decisions/2026-09-section-edit-undo-boundaries.md).
 *
 * Shared functions, not a service: `SectionService` captures through them and
 * `OperationHistoryService` executes through them, and neither composes the other. Each Undo/Redo
 * pair runs over the same captured footprint with **applied-state** checks — the recorded state
 * must still be what the other direction left — instead of the Slice 30 workspace supersession
 * scan, which a per-actor cursor makes unnecessary.
 */

type SectionEditOperation = SectionAddUndoOperation | SectionMoveUndoOperation | SectionUpdateUndoOperation;

/** Builds the operation stored for an explicit add, with the placement Redo returns it to. */
export const captureSectionAdd = (section: ProjectSection, placement: PlacementSnapshot): SectionAddUndoOperation =>
  SectionAddUndoOperationSchema.parse({ version: 1, type: 'section.add', section, placement });

/** Builds the operation stored for a completed move. */
export const captureSectionMove = (input: Omit<SectionMoveUndoOperation, 'version' | 'type'>): SectionMoveUndoOperation =>
  SectionMoveUndoOperationSchema.parse({ version: 1, type: 'section.move', ...input });

/** Builds the operation stored for the fields that actually changed. */
export const captureSectionUpdate = (input: Omit<SectionUpdateUndoOperation, 'version' | 'type'>): SectionUpdateUndoOperation =>
  SectionUpdateUndoOperationSchema.parse({ version: 1, type: 'section.update', ...input });

const titleValue = (section: ProjectSection): string | null => section.title ?? null;

/** Stable, editable state for the add operation; position and timestamps are intentionally absent. */
const substantiveSection = (section: ProjectSection): unknown => ({
  id: section.id,
  projectId: section.projectId,
  pageId: section.pageId,
  type: section.type,
  title: titleValue(section),
  columnSpan: section.columnSpan,
  collapsed: section.collapsed,
  config: section.config,
});

/** JSON equality with object-key order ignored and array order retained. */
export const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>).sort();
  const rightKeys = Object.keys(right as Record<string, unknown>).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
  ));
};

const nextStepFor = (problem: UndoConflict['problem']): UndoConflictNextStep => {
  switch (problem) {
    case 'missing':
    case 'not-archived':
      return 'nothing-to-undo';
    case 'already-exists':
      return 'nothing-to-restore';
    case 'field-changed':
    case 'archived-differently':
      return 'change-by-hand';
    case 'archived-subject':
    case 'archive-state-changed':
      return 'restore-state-and-retry';
    case 'shortcut-reference':
    case 'new-dependent':
      return 'remove-reference-and-retry';
    case 'moved':
    case 'page-changed':
    case 'reparented':
      return 'move-back-and-retry';
    default: {
      const unknown: never = problem;
      throw new TypeError(`no next step for ${String(unknown)}`);
    }
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

const subjectIdOf = (operation: SectionEditOperation): string =>
  operation.type === 'section.add' ? operation.section.id : operation.sectionId;

/** The subject's current name, else the add snapshot's, else its id — a missing section has no name to show. */
const titleOf = (operation: SectionEditOperation, section: ProjectSection | null): string => {
  if (section !== null) return nameOf(section);
  return operation.type === 'section.add' ? nameOf(operation.section) : `section [${operation.sectionId}]`;
};

/**
 * Refuses on conflicts. Only `already-exists` on the subject is permanent for an edit: every other
 * edit conflict — a missing, archived or changed section — can be repaired by someone's own Undo,
 * an Archive Restore or a manual change, so it blocks rather than retires.
 */
const refuse = (
  direction: OperationHistoryDirection,
  operation: SectionEditOperation,
  section: ProjectSection | null,
  conflicts: readonly UndoConflict[],
): void =>
  refuseOnConflicts(
    conflicts,
    (shown) => `${directionWord(direction)} of the ${operation.type.replace('section.', '')} on ${titleOf(operation, section)} was refused: ${shown}`,
    (conflict) => conflict.problem === 'already-exists' && conflict.id === subjectIdOf(operation),
  );

/** The operation's page, which must still exist in its project. */
const pageOf = async (
  repositories: SectionHistoryRepositories,
  operation: SectionEditOperation,
): Promise<{ page: ProjectPage | null; conflicts: UndoConflict[] }> => {
  const projectId = operation.type === 'section.add' ? operation.section.projectId : operation.projectId;
  const pageId = operation.type === 'section.add' ? operation.section.pageId : operation.pageId;
  const page = await repositories.pages.find(pageId);
  if (page === null || page.projectId !== projectId) {
    return { page: null, conflicts: [makeConflict('section', subjectIdOf(operation), 'page-changed')] };
  }
  return { page, conflicts: [] };
};

const referencesTo = async (
  repositories: SectionHistoryRepositories,
  projectId: ProjectId,
  sectionId: string,
): Promise<UndoConflict[]> => {
  const [tasks, reflections, shortcuts] = await Promise.all([
    repositories.tasks.list({ projectId, includeArchived: true }),
    repositories.reflections.list({ projectId, includeArchived: true }),
    repositories.shortcuts.list(),
  ]);
  const conflicts: UndoConflict[] = [];
  for (const task of tasks) {
    if (task.sectionId === sectionId || task.archivedWithSectionId === sectionId) {
      conflicts.push(makeConflict('task', task.id, 'new-dependent', task.title.trim() || 'Untitled task'));
    }
  }
  for (const reflection of reflections) {
    if (reflection.sectionId === sectionId || reflection.archivedWithSectionId === sectionId) {
      conflicts.push(makeConflict('reflection', reflection.id, 'new-dependent', reflection.title?.trim() || 'Untitled reflection'));
    }
  }
  for (const shortcut of shortcuts) {
    if (shortcut.sourceSectionId === sectionId) conflicts.push(makeConflict('shortcut', shortcut.id, 'shortcut-reference'));
  }
  return conflicts;
};

const valueForChange = (section: ProjectSection, field: SectionFieldChange['field']): unknown => {
  switch (field) {
    case 'title': return titleValue(section);
    case 'config': return section.config;
    case 'collapsed': return section.collapsed;
    case 'columnSpan': return section.columnSpan;
  }
};

/** The live-subject checks a move and an update share in both directions. */
const liveSubjectConflicts = (
  operation: SectionMoveUndoOperation | SectionUpdateUndoOperation,
  current: ProjectSection | null,
): UndoConflict[] => {
  if (current === null) return [makeConflict('section', operation.sectionId, 'missing')];
  if (current.archivedAt !== undefined) return [makeConflict('section', operation.sectionId, 'archived-subject', nameOf(current))];
  if (current.projectId !== operation.projectId || current.pageId !== operation.pageId) {
    return [makeConflict('section', operation.sectionId, 'page-changed', nameOf(current))];
  }
  return [];
};

/**
 * **The move check that replaces supersession.** The section must still sit where the other
 * direction left it, judged by its recorded neighbours, never by index — an index means nothing
 * once the page changes around it. It asks exactly the question `resolveRestoreIndex` answered
 * when it placed the section: after the surviving previous neighbour, else before the surviving
 * next one. Checking both would refuse a Redo straight after the actor's own Undo whenever someone
 * had put a section beside the neighbour that placement did not use. A recorded neighbour that no
 * longer survives is no evidence either way; the one placement used, no longer adjacent on its
 * recorded side, means somebody moved the section, and the move refuses.
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

/** Undo of an explicit add: deletes only the created section, refusing if anything came to depend on it. */
export const revertSectionAdd = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionAddUndoOperation,
): Promise<UndoResult> => {
  const { page, conflicts } = await pageOf(repositories, operation);
  const current = await repositories.sections.find(operation.section.id);
  if (current === null) conflicts.push(makeConflict('section', operation.section.id, 'missing'));
  else if (current.archivedAt !== undefined) conflicts.push(makeConflict('section', operation.section.id, 'archived-subject', nameOf(current)));
  else if (!sameValue(substantiveSection(current), substantiveSection(operation.section))) {
    conflicts.push(makeConflict('section', operation.section.id, 'field-changed', nameOf(current)));
  }
  if (current !== null) conflicts.push(...await referencesTo(repositories, operation.section.projectId, operation.section.id));
  refuse('undo', operation, current, conflicts);
  if (page === null) throw new EntityNotFoundError('page', operation.section.pageId);

  const placements = await listPlacements(repositories, page.id);
  const index = placements.findIndex((placement) => placement.kind === 'section' && placement.value.id === operation.section.id);
  if (index < 0) refuse('undo', operation, current, [makeConflict('section', operation.section.id, 'page-changed', nameOf(current ?? operation.section))]);
  await repositories.sections.remove(operation.section.id);
  await renumberPlacements(repositories, clock, placements.filter((_, placementIndex) => placementIndex !== index));
  return {
    operation: 'section.add',
    outcome: 'removed',
    sectionId: operation.section.id,
    projectId: operation.section.projectId,
    pageId: operation.section.pageId,
  };
};

/**
 * Redo of an explicit add: recreates the section **with the same id** and its recorded content,
 * at its recorded placement. Only `updatedAt` is stamped from the clock, and `archiveGeneration`
 * never drops below a removal some history still holds (`generationFloor`).
 */
export const reapplySectionAdd = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionAddUndoOperation,
): Promise<RedoResult> => {
  const { page, conflicts } = await pageOf(repositories, operation);
  const existing = await repositories.sections.find(operation.section.id);
  if (existing !== null) conflicts.push(makeConflict('section', operation.section.id, 'already-exists', nameOf(existing)));
  refuse('redo', operation, existing, conflicts);
  if (page === null) throw new EntityNotFoundError('page', operation.section.pageId);

  const placements = await listPlacements(repositories, page.id);
  const { index, strategy } = resolveRestoreIndex(operation.placement, placements);
  const restored = ProjectSectionSchema.parse({
    ...operation.section,
    position: index,
    archiveGeneration: await generationFloor(repositories, operation.section.id, operation.section.archiveGeneration),
    updatedAt: clock.now().toISOString(),
  });
  await repositories.sections.insert(restored);
  const ordered = [...placements];
  ordered.splice(index, 0, { kind: 'section', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: restored.id });
  return {
    operation: 'section.add',
    outcome: lostLocation(operation.placement, strategy) ? 'partial' : 'reapplied',
    section: (await repositories.sections.find(restored.id)) ?? restored,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
  };
};

/** Writes one direction of a settings update: exactly the recorded fields, nothing else. */
const writeUpdate = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionUpdateUndoOperation,
  direction: OperationHistoryDirection,
): Promise<ProjectSection> => {
  const current = await repositories.sections.find(operation.sectionId);
  const conflicts = [...(await pageOf(repositories, operation)).conflicts, ...liveSubjectConflicts(operation, current)];
  // The value this direction expects to find is what the other direction left behind.
  const expected = direction === 'undo' ? 'after' : 'before';
  if (current !== null && conflicts.length === 0 && operation.changes.some((change) => !sameValue(valueForChange(current, change.field), change[expected]))) {
    conflicts.push(makeConflict('section', operation.sectionId, 'field-changed', nameOf(current)));
  }
  refuse(direction, operation, current, conflicts);
  if (current === null) throw new EntityNotFoundError('section', operation.sectionId);

  const next = { ...current } as ProjectSection;
  for (const change of operation.changes) {
    const value = direction === 'undo' ? change.before : change.after;
    if (change.field === 'title') {
      if (value === null) delete next.title;
      else next.title = value as string;
    } else if (change.field === 'config') {
      next.config = structuredClone(value as ProjectSection['config']);
    } else if (change.field === 'collapsed') {
      next.collapsed = value as boolean;
    } else {
      next.columnSpan = value as ProjectSection['columnSpan'];
    }
  }
  const written = ProjectSectionSchema.parse({ ...next, updatedAt: clock.now().toISOString() });
  await repositories.sections.update(written);
  return written;
};

/** Undo of a settings update: restores the recorded `before` values and preserves every other field. */
export const revertSectionUpdate = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionUpdateUndoOperation,
): Promise<UndoResult> => ({
  operation: 'section.update',
  outcome: 'restored',
  section: await writeUpdate(repositories, clock, operation, 'undo'),
});

/** Redo of a settings update: writes the recorded `after` values back. */
export const reapplySectionUpdate = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionUpdateUndoOperation,
): Promise<RedoResult> => ({
  operation: 'section.update',
  outcome: 'reapplied',
  section: await writeUpdate(repositories, clock, operation, 'redo'),
});

/** Moves one direction: from the placement the other direction left to the one this direction wants. */
const writeMove = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionMoveUndoOperation,
  direction: OperationHistoryDirection,
) => {
  const { page, conflicts } = await pageOf(repositories, operation);
  const current = await repositories.sections.find(operation.sectionId);
  conflicts.push(...liveSubjectConflicts(operation, current));
  const from = direction === 'undo' ? operation.placementAfter : operation.placementBefore;
  const to = direction === 'undo' ? operation.placementBefore : operation.placementAfter;
  const placements = page === null ? [] : await listPlacements(repositories, page.id);
  if (current !== null && conflicts.length === 0 && !stillAt(placements, operation.sectionId, from)) {
    conflicts.push(makeConflict('section', operation.sectionId, 'moved', nameOf(current)));
  }
  refuse(direction, operation, current, conflicts);
  if (current === null) throw new EntityNotFoundError('section', operation.sectionId);
  if (page === null) throw new EntityNotFoundError('page', operation.pageId);

  const without = placements.filter((placement) => !(placement.kind === 'section' && placement.value.id === operation.sectionId));
  const { index, strategy } = resolveRestoreIndex(to, without);
  const moved = ProjectSectionSchema.parse({ ...current, position: index, updatedAt: clock.now().toISOString() });
  await repositories.sections.update(moved);
  const ordered = [...without];
  ordered.splice(index, 0, { kind: 'section', value: moved });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: operation.sectionId });
  return {
    section: (await repositories.sections.find(operation.sectionId)) ?? moved,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
    partial: lostLocation(to, strategy),
  };
};

/** Undo of a move: back to `placementBefore`, between surviving neighbours where it can. */
export const revertSectionMove = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionMoveUndoOperation,
): Promise<UndoResult> => {
  const { section, placement, partial } = await writeMove(repositories, clock, operation, 'undo');
  return { operation: 'section.move', outcome: partial ? 'partial' : 'restored', section, placement };
};

/** Redo of a move: back to `placementAfter`. */
export const reapplySectionMove = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionMoveUndoOperation,
): Promise<RedoResult> => {
  const { section, placement, partial } = await writeMove(repositories, clock, operation, 'redo');
  return { operation: 'section.move', outcome: partial ? 'partial' : 'reapplied', section, placement };
};
