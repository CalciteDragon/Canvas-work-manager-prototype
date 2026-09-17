import {
  canonicalPageKindFor,
  nameOf,
  ownedKindOf,
  pageAcceptsSectionType,
  ProjectSectionSchema,
  SectionRemoveUndoOperationSchema,
  type AppliedRemovalPolicy,
  type OwnedDataKind,
  type SectionRemovalDisposition,
  type PlacementSnapshot,
  type ProjectPage,
  type ProjectSection,
  type RedoResult,
  type Reflection,
  type ReflectionStructuralState,
  type SectionId,
  type SectionRemoveUndoOperation,
  type SectionShortcut,
  type Task,
  type TaskStructuralState,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
  type UndoRowChange,
} from '@cwm/contracts';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import { OperationExecutionRefused, generationFloor, refuseOnConflicts, type SectionHistoryRepositories } from './operation-execution';
import { writeRow, type OwnedRow } from './owned-rows';
import { listPlacements, renumberPlacements, resolveRestoreIndex, type RestoreStrategy } from './page-placements';
import { sameValue } from './section-edit-undo';

/**
 * **Capture, Undo and Redo for `section.remove`.** Shared functions, not a service:
 * `SectionService.remove` captures through them and `OperationHistoryService` executes through
 * them, and neither composes the other (docs/decisions/2026-09-section-removal-undo-records.md,
 * rule 8).
 */

/** What `settleRows` did to a container's rows — the policy it applied and every row it wrote. */
export interface SettledRows {
  appliedPolicy: AppliedRemovalPolicy;
  reassignToSectionId?: SectionId;
  rows: UndoRowChange[];
}

export const NOTHING_SETTLED: SettledRows = { appliedPolicy: 'none', rows: [] };

const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;

/** The fields of a task an inverse writes. */
export const taskStructureOf = (task: Task): TaskStructuralState =>
  defined({
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    archivedAt: task.archivedAt,
    archivedWithSectionId: task.archivedWithSectionId,
    archivedWithTaskId: task.archivedWithTaskId,
  });

/** The fields of a reflection an inverse writes. */
export const reflectionStructureOf = (reflection: Reflection): ReflectionStructuralState =>
  defined({
    sectionId: reflection.sectionId,
    archivedAt: reflection.archivedAt,
    archivedWithSectionId: reflection.archivedWithSectionId,
  });

/** One row's change, from the row as read and the row as about to be written. */
export const rowChangeOf = (owned: OwnedDataKind, before: OwnedRow, after: OwnedRow): UndoRowChange =>
  owned === 'tasks'
    ? { kind: 'task', id: (before as Task).id, before: taskStructureOf(before as Task), after: taskStructureOf(after as Task) }
    : {
        kind: 'reflection',
        id: (before as Reflection).id,
        before: reflectionStructureOf(before as Reflection),
        after: reflectionStructureOf(after as Reflection),
      };

/** Assembles and validates the operation from state read before the removal wrote anything. */
export const captureSectionRemoval = (input: {
  section: ProjectSection;
  placement: PlacementSnapshot;
  settled: SettledRows;
  disposition: SectionRemovalDisposition;
  postSectionArchivedAt: string;
  archiveGeneration: number;
}): SectionRemoveUndoOperation =>
  SectionRemoveUndoOperationSchema.parse({
    version: 1,
    type: 'section.remove',
    section: input.section,
    placement: input.placement,
    appliedPolicy: input.settled.appliedPolicy,
    // Omitted rather than `undefined`, so the record in memory is the record written to disk.
    ...(input.settled.reassignToSectionId === undefined ? {} : { reassignToSectionId: input.settled.reassignToSectionId }),
    rows: input.settled.rows,
    disposition: input.disposition,
    postSectionArchivedAt: input.postSectionArchivedAt,
    archiveGeneration: input.archiveGeneration,
  });

export type UndoDestination =
  | { kind: 'original'; page: ProjectPage }
  | { kind: 'fallback'; page: ProjectPage }
  | { kind: 'unavailable'; problem: 'no-compatible-page' | 'shortcut-on-fallback-page' };

