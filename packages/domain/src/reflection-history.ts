import {
  nameOf,
  ReflectionAddOperationSchema,
  ReflectionArchiveOperationSchema,
  ReflectionRestoreOperationSchema,
  ReflectionSchema,
  ReflectionUpdateOperationSchema,
  type CreatedContainer,
  type OperationHistoryDirection,
  type Reflection,
  type ReflectionAddOperation,
  type ReflectionArchiveOperation,
  type ReflectionFieldChange,
  type ReflectionId,
  type ReflectionRestoreOperation,
  type ReflectionStructuralState,
  type ReflectionSubject,
  type ReflectionUpdateOperation,
  type RedoResult,
  type UndoConflict,
  type UndoResult,
  type UndoRowChange,
} from '@cwm/contracts';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import { reflectionStructureOf } from './section-removal-undo';
import { sameValue } from './section-edit-undo';
import {
  createdContainerConflicts,
  refuseRow,
  removeCreatedContainer,
  restoreCreatedContainer,
  rowConflict,
  type RowHistoryRepositories,
} from './task-history';

/**
 * **Capture, Undo and Redo for the four committed reflection operations** — `reflection.add`,
 * `reflection.update`, `reflection.archive` and `reflection.restore`.
 *
 * Shared functions on the same terms `task-history.ts` sets out: no service edge, no unit of work,
 * no grant, no activity, and every refusal thrown before the first write. A reflection has no
 * parent and no cascade, so its structural footprint is always exactly itself.
 *
 * The one rule that is genuinely different is the **subject** (§36).
 *
 * Ordinary assignment checks current eligibility: the subject must be completed, visible work in
 * the same root tree, and `assertSubjectEligible` will not disclose why to a caller that cannot
 * read it. Undo and Redo restore a **historical** association instead, on workspace-scoped identity
 * alone: the entity must still exist in this workspace, but it need not still be completed, live or
 * in the root it was in. Reopening a task must not silently erase the reflection written about it,
 * and an inverse that re-ran the eligibility check would do exactly that
 * (docs/decisions/2026-09-reflection-subjects-and-the-journal-feed.md).
 */

// ---------------------------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------------------------

/** Builds the operation stored for a create, with the container the create had to add, if any. */
export const captureReflectionAdd = (reflection: Reflection, container?: CreatedContainer): ReflectionAddOperation =>
  ReflectionAddOperationSchema.parse({
    version: 1,
    type: 'reflection.add',
    reflection,
    ...(container === undefined ? {} : { container }),
  });

/** Builds the operation stored for a committed edit, limited to the fields it changed. */
export const captureReflectionUpdate = (input: {
  reflectionId: ReflectionId;
  projectId: Reflection['projectId'];
  changes: readonly ReflectionFieldChange[];
}): ReflectionUpdateOperation =>
  ReflectionUpdateOperationSchema.parse({ version: 1, type: 'reflection.update', ...input, changes: [...input.changes] });

/** One row's structural footprint, from the row as read and the row about to be written. */
export const reflectionRowChange = (before: Reflection, after: Reflection): UndoRowChange => ({
  kind: 'reflection',
  id: before.id,
  before: reflectionStructureOf(before),
  after: reflectionStructureOf(after),
});

export const captureReflectionArchive = (input: {
  reflectionId: ReflectionId;
  projectId: Reflection['projectId'];
  rows: readonly UndoRowChange[];
}): ReflectionArchiveOperation =>
  ReflectionArchiveOperationSchema.parse({ version: 1, type: 'reflection.archive', ...input, rows: [...input.rows] });

export const captureReflectionRestore = (input: {
  reflectionId: ReflectionId;
  projectId: Reflection['projectId'];
  rows: readonly UndoRowChange[];
}): ReflectionRestoreOperation =>
  ReflectionRestoreOperationSchema.parse({ version: 1, type: 'reflection.restore', ...input, rows: [...input.rows] });

