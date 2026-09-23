import {
  ProjectAddOperationSchema,
  ProjectArchiveOperationSchema,
  ProjectPageSchema,
  ProjectReactivateOperationSchema,
  ProjectSchema,
  ProjectUpdateOperationSchema,
  type OperationHistoryDirection,
  type OperationHistoryId,
  type Project,
  type ProjectAddOperation,
  type ProjectFieldChange,
  type ProjectId,
  type ProjectPage,
  type ProjectUndoOperation,
  type RedoResult,
  type SectionShortcut,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoResult,
} from '@cwm/contracts';
import type {
  MilestoneRepository,
  OperationHistoryRepository,
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
} from '@cwm/repositories';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import { OperationExecutionRefused, directionWord, refuseOnConflicts } from './operation-execution';

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
 * The dependency type holds the project repository — the only one written — plus pages, sections
 * and placements, read to refuse a move that would carry a Home shortcut's source out of its root.
 * No task or reflection repository appears, so a reviewer can see from the signature that a
 * project transition cannot reach a row.
 */

/** The project repository a project inverse writes, and the three it reads for a cross-root move. */
export interface ProjectHistoryRepositories {
  projects: ProjectRepository;
  pages: ProjectPageRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
}

/** Additional reads used only to prove a new project has no dependants before creation Undo. */
export interface ProjectAddHistoryRepositories extends ProjectHistoryRepositories {
  tasks: TaskRepository;
  reflections: ReflectionRepository;
  milestones: MilestoneRepository;
  histories: OperationHistoryRepository;
}

/** Existing-project history payloads; their executor stays separate from project creation. */
type ProjectWriteOperation = Exclude<ProjectUndoOperation, ProjectAddOperation>;

/** The creation footprint is the project and its canonical page, captured as one action. */
export const captureProjectAdd = (project: Project, page: ProjectPage): ProjectAddOperation =>
  ProjectAddOperationSchema.parse({ version: 1, type: 'project.add', project, page });

/** The receipt and history use one stable label for creation. */
export const projectAddLabel = (project: Project): string => `Created "${project.name}"`;

const creationConflict = (
  entityType: 'section' | 'task' | 'reflection' | 'shortcut' | 'page' | 'project',
  id: string,
  problem: UndoConflict['problem'],
  nextStep: UndoConflictNextStep,
  title?: string,
): UndoConflict => ({ entityType, id, problem, nextStep, ...(title === undefined ? {} : { title }) });

const withoutUpdatedAt = <T extends { updatedAt: string }>(record: T): Omit<T, 'updatedAt'> => {
  const { updatedAt: _updatedAt, ...rest } = record;
  return rest;
};

/**
 * Read-only proof for creation Undo. It runs before the service records the removal Activity line,
 * so a permanent conflict can retire the action without leaving an audit event or live frame.
 */
