import {
  nameOf,
  ProjectSectionSchema,
  TaskAddOperationSchema,
  TaskArchiveOperationSchema,
  TaskRestoreOperationSchema,
  TaskSchema,
  TaskUpdateOperationSchema,
  type CreatedContainer,
  type OperationHistoryDirection,
  type ProjectSection,
  type RedoResult,
  type Task,
  type TaskAddOperation,
  type TaskArchiveOperation,
  type TaskFieldChange,
  type TaskId,
  type TaskRestoreOperation,
  type TaskStructuralState,
  type TaskUpdateOperation,
  type TransitionPlacement,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
  type UndoRowChange,
} from '@cwm/contracts';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import {
  directionWord,
  refuseOnConflicts,
  type SectionHistoryRepositories,
} from './operation-execution';
import { taskStructureOf } from './section-removal-undo';
import { sameValue } from './section-edit-undo';
import { listPlacements, renumberPlacements, resolveRestoreIndex } from './page-placements';
import { generationFloor } from './operation-execution';

/**
 * **Capture, Undo and Redo for the four committed task operations** — `task.add`, `task.update`
 * (edits, completion, moves and reparents), `task.archive` and `task.restore`.
 *
 * Shared functions, not a service, for the reason `section-edit-undo.ts` gives: `TaskService`
 * captures through them and `OperationHistoryService` executes through them, and neither composes
 * the other, so the service graph stays acyclic and a transition can never record the inverse of
 * its own inverse. They run **inside the caller's unit of work**, open none, assert no grant and
 * record no activity, and every refusal is thrown before the first write.
 *
 * Slice 34 named this file. It holds capture **and** both executors, which is why it is not
 * `task-undo.ts` like `section-edit-undo.ts`.
 *
 * Two rules run through all of it.
 *
 * 1. **Compare only what was recorded.** A field inverse checks the fields it captured and no
 *    others, so another actor's edit to a different field survives; a structural inverse checks the
 *    rows it captured and refuses if the canonical footprint has changed around it.
 * 2. **Never absorb a later dependent.** A child, a subject link or a marker that arrived after the
 *    operation is not part of it, so a transition that would move, archive or orphan one refuses
 *    instead of quietly taking it along.
 */

/** The repositories a row executor reads and writes — the same set the section executors take. */
export type RowHistoryRepositories = SectionHistoryRepositories;

// ---------------------------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------------------------

/** Builds the operation stored for a create, with the container the create had to add, if any. */
export const captureTaskAdd = (task: Task, container?: CreatedContainer): TaskAddOperation =>
  TaskAddOperationSchema.parse({ version: 1, type: 'task.add', task, ...(container === undefined ? {} : { container }) });

/** Builds the operation stored for a committed edit, completion, move or reparent. */
export const captureTaskUpdate = (input: {
  taskId: TaskId;
  projectId: Task['projectId'];
  completion: boolean;
  changes: readonly TaskFieldChange[];
  rows: readonly UndoRowChange[];
}): TaskUpdateOperation =>
  TaskUpdateOperationSchema.parse({ version: 1, type: 'task.update', ...input, changes: [...input.changes], rows: [...input.rows] });

/** Builds the operation stored for an archive, with the exact rows the cascade wrote. */
export const captureTaskArchive = (input: {
  taskId: TaskId;
  projectId: Task['projectId'];
  rows: readonly UndoRowChange[];
}): TaskArchiveOperation =>
  TaskArchiveOperationSchema.parse({ version: 1, type: 'task.archive', ...input, rows: [...input.rows] });

/** Builds the operation stored for a restore, with the exact rows it cleared. */
export const captureTaskRestore = (input: {
  taskId: TaskId;
  projectId: Task['projectId'];
  rows: readonly UndoRowChange[];
}): TaskRestoreOperation =>
  TaskRestoreOperationSchema.parse({ version: 1, type: 'task.restore', ...input, rows: [...input.rows] });

