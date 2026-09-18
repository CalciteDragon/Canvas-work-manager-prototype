import {
  TaskIdSchema,
  TaskSchema,
  type CreatedContainer,
  type CreateTaskInput,
  type OperationReceipt,
  type ProjectId,
  type Task,
  type TaskAddResult,
  type TaskFieldChange,
  type TaskId,
  type TaskQuery,
  type TaskWriteResult,
  type UndoRowChange,
  type UpdateTaskInput,
} from '@cwm/contracts';
import type { ProjectRepository, TaskRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import type { OperationRecorder } from './operation-recorder';
import { archivedAncestry, assertProjectWritable } from './project-visibility';
import type { SectionService } from './section-service';
import {
  captureTaskAdd,
  captureTaskArchive,
  captureTaskRestore,
  captureTaskUpdate,
  isCompletion,
  taskFieldChanges,
  taskRowChange,
} from './task-history';

export interface TaskServiceDependencies {
  tasks: TaskRepository;
  projects: ProjectRepository;
  /**
   * A task belongs to a `task-list` section, not merely to a project, so a create resolves
   * or checks a container. `SectionService` depends on repositories and never on tasks, so
   * this direction closes no cycle.
   */
  sections: SectionService;
  activity: ActivityService;
  /**
   * §31's per-actor history. The same interface `SectionService` records through, and acyclic for
   * the same reason: the recorder depends on two repositories, a clock and ids — never on this
   * service — and `OperationHistoryService` executes a task inverse through the shared functions in
   * `task-history.ts`, never through this service.
   */
  history: OperationRecorder;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

/** `null` clears and `undefined` leaves alone — §11's `dueAt` example is the pattern. */
const apply = <T extends object>(task: T, key: keyof T, value: unknown): void => {
  if (value === undefined) return;
  if (value === null) delete task[key];
  else task[key] = value as T[keyof T];
};

/**
 * A restored row carries **neither** marker: the integrity pass rejects a live row holding
 * either, and each marker means "came down with *that*", which stops being true the moment
 * the row comes back.
 */
const cleared = (task: Task): Task => {
  const next = { ...task };
  delete next.archivedAt;
  delete next.archivedWithSectionId;
  delete next.archivedWithTaskId;
  return next;
};

const assertParentLive = (parent: Task): void => {
  if (parent.archivedAt !== undefined) {
    throw new DomainRuleError(`task "${parent.id}" is archived; restore it before nesting work under it`);
  }
};

type TaskAction = 'task.updated' | 'task.completed' | 'task.archived' | 'task.restored';

/** One row a cascade, a move or a normalization wrote, and its captured footprint. */
interface WrittenRow {
  id: TaskId;
  row: UndoRowChange;
}

/** Where a create landed, and the container it had to make on the way. */
interface ResolvedSection {
  sectionId: Task['sectionId'];
  container?: CreatedContainer;
}

/** Whether a write changed anything an inverse would have to put back structurally. */
const sameStructure = (before: Task, after: Task): boolean =>
  before.sectionId === after.sectionId &&
  before.parentTaskId === after.parentTaskId &&
  before.archivedAt === after.archivedAt &&
  before.archivedWithSectionId === after.archivedWithSectionId &&
  before.archivedWithTaskId === after.archivedWithTaskId;

/** Unused in this module beyond the type it names; kept so the receipt type stays imported. */
export type TaskOperationReceipt = OperationReceipt;

/** Re-exported so a caller assembling a footprint by hand uses the same change shape. */
export type TaskFieldFootprint = TaskFieldChange;

export class TaskService {
  constructor(private readonly dependencies: TaskServiceDependencies) {}

  async get(actor: ActorContext, id: TaskId): Promise<Task> {
    assertPermitted(actor, 'tasks.read');
    return this.require(actor, id);
  }

  /**
   * The same lookup without the permission check.
   *
   * A grant of `tasks.write` alone has to be usable: an agent that could complete a task
   * but not read one would fail on the lookup inside its own `complete`. Reads a *caller*
   * asked for are checked; reads a write does on its own behalf are not.
   */
  private async require(actor: ActorContext, id: TaskId): Promise<Task> {
    const task = await this.dependencies.tasks.find(id);
    if (task === null) throw new EntityNotFoundError('task', id);
    // A task in a foreign workspace is "not found": 409 would confirm it exists.
    if (!(await this.isProjectVisible(actor, task.projectId))) throw new EntityNotFoundError('task', id);
    return task;
  }

  /**
   * `Task` carries no workspace and `TaskQuery` no workspace filter, so scoping is two
   * steps: resolve the actor's projects, then intersect. An explicit `projectId` or
   * `parentTaskId` that does not resolve raises rather than answering `[]` — consistent
   * with `get`, and it stops the UI rendering "no tasks" for a typo or a foreign id.
   */
  async list(actor: ActorContext, query: TaskQuery = {}): Promise<Task[]> {
    assertPermitted(actor, 'tasks.read');
    if (query.projectId !== undefined) await this.assertProjectVisible(actor, query.projectId);
    if (query.parentTaskId !== undefined) await this.require(actor, query.parentTaskId);

    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const visible = new Set(projects.map((project) => project.id));
    const tasks = await this.dependencies.tasks.list(query);
    // §31: an archived project hides its live contents from **ordinary** reads. A read that
    // named where to look is not one of those — the canvas asks by `sectionId` and an archived
    // project's own page has to keep rendering — so the exclusion applies only when the caller
    // named nothing at all. Keyed on all three, not on `projectId`: the Task List section
    // reads `{ sectionId }` with no project.
    const scoped =
      query.projectId !== undefined || query.sectionId !== undefined || query.parentTaskId !== undefined;
    if (scoped) return tasks.filter((task) => visible.has(task.projectId));
    // Archived **and** beneath an archived ancestor: `isHidden` deliberately excludes a project
    // archived in its own right, and this is the one read with no `status` filter of its own.
    const ancestry = archivedAncestry(projects);
    return tasks.filter(
      (task) =>
        visible.has(task.projectId) &&
        !ancestry.isArchived(task.projectId) &&
        !ancestry.hasArchivedAncestor(task.projectId),
    );
  }

  /**
   * Answers the created task **and its receipt** (§31). The receipt is not optional here: a create
   * always changes something, so there is always an action to undo, and an agent holding only
   * `tasks.write` needs the receipt to reach its own history without `projects.read`.
   *
   * When the create had to make its container, the container joins **this** action: one row event,
   * one action, one frame, and one Undo that removes both.
   */
  async create(actor: ActorContext, input: CreateTaskInput): Promise<TaskAddResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      await this.assertProjectVisible(actor, input.projectId);
      await this.assertProjectActive(input.projectId);
      // `resolveSection` refuses an archived container through `requireContainer`, and
      // skips one through `resolveContainer`; the parent check below is the level down.
      const { sectionId, container } = await this.resolveSection(actor, input);

      const now = this.dependencies.clock.now().toISOString();
      const status = input.status ?? 'todo';
      const task = TaskSchema.parse({
        id: TaskIdSchema.parse(this.dependencies.ids.next('task')),
        projectId: input.projectId,
        sectionId,
        parentTaskId: input.parentTaskId,
        title: input.title,
        description: input.description,
        status,
        priority: input.priority ?? 'medium',
        estimate: input.estimate,
        startAt: input.startAt ?? undefined,
        dueAt: input.dueAt ?? undefined,
        completedAt: status === 'done' ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });

      await this.dependencies.tasks.insert(task);
      await this.record(actor, task, 'task.created', 'Created');
      const operation = await this.dependencies.history.record(actor, {
        projectId: task.projectId,
        label: `Created "${task.title}"`,
        operation: captureTaskAdd(task, container),
      });
      return { task, operation };
    });
  }

  /**
   * Answers the updated task and a receipt, or a `null` receipt for a normalized no-op — the shape
   * `SectionWriteResult` already uses, so every caller has one rule for "did that record something?".
   *
   * The captured footprint is assembled **after** the two helpers below have run: `moveSubtree` and
   * `normalizeArchiveGroup` change rows after `commit` returns, and an action that recorded the
   * earlier state would leave those rows behind on Undo. The same is true of `committed` itself,
   * which marker normalization can change, so the final root is re-read rather than reused.
   */
  async update(actor: ActorContext, id: TaskId, input: UpdateTaskInput): Promise<TaskWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      await this.assertProjectActive(current.projectId);
      // The row's **own** section, not the destination. `requireContainer` below checks only
      // where a move is going, so without this an archived row could be edited or moved out
      // of an archived container — carrying `archivedWithSectionId` to a section it no
      // longer names, which document integrity rejects when the unit closes. The caller
      // would see a rolled-back write rather than a refusal it can read. Restoring the
      // section is what makes the row editable again.
      await this.assertSectionLive(actor, current);
      // Move-to-project belongs to Slice 20, with the parent/child semantics that make it
      // hard. Refusing beats dropping `projectId` from the contract: these schemas are not
      // strict, so a removed field would be silently stripped and answered 200.
      if (input.projectId !== undefined && input.projectId !== current.projectId) {
        throw new DomainRuleError('moving a task between projects is not supported yet');
      }

      const next = { ...current };
      apply(next, 'title', input.title);
      apply(next, 'description', input.description);
      apply(next, 'status', input.status);
      apply(next, 'priority', input.priority);
      apply(next, 'estimate', input.estimate);
      apply(next, 'startAt', input.startAt);
      apply(next, 'dueAt', input.dueAt);
      apply(next, 'parentTaskId', input.parentTaskId);
      apply(next, 'sectionId', input.sectionId);

      if (next.parentTaskId !== current.parentTaskId && next.parentTaskId !== undefined) {
        await this.assertParentIsUsable(actor, current, next.parentTaskId);
        // A **live** row under an archived parent is a row nothing can reach — the same
        // defect as a live row in an archived section, one level down. Refused before any
        // write, so the caller sees a rule error rather than a commit-time integrity
        // failure. An archived row may move under an archived parent: that is a move within
        // an archive group, which `normalizeArchiveGroup` below settles.
        if (next.archivedAt === undefined) assertParentLive(await this.require(actor, next.parentTaskId));
      }

      if (next.parentTaskId === undefined) {
        // `projectId` cannot change here (refused above), so the two keys move together by
        // construction: a new section is checked against the project the task already has.
        if (next.sectionId !== current.sectionId) {
          await this.dependencies.sections.requireContainer(actor, next.projectId, next.sectionId, 'tasks');
        }
      } else {
        // A subtask is rendered by whichever list holds its parent, so it inherits rather
        // than moves. Naming a different section is a caller mistake worth reporting; a
        // parent that moved is simply followed.
        const parent = await this.require(actor, next.parentTaskId);
        if (input.sectionId !== undefined && input.sectionId !== parent.sectionId) {
          throw new DomainRuleError('a subtask is rendered by its parent section and cannot be moved on its own');
        }
        // This branch runs on **every** update of a task that has a parent, not only on a
        // reparent, so the disabled-page rule is applied to the *change* rather than to the
        // branch: renaming a subtask that already lives on a disabled page is an edit, and
        // following a parent onto one is a placement (§27).
        if (parent.sectionId !== current.sectionId) {
          await this.dependencies.sections.assertWritablePage(
            await this.dependencies.sections.requireWithin(actor, parent.sectionId),
          );
        }
        next.sectionId = parent.sectionId;
      }

      // Entering `done` stamps `completedAt`; leaving it clears it, whichever entry point
      // is used. A transition into `done` is what makes this a completion (§57's verb).
      const completing = next.status === 'done' && current.status !== 'done';
      // PATCH is the exposed route, so a rule only `complete()` enforced would be
      // decorative — the same trap `ProjectService` avoids for archive.
      if (completing && current.archivedAt !== undefined) {
        throw new DomainRuleError('an archived task cannot be completed');
      }
      if (completing) next.completedAt = this.dependencies.clock.now().toISOString();
      if (next.status !== 'done') delete next.completedAt;

      const committed = await this.commit(actor, current, next, completing ? 'task.completed' : 'task.updated');
      if (committed === current) return { task: current, operation: null };
      // Dragging a task between lists is the operation two containers exist for, and a
      // parent left behind by its own subtasks would render as two half-tasks.
      const moved: WrittenRow[] = [];
      if (committed.sectionId !== current.sectionId) moved.push(...(await this.moveSubtree(actor, committed)));
      // Re-parenting can split an archive group, and it can do so **without** changing
      // section — an `A → B → C` detach within one list — so this runs on any parent change
      // rather than being folded into the section-gated `moveSubtree` above.
      if (committed.parentTaskId !== current.parentTaskId) moved.push(...(await this.normalizeArchiveGroup(actor, committed)));

      // The **final** root, after normalization may have rewritten its marker, and every descendant
      // that actually changed. A row is recorded once, root first.
      const final = (await this.dependencies.tasks.find(id)) ?? committed;
      const rows: UndoRowChange[] = [];
      if (!sameStructure(current, final)) rows.push(taskRowChange(current, final));
      for (const change of moved) {
        if (change.id === id) continue;
        rows.push(change.row);
      }
      const operation = await this.dependencies.history.record(actor, {
        projectId: final.projectId,
        label: completing ? `Completed "${final.title}"` : `Updated "${final.title}"`,
        operation: captureTaskUpdate({
          taskId: id,
          projectId: final.projectId,
          completion: completing,
          changes: taskFieldChanges(current, final),
          rows,
        }),
      });
      return { task: final, operation };
    });
  }

  /**
   * Idempotent, per §34's inline completion: completing a done task records nothing and answers a
   * `null` receipt.
   *
   * It shares capture with PATCH-to-done rather than having a kind of its own: §34 makes completion
   * a status transition, so both entry points record one `task.update` whose label and verb say
   * `Completed`, and one inverse reopens either.
   */
  async complete(actor: ActorContext, id: TaskId): Promise<TaskWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      await this.assertProjectActive(current.projectId);
      if (current.archivedAt !== undefined) throw new DomainRuleError('an archived task cannot be completed');
      if (current.status === 'done') return { task: current, operation: null };

      const completedAt = this.dependencies.clock.now().toISOString();
      const completed = await this.commit(actor, current, { ...current, status: 'done', completedAt }, 'task.completed');
      if (completed === current) return { task: current, operation: null };
      const operation = await this.dependencies.history.record(actor, {
        projectId: completed.projectId,
        label: `Completed "${completed.title}"`,
        operation: captureTaskUpdate({
          taskId: id,
          projectId: completed.projectId,
          completion: isCompletion(current, completed),
          changes: taskFieldChanges(current, completed),
          rows: [],
        }),
      });
      return { task: completed, operation };
    });
  }

  /**
   * Archiving sets `archivedAt` rather than `status: 'cancelled'`. Conflating the two
   * would leave the prototype unable to answer §83's question about which of §33's five
   * statuses earn their place, and §58 already treats complete and archive as different
   * operations. Idempotent.
   *
   * **It cascades to live descendants**, stamping each with `archivedWithTaskId = id`; the
   * root itself carries no marker, and a descendant that was already archived is left
   * alone with whatever marker it had. Removing something takes what hangs off it — and
   * this is what buys the invariant the rest of this file rests on: *a live row's ancestors
   * are live*, which is what lets a section cascade treat its live rows as whole subtrees.
   *
   * Allowed inside an archived project or section, so a caller can tidy hidden work without
   * bringing it back — the same exception `SectionService.remove` makes.
   */
  async archive(actor: ActorContext, id: TaskId): Promise<TaskWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.archivedAt !== undefined) return { task: current, operation: null };

      const archivedAt = this.dependencies.clock.now().toISOString();
      const archived = await this.commit(actor, current, { ...current, archivedAt }, 'task.archived');
      if (archived === current) return { task: current, operation: null };
      // Captured after the cascade, so the action holds exactly the rows archiving actually wrote:
      // a descendant that was already archived is absent, because archiving left it alone.
      const cascaded = await this.archiveDescendants(actor, archived.id, archived.id, archivedAt);
      const operation = await this.dependencies.history.record(actor, {
        projectId: archived.projectId,
        label: `Archived "${archived.title}"`,
        operation: captureTaskArchive({
          taskId: id,
          projectId: archived.projectId,
          rows: [taskRowChange(current, archived), ...cascaded.map((change) => change.row)],
        }),
      });
      return { task: archived, operation };
    });
  }

  /**
   * The undo, and the mirror of `SectionService.restoreSection`: it restores this task and
   * every task carrying `archivedWithTaskId === id`. `archive` marks the whole subtree with
   * the *root's* id rather than each row's parent, so this is one lookup, not a walk.
   *
   * Two refusals, both before any write, and both naming what to restore instead:
   *
   * 1. **The section is archived.** The container is what renders the row, and a live row in
   *    an archived section is the state document integrity forbids. Restore the section —
   *    which brings back the rows it took down — rather than the row.
   * 2. **The parent is archived.** Reachable despite the cascade: archive a child on its
   *    own, then its parent, and the cascade skips the child, so restoring it alone would
   *    put a live row under an archived parent.
   *
   * It never calls `SectionService`: `restoreSection` asserts `projects.write`, and an agent
   * granted `tasks.write` alone — the case `SectionService.resolveContainer` legislates for
   * by name — would have got a `PermissionDeniedError` from inside a task write.
   *
   * `status` and `completedAt` are untouched; archiving never changed them.
   */
  async restore(actor: ActorContext, id: TaskId): Promise<TaskWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      // Idempotent, as `archive` is for an already-archived row. A live task returns
      // unchanged even if an ancestor was archived after the original restore.
      if (current.archivedAt === undefined) return { task: current, operation: null };
      await this.assertProjectActive(current.projectId);

      // Rule 1, and the same refusal `update` makes — one sentence, in one place.
      await this.assertSectionLive(actor, current);
      if (current.parentTaskId !== undefined) {
        const parent = await this.require(actor, current.parentTaskId);
        if (parent.archivedAt !== undefined) {
          throw new DomainRuleError(`task "${id}" is under archived task "${parent.id}"; restore that instead`);
        }
      }

      const restored = await this.commit(actor, current, cleared(current), 'task.restored');
      if (restored === current) return { task: current, operation: null };
      const rows: UndoRowChange[] = [taskRowChange(current, restored)];
      for (const row of await this.dependencies.tasks.list({ projectId: current.projectId, includeArchived: true })) {
        if (row.archivedWithTaskId !== id) continue;
        const cleared_ = TaskSchema.parse({ ...cleared(row), updatedAt: this.dependencies.clock.now().toISOString() });
        await this.dependencies.tasks.update(cleared_);
        rows.push(taskRowChange(row, cleared_));
      }
      const operation = await this.dependencies.history.record(actor, {
        projectId: restored.projectId,
        label: `Restored "${restored.title}"`,
        operation: captureTaskRestore({ taskId: id, projectId: restored.projectId, rows }),
      });
      return { task: restored, operation };
    });
  }

  /**
   * Depth-first, so a descendant already archived keeps its own group intact.
   *
   * It reports every row it wrote, because the action recorded for this archive has to hold the
   * cascade's exact footprint: Undo re-livens precisely those rows, and Redo re-archives precisely
   * those markers.
   */
  private async archiveDescendants(
    actor: ActorContext,
    parentTaskId: TaskId,
    root: TaskId,
    archivedAt: string,
  ): Promise<WrittenRow[]> {
    const written: WrittenRow[] = [];
    const children = await this.dependencies.tasks.list({ parentTaskId, includeArchived: true });
    for (const child of children) {
      if (child.archivedAt !== undefined) continue;
      const archived = TaskSchema.parse({
        ...child,
        archivedAt,
        archivedWithTaskId: root,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      await this.dependencies.tasks.update(archived);
      written.push({ id: child.id, row: taskRowChange(child, archived) });
      written.push(...(await this.archiveDescendants(actor, child.id, root, archivedAt)));
    }
    return written;
  }

  /**
   * Re-parenting is the one operation that can split a task archive group. If a moved
   * archived task carries a marker whose root is no longer its strict ancestor, that task
   * becomes the root of its own group: its marker clears, and the descendants still naming
   * the old root are rewritten to name it. The detached subtree stays one reversible
   * archive, and restoring the old root cannot revive it.
   *
   * A move *within* the same group — the root is still an ancestor — preserves every marker.
   */
  private async normalizeArchiveGroup(actor: ActorContext, moved: Task): Promise<WrittenRow[]> {
    const oldRoot = moved.archivedWithTaskId;
    if (moved.archivedAt === undefined || oldRoot === undefined) return [];
    if (await this.hasAncestor(actor, moved, oldRoot)) return [];

    const next = { ...moved };
    delete next.archivedWithTaskId;
    const rerooted = TaskSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
    await this.dependencies.tasks.update(rerooted);
    // The root's own marker change is part of the footprint even when the section did not change:
    // a reparent-only detach within one list still rewrites markers, and an Undo that ignored them
    // would leave a detached subtree naming a root that is no longer its ancestor.
    return [
      { id: moved.id, row: taskRowChange(moved, rerooted) },
      ...(await this.rerootDescendants(actor, moved.id, oldRoot, moved.id)),
    ];
  }

  private async rerootDescendants(actor: ActorContext, parentTaskId: TaskId, from: TaskId, to: TaskId): Promise<WrittenRow[]> {
    const written: WrittenRow[] = [];
    for (const child of await this.dependencies.tasks.list({ parentTaskId, includeArchived: true })) {
      // A descendant with a different valid root is somebody else's group; leave it alone.
      if (child.archivedWithTaskId === from) {
        const rerooted = TaskSchema.parse({
          ...child,
          archivedWithTaskId: to,
          updatedAt: this.dependencies.clock.now().toISOString(),
        });
        await this.dependencies.tasks.update(rerooted);
        written.push({ id: child.id, row: taskRowChange(child, rerooted) });
      }
      written.push(...(await this.rerootDescendants(actor, child.id, from, to)));
    }
    return written;
  }

  /**
   * `requireWithin`, not `get`: the section read is one this write does on its own behalf,
   * and an agent granted `tasks.write` alone must not need `projects.read` for it — the same
   * reasoning `restore` and `ReflectionService` use.
   */
  private async assertSectionLive(actor: ActorContext, task: Task): Promise<void> {
    const section = await this.dependencies.sections.requireWithin(actor, task.sectionId);
    if (section.archivedAt !== undefined) {
      throw new DomainRuleError(
        `task "${task.id}" is in archived section "${section.id}"; restore the section instead`,
      );
    }
  }

  /** Walks `parentTaskId`; the document's acyclic guarantee makes this finite. */
  private async hasAncestor(actor: ActorContext, task: Task, ancestorId: TaskId): Promise<boolean> {
    let parentId = task.parentTaskId;
    const seen = new Set<TaskId>([task.id]);
    while (parentId !== undefined && !seen.has(parentId)) {
      if (parentId === ancestorId) return true;
      seen.add(parentId);
      parentId = (await this.require(actor, parentId)).parentTaskId;
    }
    return false;
  }

  private async commit(actor: ActorContext, current: Task, next: Task, action: TaskAction): Promise<Task> {
    // A no-op write records nothing, so `update` stays consistent with `complete`.
    if (JSON.stringify({ ...next, updatedAt: current.updatedAt }) === JSON.stringify(current)) return current;

    const updated = TaskSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
    await this.dependencies.tasks.update(updated);
    const verb =
      action === 'task.completed'
        ? 'Completed'
        : action === 'task.archived'
          ? 'Archived'
          : action === 'task.restored'
            ? 'Restored'
            : 'Updated';
    await this.record(actor, updated, action, verb);
    return updated;
  }

  private async record(actor: ActorContext, task: Task, action: TaskAction | 'task.created', verb: string): Promise<void> {
    await this.dependencies.activity.record(actor, {
      action,
      entityType: 'task',
      entityId: task.id,
      projectId: task.projectId,
      summary: `${verb} "${task.title}"`,
    });
  }

  /**
   * Where a new task goes. Named: checked. Inherited from a parent: the same section the
   * parent is rendered in, one turn tighter than the same-project rule it replaces. Absent:
   * resolved to the project's first task list, creating one when there is none — which is
   * what stops an agent producing a project whose work nothing renders.
   */
  private async resolveSection(actor: ActorContext, input: CreateTaskInput): Promise<ResolvedSection> {
    if (input.parentTaskId !== undefined) {
      const parent = await this.require(actor, input.parentTaskId);
      // The document requires a subtask to share its parent's project.
      if (parent.projectId !== input.projectId) {
        throw new DomainRuleError('a subtask must live in the same project as its parent');
      }
      if (input.sectionId !== undefined && input.sectionId !== parent.sectionId) {
        throw new DomainRuleError('a subtask is rendered by its parent section and cannot be given another');
      }
      assertParentLive(parent);
      // §27's third case reaches the *inherited* section too: a supplied page has to agree with
      // where the parent is rendered, and this is also the one create path that names neither a
      // page nor a section, so it is where the disabled-page rule has to be applied by hand.
      // `requireWithin` is the unchecked door, so a `tasks.write`-only agent still gets here.
      const section = await this.dependencies.sections.requireWithin(actor, parent.sectionId);
      if (input.pageId !== undefined && input.pageId !== section.pageId) {
        throw new DomainRuleError('a subtask is rendered by its parent section and cannot be given another page');
      }
      await this.dependencies.sections.assertWritablePage(section);
      return { sectionId: parent.sectionId };
    }

    if (input.sectionId !== undefined) {
      const section = await this.dependencies.sections.requireContainer(
        actor,
        input.projectId,
        input.sectionId,
        'tasks',
      );
      // Authoritative, and it must agree with any page also supplied (§27) — a mismatch is an
      // error rather than a preference order.
      if (input.pageId !== undefined && input.pageId !== section.pageId) {
        throw new DomainRuleError('the named section is not on the named page');
      }
      return { sectionId: input.sectionId };
    }

    const resolved = await this.dependencies.sections.resolveContainer(actor, input.projectId, 'tasks', input.pageId);
    return { sectionId: resolved.section.id, ...(resolved.created === undefined ? {} : { container: resolved.created }) };
  }

  /**
   * Repoints every descendant of a moved task, so a subtree stays in one list, and reports each row
   * it wrote for the action's footprint. Archived descendants move too: an archive group belongs to
   * the list its root is in, and leaving them behind would split it.
   */
  private async moveSubtree(actor: ActorContext, root: Task): Promise<WrittenRow[]> {
    const written: WrittenRow[] = [];
    const children = await this.dependencies.tasks.list({ parentTaskId: root.id, includeArchived: true });
    for (const child of children) {
      if (child.sectionId !== root.sectionId) {
        const moved = TaskSchema.parse({
          ...child,
          sectionId: root.sectionId,
          updatedAt: this.dependencies.clock.now().toISOString(),
        });
        await this.dependencies.tasks.update(moved);
        written.push({ id: child.id, row: taskRowChange(child, moved) });
        written.push(...(await this.moveSubtree(actor, moved)));
        continue;
      }
      written.push(...(await this.moveSubtree(actor, child)));
    }
    return written;
  }

  /**
   * A subtask must share its parent's project — `validateDocumentIntegrity` enforces that
   * much — and must not become its own ancestor, which nothing downstream catches: a
   * committed A→B→A cycle reloads on every boot and hangs the first tree walk that meets
   * it. The visited set also makes the walk terminate on a document that is already
   * cyclic, where an unguarded loop would starve the event loop.
   */
  private async assertParentIsUsable(actor: ActorContext, task: Task, parentId: TaskId): Promise<void> {
    if (parentId === task.id) throw new DomainRuleError('a task cannot be its own parent');

    const seen = new Set<TaskId>([task.id]);
    let ancestor: TaskId | undefined = parentId;
    while (ancestor !== undefined) {
      if (seen.has(ancestor)) throw new DomainRuleError('a task cannot be nested inside itself');
      seen.add(ancestor);
      const parent: Task = await this.require(actor, ancestor);
      if (parent.projectId !== task.projectId) {
        throw new DomainRuleError('a subtask must live in the same project as its parent');
      }
      ancestor = parent.parentTaskId;
    }
  }

  private async isProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<boolean> {
    const project = await this.dependencies.projects.find(projectId);
    return project !== null && project.workspaceId === actor.workspaceId;
  }

  private async assertProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<void> {
    if (!(await this.isProjectVisible(actor, projectId))) throw new EntityNotFoundError('project', projectId);
  }

  /**
   * A project archives by `status`, which `assertProjectVisible` cannot see. Work does not
   * come back into a project someone has put away — **or into one whose ancestor is archived**,
   * since archiving does not cascade (§31). Create, update, complete and restore are refused.
   * Archiving is not — tidying hidden work is the point. The walk is shared with
   * `SectionService` and `ReflectionService`, which each carried the shallow version.
   */
  private async assertProjectActive(projectId: ProjectId): Promise<void> {
    await assertProjectWritable(this.dependencies.projects, projectId);
  }
}
