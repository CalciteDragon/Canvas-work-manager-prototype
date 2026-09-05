import {
  ReflectionIdSchema,
  ReflectionSchema,
  type CreateReflectionInput,
  type ProjectId,
  type Reflection,
  type ReflectionId,
  type ReflectionQuery,
  type UpdateReflectionInput,
} from '@cwm/contracts';
import type { ProjectRepository, ReflectionRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import { assertProjectWritable } from './project-visibility';
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

  /**
   * Scoped to a project, and narrowed to one container when a section is named: a
   * reflections section renders what it owns, not everything the project holds.
   *
   * The filters travel as the shared `ReflectionQuery` rather than a parallel options type,
   * so the Archived region can ask for `{ includeArchived: true }` without a placeholder
   * argument. The mandatory project scope is written **last**, so an untyped caller cannot
   * override it from inside the query object.
   */
  async list(
    actor: ActorContext,
    projectId: ProjectId,
    query: Omit<ReflectionQuery, 'projectId'> = {},
  ): Promise<Reflection[]> {
    assertPermitted(actor, 'reflections.read');
    await this.assertProjectVisible(actor, projectId);
    return (await this.dependencies.reflections.list({ ...query, projectId })).sort((a, b) =>
      b.createdAt === a.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
    );
  }

  async create(actor: ActorContext, input: CreateReflectionInput): Promise<Reflection> {
    assertValidActor(actor);
    assertPermitted(actor, 'reflections.write');
    return this.dependencies.unitOfWork.run(async () => {
      await this.assertProjectVisible(actor, input.projectId);
      await this.assertProjectActive(input.projectId);
      // §27's three cases, the same door `TaskService.create` uses. Named section:
      // authoritative, and it has to agree with any page also supplied. Named page only:
      // resolved there, and refused if that page does not take reflections. Neither: the
      // project's canonical page.
      const sectionId = await this.resolveSection(actor, input);

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
      await this.assertProjectActive(current.projectId);
      await this.assertSectionLive(actor, current);
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

  /**
   * The symmetric pair `TaskService` has had since the ownership phase, and which
   * reflections lacked: a reflection could acquire `archivedAt` only by having its container
   * cascaded, and nothing could ever clear it. Idempotent, like its task counterpart, and
   * allowed inside an archived project or section so hidden work can still be tidied.
   */
  async archive(actor: ActorContext, id: ReflectionId): Promise<Reflection> {
    assertValidActor(actor);
    assertPermitted(actor, 'reflections.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      if (current.archivedAt !== undefined) return current;
      const archivedAt = this.dependencies.clock.now().toISOString();
      const updated = ReflectionSchema.parse({
        ...current,
        archivedAt,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      await this.dependencies.reflections.update(updated);
      await this.record(actor, updated, 'reflection.archived', 'Archived');
      return updated;
    });
  }

  /**
   * The undo. Refused while the owning section is archived — the container is what renders
   * the row, so restore the section, which brings back exactly the rows it took down.
   * Reflections have no parents, so there is no second refusal. A live reflection returns
   * unchanged and records nothing.
   */
  async restore(actor: ActorContext, id: ReflectionId): Promise<Reflection> {
    assertValidActor(actor);
    assertPermitted(actor, 'reflections.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      if (current.archivedAt === undefined) return current;
      await this.assertProjectActive(current.projectId);
      await this.assertSectionLive(actor, current);

      const next = { ...current };
      delete next.archivedAt;
      delete next.archivedWithSectionId;
      const updated = ReflectionSchema.parse({
        ...next,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      await this.dependencies.reflections.update(updated);
      await this.record(actor, updated, 'reflection.restored', 'Restored');
      return updated;
    });
  }

  /** §27's write resolution for a reflection. See `TaskService.resolveSection` for the shape. */
  private async resolveSection(actor: ActorContext, input: CreateReflectionInput) {
    if (input.sectionId === undefined) {
      return (await this.dependencies.sections.resolveContainer(actor, input.projectId, 'reflections', input.pageId))
        .id;
    }
    const section = await this.dependencies.sections.requireContainer(
      actor,
      input.projectId,
      input.sectionId,
      'reflections',
    );
    if (input.pageId !== undefined && input.pageId !== section.pageId) {
      throw new DomainRuleError('the named section is not on the named page');
    }
    return section.id;
  }

  /**
   * `requireWithin`, not `get`: the section read is one this write does on its own behalf,
   * and an agent granted `reflections.write` alone must not need `projects.read` for it.
   */
  private async assertSectionLive(actor: ActorContext, reflection: Reflection): Promise<void> {
    const section = await this.dependencies.sections.requireWithin(actor, reflection.sectionId);
    if (section.archivedAt !== undefined) {
      throw new DomainRuleError(
        `reflection "${reflection.id}" is in archived section "${section.id}"; restore the section instead`,
      );
    }
  }

  /** See `TaskService.assertProjectActive` — the same freeze, and now the same ancestor walk. */
  private async assertProjectActive(projectId: ProjectId): Promise<void> {
    await assertProjectWritable(this.dependencies.projects, projectId);
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
