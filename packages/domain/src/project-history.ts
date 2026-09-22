import {
  ProjectArchiveOperationSchema,
  ProjectReactivateOperationSchema,
  ProjectSchema,
  ProjectUpdateOperationSchema,
  type OperationHistoryDirection,
  type Project,
  type ProjectFieldChange,
  type ProjectId,
  type ProjectUndoOperation,
  type RedoResult,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
} from '@cwm/contracts';
import type { ProjectRepository } from '@cwm/repositories';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import { directionWord, refuseOnConflicts } from './operation-execution';

/**
 * **Capture, Undo and Redo for existing-project writes** (Slice 39, §§26, 31, 39;
 * docs/decisions/2026-09-project-update-operation-history.md).
 *
 * `ProjectService.update` and `archive` share one commit, so one footprint covers every field they
 * write: the fields the normalized change actually moved, with exact before and after values. Undo
 * writes the `before` values back and Redo the `after` values, and nothing else — an unrelated
 * field another actor changed survives both directions, while a recorded field someone else moved
 * refuses the whole transition.
 *
 * Reversal is not a way around the forward rules. Each direction re-runs, against the project tree
 * as it is **now**, the checks `ProjectService.update` would run for the same change: a destination
 * parent must exist in the workspace, must not sit under the subject, and must have no archived
 * ancestry; a direction that archives refuses while any child is live, because archiving never
 * cascades and a history step must not acquire one. `completedAt` is restored verbatim — it is
 * captured business state, not something to regenerate from the transition's clock.
 *
 * Only the project repository appears in the dependency type, so a reviewer can see from the
 * signature that a project transition cannot reach a section, page or row.
 */

/** The one repository a project inverse reads and writes. */
export interface ProjectHistoryRepositories {
  projects: ProjectRepository;
}

type Field = ProjectFieldChange['field'];

/** The recorded fields, in the order a footprint lists them. `status` and `completedAt` stay adjacent. */
const FIELDS: readonly Field[] = [
  'name',
  'description',
  'icon',
  'status',
  'completedAt',
  'targetDate',
  'projectLayoutMode',
  'progressFormula',
  'manualProgress',
  'parentProjectId',
];

/** A project's value for one recorded field, with absence as `null`. */
const valueOf = (project: Project, field: Field): unknown => (project as Record<string, unknown>)[field] ?? null;

/**
 * The operation one committed write stores, from the project before it and the normalized project
 * it wrote (`updatedAt` aside). The status decides the kind; everything else is `changes`.
 */
export const captureProjectWrite = (before: Project, after: Project): ProjectUndoOperation => {
  const changes = FIELDS.flatMap((field) => {
    const was = valueOf(before, field);
    const now = valueOf(after, field);
    return JSON.stringify(was) === JSON.stringify(now) ? [] : [{ field, before: was, after: now }];
  });
  const shape = { version: 1, projectId: before.id, changes };
  if (before.status !== 'archived' && after.status === 'archived') {
    return ProjectArchiveOperationSchema.parse({ ...shape, type: 'project.archive' });
  }
  if (before.status === 'archived' && after.status !== 'archived') {
    return ProjectReactivateOperationSchema.parse({ ...shape, type: 'project.reactivate' });
  }
  return ProjectUpdateOperationSchema.parse({ ...shape, type: 'project.update', archivedThroughout: after.status === 'archived' });
};

/** What a receipt and a history summary call one write, e.g. `Archived "Kitchen"`. */
export const projectWriteLabel = (operation: ProjectUndoOperation, after: Project): string => {
  const verb = (() => {
    if (operation.type === 'project.archive') return 'Archived';
    if (operation.type === 'project.reactivate') return 'Reactivated';
    const status = operation.changes.find((change) => change.field === 'status');
    if (status?.after === 'completed') return 'Completed';
    if (operation.changes.length === 1 && operation.changes[0]!.field === 'parentProjectId') return 'Moved';
    return 'Updated';
  })();
  return `${verb} "${after.name}"`;
};

/**
 * Whether this one step may run while its **subject** is archived (never through an archived
 * ancestor, which still blocks). The service permits editing an archived project, archiving is
 * itself a write whose Undo starts from an archived subject, and a reactivation's Redo does too;
 * without these three the cursor would wedge on the very project the actions are about.
 */
export const mayRunWhileSubjectArchived = (operation: ProjectUndoOperation, direction: OperationHistoryDirection): boolean =>
  (operation.type === 'project.archive' && direction === 'undo') ||
  (operation.type === 'project.reactivate' && direction === 'redo') ||
  (operation.type === 'project.update' && operation.archivedThroughout);

const nextStepFor = (problem: UndoConflict['problem']): UndoConflictNextStep => {
  switch (problem) {
    case 'missing':
      return 'nothing-to-undo';
    case 'reparented':
      return 'move-back-and-retry';
    case 'archive-state-changed':
      return 'restore-state-and-retry';
    case 'new-dependent':
      return 'restore-or-move-dependent-and-retry';
    default:
      return 'change-by-hand';
  }
};

const conflict = (id: string, problem: UndoConflict['problem'], title?: string): UndoConflict => ({
  entityType: 'project',
  id,
  ...(problem === 'missing' || title === undefined ? {} : { title }),
  problem,
  nextStep: nextStepFor(problem),
});

