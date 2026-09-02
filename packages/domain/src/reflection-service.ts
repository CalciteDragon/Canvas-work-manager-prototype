import {
  ReflectionIdSchema,
  ReflectionSchema,
  type CreateReflectionInput,
  type ProjectId,
  type Reflection,
  type ReflectionId,
  type UpdateReflectionInput,
} from '@cwm/contracts';
import type { ProjectRepository, ReflectionRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import type { SectionService } from './section-service';

export interface ReflectionServiceDependencies {
  reflections: ReflectionRepository;
  projects: ProjectRepository;
  /** A reflection belongs to a `reflections` section — see `TaskServiceDependencies`. */
  sections: SectionService;
  activity: ActivityService;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

export class ReflectionService {
  constructor(private readonly dependencies: ReflectionServiceDependencies) {}

  async list(actor: ActorContext, projectId: ProjectId): Promise<Reflection[]> {
    assertPermitted(actor, 'reflections.read');
    await this.assertProjectVisible(actor, projectId);
    return (await this.dependencies.reflections.list({ projectId })).sort((a, b) =>
      b.createdAt === a.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
    );
  }

  async create(actor: ActorContext, input: CreateReflectionInput): Promise<Reflection> {
    assertValidActor(actor);
    assertPermitted(actor, 'reflections.write');
    return this.dependencies.unitOfWork.run(async () => {
      await this.assertProjectVisible(actor, input.projectId);
      // Named: checked. Absent: the project's first reflections section, created through
      // the ordinary add when there is none — the same door `TaskService.create` uses.
      const sectionId =
        input.sectionId === undefined
          ? (await this.dependencies.sections.resolveContainer(actor, input.projectId, 'reflections')).id
          : (await this.dependencies.sections.requireContainer(actor, input.projectId, input.sectionId, 'reflections'))
              .id;

      const now = this.dependencies.clock.now().toISOString();
      const reflection = ReflectionSchema.parse({
        id: ReflectionIdSchema.parse(this.dependencies.ids.next('reflection')),
        ...input,
        sectionId,
        createdAt: now,
        updatedAt: now,
      });
      await this.dependencies.reflections.insert(reflection);
      await this.record(actor, reflection, 'reflection.added', 'Added');
      return reflection;
    });
  }

  async update(actor: ActorContext, id: ReflectionId, input: UpdateReflectionInput): Promise<Reflection> {
    assertValidActor(actor);
    assertPermitted(actor, 'reflections.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      const next = { ...current };
      if (input.title === null) delete next.title;
      else if (input.title !== undefined) next.title = input.title;
      if (input.body !== undefined) next.body = input.body;
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      const updated = ReflectionSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
      await this.dependencies.reflections.update(updated);
      await this.record(actor, updated, 'reflection.updated', 'Updated');
      return updated;
    });
  }

  private async get(actor: ActorContext, id: ReflectionId): Promise<Reflection> {
    const reflection = await this.dependencies.reflections.find(id);
    if (reflection === null) throw new EntityNotFoundError('reflection', id);
    await this.assertProjectVisible(actor, reflection.projectId);
    return reflection;
  }

  private async assertProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<void> {
    const project = await this.dependencies.projects.find(projectId);
    if (project === null || project.workspaceId !== actor.workspaceId) {
      throw new EntityNotFoundError('project', projectId);
    }
  }

  private async record(actor: ActorContext, reflection: Reflection, action: string, verb: string): Promise<void> {
    await this.dependencies.activity.record(actor, {
      action,
      entityType: 'reflection',
      entityId: reflection.id,
      projectId: reflection.projectId,
      summary: `${verb} reflection${reflection.title === undefined ? '' : ` “${reflection.title}”`}`,
    });
  }
}