/**
 * **Where a removed section goes back to** — pure, so it can be tested directly.
 *
 * The original page when it exists, disabled or not: recovery is never behind a toggle. When it
 * is missing, the project's canonical page, appended and reported `partial` — provided that page
 * holds this type and holds no shortcut to the section, which integrity forbids on a section's
 * own page. Otherwise nothing, and Undo refuses before writing.
 *
 * In a valid document a retained section's page always exists (pages have no `remove`), so the
 * fallback branches are reachable only once a later slice recreates deleted sections; until then
 * the executor's missing-section conflict fires first.
 */
export const resolveUndoDestination = (input: {
  originalPage: ProjectPage | null;
  canonicalPage: ProjectPage | undefined;
  section: Pick<ProjectSection, 'id' | 'type'>;
  shortcutsOnCanonicalPage: readonly SectionShortcut[];
}): UndoDestination => {
  if (input.originalPage !== null) return { kind: 'original', page: input.originalPage };
  const canonical = input.canonicalPage;
  if (canonical === undefined || !pageAcceptsSectionType(canonical.kind, input.section.type)) {
    return { kind: 'unavailable', problem: 'no-compatible-page' };
  }
  if (input.shortcutsOnCanonicalPage.some((shortcut) => shortcut.sourceSectionId === input.section.id)) {
    return { kind: 'unavailable', problem: 'shortcut-on-fallback-page' };
  }
  return { kind: 'fallback', page: canonical };
};

const nextStepFor = (problem: UndoConflict['problem'], expectedLive: boolean): UndoConflictNextStep => {
  switch (problem) {
    case 'archived-differently':
    case 'field-changed':
    case 'archived-subject':
      return 'change-by-hand-or-archive';
    case 'not-archived':
      return 'nothing-to-undo';
    case 'missing':
    case 'already-exists':
      return 'nothing-to-restore';
    case 'moved':
    case 'page-changed':
    case 'reparented':
      return 'move-back-and-retry';
    case 'shortcut-reference':
      return 'remove-reference-and-retry';
    case 'archive-state-changed':
      return expectedLive ? 'restore-state-and-retry' : 'change-by-hand-or-archive';
    case 'new-dependent':
      return 'restore-or-move-dependent-and-retry';
  }
};

const makeConflict = (
  entityType: UndoConflict['entityType'],
  id: string,
  problem: UndoConflict['problem'],
  options: { title?: string; expectedLive?: boolean } = {},
): UndoConflict => ({
  entityType,
  id,
  ...(problem === 'missing' || options.title === undefined ? {} : { title: options.title }),
  problem,
  nextStep: nextStepFor(problem, options.expectedLive ?? false),
});

const rowTitle = (change: UndoRowChange, row: OwnedRow): string =>
  change.kind === 'task' ? (row as Task).title.trim() || 'Untitled task' : (row as Reflection).title?.trim() || 'Untitled reflection';

/** The problems one recorded row has against the structure the other direction left behind. */
const rowProblems = (change: UndoRowChange, current: OwnedRow, expected: Partial<TaskStructuralState>): UndoConflict[] => {
  const problems: UndoConflict[] = [];
  const conflict = (problem: UndoConflict['problem']) =>
    problems.push(makeConflict(change.kind, change.id, problem, { title: rowTitle(change, current), expectedLive: expected.archivedAt === undefined }));
  const present: Partial<TaskStructuralState> =
    change.kind === 'task' ? taskStructureOf(current as Task) : reflectionStructureOf(current as Reflection);
  if (present.sectionId !== expected.sectionId) conflict('moved');
  if (
    present.archivedAt !== expected.archivedAt ||
    present.archivedWithSectionId !== expected.archivedWithSectionId ||
    present.archivedWithTaskId !== expected.archivedWithTaskId
  ) {
    conflict('archive-state-changed');
  }
  if (present.parentTaskId !== expected.parentTaskId) conflict('reparented');
  return problems;
};

/** The project's rows, archived included, and the recorded ones by id. */
const projectRows = async (
  repositories: SectionHistoryRepositories,
  operation: SectionRemoveUndoOperation,
): Promise<{ tasks: Task[]; reflections: Reflection[]; byId: Map<string, OwnedRow> }> => {
  const projectId = operation.section.projectId;
  const tasks = await repositories.tasks.list({ projectId, includeArchived: true });
  const reflections = await repositories.reflections.list({ projectId, includeArchived: true });
  const byId = new Map<string, OwnedRow>([
    ...tasks.map((task) => [task.id as string, task] as const),
    ...reflections.map((reflection) => [reflection.id as string, reflection] as const),
  ]);
  return { tasks, reflections, byId };
};