/** One row's structural footprint, from the row as read and the row about to be written. */
export const taskRowChange = (before: Task, after: Task): UndoRowChange => ({
  kind: 'task',
  id: before.id,
  before: taskStructureOf(before),
  after: taskStructureOf(after),
});

/** `null` is a cleared optional field, so a change can say "there was a value, now there is none". */
const scalar = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/**
 * The scalar fields one write changed, in a fixed order.
 *
 * `status` and `completedAt` are emitted **together** whenever either moves: §34 stamps and clears
 * the timestamp from the status transition, so reversing one without the other would leave a done
 * task with no completion time. Structural fields are deliberately absent — they travel as `rows`.
 */
export const taskFieldChanges = (before: Task, after: Task): TaskFieldChange[] => {
  const changes: TaskFieldChange[] = [];
  if (before.title !== after.title) changes.push({ field: 'title', before: before.title, after: after.title });
  if (before.description !== after.description) {
    changes.push({ field: 'description', before: scalar(before.description), after: scalar(after.description) });
  }
  const completionMoved = before.status !== after.status || before.completedAt !== after.completedAt;
  if (completionMoved) {
    changes.push({ field: 'status', before: before.status, after: after.status });
    changes.push({ field: 'completedAt', before: scalar(before.completedAt), after: scalar(after.completedAt) });
  }
  if (before.priority !== after.priority) changes.push({ field: 'priority', before: before.priority, after: after.priority });
  if (before.estimate !== after.estimate) {
    changes.push({ field: 'estimate', before: scalar(before.estimate), after: scalar(after.estimate) });
  }
  if (before.startAt !== after.startAt) changes.push({ field: 'startAt', before: scalar(before.startAt), after: scalar(after.startAt) });
  if (before.dueAt !== after.dueAt) changes.push({ field: 'dueAt', before: scalar(before.dueAt), after: scalar(after.dueAt) });
  // A status that moved without changing, paired with an unchanged timestamp, is not a change: the
  // payload schema rejects a no-change field, so drop the pair rather than record a lie.
  return changes.filter((change) => !sameValue(change.before, change.after));
};

/** Whether this write crossed into `done`, which is what makes it a completion (§34, §57). */
export const isCompletion = (before: Task, after: Task): boolean => after.status === 'done' && before.status !== 'done';

// ---------------------------------------------------------------------------------------------
// Shared conflict vocabulary
// ---------------------------------------------------------------------------------------------

/**
 * The repair a row conflict suggests. Shared with `reflection-history.ts` so the two families give
 * one answer to the same problem.
 */