/** Refuses on conflicts. None is permanent: every one describes a tree someone can put back. */
const refuse = (direction: OperationHistoryDirection, operation: ProjectUndoOperation, subject: string, conflicts: readonly UndoConflict[]): void =>
  refuseOnConflicts(
    conflicts,
    (shown) => `${directionWord(direction)} of the ${operation.type.replace('project.', '')} on ${subject} was refused: ${shown}`,
    () => false,
  );

/**
 * The destination parent's problems, as the forward service would find them: absent or foreign
 * (one answer, so nothing is disclosed), the subject among its ancestors, or an archived project
 * anywhere on its chain. The walk keeps a visited set for the reason `ProjectService` gives: a
 * hand-edited document can already contain a cycle.
 */
const parentConflicts = async (
  repositories: ProjectHistoryRepositories,
  subject: Project,
  parentId: ProjectId,
  checkAncestry: boolean,
): Promise<UndoConflict[]> => {
  const parent = await repositories.projects.find(parentId);
  if (parent === null || parent.workspaceId !== subject.workspaceId) return [conflict(parentId, 'missing')];
  if (parent.id === subject.id) return [conflict(parent.id, 'reparented', parent.name)];

  const seen = new Set<ProjectId>([subject.id]);
  let current: Project | null = parent;
  while (current !== null && !seen.has(current.id)) {
    if (current.parentProjectId === subject.id) return [conflict(parent.id, 'reparented', parent.name)];
    seen.add(current.id);
    current = current.parentProjectId === undefined ? null : await repositories.projects.find(current.parentProjectId);
  }
  if (current !== null) return [conflict(parent.id, 'reparented', parent.name)];
  if (!checkAncestry) return [];

  const walked = new Set<ProjectId>();
  let ancestor: Project | null = parent;
  while (ancestor !== null && !walked.has(ancestor.id)) {
    if (ancestor.status === 'archived') return [conflict(ancestor.id, 'archive-state-changed', ancestor.name)];
    walked.add(ancestor.id);
    ancestor = ancestor.parentProjectId === undefined ? null : await repositories.projects.find(ancestor.parentProjectId);
  }
  return [];
};

/** Runs one direction: preflight every recorded field and the hierarchy rules, then one write. */
const writeProject = async (
  repositories: ProjectHistoryRepositories,
  clock: Clock,
  operation: ProjectUndoOperation,
  direction: OperationHistoryDirection,
): Promise<Project> => {
  const expected = direction === 'undo' ? 'after' : 'before';
  const target = direction === 'undo' ? 'before' : 'after';
  const current = await repositories.projects.find(operation.projectId);
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(conflict(operation.projectId, 'missing'));
  else {
    for (const change of operation.changes) {
      if (JSON.stringify(valueOf(current, change.field)) !== JSON.stringify(change[expected])) {
        conflicts.push(conflict(current.id, change.field === 'parentProjectId' ? 'reparented' : 'field-changed', current.name));
        break;
      }
    }
  }

  let next: Project | undefined;
  if (current !== null && conflicts.length === 0) {
    const draft: Record<string, unknown> = { ...current };
    for (const change of operation.changes) {
      const value = change[target];
      if (value === null) delete draft[change.field];
      else draft[change.field] = value;
    }
    next = draft as Project;

    // A formula without the value it needs is a state the forward service refuses to write.
    if (next.progressFormula === 'manual' && next.manualProgress === undefined) {
      conflicts.push(conflict(current.id, 'field-changed', current.name));
    }
    const reparenting = next.parentProjectId !== current.parentProjectId && next.parentProjectId !== undefined;
    const reactivating = current.status === 'archived' && next.status !== 'archived';
    if ((reparenting || reactivating) && next.parentProjectId !== undefined) {
      conflicts.push(...(await parentConflicts(repositories, current, next.parentProjectId, true)));
    }
    if (next.status === 'archived' && current.status !== 'archived') {
      const children = await repositories.projects.list({ workspaceId: current.workspaceId, parentProjectId: current.id });
      conflicts.push(...children.filter((child) => child.status !== 'archived').map((child) => conflict(child.id, 'new-dependent', child.name)));
    }
  }

  refuse(direction, operation, current === null ? `project [${operation.projectId}]` : `"${current.name}"`, conflicts);
  if (current === null || next === undefined) throw new EntityNotFoundError('project', operation.projectId);

  const written = ProjectSchema.parse({ ...next, updatedAt: clock.now().toISOString() });
  await repositories.projects.update(written);
  return written;
};

/** Undo: the recorded `before` values, under the current tree's rules. */
export const revertProjectWrite = async (
  repositories: ProjectHistoryRepositories,
  clock: Clock,
  operation: ProjectUndoOperation,
): Promise<UndoResult> =>
  ({ operation: operation.type, outcome: 'restored', project: await writeProject(repositories, clock, operation, 'undo') }) as UndoResult;

/** Redo: the recorded `after` values, under the same rules. */
export const reapplyProjectWrite = async (
  repositories: ProjectHistoryRepositories,
  clock: Clock,
  operation: ProjectUndoOperation,
): Promise<RedoResult> =>
  ({ operation: operation.type, outcome: 'reapplied', project: await writeProject(repositories, clock, operation, 'redo') }) as RedoResult;
