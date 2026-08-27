import {
  TaskIdSchema,
  TaskSchema,
  type CreateTaskInput,
  type ProjectId,
  type Task,
  type TaskId,
  type TaskQuery,
  type UpdateTaskInput,
} from '@cwm/contracts';
import type { ProjectRepository, TaskRepository, UnitOfWork } from '@cwm/repositories';
import { assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';

export interface TaskServiceDependencies {
  tasks: TaskRepository;
  projects: ProjectRepository;
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
    if (query.projectId !== undefined) await this.assertProjectVisible(actor, query.projectId);
    if (query.parentTaskId !== undefined) await this.get(actor, query.parentTaskId);

    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const visible = new Set(projects.map((project) => project.id));
    const tasks = await this.dependencies.tasks.list(query);
    return tasks.filter((task) => visible.has(task.projectId));
  }

  async create(actor: ActorContext, input: CreateTaskInput): Promise<Task> {
    assertValidActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      await this.assertProjectVisible(actor, input.projectId);
      if (input.parentTaskId !== undefined) {
        const parent = await this.get(actor, input.parentTaskId);
        // The document requires a subtask to share its parent's project.
        if (parent.projectId !== input.projectId) {
          throw new DomainRuleError('a subtask must live in the same project as its parent');
        }
      }

      const now = this.dependencies.clock.now().toISOString();
      const status = input.status ?? 'todo';
      const task = TaskSchema.parse({
        id: TaskIdSchema.parse(this.dependencies.ids.next('task')),
        projectId: input.projectId,
        parentTaskId: input.parentTaskId,
        title: input.title,
        description: input.description,
        status,
        priority: input.priority ?? 'medium',
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

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
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
      apply(next, 'startAt', input.startAt);
      apply(next, 'dueAt', input.dueAt);
      apply(next, 'parentTaskId', input.parentTaskId);

      if (next.parentTaskId !== current.parentTaskId && next.parentTaskId !== undefined) {
        await this.assertParentIsUsable(actor, current, next.parentTaskId);
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

      return this.commit(actor, current, next, completing ? 'task.completed' : 'task.updated');
    });
  }

  /** Idempotent, per §34's inline completion: completing a done task records nothing. */
  async complete(actor: ActorContext, id: TaskId): Promise<Task> {
    assertValidActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
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

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
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
      const parent: Task = await this.get(actor, ancestor);
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