export const rowNextStepFor = (problem: UndoConflict['problem']): UndoConflictNextStep => {
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
      return 'remove-reference-and-retry';
    case 'new-dependent':
      return 'restore-or-move-dependent-and-retry';
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

/** One conflict, with the repair its problem implies. A missing entity has no name to show. */
export const rowConflict = (
  entityType: UndoConflict['entityType'],
  id: string,
  problem: UndoConflict['problem'],
  title?: string,
): UndoConflict => ({
  entityType,
  id,
  ...(problem === 'missing' || title === undefined ? {} : { title }),
  problem,
  nextStep: rowNextStepFor(problem),
});

/** A readable name for a row in a refusal sentence; a blank title reads as its kind. */
export const taskLabel = (task: Task | null, id: string): string => task?.title.trim() || `task [${id}]`;

/**
 * Refuses on conflicts.
 *
 * **No row conflict is permanent in this phase.** Every one of them describes a state someone can
 * put back: a row cannot be deleted by any ordinary operation, a missing row may be recreated by
 * another actor's Redo, and a dependent can be moved or archived by hand. An action that blocks is
 * reachable again; an action that retired never is, so "repairable" is the honest default until a
 * case is argued into the decision log
 * (docs/decisions/2026-09-operation-history-retired-actions.md).
 */
export const refuseRow = (
  direction: OperationHistoryDirection,
  what: string,
  subject: string,
  conflicts: readonly UndoConflict[],
): void =>
  refuseOnConflicts(
    conflicts,
    (shown) => `${directionWord(direction)} of the ${what} on ${subject} was refused: ${shown}`,
    () => false,
  );

// ---------------------------------------------------------------------------------------------
// Structural reads
// ---------------------------------------------------------------------------------------------

/** Every task in the project, archived ones included, by id — one read per transition. */
const projectTasks = async (
  repositories: RowHistoryRepositories,
  projectId: Task['projectId'],
): Promise<Map<TaskId, Task>> => {
  const rows = await repositories.tasks.list({ projectId, includeArchived: true });
  return new Map(rows.map((row) => [row.id, row]));
};

/**
 * Every descendant of `rootId` in `tasks`, archived ones included.
 *
 * Breadth-first over a snapshot rather than repeated repository reads, and guarded by a visited
 * set: the document's acyclic invariant makes the walk finite, and a hand-edited cycle makes it
 * terminate anyway rather than starve the event loop.
 */
export const descendantsOf = (tasks: ReadonlyMap<TaskId, Task>, rootId: TaskId): Task[] => {
  const byParent = new Map<TaskId, Task[]>();
  for (const task of tasks.values()) {
    if (task.parentTaskId === undefined) continue;
    const siblings = byParent.get(task.parentTaskId) ?? [];
    siblings.push(task);
    byParent.set(task.parentTaskId, siblings);
  }
  const found: Task[] = [];
  const seen = new Set<TaskId>([rootId]);
  const queue: TaskId[] = [rootId];
  while (queue.length > 0) {
    for (const child of byParent.get(queue.shift()!) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      found.push(child);
      queue.push(child.id);
    }
  }
  return found;
};

/** The container a row must sit in for a transition that leaves it live, with typed guidance. */
const liveContainerConflicts = async (
  repositories: RowHistoryRepositories,
  sectionId: Task['sectionId'],
  subjectId: string,
): Promise<UndoConflict[]> => {
  const section = await repositories.sections.find(sectionId);
  if (section === null) return [rowConflict('section', sectionId, 'missing')];
  if (section.archivedAt !== undefined) {
    // Typed guidance, not an integrity failure: a live row inside an archived container is the
    // state the document forbids, so the repair is to restore the section first.
    return [rowConflict('section', sectionId, 'archived-subject', nameOf(section))];
  }
  if (subjectId === sectionId) return [];
  return [];
};

/** The parent a row must hang off for a transition that leaves it live. */
const liveParentConflicts = (tasks: ReadonlyMap<TaskId, Task>, parentTaskId: TaskId | undefined): UndoConflict[] => {
  if (parentTaskId === undefined) return [];
  const parent = tasks.get(parentTaskId);
  if (parent === undefined) return [rowConflict('task', parentTaskId, 'missing')];
  if (parent.archivedAt !== undefined) return [rowConflict('task', parentTaskId, 'archived-subject', taskLabel(parent, parentTaskId))];
  return [];
};

/**
 * Which recorded row is not where the other direction left it.
 *
 * The comparison is the structural state alone: a title or status edit since the operation is not
 * structural, and is preserved rather than refused. The problem is named from what actually moved,
 * so the refusal suggests the right repair.
 */
const structuralConflicts = (
  tasks: ReadonlyMap<TaskId, Task>,
  rows: readonly UndoRowChange[],
  expected: 'before' | 'after',
): UndoConflict[] => {
  const conflicts: UndoConflict[] = [];
  for (const row of rows) {
    const current = tasks.get(row.id as TaskId);
    if (current === undefined) {
      conflicts.push(rowConflict('task', row.id, 'missing'));
      continue;
    }
    const want = row[expected] as TaskStructuralState;
    const have = taskStructureOf(current);
    if (sameValue(have, want)) continue;
    const problem =
      have.archivedAt !== want.archivedAt || have.archivedWithTaskId !== want.archivedWithTaskId || have.archivedWithSectionId !== want.archivedWithSectionId
        ? 'archive-state-changed'
        : have.parentTaskId !== want.parentTaskId
          ? 'reparented'
          : 'moved';
    conflicts.push(rowConflict('task', row.id, problem, taskLabel(current, row.id)));
  }
  return conflicts;
};

/**
 * **The footprint check that keeps a later dependent out of an old action.**
 *
 * A move, an archive or a restore wrote a set of rows. Running it in either direction again must
 * write exactly that set: a descendant that arrived afterwards is nobody's business but its own,
 * and dragging it along — into another section, or into an archive it never joined — would be this
 * operation silently growing. `relevant` says which of today's descendants this transition would
 * touch; any of them the action never recorded is a conflict.
 */
const unrecordedDependents = (
  tasks: ReadonlyMap<TaskId, Task>,
  rootId: TaskId,
  rows: readonly UndoRowChange[],
  relevant: (task: Task) => boolean,
): UndoConflict[] => {
  const recorded = new Set(rows.map((row) => row.id));
  return descendantsOf(tasks, rootId)
    .filter((task) => !recorded.has(task.id) && relevant(task))
    .map((task) => rowConflict('task', task.id, 'new-dependent', taskLabel(task, task.id)));
};

/** Writes one row's structural state, preserving every field the inverse does not own. */
const writeStructure = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  current: Task,
  state: TaskStructuralState,
): Promise<Task> => {
  const next: Record<string, unknown> = { ...current, sectionId: state.sectionId, updatedAt: clock.now().toISOString() };
  for (const key of ['parentTaskId', 'archivedAt', 'archivedWithSectionId', 'archivedWithTaskId'] as const) {
    if (state[key] === undefined) delete next[key];
    else next[key] = state[key];
  }
  const written = TaskSchema.parse(next);
  await repositories.tasks.update(written);
  return written;
};