const scalar = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** The fields one write changed, in a fixed order. A subject is whole-object, like section config. */
export const reflectionFieldChanges = (before: Reflection, after: Reflection): ReflectionFieldChange[] => {
  const changes: ReflectionFieldChange[] = [];
  if (before.title !== after.title) changes.push({ field: 'title', before: scalar(before.title), after: scalar(after.title) });
  if (before.body !== after.body) changes.push({ field: 'body', before: before.body, after: after.body });
  if (before.prompt !== after.prompt) changes.push({ field: 'prompt', before: scalar(before.prompt), after: scalar(after.prompt) });
  if (!sameValue(scalar(before.subject), scalar(after.subject))) {
    changes.push({ field: 'subject', before: scalar(before.subject), after: scalar(after.subject) });
  }
  return changes.filter((change) => !sameValue(change.before, change.after));
};

// ---------------------------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------------------------

/** A readable name for a reflection in a refusal sentence; §36 makes its title optional. */
export const reflectionLabel = (reflection: Reflection | null, id: string): string =>
  reflection?.title?.trim() || (reflection === null ? `reflection [${id}]` : 'Untitled reflection');

/** Stable, editable state for the created reflection; timestamps are intentionally absent. */
const substantiveReflection = (reflection: Reflection): unknown => ({
  id: reflection.id,
  projectId: reflection.projectId,
  sectionId: reflection.sectionId,
  subject: reflection.subject ?? null,
  title: reflection.title ?? null,
  body: reflection.body,
  prompt: reflection.prompt ?? null,
});

/** The container a transition that leaves the row live requires, with typed guidance. */
const liveContainerConflicts = async (
  repositories: RowHistoryRepositories,
  sectionId: Reflection['sectionId'],
): Promise<UndoConflict[]> => {
  const section = await repositories.sections.find(sectionId);
  if (section === null) return [rowConflict('section', sectionId, 'missing')];
  if (section.archivedAt !== undefined) return [rowConflict('section', sectionId, 'archived-subject', nameOf(section))];
  return [];
};

/**
 * **The historical subject check.** Workspace-scoped identity alone: the task or sub-project must
 * still exist and still be in this workspace, and nothing more is asked. Completion, liveness and
 * root membership are deliberately not re-checked — see this module's header.
 */
const historicalSubjectConflicts = async (
  repositories: RowHistoryRepositories,
  reflection: Reflection,
  subject: ReflectionSubject | null,
): Promise<UndoConflict[]> => {
  if (subject === null) return [];
  const workspaceOf = async (projectId: Reflection['projectId']): Promise<string | undefined> =>
    (await repositories.projects.find(projectId))?.workspaceId;
  const home = await workspaceOf(reflection.projectId);
  if (subject.kind === 'task') {
    const task = await repositories.tasks.find(subject.id);
    if (task === null) return [rowConflict('task', subject.id, 'missing')];
    if ((await workspaceOf(task.projectId)) !== home) {
      // A subject that has left the workspace cannot be linked again: that link would cross the
      // one boundary every read in this prototype is scoped by.
      return [rowConflict('task', subject.id, 'missing')];
    }
    return [];
  }
  const project = await repositories.projects.find(subject.id);
  if (project === null || project.workspaceId !== home) return [rowConflict('section', subject.id, 'missing')];
  return [];
};

/** Writes one row's structural state, preserving every field the inverse does not own. */
const writeStructure = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  current: Reflection,
  state: ReflectionStructuralState,
): Promise<Reflection> => {
  const next: Record<string, unknown> = { ...current, sectionId: state.sectionId, updatedAt: clock.now().toISOString() };
  for (const key of ['archivedAt', 'archivedWithSectionId'] as const) {
    if (state[key] === undefined) delete next[key];
    else next[key] = state[key];
  }
  const written = ReflectionSchema.parse(next);
  await repositories.reflections.update(written);
  return written;
};

const reread = async (repositories: RowHistoryRepositories, reflection: Reflection): Promise<Reflection> =>
  (await repositories.reflections.find(reflection.id)) ?? reflection;

// ---------------------------------------------------------------------------------------------
// reflection.add
// ---------------------------------------------------------------------------------------------

