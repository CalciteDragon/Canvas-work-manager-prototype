import {
  canonicalPageKindFor,
  nameOf,
  ownedKindOf,
  pageAcceptsSectionType,
  ProjectSectionSchema,
  SectionRemoveUndoOperationSchema,
  type AppliedRemovalPolicy,
  type OwnedDataKind,
  type PlacementSnapshot,
  type ProjectPage,
  type ProjectSection,
  type Reflection,
  type ReflectionStructuralState,
  type SectionId,
  type SectionRemoveUndoOperation,
  type SectionShortcut,
  type Task,
  type TaskStructuralState,
  type UndoConflict,
  type UndoRecord,
  type UndoResult,
  type UndoRowChange,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
  UndoRecordRepository,
} from '@cwm/repositories';
import type { Clock } from './clock';
import { EntityNotFoundError, undoRefusal } from './errors';
import { writeRow, type OwnedRow } from './owned-rows';
import { listPlacements, renumberPlacements, resolveRestoreIndex, type RestoreStrategy } from './page-placements';
import { findHighestWriteBlocker } from './project-visibility';
import { subjectSectionOf } from './undo-recorder';

/**
 * **The capture and the inverse for one operation type, `section.remove`.** Shared functions,
 * not a service: `SectionService.remove` captures through them and `UndoService` executes
 * through them, and neither composes the other (docs/decisions/2026-09-section-removal-undo-records.md,
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
  postSectionArchivedAt: string;
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
    postSectionArchivedAt: input.postSectionArchivedAt,
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

export interface SectionRemovalUndoRepositories {
  undoRecords: UndoRecordRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
}

const sameValue = (left: string | undefined, right: string | undefined): boolean => left === right;

/** The problems a snapshot row's current structure has against what removal left, in a fixed order. */
const rowProblems = (change: UndoRowChange, current: OwnedRow): UndoConflict[] => {
  const problems: UndoConflict[] = [];
  const conflict = (problem: UndoConflict['problem']) => problems.push({ entityType: change.kind, id: change.id, problem });
  const now = change.kind === 'task' ? taskStructureOf(current as Task) : reflectionStructureOf(current as Reflection);
  const after = change.after as Partial<TaskStructuralState>;
  const present = now as Partial<TaskStructuralState>;

  if (!sameValue(present.sectionId, after.sectionId)) conflict('moved');
  if (
    !sameValue(present.archivedAt, after.archivedAt) ||
    !sameValue(present.archivedWithSectionId, after.archivedWithSectionId) ||
    !sameValue(present.archivedWithTaskId, after.archivedWithTaskId)
  ) {
    conflict('archive-state-changed');
  }
  if (!sameValue(present.parentTaskId, after.parentTaskId)) conflict('reparented');
  return problems;
};

/**
 * Every reason Undo would overwrite a later write or break integrity, collected before anything
 * is written (decision rule 6): the section first, then snapshot rows in snapshot order, then
 * dependents in collection order.
 */
const collectConflicts = async (
  repositories: SectionRemovalUndoRepositories,
  record: UndoRecord,
  operation: SectionRemoveUndoOperation,
  section: ProjectSection | null,
): Promise<UndoConflict[]> => {
  const conflicts: UndoConflict[] = [];
  const sectionId = operation.section.id;
  const sectionConflict = (problem: UndoConflict['problem']) => conflicts.push({ entityType: 'section', id: sectionId, problem });

  if (section === null) sectionConflict('missing');
  else if (section.archivedAt === undefined) sectionConflict('not-archived');
  else if (section.archivedAt !== operation.postSectionArchivedAt) sectionConflict('archived-differently');
  if (section !== null && section.pageId !== operation.section.pageId) sectionConflict('moved');

  // Timestamps cannot tell two removals of the same section apart — an Archive Restore and a
  // re-removal can land in one clock instant, or under a clock set backwards — so a newer record
  // for this section, by sequence, decides.
  const newer = (await repositories.undoRecords.list({ workspaceId: record.workspaceId })).some(
    (other) => other.sequence > record.sequence && subjectSectionOf(other) === sectionId,
  );
  if (newer) sectionConflict('superseded');

  const tasks = await repositories.tasks.list({ projectId: record.projectId, includeArchived: true });
  const reflections = await repositories.reflections.list({ projectId: record.projectId, includeArchived: true });
  const tasksById = new Map(tasks.map((task) => [task.id as string, task]));
  const reflectionsById = new Map(reflections.map((reflection) => [reflection.id as string, reflection]));

  for (const change of operation.rows) {
    const current = change.kind === 'task' ? tasksById.get(change.id) : reflectionsById.get(change.id);
    if (current === undefined) conflicts.push({ entityType: change.kind, id: change.id, problem: 'missing' });
    else conflicts.push(...rowProblems(change, current));
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
      conflicts.push({ entityType: 'task', id: task.id, problem: 'new-dependent' });
    }
  }
  for (const reflection of reflections) {
    if (!recorded.has(reflection.id) && reflection.archivedWithSectionId === sectionId) {
      conflicts.push({ entityType: 'reflection', id: reflection.id, problem: 'new-dependent' });
    }
  }
  return conflicts;
};