/** Reads back what the repository now holds, so a result is never a hopeful projection. */
const reread = async (repositories: RowHistoryRepositories, task: Task): Promise<Task> =>
  (await repositories.tasks.find(task.id)) ?? task;

// ---------------------------------------------------------------------------------------------
// task.add
// ---------------------------------------------------------------------------------------------

/** Stable, editable state for the created task; timestamps are intentionally absent. */
const substantiveTask = (task: Task): unknown => ({
  id: task.id,
  projectId: task.projectId,
  sectionId: task.sectionId,
  parentTaskId: task.parentTaskId ?? null,
  title: task.title,
  description: task.description ?? null,
  status: task.status,
  priority: task.priority,
  estimate: task.estimate ?? null,
  startAt: task.startAt ?? null,
  dueAt: task.dueAt ?? null,
  completedAt: task.completedAt ?? null,
});

/** Stable, editable state for a created container; position and timestamps are intentionally absent. */
const substantiveSection = (section: ProjectSection): unknown => ({
  id: section.id,
  projectId: section.projectId,
  pageId: section.pageId,
  type: section.type,
  title: section.title ?? null,
  columnSpan: section.columnSpan,
  collapsed: section.collapsed,
  config: section.config,
});

/**
 * **Whether the implicit container may be removed with the row.**
 *
 * The compound is one action, so it is undone whole or not at all: never partially, by silently
 * keeping the section. If the section has acquired rows of its own, a shortcut, a meaningful edit
 * or any outside reference, the whole Undo refuses.
 */
