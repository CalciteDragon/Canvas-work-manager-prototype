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

type TaskAction = 'task.updated' | 'task.completed' | 'task.archived';

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
      return committed;
    });
  }

  /** Idempotent, per §34's inline completion: completing a done task records nothing. */
  async complete(actor: ActorContext, id: TaskId): Promise<Task> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
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
   */
  async archive(actor: ActorContext, id: TaskId): Promise<Task> {
    assertValidActor(actor);
    assertPermitted(actor, 'tasks.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.archivedAt !== undefined) return current;

      const archivedAt = this.dependencies.clock.now().toISOString();
      return this.commit(actor, current, { ...current, archivedAt }, 'task.archived');
    });
  }

  private async commit(actor: ActorContext, current: Task, next: Task, action: TaskAction): Promise<Task> {
    // A no-op write records nothing, so `update` stays consistent with `complete`.
    if (JSON.stringify({ ...next, updatedAt: current.updatedAt }) === JSON.stringify(current)) return current;

    const updated = TaskSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
    await this.dependencies.tasks.update(updated);
    const verb = action === 'task.completed' ? 'Completed' : action === 'task.archived' ? 'Archived' : 'Updated';
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
}