/**
 * The conflicts that make a removal action unsatisfiable for good, so it retires rather than
 * blocks (docs/decisions/2026-09-operation-history-retired-actions.md). Every one is about the
 * section itself, and every one means its existence or generation moved somewhere no user action
 * can bring back, because `archiveGeneration` never decreases:
 *
 * - `not-archived` — Undo found the section live: it was restored out of band, and removing it
 *   again would advance the generation past the captured one.
 * - `archived-differently` — the section's generation or `archivedAt` is not the one this action
 *   left: another removal happened since.
 * - `missing` — a *retained* section's row is gone, which only a later disposable removal does.
 * - `already-exists` — Undo of a *deleted* removal found a section already holding the id.
 */
const isPermanent = (operation: SectionRemoveUndoOperation) => (conflict: UndoConflict): boolean =>
  conflict.entityType === 'section' &&
  conflict.id === operation.section.id &&
  (conflict.problem === 'not-archived' ||
    conflict.problem === 'archived-differently' ||
    conflict.problem === 'already-exists' ||
    (conflict.problem === 'missing' && operation.disposition === 'retained'));

const refuse = (direction: 'undo' | 'redo', operation: SectionRemoveUndoOperation, conflicts: readonly UndoConflict[]): void =>
  refuseOnConflicts(
    conflicts,
    (shown) =>
      `${direction === 'undo' ? 'Undo' : 'Redo'} for section "${nameOf(operation.section)}" [${operation.section.id}] was refused: ${shown}. ` +
      'Open Archive to restore saved content when available',
    isPermanent(operation),
  );

/**
 * Every reason Undo would overwrite a later write or break integrity, collected before anything
 * is written (decision rule 6): the section first, then recorded rows in record order, then
 * dependents in collection order.
 */
const revertConflicts = async (
  repositories: SectionHistoryRepositories,
  operation: SectionRemoveUndoOperation,
  section: ProjectSection | null,
): Promise<UndoConflict[]> => {
  const conflicts: UndoConflict[] = [];
  const sectionId = operation.section.id;
  const sectionConflict = (problem: UndoConflict['problem']) =>
    conflicts.push(makeConflict('section', sectionId, problem, { title: section === null ? undefined : nameOf(section) }));

  if (operation.disposition === 'deleted') {
    if (section !== null) sectionConflict('already-exists');
  } else if (section === null) {
    sectionConflict('missing');
  } else if (section.archivedAt === undefined) {
    sectionConflict('not-archived');
  } else {
    // **The removal check that replaces supersession.** Two removals of one section can land in a
    // single clock instant — an Archive Restore and a re-removal, or a clock set backwards — so
    // `archivedAt` alone would let this actor's Undo reverse another actor's removal. The
    // generation cannot collide: every removal advances it and nothing moves it back.
    if (section.archivedAt !== operation.postSectionArchivedAt || section.archiveGeneration !== operation.archiveGeneration) {
      sectionConflict('archived-differently');
    }
    if (section.pageId !== operation.section.pageId) sectionConflict('moved');
  }

  const { tasks, reflections, byId } = await projectRows(repositories, operation);
  for (const change of operation.rows) {
    const current = byId.get(change.id);
    if (current === undefined) conflicts.push(makeConflict(change.kind, change.id, 'missing'));
    else conflicts.push(...rowProblems(change, current, change.after));
  }

  const recorded = new Set<string>(operation.rows.map((change) => change.id));
  const movedTasks = new Set<string>(
    operation.rows.filter((change) => change.kind === 'task' && change.before.sectionId !== change.after.sectionId).map((change) => change.id),
  );
  for (const task of tasks) {
    if (recorded.has(task.id)) continue;
    const dependsOnMoved =
      (task.parentTaskId !== undefined && movedTasks.has(task.parentTaskId)) ||
      (task.archivedWithTaskId !== undefined && movedTasks.has(task.archivedWithTaskId));
    if (task.archivedWithSectionId === sectionId || dependsOnMoved) {
      conflicts.push(makeConflict('task', task.id, 'new-dependent', { title: task.title.trim() || 'Untitled task' }));
    }
  }
  for (const reflection of reflections) {
    if (!recorded.has(reflection.id) && reflection.archivedWithSectionId === sectionId) {
      conflicts.push(makeConflict('reflection', reflection.id, 'new-dependent', { title: reflection.title?.trim() || 'Untitled reflection' }));
    }
  }
  return conflicts;
};