/**
 * Reverses one section removal **inside the caller's unit of work**. Refusals — blocked,
 * conflicting, unavailable — throw before any write, so the caller's unit rolls back nothing
 * because nothing was written. It opens no unit, asserts no grant and records no activity:
 * `UndoService` does all three.
 */
export const executeSectionRemovalUndo = async (
  repositories: SectionRemovalUndoRepositories,
  clock: Clock,
  record: UndoRecord,
  operation: SectionRemoveUndoOperation,
): Promise<UndoResult> => {
  const project = await repositories.projects.find(record.projectId);
  if (project === null) throw new EntityNotFoundError('project', record.projectId);
  const blocker = await findHighestWriteBlocker(repositories.projects, project.id);
  if (blocker !== undefined) {
    throw undoRefusal(
      { reason: 'undo_blocked', undoId: record.id, blockingProjectId: blocker },
      `project "${blocker}" is archived; reactivate it before undoing this removal`,
    );
  }

  const section = await repositories.sections.find(operation.section.id);
  const conflicts = await collectConflicts(repositories, record, operation, section);
  if (conflicts.length > 0 || section === null) {
    throw undoRefusal(
      { reason: 'undo_conflict', undoId: record.id, conflicts },
      conflicts.map(({ entityType, id, problem }) => `${entityType} ${id} ${problem}`).join('; '),
    );
  }

  const canonicalPage = (await repositories.pages.list({ projectId: project.id, kind: canonicalPageKindFor(project.kind) }))[0];
  const destination = resolveUndoDestination({
    originalPage: await repositories.pages.find(section.pageId),
    canonicalPage,
    section,
    shortcutsOnCanonicalPage: canonicalPage === undefined ? [] : await repositories.shortcuts.list({ pageId: canonicalPage.id }),
  });
  if (destination.kind === 'unavailable') {
    throw undoRefusal(
      { reason: 'undo_unavailable', undoId: record.id, problem: destination.problem },
      `the ${nameOf(section)} section has no page it can return to (${destination.problem})`,
    );
  }

  // Read before the section is live, so it is not already in the list at its stale position.
  const current = await listPlacements(repositories, destination.page.id);
  const { index, strategy }: { index: number; strategy: RestoreStrategy | 'fallback-page' } =
    destination.kind === 'fallback'
      ? { index: current.length, strategy: 'fallback-page' }
      : resolveRestoreIndex(operation.placement, current);

  const restored = ProjectSectionSchema.parse({
    ...section,
    pageId: destination.page.id,
    position: index,
    updatedAt: clock.now().toISOString(),
  });
  delete (restored as { archivedAt?: string }).archivedAt;
  // Written explicitly: when its stale position already equals `index`, the renumber below would
  // skip it and it would never become live.
  await repositories.sections.update(restored);
  const ordered = [...current];
  ordered.splice(index, 0, { kind: 'section', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: restored.id });

  const owned = ownedKindOf(section.type);
  for (const change of operation.rows) {
    if (owned === undefined) break;
    const row =
      change.kind === 'task' ? await repositories.tasks.find(change.id) : await repositories.reflections.find(change.id);
    if (row === null) continue; // Unreachable: a missing row is a conflict above.
    const next = { ...row } as Record<string, unknown>;
    for (const key of ['sectionId', 'parentTaskId', 'archivedAt', 'archivedWithSectionId', 'archivedWithTaskId']) delete next[key];
    await writeRow(repositories, clock, owned, { ...next, ...change.before } as OwnedRow);
  }

  return {
    undoId: record.id,
    operation: 'section.remove',
    outcome: destination.kind === 'fallback' ? 'partial' : 'restored',
    section: (await repositories.sections.find(restored.id)) ?? restored,
    placement: { pageId: destination.page.id, index, strategy, pageEnabled: destination.page.enabled },
    restoredRowCount: operation.rows.length,
  };
};