export const preflightProjectAddUndo = async (
  repositories: ProjectAddHistoryRepositories,
  operation: ProjectAddOperation,
  historyId: OperationHistoryId,
): Promise<void> => {
  const { project, page } = operation;
  const current = await repositories.projects.find(project.id);
  const conflicts: UndoConflict[] = [];
  const permanent = new Set<UndoConflict>();

  if (current === null) {
    conflicts.push(creationConflict('project', project.id, 'missing', 'nothing-to-undo'));
  } else if (JSON.stringify(withoutUpdatedAt(current)) !== JSON.stringify(withoutUpdatedAt(project))) {
    conflicts.push(creationConflict('project', project.id, 'field-changed', 'change-by-hand', current.name));
  }

  const currentPage = await repositories.pages.find(page.id);
  if (currentPage === null) {
    conflicts.push(creationConflict('page', page.id, 'missing', 'nothing-to-undo'));
  } else if (JSON.stringify(withoutUpdatedAt(currentPage)) !== JSON.stringify(withoutUpdatedAt(page))) {
    conflicts.push(creationConflict('page', page.id, 'field-changed', 'change-by-hand'));
  }

  const [pages, sections, tasks, reflections, milestones, children, allReflections, shortcuts, histories] = await Promise.all([
    repositories.pages.list({ projectId: project.id }),
    repositories.sections.list({ projectId: project.id, includeArchived: true }),
    repositories.tasks.list({ projectId: project.id, includeArchived: true }),
    repositories.reflections.list({ projectId: project.id, includeArchived: true }),
    repositories.milestones.list({ projectId: project.id }),
    repositories.projects.list({ workspaceId: project.workspaceId, parentProjectId: project.id }),
    repositories.reflections.list({ includeArchived: true }),
    repositories.shortcuts.list({ pageId: page.id }),
    repositories.histories.list({ projectId: project.id }),
  ]);

  for (const extra of pages.filter((candidate) => candidate.id !== page.id)) {
    conflicts.push(creationConflict('page', extra.id, 'new-dependent', 'restore-or-move-dependent-and-retry'));
  }
  for (const section of sections) {
    conflicts.push(creationConflict('section', section.id, 'new-dependent', 'restore-or-move-dependent-and-retry', section.title));
  }
  for (const task of tasks) {
    conflicts.push(creationConflict('task', task.id, 'new-dependent', 'restore-or-move-dependent-and-retry', task.title));
  }
  for (const reflection of reflections) {
    conflicts.push(creationConflict(
      'reflection', reflection.id, 'new-dependent', 'restore-or-move-dependent-and-retry',
      reflection.title?.trim() || undefined,
    ));
  }
  if (milestones.length > 0) {
    conflicts.push(creationConflict('project', project.id, 'new-dependent', 'restore-or-move-dependent-and-retry', current?.name));
  }
  for (const child of children) {
    conflicts.push(creationConflict('project', child.id, 'new-dependent', 'restore-or-move-dependent-and-retry', child.name));
  }
  for (const reflection of allReflections) {
    if (reflection.projectId !== project.id && reflection.subject?.kind === 'subproject' && reflection.subject.id === project.id) {
      conflicts.push(creationConflict(
        'reflection', reflection.id, 'new-dependent', 'restore-or-move-dependent-and-retry',
        reflection.title?.trim() || undefined,
      ));
    }
  }
  for (const shortcut of shortcuts) {
    conflicts.push(creationConflict('shortcut', shortcut.id, 'new-dependent', 'restore-or-move-dependent-and-retry'));
  }
  if (histories.some((candidate) => candidate.id !== historyId)) {
    const conflict = creationConflict('project', project.id, 'new-dependent', 'change-by-hand', current?.name);
    conflicts.push(conflict);
    permanent.add(conflict);
  }

  refuseOnConflicts(
    conflicts,
    (shown) => `Undo of creating "${project.name}" was refused: ${shown}`,
    (conflict) => permanent.has(conflict),
  );
};

/** Undo: remove only the captured, still-untouched project and canonical page. */
export const revertProjectAdd = async (
  repositories: ProjectAddHistoryRepositories,
  operation: ProjectAddOperation,
  historyId: OperationHistoryId,
): Promise<UndoResult> => {
  try {
    await preflightProjectAddUndo(repositories, operation, historyId);
  } catch (error) {
    if (error instanceof OperationExecutionRefused) {
      // The service already preflighted before recording Activity. A second refusal can only mean
      // an invariant changed inside this unit, so propagate a defect and roll the unit back.
      throw new TypeError('project.add Undo preflight changed inside its unit of work', { cause: error });
    }
    throw error;
  }
  await repositories.pages.remove(operation.page.id);
  await repositories.projects.remove(operation.project.id);
  return { operation: 'project.add', outcome: 'removed', projectId: operation.project.id };
};