export const createdContainerConflicts = async (
  repositories: RowHistoryRepositories,
  container: CreatedContainer,
  rowId: string,
): Promise<UndoConflict[]> => {
  const conflicts: UndoConflict[] = [];
  const current = await repositories.sections.find(container.section.id);
  if (current === null) {
    // Nothing to remove, and nothing repairable to say about the row either: the compound's own
    // section is gone, so this Undo is not the one that removes it.
    return [rowConflict('section', container.section.id, 'missing')];
  }
  if (current.archivedAt !== undefined) {
    conflicts.push(rowConflict('section', container.section.id, 'archived-subject', nameOf(current)));
  } else if (!sameValue(substantiveSection(current), substantiveSection(container.section))) {
    conflicts.push(rowConflict('section', container.section.id, 'field-changed', nameOf(current)));
  }
  const [tasks, reflections, shortcuts] = await Promise.all([
    repositories.tasks.list({ sectionId: container.section.id, includeArchived: true }),
    repositories.reflections.list({ sectionId: container.section.id, includeArchived: true }),
    repositories.shortcuts.list(),
  ]);
  for (const task of tasks) {
    if (task.id === rowId) continue;
    conflicts.push(rowConflict('task', task.id, 'new-dependent', taskLabel(task, task.id)));
  }
  for (const reflection of reflections) {
    if (reflection.id === rowId) continue;
    conflicts.push(rowConflict('reflection', reflection.id, 'new-dependent', reflection.title?.trim() || 'Untitled reflection'));
  }
  // An archived row that named this container on the way down is a reference too.
  for (const task of await repositories.tasks.list({ projectId: container.section.projectId, includeArchived: true })) {
    if (task.archivedWithSectionId === container.section.id) {
      conflicts.push(rowConflict('task', task.id, 'new-dependent', taskLabel(task, task.id)));
    }
  }
  for (const reflection of await repositories.reflections.list({ projectId: container.section.projectId, includeArchived: true })) {
    if (reflection.archivedWithSectionId === container.section.id) {
      conflicts.push(rowConflict('reflection', reflection.id, 'new-dependent', reflection.title?.trim() || 'Untitled reflection'));
    }
  }
  for (const shortcut of shortcuts) {
    if (shortcut.sourceSectionId === container.section.id) {
      conflicts.push(rowConflict('shortcut', shortcut.id, 'shortcut-reference'));
    }
  }
  return conflicts;
};

/**
 * Removes a created container and closes the gap it leaves in its page's combined order. Exported
 * because both row families create containers implicitly and undo them identically.
 */
export const removeCreatedContainer = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  section: ProjectSection,
): Promise<void> => {
  const placements = await listPlacements(repositories, section.pageId);
  await repositories.sections.remove(section.id);
  await renumberPlacements(
    repositories,
    clock,
    placements.filter((placement) => !(placement.kind === 'section' && placement.value.id === section.id)),
  );
};

/**
 * Recreates a container at its recorded placement, between surviving neighbours where it can.
 *
 * It reuses the helpers the section family already exports — `resolveRestoreIndex` for the index
 * and `generationFloor` so a recreated section never carries a generation older than a removal some
 * history still holds. Siblings shifted by the insert keep their `updatedAt`: nobody edited them.
 */
export const restoreCreatedContainer = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  container: CreatedContainer,
): Promise<{ section: ProjectSection; placement: TransitionPlacement; partial: boolean }> => {
  const page = await repositories.pages.find(container.section.pageId);
  if (page === null || page.projectId !== container.section.projectId) {
    throw new EntityNotFoundError('projectPage', container.section.pageId);
  }
  const placements = await listPlacements(repositories, page.id);
  const { index, strategy } = resolveRestoreIndex(container.placement, placements);
  const restored = ProjectSectionSchema.parse({
    ...container.section,
    position: index,
    archiveGeneration: await generationFloor(repositories, container.section.id, container.section.archiveGeneration),
    updatedAt: clock.now().toISOString(),
  });
  await repositories.sections.insert(restored);
  const ordered = [...placements];
  ordered.splice(index, 0, { kind: 'section', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: restored.id });
  return {
    section: (await repositories.sections.find(restored.id)) ?? restored,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
    // A placement that had neighbours but could only use the recorded index lost its exact spot.
    partial: strategy === 'index' && (container.placement.previous !== undefined || container.placement.next !== undefined),
  };
};

/**
 * Undo of a create: deletes **only** the created row, and the container the create made when it
 * made one.
 *
 * It refuses if the row was substantively edited or acquired anything canonical — a child, a
 * reflection subject link, a cascade-marker reference — because those are somebody else's work
 * hanging off a row this would delete. Its activity line survives, because a version-5 event
 * captured the row's identity when it was written
 * (docs/decisions/2026-09-historical-activity-identity.md).
 */
