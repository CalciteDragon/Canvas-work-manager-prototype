import {
  canonicalPageKindFor,
  ProjectIdSchema,
  ProjectPageIdSchema,
  ProjectPageSchema,
  ProjectSchema,
  type CreateProjectInput,
  type Project,
  type ProjectId,
  type ProjectQuery,
  type UpdateProjectInput,
} from '@cwm/contracts';
import type { ProjectPageRepository, ProjectRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';

/**
 * §26's project hierarchy. Deliberately no depth limit: whether nesting is worth keeping
 * at all is a §83 question, and a limit invented now would prejudge it.
 */
export interface ProjectServiceDependencies {
  projects: ProjectRepository;
  /**
   * §26's pages. A repository rather than a page *service*: a project and its canonical page
   * are one write, and routing that through another service would be a new edge in the domain
   * graph for no invariant that needs one.
   */
  pages: ProjectPageRepository;
  activity: ActivityService;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

/** `null` clears and `undefined` leaves alone — §11's `dueAt` example is the pattern. */
const apply = <T extends object>(project: T, key: keyof T, value: unknown): void => {
  if (value === undefined) return;
  if (value === null) delete project[key];
  else project[key] = value as T[keyof T];
};

export class ProjectService {
  constructor(private readonly dependencies: ProjectServiceDependencies) {}

  async get(actor: ActorContext, id: ProjectId): Promise<Project> {
    assertPermitted(actor, 'projects.read');
    return this.require(actor, id);
  }

  /**
   * The same lookup without the permission check, for the write paths below.
   *
   * A grant of `projects.write` alone has to be usable: an agent that could create a
   * sub-project but not read one would fail on the parent lookup inside its own create.
   * Reads a *caller* asked for are checked; reads a write does on its own behalf are not.
   */
  private async require(actor: ActorContext, id: ProjectId): Promise<Project> {
    const project = await this.dependencies.projects.find(id);
    // A foreign project is "not found", not "forbidden": 409 would confirm it exists.
    if (project === null || project.workspaceId !== actor.workspaceId) {
      throw new EntityNotFoundError('project', id);
    }
    return project;
  }

  /** The actor's workspace is applied last, so a caller-supplied filter cannot widen it. */
  async list(actor: ActorContext, query: ProjectQuery = {}): Promise<Project[]> {
    assertPermitted(actor, 'projects.read');
    return this.dependencies.projects.list({ ...query, workspaceId: actor.workspaceId });
  }

  async create(actor: ActorContext, input: CreateProjectInput): Promise<Project> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    if (input.workspaceId !== actor.workspaceId) {
      throw new DomainRuleError('a project can only be created in the actor\u2019s own workspace');
    }

    if (input.progressFormula === 'manual' && input.manualProgress === undefined) {
      throw new DomainRuleError('manual progress requires a value from 0 to 100');
    }

    return this.dependencies.unitOfWork.run(async () => {
      if (input.kind === 'subproject') {
        const parent = await this.require(actor, input.parentProjectId);
        // A unit of work under archived work would be live inside something hidden from every
        // ordinary read — the same defect a live row in an archived section is, one layer up.
        if (parent.status === 'archived') {
          throw new DomainRuleError(`project "${parent.id}" is archived and cannot take new work`);
        }
      }

      const now = this.dependencies.clock.now().toISOString();
      const project = ProjectSchema.parse({
        id: ProjectIdSchema.parse(this.dependencies.ids.next('project')),
        workspaceId: input.workspaceId,
        kind: input.kind,
        parentProjectId: input.parentProjectId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        status: input.status ?? 'planning',
        targetDate: input.targetDate ?? undefined,
        projectLayoutMode: input.projectLayoutMode ?? 'flow',
        progressFormula: input.progressFormula ?? 'count',
        manualProgress: input.manualProgress,
        createdAt: now,
        updatedAt: now,
      });

      await this.dependencies.projects.insert(project);
      // In the same unit as the owner: a project with no canonical page has nowhere to put a
      // section, which `validateDocumentIntegrity` rejects — so the pair commits or neither
      // does. No separate "ensure page" path exists to drift from this one.
      await this.dependencies.pages.insert(
        ProjectPageSchema.parse({
          id: ProjectPageIdSchema.parse(this.dependencies.ids.next('projectPage')),
          projectId: project.id,
          kind: canonicalPageKindFor(project.kind),
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
      await this.dependencies.activity.record(actor, {
        action: 'project.created',
        entityType: 'project',
        entityId: project.id,
        projectId: project.id,
        summary: `Created "${project.name}"`,
      });
      return project;
    });
  }

  async update(actor: ActorContext, id: ProjectId, input: UpdateProjectInput): Promise<Project> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      // Reparenting is only meaningful for a unit of work. A root has no parent to change,
      // and giving it one would be conversion between kinds — which §26 does not allow, and
      // which `ProjectSchema` would reject as a parse failure rather than a refusal.
      if (input.parentProjectId !== undefined && current.kind !== 'subproject') {
        throw new DomainRuleError('a root project cannot be given a parent');
      }

      const next = { ...current };
      apply(next, 'name', input.name);
      apply(next, 'description', input.description);
      apply(next, 'icon', input.icon);
      apply(next, 'status', input.status);
      apply(next, 'targetDate', input.targetDate);
      apply(next, 'projectLayoutMode', input.projectLayoutMode);
      apply(next, 'progressFormula', input.progressFormula);
      apply(next, 'manualProgress', input.manualProgress);
      apply(next, 'parentProjectId', input.parentProjectId);

      if (next.progressFormula === 'manual' && next.manualProgress === undefined) {
        throw new DomainRuleError('manual progress requires a value from 0 to 100');
      }

      if (next.parentProjectId !== current.parentProjectId && next.parentProjectId !== undefined) {
        await this.assertParentIsUsable(actor, id, next.parentProjectId);
      }

      // §26: completion is explicit and recorded. Derived from the status rather than
      // accepted as an input, so the two cannot disagree, and cleared on reopening so a
      // reopened project does not keep claiming a finish date.
      if (next.status === 'completed' && current.status !== 'completed') {
        next.completedAt = this.dependencies.clock.now().toISOString();
      } else if (next.status !== 'completed') {
        delete next.completedAt;
      }

      const archiving = next.status === 'archived' && current.status !== 'archived';
      // The exposed route is PATCH, so a rule only `archive()` enforced would be decorative.
      if (archiving) await this.assertNoActiveChildren(actor, id);

      return this.commit(actor, current, next, archiving);
    });
  }

  /** Sets `status: 'archived'`. Idempotent: archiving an archived project records nothing. */
  async archive(actor: ActorContext, id: ProjectId): Promise<Project> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.status === 'archived') return current;
      await this.assertNoActiveChildren(actor, id);
      return this.commit(actor, current, { ...current, status: 'archived' }, true);
    });
  }

  private async commit(actor: ActorContext, current: Project, next: Project, archiving: boolean): Promise<Project> {
    const changed = { ...next, updatedAt: current.updatedAt };
    if (JSON.stringify(changed) === JSON.stringify(current)) return current;

    const updated = ProjectSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
    await this.dependencies.projects.update(updated);
    await this.dependencies.activity.record(actor, {
      action: archiving ? 'project.archived' : 'project.updated',
      entityType: 'project',
      entityId: updated.id,
      projectId: updated.id,
      summary: `${archiving ? 'Archived' : 'Updated'} "${updated.name}"`,
    });
    return updated;
  }

  /** An implicit cascade would archive work the caller never named (§58 flags archive). */
  private async assertNoActiveChildren(actor: ActorContext, id: ProjectId): Promise<void> {
    // The repository, not `list`: this runs inside `archive`, and a write must not
    // additionally require `projects.read` to check its own precondition.
    const children = await this.dependencies.projects.list({
      workspaceId: actor.workspaceId,
      parentProjectId: id,
    });
    if (children.some((child) => child.status !== 'archived')) {
      throw new DomainRuleError(`project "${id}" still has active sub-projects`);
    }
  }

  private async assertParentIsUsable(actor: ActorContext, id: ProjectId, parentId: ProjectId): Promise<void> {
    if (parentId === id) throw new DomainRuleError('a project cannot be its own parent');

    // The visited set is not belt-and-braces. A document can already contain a cycle —
    // a hand-edited file, or one written before this rule existed — and every step of
    // this walk resolves as a microtask, so an unguarded loop does not hang one request:
    // it starves the event loop and wedges the process, signal handlers included.
    const seen = new Set<ProjectId>([id]);
    let ancestor: ProjectId | undefined = parentId;
    while (ancestor !== undefined) {
      if (seen.has(ancestor)) throw new DomainRuleError('a project cannot be nested inside itself');
      seen.add(ancestor);
      const project: Project = await this.require(actor, ancestor);
      if (project.parentProjectId === id) throw new DomainRuleError('a project cannot be nested inside itself');
      ancestor = project.parentProjectId;
    }
  }
}
