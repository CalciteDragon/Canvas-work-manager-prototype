import {
  canonicalPageKindFor,
  ProjectIdSchema,
  ProjectPageIdSchema,
  ProjectPageSchema,
  ProjectSchema,
  ProjectWriteResultSchema,
  type CreateProjectInput,
  type Project,
  type ProjectId,
  type ProjectQuery,
  type ProjectWriteResult,
  type UpdateProjectInput,
} from '@cwm/contracts';
import type { ProjectPageRepository, ProjectRepository, SectionRepository, SectionShortcutRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import type { OperationRecorder } from './operation-recorder';
import { captureProjectWrite, projectWriteLabel, shortcutsCarriedAcrossRoots } from './project-history';
import { archivedAncestry } from './project-visibility';

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
  /**
   * Read, never written, to refuse a reparent that would carry a Home shortcut's source out of its
   * root (§27) — the check `project-history.ts` shares with a reparent's Undo and Redo. Repositories
   * for the same reason `pages` is one: a placement service here would be a new edge for a read.
   */
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  activity: ActivityService;
  /**
   * Makes each changed update or archive of an existing project undoable, in the **subject's own**
   * history (Slice 39, §31) — never its root's, so a reparent that changes the root moves nothing
   * between histories. `create` does not record yet.
   */
  history: OperationRecorder;
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

  /**
   * The actor's workspace is applied last, so a caller-supplied filter cannot widen it.
   *
   * **Live projects underneath an archived ancestor are dropped.** Archiving does not cascade
   * (§31), so reparenting or reactivating can leave one live inside something someone has put
   * away — hidden from the tree a person navigates while every write to it is refused. It is
   * the trap state, and it is the only thing dropped: a project archived in its own right is
   * still returned, so `status: ['archived']` keeps working and an archived project's
   * Sub-Projects section still lists the descendants that were archived with it — which, since
   * archiving requires its children archived first, is all of them on a document built through
   * these operations.
   *
   * The ancestry is built over the **unfiltered** workspace, then the query is applied. Built
   * over the filtered result it would be looking for ancestors that are no longer in the array,
   * and would silently find none.
   */
  async list(actor: ActorContext, query: ProjectQuery = {}): Promise<Project[]> {
    assertPermitted(actor, 'projects.read');
    const ancestry = archivedAncestry(await this.dependencies.projects.list({ workspaceId: actor.workspaceId }));
    const matching = await this.dependencies.projects.list({ ...query, workspaceId: actor.workspaceId });
    return matching.filter((project) => !ancestry.isHidden(project.id));
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
        // The whole chain, not just the parent: an archived *grandparent* hides it just as
        // completely, and archiving does not cascade, so the intermediate one can be live.
        await this.assertAncestryActive(actor, parent);
      }

      const now = this.dependencies.clock.now().toISOString();
      const project = ProjectSchema.parse({
        id: ProjectIdSchema.parse(this.dependencies.ids.next('project')),
        workspaceId: input.workspaceId,
        kind: input.kind,
        // Only one branch of the input has a parent, and reading it outside the narrow would
        // be reading a field the root branch does not have — which is the union working.
        parentProjectId: input.kind === 'subproject' ? input.parentProjectId : undefined,
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

  /**
   * Every change §26 allows an existing project, as one write: one Activity event, and one history
   * action whose kind follows the status — `project.archive` into `archived`, `project.reactivate`
   * out of it, `project.update` otherwise. A normalized no-op answers `operation: null` and records
   * nothing, so it leaves timestamps, Activity and the actor's Redo branch alone.
   */
  async update(actor: ActorContext, id: ProjectId, input: UpdateProjectInput): Promise<ProjectWriteResult> {
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

      const reparenting = next.parentProjectId !== current.parentProjectId && next.parentProjectId !== undefined;
      if (reparenting) await this.assertParentIsUsable(actor, id, next.parentProjectId!);

      // **Reactivating is an explicit choice (§31); this only says in which order.** Coming back
      // out of `archived` while an ancestor is still archived would produce a project that is
      // live, hidden from every ordinary read, and refused by every write — so it names the
      // ancestor to reactivate first instead.
      //
      // A *transition*, not a state: a project already live under an archived ancestor has
      // `next.status !== 'archived'` on every update, so a state check would refuse renaming it
      // or moving it out — which is the way out.
      const reactivating = current.status === 'archived' && next.status !== 'archived';
      // One walk, from `next.parentProjectId` — **after** the reparent, so reactivating and
      // moving to a live parent in one call succeeds rather than being refused against the
      // parent it is leaving.
      if ((reparenting || reactivating) && next.parentProjectId !== undefined) {
        await this.assertAncestryActive(actor, await this.require(actor, next.parentProjectId));
      }
      // After the parent is known to be usable, so a missing or cyclic destination is refused as
      // that, not misread as a move to another root.
      if (reparenting) await this.assertNoShortcutCarriedAcrossRoots(current, next.parentProjectId!);

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

      // The label names the new parent; `assertParentIsUsable` does not keep it, so it is read once
      // more inside the same unit, and only for a move.
      const parentName = reparenting ? (await this.dependencies.projects.find(next.parentProjectId!))?.name : undefined;
      return this.commit(actor, current, next, archiving, parentName);
    });
  }

  /** Sets `status: 'archived'`. Idempotent: archiving an archived project records nothing. */
  async archive(actor: ActorContext, id: ProjectId): Promise<ProjectWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.status === 'archived') return ProjectWriteResultSchema.parse({ project: current, operation: null });
      await this.assertNoActiveChildren(actor, id);
      return this.commit(actor, current, { ...current, status: 'archived' }, true);
    });
  }

  /**
   * The one write both entry points share, and so the one place history is captured: from the
   * normalized change this method is about to apply, not from the caller's input, so an omitted
   * field, a `null` on an absent one and a status that did not move all record nothing.
   */
  private async commit(
    actor: ActorContext,
    current: Project,
    next: Project,
    archiving: boolean,
    parentName?: string,
  ): Promise<ProjectWriteResult> {
    const changed = { ...next, updatedAt: current.updatedAt };
    if (JSON.stringify(changed) === JSON.stringify(current)) return ProjectWriteResultSchema.parse({ project: current, operation: null });

    const updated = ProjectSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
    await this.dependencies.projects.update(updated);
    await this.dependencies.activity.record(actor, {
      action: archiving ? 'project.archived' : 'project.updated',
      entityType: 'project',
      entityId: updated.id,
      projectId: updated.id,
      summary: `${archiving ? 'Archived' : 'Updated'} "${updated.name}"`,
    });
    // Recorded inside this same unit, after the write and its activity, so the project, the event
    // and the action commit or roll back together.
    const operation = captureProjectWrite(current, updated);
    const receipt = await this.dependencies.history.record(actor, {
      projectId: updated.id,
      label: projectWriteLabel(operation, updated, parentName),
      operation,
    });
    return ProjectWriteResultSchema.parse({ project: updated, operation: receipt });
  }

  /**
   * A move to another root must not take a section an old-root Home shortcut places: that
   * placement would cross root trees, which commit-time integrity rejects as a defect rather than
   * a refusal. Naming each placement lets the caller remove it and retry (§§26, 27, 61).
   */
  private async assertNoShortcutCarriedAcrossRoots(subject: Project, parentId: ProjectId): Promise<void> {
    const carried = await shortcutsCarriedAcrossRoots(this.dependencies, subject, parentId);
    if (carried.length === 0) return;
    const named = carried.map(({ id }) => `"${id}"`).join(', ');
    throw new DomainRuleError(
      `project "${subject.id}" cannot move to another root while Home shortcut ${named} on its current root places a section from it; remove that placement first`,
    );
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

  /**
   * The parent, and everything above it. Walks with a visited set for the reason
   * `assertParentIsUsable` states — a document can already contain a cycle.
   */
  private async assertAncestryActive(actor: ActorContext, parent: Project): Promise<void> {
    const seen = new Set<ProjectId>();
    let current: Project | undefined = parent;
    while (current !== undefined && !seen.has(current.id)) {
      if (current.status === 'archived') {
        throw new DomainRuleError(`project "${current.id}" is archived and cannot take new work`);
      }
      seen.add(current.id);
      current = current.parentProjectId === undefined ? undefined : await this.require(actor, current.parentProjectId);
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