export const revertTaskAdd = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskAddOperation,
): Promise<UndoResult> => {
  const { task: created, container } = operation;
  const conflicts: UndoConflict[] = [];
  const current = await repositories.tasks.find(created.id);
  if (current === null) conflicts.push(rowConflict('task', created.id, 'missing'));
  else if (current.archivedAt !== undefined) {
    conflicts.push(rowConflict('task', created.id, 'archived-subject', taskLabel(current, created.id)));
  } else if (!sameValue(substantiveTask(current), substantiveTask(created))) {
    conflicts.push(rowConflict('task', created.id, 'field-changed', taskLabel(current, created.id)));
  }

  if (current !== null) {
    const [tasks, reflections] = await Promise.all([
      repositories.tasks.list({ projectId: created.projectId, includeArchived: true }),
      repositories.reflections.list({ projectId: created.projectId, includeArchived: true }),
    ]);
    for (const task of tasks) {
      // A child, or a row that came down with this one's archive: either way it would be orphaned.
      if (task.parentTaskId === created.id || task.archivedWithTaskId === created.id) {
        conflicts.push(rowConflict('task', task.id, 'new-dependent', taskLabel(task, task.id)));
      }
    }
    for (const reflection of reflections) {
      if (reflection.subject?.kind === 'task' && reflection.subject.id === created.id) {
        conflicts.push(rowConflict('reflection', reflection.id, 'new-dependent', reflection.title?.trim() || 'Untitled reflection'));
      }
    }
  }
  if (container !== undefined) conflicts.push(...(await createdContainerConflicts(repositories, container, created.id)));

  refuseRow('undo', 'creation', taskLabel(current, created.id), conflicts);

  await repositories.tasks.remove(created.id);
  if (container !== undefined) await removeCreatedContainer(repositories, clock, container.section);
  return {
    operation: 'task.add',
    outcome: 'removed',
    taskId: created.id,
    projectId: created.projectId,
    ...(container === undefined ? {} : { removedSectionId: container.section.id }),
  };
};

/**
 * Redo of a create: the same ids back, from captured values rather than a new create request.
 *
 * The container is restored first when the add made one, so the row has somewhere to go. Only
 * `updatedAt` comes from the clock: `createdAt` and every business date are the captured ones,
 * because a Redo is the same creation happening again, not a later one.
 */
export const reapplyTaskAdd = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskAddOperation,
): Promise<RedoResult> => {
  const { task: created, container } = operation;
  const conflicts: UndoConflict[] = [];
  const existing = await repositories.tasks.find(created.id);
  // Another actor's Redo may already have recreated it. Repairable: they can undo theirs again.
  if (existing !== null) conflicts.push(rowConflict('task', created.id, 'already-exists', taskLabel(existing, created.id)));
  const project = await repositories.projects.find(created.projectId);
  if (project === null) conflicts.push(rowConflict('section', created.sectionId, 'missing'));

  const containerMissing = container !== undefined && (await repositories.sections.find(container.section.id)) === null;
  if (!containerMissing) conflicts.push(...(await liveContainerConflicts(repositories, created.sectionId, created.id)));
  const tasks = await projectTasks(repositories, created.projectId);
  conflicts.push(...liveParentConflicts(tasks, created.parentTaskId));

  refuseRow('redo', 'creation', taskLabel(created, created.id), conflicts);

  const restored = containerMissing ? await restoreCreatedContainer(repositories, clock, container!) : undefined;
  const task = TaskSchema.parse({ ...created, updatedAt: clock.now().toISOString() });
  await repositories.tasks.insert(task);
  return {
    operation: 'task.add',
    outcome: restored?.partial === true ? 'partial' : 'reapplied',
    task: await reread(repositories, task),
    ...(restored === undefined ? {} : { container: { section: restored.section, placement: restored.placement } }),
  };
};

// ---------------------------------------------------------------------------------------------
// task.update
// ---------------------------------------------------------------------------------------------