/** Redo: preserve ids and createdAt; stamp both updatedAt values at the new write time. */
export const reapplyProjectAdd = async (
  repositories: ProjectAddHistoryRepositories,
  clock: Clock,
  operation: ProjectAddOperation,
): Promise<RedoResult> => {
  const conflicts: UndoConflict[] = [];
  if (await repositories.projects.find(operation.project.id) !== null) {
    conflicts.push(creationConflict('project', operation.project.id, 'already-exists', 'change-by-hand', operation.project.name));
  }
  if (await repositories.pages.find(operation.page.id) !== null) {
    conflicts.push(creationConflict('page', operation.page.id, 'already-exists', 'change-by-hand'));
  }
  if (operation.project.kind === 'subproject') {
    const parent = await repositories.projects.find(operation.project.parentProjectId);
    if (parent === null || parent.workspaceId !== operation.project.workspaceId) {
      conflicts.push(creationConflict('project', operation.project.parentProjectId, 'missing', 'nothing-to-undo'));
    }
  }
  refuseOnConflicts(
    conflicts,
    (shown) => `Redo of creating "${operation.project.name}" was refused: ${shown}`,
    () => false,
  );

  const updatedAt = clock.now().toISOString();
  const project = ProjectSchema.parse({ ...operation.project, updatedAt });
  const page = ProjectPageSchema.parse({ ...operation.page, updatedAt });
  await repositories.projects.insert(project);
  await repositories.pages.insert(page);
  return { operation: 'project.add', outcome: 'reapplied', project, page };
};

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
export const captureProjectWrite = (before: Project, after: Project): ProjectWriteOperation => {
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

/** The user-facing edit each recorded field belongs to; `completedAt` rides with `status`, manual progress with its formula. */
const EDIT_OF: Record<Field, string> = {
  name: 'name',
  description: 'description',
  icon: 'icon',
  status: 'status',
  completedAt: 'status',
  targetDate: 'targetDate',
  projectLayoutMode: 'projectLayoutMode',
  progressFormula: 'progress',
  manualProgress: 'progress',
  parentProjectId: 'parentProjectId',
};

const STATUS_WORD: Record<Project['status'], string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

/**
 * What a receipt and a history summary call one write, naming the edit and its result so a header
 * control can say what it will undo (Slice 41): `Renamed "Old" to "New"`, `Completed "X"`,
 * `Reopened "X"`, `Set "X" to On hold`, `Moved "X" under Kitchen`, `Changed the layout of "X"`,
 * `Changed progress for "X"`, `Changed the target date of "X"`, `Edited the description of "X"`,
 * `Changed the icon of "X"`; an archive or reactivation keeps `Archived`/`Reactivated`; more than
 * one user-facing edit is `Edited "X"`. `parentName` is the new parent's name for a move, read by
 * the caller; without it a move is `Moved "X"`.
 */
export const projectWriteLabel = (operation: ProjectWriteOperation, after: Project, parentName?: string): string => {
  const subject = `"${after.name}"`;
  if (operation.type === 'project.archive') return `Archived ${subject}`;
  if (operation.type === 'project.reactivate') return `Reactivated ${subject}`;
  const edits = new Set(operation.changes.map((change) => EDIT_OF[change.field]));
  if (edits.size !== 1) return `Edited ${subject}`;
  const [edit] = edits;
  switch (edit) {
    case 'name': {
      const rename = operation.changes.find((change) => change.field === 'name');
      return `Renamed "${String(rename?.before)}" to ${subject}`;
    }
    case 'status': {
      const status = operation.changes.find((change) => change.field === 'status');
      if (status === undefined) return `Edited ${subject}`;
      if (status.after === 'completed') return `Completed ${subject}`;
      if (status.before === 'completed') return `Reopened ${subject}`;
      return `Set ${subject} to ${STATUS_WORD[status.after as Project['status']]}`;
    }
    case 'parentProjectId':
      return parentName === undefined ? `Moved ${subject}` : `Moved ${subject} under ${parentName}`;
    case 'projectLayoutMode':
      return `Changed the layout of ${subject}`;
    case 'progress':
      return `Changed progress for ${subject}`;
    case 'targetDate':
      return `Changed the target date of ${subject}`;
    case 'description':
      return `Edited the description of ${subject}`;
    case 'icon':
      return `Changed the icon of ${subject}`;
    default:
      return `Edited ${subject}`;
  }
};

/**
 * Whether this one step may run while its **subject** is archived (never through an archived
 * ancestor, which still blocks). The service permits editing an archived project, archiving is
 * itself a write whose Undo starts from an archived subject, and a reactivation's Redo does too;
 * without these three the cursor would wedge on the very project the actions are about.
 */
export const mayRunWhileSubjectArchived = (operation: ProjectWriteOperation, direction: OperationHistoryDirection): boolean =>
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

/**
 * What a recorded field someone else moved means. A parent is a move to put back and a status is a
 * state to restore — both repairable by making the project match again — while any other field is a
 * later edit only a person can reconcile.
 */
const driftProblem = (field: Field): UndoConflict['problem'] =>
  field === 'parentProjectId' ? 'reparented' : field === 'status' ? 'archive-state-changed' : 'field-changed';

const conflict = (id: string, problem: UndoConflict['problem'], title?: string): UndoConflict => ({
  entityType: 'project',
  id,
  ...(problem === 'missing' || title === undefined ? {} : { title }),
  problem,
  nextStep: nextStepFor(problem),
});

/** Refuses on conflicts. None is permanent: every one describes a tree someone can put back. */
const refuse = (direction: OperationHistoryDirection, operation: ProjectWriteOperation, subject: string, conflicts: readonly UndoConflict[]): void =>
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
    if (current.parentProjectId === undefined) {
      current = null;
      break;
    }
    const next: Project | null = await repositories.projects.find(current.parentProjectId);
    // A broken chain is what the forward service refuses as not found; so does its reversal.
    if (next === null) return [conflict(current.parentProjectId, 'missing')];
    current = next;
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

/** The root at the top of `projectId`'s chain, or `undefined` for a broken or cyclic one. */
const rootOf = async (repositories: ProjectHistoryRepositories, projectId: ProjectId): Promise<ProjectId | undefined> => {
  const seen = new Set<ProjectId>();
  let current = await repositories.projects.find(projectId);
  while (current !== null && !seen.has(current.id)) {
    if (current.parentProjectId === undefined) return current.id;
    seen.add(current.id);
    current = await repositories.projects.find(current.parentProjectId);
  }
  return undefined;
};

/**
 * The Home shortcuts moving `subject` under `destinationParentId` would carry across root trees.
 *
 * A move to another root carries every section in the subject's subtree with it, so a Home
 * shortcut on the **old** root that places one of them would cross root trees — a state
 * commit-time integrity rejects. Both the forward write (`ProjectService.update`) and a reparent's
 * Undo or Redo refuse on a non-empty answer, typed, before any write: the placement has to go
 * first. A move within one root, a placement already on the destination root and a broken or
 * cyclic chain (refused elsewhere as not found) all answer empty.
 */
export const shortcutsCarriedAcrossRoots = async (
  repositories: ProjectHistoryRepositories,
  subject: Project,
  destinationParentId: ProjectId,
): Promise<SectionShortcut[]> => {
  const [from, to] = await Promise.all([rootOf(repositories, subject.id), rootOf(repositories, destinationParentId)]);
  if (from === undefined || to === undefined || from === to) return [];
  const projects = await repositories.projects.list({ workspaceId: subject.workspaceId });
  const subtree = new Set<ProjectId>([subject.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const candidate of projects) {
      if (candidate.parentProjectId !== undefined && subtree.has(candidate.parentProjectId) && !subtree.has(candidate.id)) {
        subtree.add(candidate.id);
        grew = true;
      }
    }
  }
  const carried: SectionShortcut[] = [];
  for (const shortcut of await repositories.shortcuts.list()) {
    // A placement's destination is its Home page's root; one already on the new root stays legal.
    if ((await repositories.pages.find(shortcut.pageId))?.projectId === to) continue;
    const source = await repositories.sections.find(shortcut.sourceSectionId);
    if (source !== null && subtree.has(source.projectId)) carried.push(shortcut);
  }
  return carried;
};

/** The history executor's reading of the same check: one `shortcut-reference` conflict per placement. */
const crossRootShortcutConflicts = async (
  repositories: ProjectHistoryRepositories,
  subject: Project,
  destinationParentId: ProjectId,
): Promise<UndoConflict[]> =>
  (await shortcutsCarriedAcrossRoots(repositories, subject, destinationParentId)).map(({ id }) => ({
    entityType: 'shortcut',
    id,
    problem: 'shortcut-reference',
    nextStep: 'remove-reference-and-retry',
  }));

/** Runs one direction: preflight every recorded field and the hierarchy rules, then one write. */
const writeProject = async (
  repositories: ProjectHistoryRepositories,
  clock: Clock,
  operation: ProjectWriteOperation,
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
        conflicts.push(conflict(current.id, driftProblem(change.field), current.name));
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
    if (reparenting && conflicts.length === 0) {
      conflicts.push(...(await crossRootShortcutConflicts(repositories, current, next.parentProjectId!)));
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
  operation: ProjectWriteOperation,
): Promise<UndoResult> =>
  ({ operation: operation.type, outcome: 'restored', project: await writeProject(repositories, clock, operation, 'undo') }) as UndoResult;

/** Redo: the recorded `after` values, under the same rules. */
export const reapplyProjectWrite = async (
  repositories: ProjectHistoryRepositories,
  clock: Clock,
  operation: ProjectWriteOperation,
): Promise<RedoResult> =>
  ({ operation: operation.type, outcome: 'reapplied', project: await writeProject(repositories, clock, operation, 'redo') }) as RedoResult;