/** Writes each recorded row's `before` or `after` structure verbatim over its other fields. */
const writeRecordedRows = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionRemoveUndoOperation,
  side: 'before' | 'after',
): Promise<void> => {
  const owned = ownedKindOf(operation.section.type);
  if (owned === undefined) return;
  for (const change of operation.rows) {
    const row = change.kind === 'task' ? await repositories.tasks.find(change.id) : await repositories.reflections.find(change.id);
    if (row === null) continue; // Unreachable: a missing row is a conflict before any write.
    const next = { ...row } as Record<string, unknown>;
    for (const key of ['sectionId', 'parentTaskId', 'archivedAt', 'archivedWithSectionId', 'archivedWithTaskId']) delete next[key];
    await writeRow(repositories, clock, owned, { ...next, ...change[side] } as OwnedRow);
  }
};

/**
 * Undo of one section removal, **inside the caller's unit of work**. Refusals throw before any
 * write. The section keeps the generation the removal captured — Undo never moves it back.
 */
export const revertSectionRemoval = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionRemoveUndoOperation,
): Promise<UndoResult> => {
  const project = await repositories.projects.find(operation.section.projectId);
  if (project === null) throw new EntityNotFoundError('project', operation.section.projectId);

  const section = await repositories.sections.find(operation.section.id);
  refuse('undo', operation, await revertConflicts(repositories, operation, section));

  const sectionToRestore = section ?? {
    ...operation.section,
    archiveGeneration: await generationFloor(repositories, operation.section.id, operation.archiveGeneration),
  };
  const canonicalPage = (await repositories.pages.list({ projectId: project.id, kind: canonicalPageKindFor(project.kind) }))[0];
  const destination = resolveUndoDestination({
    originalPage: await repositories.pages.find(sectionToRestore.pageId),
    canonicalPage,
    section: sectionToRestore,
    shortcutsOnCanonicalPage: canonicalPage === undefined ? [] : await repositories.shortcuts.list({ pageId: canonicalPage.id }),
  });
  if (destination.kind === 'unavailable') {
    throw new OperationExecutionRefused(
      { kind: 'unavailable', problem: destination.problem },
      `the ${nameOf(sectionToRestore)} section has no page it can return to (${destination.problem})`,
    );
  }

  // Read before the section is live, so it is not already in the list at its stale position.
  const current = await listPlacements(repositories, destination.page.id);
  const { index, strategy }: { index: number; strategy: RestoreStrategy | 'fallback-page' } =
    destination.kind === 'fallback'
      ? { index: current.length, strategy: 'fallback-page' }
      : resolveRestoreIndex(operation.placement, current);

  const restored = ProjectSectionSchema.parse({
    ...sectionToRestore,
    pageId: destination.page.id,
    position: index,
    updatedAt: clock.now().toISOString(),
  });
  delete (restored as { archivedAt?: string }).archivedAt;
  // Written explicitly: when its stale position already equals `index`, the renumber below would
  // skip it and it would never become live.
  if (section === null) await repositories.sections.insert(restored);
  else await repositories.sections.update(restored);
  const ordered = [...current];
  ordered.splice(index, 0, { kind: 'section', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: restored.id });

  await writeRecordedRows(repositories, clock, operation, 'before');

  return {
    operation: 'section.remove',
    outcome: destination.kind === 'fallback' ? 'partial' : 'restored',
    section: (await repositories.sections.find(restored.id)) ?? restored,
    placement: { pageId: destination.page.id, index, strategy, pageEnabled: destination.page.enabled },
    restoredRowCount: operation.rows.length,
  };
};

/** The editable content of a section, which a disposable removal destroys on Redo. */
const substanceOf = (section: ProjectSection): unknown => ({
  type: section.type,
  title: section.title ?? null,
  columnSpan: section.columnSpan,
  collapsed: section.collapsed,
  config: section.config,
});

/**
 * Everything that stops Redo re-removing exactly what the removal removed. Redo never absorbs
 * content created after the Undo: a row now in the section that was not recorded refuses, as does
 * a disposable section whose content changed or that something now references.
 */