/** The value a recorded field currently holds, as a change records it. */
const valueOf = (task: Task, field: TaskFieldChange['field']): unknown => {
  switch (field) {
    case 'title': return task.title;
    case 'description': return scalar(task.description);
    case 'status': return task.status;
    case 'completedAt': return scalar(task.completedAt);
    case 'priority': return task.priority;
    case 'estimate': return scalar(task.estimate);
    case 'startAt': return scalar(task.startAt);
    case 'dueAt': return scalar(task.dueAt);
  }
};

/** Writes exactly the recorded fields, in one direction, leaving every other field alone. */
const applyFields = (task: Task, changes: readonly TaskFieldChange[], direction: OperationHistoryDirection): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...task };
  for (const change of changes) {
    const value = direction === 'undo' ? change.before : change.after;
    if (value === null) delete next[change.field];
    else next[change.field] = value;
  }
  return next;
};

/** Runs one direction of an update: the recorded fields, then the recorded structure. */
const writeTaskUpdate = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskUpdateOperation,
  direction: OperationHistoryDirection,
): Promise<{ task: Task; affectedTaskIds: TaskId[] }> => {
  const expected = direction === 'undo' ? 'after' : 'before';
  const tasks = await projectTasks(repositories, operation.projectId);
  const current = tasks.get(operation.taskId) ?? null;
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(rowConflict('task', operation.taskId, 'missing'));
  else if (operation.changes.some((change) => !sameValue(valueOf(current, change.field), change[expected]))) {
    // Only the recorded fields are compared, so an unrelated actor's edit survives untouched.
    conflicts.push(rowConflict('task', operation.taskId, 'field-changed', taskLabel(current, operation.taskId)));
  }
  conflicts.push(...structuralConflicts(tasks, operation.rows, expected));

  if (operation.rows.length > 0 && current !== null && conflicts.length === 0) {
    const subject = operation.rows.find((row) => row.id === operation.taskId);
    const target = subject === undefined ? undefined : (subject[direction === 'undo' ? 'before' : 'after'] as TaskStructuralState);
    if (target !== undefined) {
      // A descendant that arrived after the move would be repointed by the subtree walk this
      // transition reproduces, so it blocks rather than being dragged along.
      conflicts.push(
        ...unrecordedDependents(tasks, operation.taskId, operation.rows, (task) => task.sectionId === current.sectionId),
      );
      if (target.archivedAt === undefined) {
        conflicts.push(...(await liveContainerConflicts(repositories, target.sectionId, operation.taskId)));
        conflicts.push(...liveParentConflicts(tasks, target.parentTaskId));
      }
    }
  }

  refuseRow(direction, operation.completion ? 'completion' : 'update', taskLabel(current, operation.taskId), conflicts);
  if (current === null) throw new EntityNotFoundError('task', operation.taskId);

  const fields = applyFields(current, operation.changes, direction);
  const subjectRow = operation.rows.find((row) => row.id === operation.taskId);
  const affected: TaskId[] = [];
  let written = TaskSchema.parse({ ...fields, updatedAt: clock.now().toISOString() });
  if (subjectRow !== undefined) {
    written = await writeStructure(repositories, clock, written, subjectRow[direction === 'undo' ? 'before' : 'after'] as TaskStructuralState);
  } else {
    await repositories.tasks.update(written);
  }
  affected.push(written.id);
  for (const row of operation.rows) {
    if (row.id === operation.taskId) continue;
    const row_ = tasks.get(row.id as TaskId)!;
    await writeStructure(repositories, clock, row_, row[direction === 'undo' ? 'before' : 'after'] as TaskStructuralState);
    affected.push(row.id as TaskId);
  }
  return { task: await reread(repositories, written), affectedTaskIds: affected };
};

/** Undo of an edit, completion, move or reparent: the recorded `before` values and structure. */
export const revertTaskUpdate = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskUpdateOperation,
): Promise<UndoResult> => ({
  operation: 'task.update',
  outcome: 'restored',
  ...(await writeTaskUpdate(repositories, clock, operation, 'undo')),
});

/** Redo of the same: the recorded `after` values and structure written back. */
export const reapplyTaskUpdate = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskUpdateOperation,
): Promise<RedoResult> => ({
  operation: 'task.update',
  outcome: 'reapplied',
  ...(await writeTaskUpdate(repositories, clock, operation, 'redo')),
});

