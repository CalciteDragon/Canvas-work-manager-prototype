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
import {
  captureProjectAdd,
  captureProjectWrite,
  carriedShortcutsSentence,
  projectAddLabel,
  projectWriteLabel,
  shortcutsCarriedAcrossRoots,
  type GroupWrite,
} from './project-history';
import { archivedAncestry, groupWords, liveSubtree, markArchivedWith, reviveFromMarker } from './project-visibility';

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
   * Read, never written, to refuse a reparent that would split a shortcut's canvas and source across
   * roots (§27) — the check `project-history.ts` shares with a reparent's Undo and Redo. Repositories
   * for the same reason `pages` is one: a placement service here would be a new edge for a read.
   */
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  activity: ActivityService;
  /**
   * Makes creation and every changed update or archive undoable in the **subject's own** history
   * (Slices 39 and 42, §31) — never its root's, so a sub-project creation and a reparent that
   * changes the root move nothing between histories.
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
   * **Live projects underneath an archived ancestor are dropped.** An archive comes down only with
   * what the caller named (§31), so a move or an older document can leave one live inside something
   * someone has put away — hidden from the tree a person navigates while every write to it is refused. It is
   * the trap state, and it is the only thing dropped: a project archived in its own right is
   * still returned, so `status: ['archived']` keeps working. Archive and workspace Settings
   * apply their own recovery eligibility when presenting archived projects.
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

  async create(actor: ActorContext, input: CreateProjectInput): Promise<ProjectWriteResult> {
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
        // completely, and in the trap state the intermediate one can be live.
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
      const page = ProjectPageSchema.parse({
          id: ProjectPageIdSchema.parse(this.dependencies.ids.next('projectPage')),
          projectId: project.id,
          kind: canonicalPageKindFor(project.kind),
          enabled: true,
          createdAt: now,
          updatedAt: now,
        });
      await this.dependencies.pages.insert(page);
      await this.dependencies.activity.record(actor, {
        action: 'project.created',
        entityType: 'project',
        entityId: project.id,
        projectId: project.id,
        summary: `Created "${project.name}"`,
      });
      const operation = captureProjectAdd(project, page);
      const receipt = await this.dependencies.history.record(actor, {
        projectId: project.id,
        label: projectAddLabel(project),
        operation,
      });
      return ProjectWriteResultSchema.parse({ project, operation: receipt });
    });
  }

  /**
   * Every change §26 allows an existing project, as one write: one Activity event, and one history
   * action whose kind follows the status — `project.archive` into `archived`, `project.reactivate`
   * out of it, `project.update` otherwise. A normalized no-op answers `operation: null` and records
   * nothing, so it leaves timestamps, Activity and the actor's Redo branch alone.
   *
   * **A group moves with the transition, still as one write** (Slice 80, §31). Into `archived`, the
   * caller must name the whole live subtree in `archiveWorkstreamIds`, and each comes down marked
   * with this owner. Out of `archived`, every project so marked returns to its recorded status,
   * whichever entry point restored the owner, and nothing unmarked changes.
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

      // A workstream that came down does not leave alone (R5), judged on the normalized change, so
      // sending its current parent or status again is not one. Before the checks below, whose
      // remedies it would contradict: its owner's restore is the only way back.
      const marker = current.archivedWithProject;
      if (marker !== undefined && (next.status !== current.status || next.parentProjectId !== current.parentProjectId)) {
        throw new DomainRuleError(`project "${id}" was archived with "${marker.projectId}"; restore "${marker.projectId}" to bring it back`);
      }

      const named = input.archiveWorkstreamIds ?? [];
      const archiving = next.status === 'archived' && current.status !== 'archived';
      // Refused on anything but an archive, except a retry of one: on an already archived project
      // the list is ignored, so an uncertain retry stays the idempotent no-op it needs.
      if (named.length > 0 && !archiving && !(current.status === 'archived' && input.status === 'archived')) {
        throw new DomainRuleError('archiveWorkstreamIds applies only to a write that archives the project');
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

      // The exposed route is PATCH, so a rule only `archive()` enforced would be decorative.
      const group = archiving
        ? await this.groupComingDown(actor, id, named)
        : reactivating
          ? await this.groupComingBack(actor, id)
          : [];

      // The label names the new parent; `assertParentIsUsable` does not keep it, so it is read once
      // more inside the same unit, and only for a move.
      const parentName = reparenting ? (await this.dependencies.projects.find(next.parentProjectId!))?.name : undefined;
      return this.commit(actor, current, next, archiving, parentName, group);
    });
  }

  /**
   * Sets `status: 'archived'`, with the live workstreams the caller named. Idempotent: archiving an
   * archived project records nothing, and ignores the list.
   */
  async archive(actor: ActorContext, id: ProjectId, options: { archiveWorkstreamIds?: readonly ProjectId[] } = {}): Promise<ProjectWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.status === 'archived') return ProjectWriteResultSchema.parse({ project: current, operation: null });
      const group = await this.groupComingDown(actor, id, options.archiveWorkstreamIds ?? []);
      return this.commit(actor, current, { ...current, status: 'archived' }, true, undefined, group);
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
    group: readonly GroupWrite[] = [],
  ): Promise<ProjectWriteResult> {
    const changed = { ...next, updatedAt: current.updatedAt };
    if (JSON.stringify(changed) === JSON.stringify(current)) return ProjectWriteResultSchema.parse({ project: current, operation: null });

    const updatedAt = this.dependencies.clock.now().toISOString();
    const updated = ProjectSchema.parse({ ...next, updatedAt });
    await this.dependencies.projects.update(updated);
    const cascaded: Project[] = [];
    for (const { after } of group) {
      const workstream = ProjectSchema.parse({ ...after, updatedAt });
      await this.dependencies.projects.update(workstream);
      cascaded.push(workstream);
    }
    // One line however large the group, on the owner: one gesture stays one event (R7).
    const words = groupWords(group.length);
    await this.dependencies.activity.record(actor, {
      action: archiving ? 'project.archived' : 'project.updated',
      entityType: 'project',
      entityId: updated.id,
      projectId: updated.id,
      summary: archiving ? `Archived "${updated.name}"${words}` : group.length > 0 ? `Reactivated "${updated.name}"${words}` : `Updated "${updated.name}"`,
    });
    // Recorded inside this same unit, after the write and its activity, so the project, the event
    // and the action commit or roll back together.
    const operation = captureProjectWrite(current, updated, group);
    const receipt = await this.dependencies.history.record(actor, {
      projectId: updated.id,
      label: projectWriteLabel(operation, updated, parentName),
      operation,
    });
    return ProjectWriteResultSchema.parse({ project: updated, operation: receipt, ...(cascaded.length === 0 ? {} : { cascaded }) });
  }

  /**
   * A move to another root must not split a shortcut — its canvas on one side, its source on the
   * other: that placement would cross root trees, which commit-time integrity rejects as a defect
   * rather than a refusal. Naming each placement, with the page it sits on and the section it
   * places, lets the caller remove it in one step and retry (§§26, 27, 61). The sentence is the one
   * a reparent's Undo or Redo uses, from `carriedShortcutsSentence` (Slice 68).
   */
  private async assertNoShortcutCarriedAcrossRoots(subject: Project, parentId: ProjectId): Promise<void> {
    const sentence = carriedShortcutsSentence(await shortcutsCarriedAcrossRoots(this.dependencies, subject, parentId));
    if (sentence === undefined) return;
    throw new DomainRuleError(`project "${subject.id}" cannot move to another root: ${sentence}`);
  }

  /**
   * An implicit cascade would archive work the caller never named (§58 flags archive), so the caller
   * names it: `named` must be exactly the live subtree, or nothing is written. A refusal names every
   * live workstream with its id, so one retry can succeed; a stranger gets one text whether it is
   * foreign or absent, so this does not confirm a project in another workspace exists.
   */
  private async assertNamedWorkstreams(actor: ActorContext, id: ProjectId, named: readonly ProjectId[]): Promise<Project[]> {
    // The repository, not `list`: this runs inside `archive`, and a write must not
    // additionally require `projects.read` to check its own precondition.
    const live = liveSubtree(await this.dependencies.projects.list({ workspaceId: actor.workspaceId }), id);
    const stranger = named.find((candidate) => !live.some((project) => project.id === candidate));
    if (stranger !== undefined) {
      throw new DomainRuleError(`project "${id}" cannot archive "${stranger}": it is not a live workstream under it`);
    }
    if (live.some((project) => !named.includes(project.id))) {
      throw new DomainRuleError(`project "${id}" still has active workstreams: ${live.map((project) => `"${project.name}" [${project.id}]`).join(', ')}`);
    }
    return live;
  }

  /** The named live subtree, each as this owner's archive leaves it. Computed before anything is written. */
  private async groupComingDown(actor: ActorContext, id: ProjectId, named: readonly ProjectId[]): Promise<GroupWrite[]> {
    const live = await this.assertNamedWorkstreams(actor, id, named);
    return live.map((before) => ({ before, after: markArchivedWith(before, id) }));
  }

  /** Every project marked with this owner, each as its restore leaves it. */
  private async groupComingBack(actor: ActorContext, id: ProjectId): Promise<GroupWrite[]> {
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    return projects
      .filter((project) => project.archivedWithProject?.projectId === id)
      .map((before) => ({ before, after: reviveFromMarker(before) }));
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
