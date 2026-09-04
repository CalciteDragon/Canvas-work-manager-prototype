import {
  TaskIdSchema,
  TaskSchema,
  type CreateTaskInput,
  type ProjectId,
  type SectionId,
  type Task,
  type TaskId,
  type TaskQuery,
  type UpdateTaskInput,
} from '@cwm/contracts';
import type { ProjectRepository, TaskRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import type { SectionService } from './section-service';

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
    return tasks.filter((task) => visible.has(task.projectId));
  }

  async create(actor: ActorContext, input: CreateTaskInput): Promise<Task> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      await this.assertProjectVisible(actor, input.projectId);
      await this.assertProjectActive(input.projectId);
      // `resolveSection` refuses an archived container through `requireContainer`, and
      // skips one through `resolveContainer`; the parent check below is the level down.
      const sectionId = await this.resolveSection(actor, input);

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
      return task;
    });
  }

  async update(actor: ActorContext, id: TaskId, input: UpdateTaskInput): Promise<Task> {
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
      // Dragging a task between lists is the operation two containers exist for, and a
      // parent left behind by its own subtasks would render as two half-tasks.
      if (committed.sectionId !== current.sectionId) await this.moveSubtree(actor, committed);
      // Re-parenting can split an archive group, and it can do so **without** changing
      // section — an `A → B → C` detach within one list — so this runs on any parent change
      // rather than being folded into the section-gated `moveSubtree` above.
      if (committed.parentTaskId !== current.parentTaskId) await this.normalizeArchiveGroup(actor, committed);
      return committed;
    });
  }

  /** Idempotent, per §34's inline completion: completing a done task records nothing. */
  async complete(actor: ActorContext, id: TaskId): Promise<Task> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      await this.assertProjectActive(current.projectId);
      if (current.archivedAt !== undefined) throw new DomainRuleError('an archived task cannot be completed');
      if (current.status === 'done') return current;

      const completedAt = this.dependencies.clock.now().toISOString();
      return this.commit(actor, current, { ...current, status: 'done', completedAt }, 'task.completed');
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
  async archive(actor: ActorContext, id: TaskId): Promise<Task> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.archivedAt !== undefined) return current;

      const archivedAt = this.dependencies.clock.now().toISOString();
      const archived = await this.commit(actor, current, { ...current, archivedAt }, 'task.archived');
      await this.archiveDescendants(actor, archived.id, archived.id, archivedAt);
      return archived;
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
  async restore(actor: ActorContext, id: TaskId): Promise<Task> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      // Idempotent, as `archive` is for an already-archived row. A live task returns
      // unchanged even if an ancestor was archived after the original restore.
      if (current.archivedAt === undefined) return current;
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
      for (const row of await this.dependencies.tasks.list({ projectId: current.projectId, includeArchived: true })) {
        if (row.archivedWithTaskId !== id) continue;
        await this.dependencies.tasks.update(
          TaskSchema.parse({ ...cleared(row), updatedAt: this.dependencies.clock.now().toISOString() }),
        );
      }
      return restored;
    });
  }

  /** Depth-first, so a descendant already archived keeps its own group intact. */
  private async archiveDescendants(
    actor: ActorContext,
    parentTaskId: TaskId,
    root: TaskId,
    archivedAt: string,
  ): Promise<void> {
    const children = await this.dependencies.tasks.list({ parentTaskId, includeArchived: true });
    for (const child of children) {
      if (child.archivedAt !== undefined) continue;
      await this.dependencies.tasks.update(
        TaskSchema.parse({
          ...child,
          archivedAt,
          archivedWithTaskId: root,
          updatedAt: this.dependencies.clock.now().toISOString(),
        }),
      );
      await this.archiveDescendants(actor, child.id, root, archivedAt);
    }
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
  private async normalizeArchiveGroup(actor: ActorContext, moved: Task): Promise<void> {
    const oldRoot = moved.archivedWithTaskId;
    if (moved.archivedAt === undefined || oldRoot === undefined) return;
    if (await this.hasAncestor(actor, moved, oldRoot)) return;

    const next = { ...moved };
    delete next.archivedWithTaskId;
    await this.dependencies.tasks.update(
      TaskSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() }),
    );
    await this.rerootDescendants(actor, moved.id, oldRoot, moved.id);
  }

  private async rerootDescendants(actor: ActorContext, parentTaskId: TaskId, from: TaskId, to: TaskId): Promise<void> {
    for (const child of await this.dependencies.tasks.list({ parentTaskId, includeArchived: true })) {
      // A descendant with a different valid root is somebody else's group; leave it alone.
      if (child.archivedWithTaskId === from) {
        await this.dependencies.tasks.update(
          TaskSchema.parse({
            ...child,
            archivedWithTaskId: to,
            updatedAt: this.dependencies.clock.now().toISOString(),
          }),
        );
      }
      await this.rerootDescendants(actor, child.id, from, to);
    }
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
  private async resolveSection(actor: ActorContext, input: CreateTaskInput): Promise<SectionId> {
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
      return parent.sectionId;
    }

    if (input.sectionId !== undefined) {
      await this.dependencies.sections.requireContainer(actor, input.projectId, input.sectionId, 'tasks');
      return input.sectionId;
    }

    return (await this.dependencies.sections.resolveContainer(actor, input.projectId, 'tasks')).id;
  }

  /** Repoints every descendant of a moved task, so a subtree stays in one list. */
  private async moveSubtree(actor: ActorContext, root: Task): Promise<void> {
    const children = await this.dependencies.tasks.list({ parentTaskId: root.id, includeArchived: true });
    for (const child of children) {
      if (child.sectionId !== root.sectionId) {
        const moved = TaskSchema.parse({
          ...child,
          sectionId: root.sectionId,
          updatedAt: this.dependencies.clock.now().toISOString(),
        });
        await this.dependencies.tasks.update(moved);
        await this.moveSubtree(actor, moved);
        continue;
      }
      await this.moveSubtree(actor, child);
    }
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
   * come back into a project someone has put away: create, update, complete and restore are
   * refused. Archiving is not — tidying hidden work is the point.
   */
  private async assertProjectActive(projectId: ProjectId): Promise<void> {
    const project = await this.dependencies.projects.find(projectId);
    if (project?.status === 'archived') {
      throw new DomainRuleError(`project "${projectId}" is archived; reactivate it first`);
    }
  }
}