// ---------------------------------------------------------------------------------------------
// task.archive and task.restore
// ---------------------------------------------------------------------------------------------

/**
 * Runs one direction of an archive or a restore: exactly the recorded rows, exactly the recorded
 * markers.
 *
 * A descendant that was already archived is not in the footprint, so it keeps whatever marker it
 * had — the invariant `TaskService.archive` maintains, preserved by not touching it. When the
 * direction produces **archived** rows, an unrecorded live descendant blocks: it never joined this
 * archive, and leaving it live under an archived parent is the state the document forbids. When the
 * direction produces **live** rows, the container and parent must be live, with typed guidance
 * rather than a commit-time integrity failure.
 */
const writeTaskTransition = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskArchiveOperation | TaskRestoreOperation,
  direction: OperationHistoryDirection,
): Promise<{ task: Task; affectedTaskIds: TaskId[] }> => {
  const expected = direction === 'undo' ? 'after' : 'before';
  const target = direction === 'undo' ? 'before' : 'after';
  const tasks = await projectTasks(repositories, operation.projectId);
  const current = tasks.get(operation.taskId) ?? null;
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(rowConflict('task', operation.taskId, 'missing'));
  conflicts.push(...structuralConflicts(tasks, operation.rows, expected));

  if (current !== null && conflicts.length === 0) {
    const subject = operation.rows[0]![target] as TaskStructuralState;
    if (subject.archivedAt === undefined) {
      conflicts.push(...(await liveContainerConflicts(repositories, subject.sectionId, operation.taskId)));
      conflicts.push(...liveParentConflicts(tasks, subject.parentTaskId));
    } else {
      // Newly attached live work is not part of an old archive, and must not be swept into it.
      conflicts.push(...unrecordedDependents(tasks, operation.taskId, operation.rows, (task) => task.archivedAt === undefined));
    }
  }

  const what = operation.type === 'task.archive' ? 'archive' : 'restore';
  refuseRow(direction, what, taskLabel(current, operation.taskId), conflicts);
  if (current === null) throw new EntityNotFoundError('task', operation.taskId);

  const affected: TaskId[] = [];
  let subjectTask = current;
  for (const row of operation.rows) {
    const written = await writeStructure(repositories, clock, tasks.get(row.id as TaskId)!, row[target] as TaskStructuralState);
    if (row.id === operation.taskId) subjectTask = written;
    affected.push(row.id as TaskId);
  }
  return { task: await reread(repositories, subjectTask), affectedTaskIds: affected };
};

/** Undo of an archive: the whole recorded group live again, at the markers it had before. */
export const revertTaskArchive = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskArchiveOperation,
): Promise<UndoResult> => ({
  operation: 'task.archive',
  outcome: 'restored',
  ...(await writeTaskTransition(repositories, clock, operation, 'undo')),
});

/** Redo of an archive: the exact captured markers written back, cascade included. */
export const reapplyTaskArchive = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskArchiveOperation,
): Promise<RedoResult> => ({
  operation: 'task.archive',
  outcome: 'reapplied',
  ...(await writeTaskTransition(repositories, clock, operation, 'redo')),
});

/**
 * Undo of a restore: the group archived again, exactly as the archive had left it.
 *
 * This is the direction that must refuse newly attached work: a child created while the task was
 * live was never part of the archive this reverses.
 */
export const revertTaskRestore = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskRestoreOperation,
): Promise<UndoResult> => ({
  operation: 'task.restore',
  outcome: 'restored',
  ...(await writeTaskTransition(repositories, clock, operation, 'undo')),
});

/** Redo of a restore: the group live again, markers cleared as the restore cleared them. */
export const reapplyTaskRestore = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: TaskRestoreOperation,
): Promise<RedoResult> => ({
  operation: 'task.restore',
  outcome: 'reapplied',
  ...(await writeTaskTransition(repositories, clock, operation, 'redo')),
});