/** Undo of a create: deletes the created reflection, and the container the create made. */
export const revertReflectionAdd = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionAddOperation,
): Promise<UndoResult> => {
  const { reflection: created, container } = operation;
  const conflicts: UndoConflict[] = [];
  const current = await repositories.reflections.find(created.id);
  if (current === null) conflicts.push(rowConflict('reflection', created.id, 'missing'));
  else if (current.archivedAt !== undefined) {
    conflicts.push(rowConflict('reflection', created.id, 'archived-subject', reflectionLabel(current, created.id)));
  } else if (!sameValue(substantiveReflection(current), substantiveReflection(created))) {
    conflicts.push(rowConflict('reflection', created.id, 'field-changed', reflectionLabel(current, created.id)));
  }
  // A reflection owns nothing: no children, and nothing else references it. The compound's section
  // is the only thing that can have acquired dependents.
  if (container !== undefined) conflicts.push(...(await createdContainerConflicts(repositories, container, created.id)));

  refuseRow('undo', 'creation', reflectionLabel(current, created.id), conflicts);

  await repositories.reflections.remove(created.id);
  if (container !== undefined) await removeCreatedContainer(repositories, clock, container.section);
  return {
    operation: 'reflection.add',
    outcome: 'removed',
    reflectionId: created.id,
    projectId: created.projectId,
    ...(container === undefined ? {} : { removedSectionId: container.section.id }),
  };
};

/** Redo of a create: the same ids back, container first, from captured values. */
export const reapplyReflectionAdd = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionAddOperation,
): Promise<RedoResult> => {
  const { reflection: created, container } = operation;
  const conflicts: UndoConflict[] = [];
  const existing = await repositories.reflections.find(created.id);
  if (existing !== null) {
    conflicts.push(rowConflict('reflection', created.id, 'already-exists', reflectionLabel(existing, created.id)));
  }
  if ((await repositories.projects.find(created.projectId)) === null) {
    conflicts.push(rowConflict('section', created.sectionId, 'missing'));
  }
  const capturedContainerNow = container === undefined ? null : await repositories.sections.find(container.section.id);
  const containerMissing = container !== undefined && capturedContainerNow === null;
  if (container !== undefined && capturedContainerNow !== null) {
    conflicts.push(rowConflict('section', capturedContainerNow.id, 'already-exists', nameOf(capturedContainerNow)));
  } else if (container === undefined) {
    conflicts.push(...(await liveContainerConflicts(repositories, created.sectionId)));
  }
  conflicts.push(...(await historicalSubjectConflicts(repositories, created, scalar(created.subject))));

  refuseRow('redo', 'creation', reflectionLabel(created, created.id), conflicts);

  const restored = containerMissing ? await restoreCreatedContainer(repositories, clock, container!) : undefined;
  const reflection = ReflectionSchema.parse({ ...created, updatedAt: clock.now().toISOString() });
  await repositories.reflections.insert(reflection);
  return {
    operation: 'reflection.add',
    outcome: restored?.partial === true ? 'partial' : 'reapplied',
    reflection: await reread(repositories, reflection),
    ...(restored === undefined ? {} : { container: { section: restored.section, placement: restored.placement } }),
  };
};

// ---------------------------------------------------------------------------------------------
// reflection.update
// ---------------------------------------------------------------------------------------------

const valueOf = (reflection: Reflection, field: ReflectionFieldChange['field']): unknown => {
  switch (field) {
    case 'title': return scalar(reflection.title);
    case 'body': return reflection.body;
    case 'prompt': return scalar(reflection.prompt);
    case 'subject': return scalar(reflection.subject);
  }
};