const reapplyConflicts = async (
  repositories: SectionHistoryRepositories,
  operation: SectionRemoveUndoOperation,
  section: ProjectSection | null,
): Promise<UndoConflict[]> => {
  const sectionId = operation.section.id;
  if (section === null) return [makeConflict('section', sectionId, 'missing')];

  const conflicts: UndoConflict[] = [];
  const title = nameOf(section);
  // Undo left the section live at the generation this removal wrote; anything else is a later
  // removal, whether or not it has been reversed since.
  if (section.archivedAt !== undefined || section.archiveGeneration !== operation.archiveGeneration) {
    conflicts.push(makeConflict('section', sectionId, 'archived-differently', { title }));
  }
  if (section.pageId !== operation.section.pageId) conflicts.push(makeConflict('section', sectionId, 'moved', { title }));
  if (operation.disposition === 'deleted' && !sameValue(substanceOf(section), substanceOf(operation.section))) {
    conflicts.push(makeConflict('section', sectionId, 'field-changed', { title }));
  }

  const { tasks, reflections, byId } = await projectRows(repositories, operation);
  for (const change of operation.rows) {
    const current = byId.get(change.id);
    if (current === undefined) conflicts.push(makeConflict(change.kind, change.id, 'missing'));
    else conflicts.push(...rowProblems(change, current, change.before));
  }

  // A row the removal would now settle without having recorded it. A cascade archives live rows
  // and leaves independently archived ones alone, so only an unrecorded live row would be
  // absorbed; a reassign moves every row and a deletion needs none left, so any unrecorded row is.
  const recorded = new Set<string>(operation.rows.map((change) => change.id));
  const everyRow = operation.disposition === 'deleted' || operation.appliedPolicy === 'reassign';
  const absorbed = (row: { id: string; sectionId: string; archivedAt?: string; archivedWithSectionId?: string }) =>
    !recorded.has(row.id) &&
    ((row.sectionId === sectionId && (everyRow || row.archivedAt === undefined)) || (everyRow && row.archivedWithSectionId === sectionId));
  for (const task of tasks) {
    if (absorbed(task)) conflicts.push(makeConflict('task', task.id, 'new-dependent', { title: task.title.trim() || 'Untitled task' }));
  }
  for (const reflection of reflections) {
    if (absorbed(reflection)) {
      conflicts.push(makeConflict('reflection', reflection.id, 'new-dependent', { title: reflection.title?.trim() || 'Untitled reflection' }));
    }
  }

  if (operation.reassignToSectionId !== undefined) {
    const target = await repositories.sections.find(operation.reassignToSectionId);
    if (target === null) conflicts.push(makeConflict('section', operation.reassignToSectionId, 'missing'));
    else if (target.archivedAt !== undefined) conflicts.push(makeConflict('section', target.id, 'archived-subject', { title: nameOf(target) }));
  }

  if (operation.disposition === 'deleted') {
    for (const shortcut of await repositories.shortcuts.list()) {
      if (shortcut.sourceSectionId === sectionId) conflicts.push(makeConflict('shortcut', shortcut.id, 'shortcut-reference'));
    }
  }
  return conflicts;
};

/**
 * Redo of one section removal. It replays the recorded state **verbatim** — `archivedAt`, the
 * captured `archiveGeneration`, each row's markers — and stamps only `updatedAt` from the clock.
 * A fresh `archivedAt` or a bumped generation would make the next Undo of this same action refuse
 * as `archived-differently`. A removal recorded as `deleted` deletes the section again.
 */
export const reapplySectionRemoval = async (
  repositories: SectionHistoryRepositories,
  clock: Clock,
  operation: SectionRemoveUndoOperation,
): Promise<RedoResult> => {
  const section = await repositories.sections.find(operation.section.id);
  refuse('redo', operation, await reapplyConflicts(repositories, operation, section));
  if (section === null) throw new EntityNotFoundError('section', operation.section.id);

  await writeRecordedRows(repositories, clock, operation, 'after');
  const archived = ProjectSectionSchema.parse({
    ...section,
    archivedAt: operation.postSectionArchivedAt,
    archiveGeneration: operation.archiveGeneration,
    updatedAt: clock.now().toISOString(),
  });
  if (operation.disposition === 'retained') await repositories.sections.update(archived);
  else await repositories.sections.remove(section.id);
  await renumberPlacements(repositories, clock, await listPlacements(repositories, section.pageId));

  return {
    operation: 'section.remove',
    outcome: 'removed',
    section: archived,
    disposition: operation.disposition,
    settledRowCount: operation.rows.length,
  };
};