/** Runs one direction of an edit: exactly the recorded fields, nothing else. */
const writeReflectionUpdate = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionUpdateOperation,
  direction: OperationHistoryDirection,
): Promise<Reflection> => {
  const expected = direction === 'undo' ? 'after' : 'before';
  const current = await repositories.reflections.find(operation.reflectionId);
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(rowConflict('reflection', operation.reflectionId, 'missing'));
  else {
    if (operation.changes.some((change) => !sameValue(valueOf(current, change.field), change[expected]))) {
      conflicts.push(rowConflict('reflection', operation.reflectionId, 'field-changed', reflectionLabel(current, operation.reflectionId)));
    }
    conflicts.push(...(await liveContainerConflicts(repositories, current.sectionId)));
    const subjectChange = operation.changes.find((change) => change.field === 'subject');
    if (subjectChange !== undefined && conflicts.length === 0) {
      const wanted = (direction === 'undo' ? subjectChange.before : subjectChange.after) as ReflectionSubject | null;
      conflicts.push(...(await historicalSubjectConflicts(repositories, current, wanted)));
    }
  }

  refuseRow(direction, 'update', reflectionLabel(current, operation.reflectionId), conflicts);
  if (current === null) throw new EntityNotFoundError('reflection', operation.reflectionId);

  const next: Record<string, unknown> = { ...current };
  for (const change of operation.changes) {
    const value = direction === 'undo' ? change.before : change.after;
    if (value === null) delete next[change.field];
    else next[change.field] = value;
  }
  const written = ReflectionSchema.parse({ ...next, updatedAt: clock.now().toISOString() });
  await repositories.reflections.update(written);
  return reread(repositories, written);
};

export const revertReflectionUpdate = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionUpdateOperation,
): Promise<UndoResult> => ({
  operation: 'reflection.update',
  outcome: 'restored',
  reflection: await writeReflectionUpdate(repositories, clock, operation, 'undo'),
});

export const reapplyReflectionUpdate = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionUpdateOperation,
): Promise<RedoResult> => ({
  operation: 'reflection.update',
  outcome: 'reapplied',
  reflection: await writeReflectionUpdate(repositories, clock, operation, 'redo'),
});

// ---------------------------------------------------------------------------------------------
// reflection.archive and reflection.restore
// ---------------------------------------------------------------------------------------------

/** Runs one direction of an archive or a restore: exactly the recorded marker. */
const writeReflectionTransition = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionArchiveOperation | ReflectionRestoreOperation,
  direction: OperationHistoryDirection,
): Promise<Reflection> => {
  const expected = direction === 'undo' ? 'after' : 'before';
  const target = direction === 'undo' ? 'before' : 'after';
  const row = operation.rows[0]!;
  const current = await repositories.reflections.find(operation.reflectionId);
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(rowConflict('reflection', operation.reflectionId, 'missing'));
  else {
    const want = row[expected] as ReflectionStructuralState;
    const have = reflectionStructureOf(current);
    if (!sameValue(have, want)) {
      const problem = have.sectionId !== want.sectionId ? 'moved' : 'archive-state-changed';
      conflicts.push(rowConflict('reflection', operation.reflectionId, problem, reflectionLabel(current, operation.reflectionId)));
    } else if ((row[target] as ReflectionStructuralState).archivedAt === undefined) {
      conflicts.push(...(await liveContainerConflicts(repositories, (row[target] as ReflectionStructuralState).sectionId)));
    }
  }

  const what = operation.type === 'reflection.archive' ? 'archive' : 'restore';
  refuseRow(direction, what, reflectionLabel(current, operation.reflectionId), conflicts);
  if (current === null) throw new EntityNotFoundError('reflection', operation.reflectionId);

  return reread(repositories, await writeStructure(repositories, clock, current, row[target] as ReflectionStructuralState));
};

export const revertReflectionArchive = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionArchiveOperation,
): Promise<UndoResult> => ({
  operation: 'reflection.archive',
  outcome: 'restored',
  reflection: await writeReflectionTransition(repositories, clock, operation, 'undo'),
});

export const reapplyReflectionArchive = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionArchiveOperation,
): Promise<RedoResult> => ({
  operation: 'reflection.archive',
  outcome: 'reapplied',
  reflection: await writeReflectionTransition(repositories, clock, operation, 'redo'),
});

export const revertReflectionRestore = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionRestoreOperation,
): Promise<UndoResult> => ({
  operation: 'reflection.restore',
  outcome: 'restored',
  reflection: await writeReflectionTransition(repositories, clock, operation, 'undo'),
});

export const reapplyReflectionRestore = async (
  repositories: RowHistoryRepositories,
  clock: Clock,
  operation: ReflectionRestoreOperation,
): Promise<RedoResult> => ({
  operation: 'reflection.restore',
  outcome: 'reapplied',
  reflection: await writeReflectionTransition(repositories, clock, operation, 'redo'),
});
