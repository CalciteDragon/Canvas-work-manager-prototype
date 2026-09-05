import {
  isCanonicalPageKind,
  isNavigablePageKind,
  NAVIGABLE_PAGE_KINDS,
  ProjectPageIdSchema,
  ProjectPageSchema,
  type ProjectId,
  type ProjectPage,
  type SetProjectPageEnabledInput,
} from '@cwm/contracts';
import type { ProjectPageRepository, ProjectRepository, UnitOfWork } from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';

/**
 * §26's pages as a surface: which a root has, and which of the optional three are on.
 *
 * Deliberately **not** a method on `ProjectService`. A project's *canonical* page is created in
 * the same unit of work as its owner, because a project with nowhere to put a section is not a
 * state any operation should reach — that pairing belongs to the create. Everything after it is
 * an operation on a page, and routing it back through `ProjectService` would be a service edge
 * with no invariant behind it (§12). This service reads the project repository for scoping and
 * eligibility, and never calls another service except `ActivityService`, as every writer does.
 */
export interface ProjectPageServiceDependencies {
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  activity: ActivityService;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

/**
 * §23's column order, read from the one place that states it. Not from `ProjectPageKind`'s own
 * order, which agrees only by coincidence — `work` happens to sit where it does, and a root
 * never owns one — so reordering that enum for an unrelated reason would silently reshuffle
 * navigation with nothing to catch it.
 *
 * Sorting here rather than at each caller: a list whose order depends on insertion is a
 * navigation bar that rearranges itself the first time somebody enables a page.
 */
const KIND_ORDER = new Map<string, number>(NAVIGABLE_PAGE_KINDS.map((kind, index) => [kind, index]));

export class ProjectPageService {
  constructor(private readonly dependencies: ProjectPageServiceDependencies) {}

  /**
   * Every page a project owns, enabled or not — the toggle list, not the navigation. A caller
   * rendering navigation filters on `enabled`; a caller rendering *settings* needs both states,
   * and a list that hid the disabled ones could not offer to turn one back on.
   */
  async list(actor: ActorContext, projectId: ProjectId): Promise<ProjectPage[]> {
    assertPermitted(actor, 'projects.read');
    await this.requireProject(actor, projectId);
    // A sub-project's `work` page is not navigation and has no place in that order; it is also
    // the only page such a project owns, so sorting it against anything is moot.
    return (await this.dependencies.pages.list({ projectId })).sort(
      (a, b) => (KIND_ORDER.get(a.kind) ?? -1) - (KIND_ORDER.get(b.kind) ?? -1),
    );
  }

  /**
   * §26's optional tabs, on and off.
   *
   * **The first enable creates the record.** A root is created with Home and nothing else — §26's
   * "defaulting to Home only for a new root" is the literal stored state — and a document written
   * before this operation existed has exactly that. Pre-creating four rows per root would have
   * made every one of those documents wrong; upserting means nothing has to be converted.
   *
   * **Disabling is nondestructive, structurally.** It writes `enabled: false` and nothing else,
   * so the page keeps its sections, their positions and every reference to it. There is no
   * remove: a page is never deleted (see `ProjectPageRepository`).
   *
   * **Allowed while the project is archived**, unlike every other write in the domain. §31 is
   * explicit that undo must not sit behind a toggle — disabling the Archive page has to leave a
   * way back to it — and a toggle moves no work, which is what the freeze is about. It is the
   * same exemption `SectionService.remove` carries.
   */
  async setEnabled(
    actor: ActorContext,
    projectId: ProjectId,
    input: SetProjectPageEnabledInput,
  ): Promise<ProjectPage> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const project = await this.requireProject(actor, projectId);
      // §26: "a subproject cannot acquire pages". Its work canvas is not a tab — it cannot be
      // added, disabled or chosen — so every kind is refused here, including `work` itself.
      if (project.kind !== 'root') {
        throw new DomainRuleError('a sub-project has one work canvas and no pages to configure');
      }
      if (!isNavigablePageKind(input.kind)) {
        throw new DomainRuleError(`a ${input.kind} page is not one a root can configure`);
      }
      // Home is required and cannot be disabled — `validateDocumentIntegrity` rejects the
      // document that would result, so refusing here is what turns a rollback into an answer.
      if (isCanonicalPageKind(input.kind) && !input.enabled) {
        throw new DomainRuleError(`the ${input.kind} page is required and cannot be disabled`);
      }

      const existing = (await this.dependencies.pages.list({ projectId, kind: input.kind }))[0];
      if (existing !== undefined) {
        // Idempotent, and records nothing: a toggle set to where it already is did not happen.
        if (existing.enabled === input.enabled) return existing;
        const updated = ProjectPageSchema.parse({
          ...existing,
          enabled: input.enabled,
          updatedAt: this.dependencies.clock.now().toISOString(),
        });
        await this.dependencies.pages.update(updated);
        await this.record(actor, updated);
        return updated;
      }

      // Nothing to disable. Refused rather than silently succeeding, because "off" and "never
      // existed" look identical afterwards and only one of them was an operation.
      if (!input.enabled) throw new DomainRuleError(`project "${projectId}" has no ${input.kind} page`);

      const now = this.dependencies.clock.now().toISOString();
      const created = ProjectPageSchema.parse({
        id: ProjectPageIdSchema.parse(this.dependencies.ids.next('projectPage')),
        projectId,
        kind: input.kind,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
      await this.dependencies.pages.insert(created);
      await this.record(actor, created);
      return created;
    });
  }

  /**
   * The workspace scope, and the not-found a foreign project gets rather than a 409 that would
   * confirm it exists — the rule `ProjectService.require` states.
   */
  private async requireProject(actor: ActorContext, projectId: ProjectId) {
    const project = await this.dependencies.projects.find(projectId);
    if (project === null || project.workspaceId !== actor.workspaceId) {
      throw new EntityNotFoundError('project', projectId);
    }
    return project;
  }

  /**
   * Against the **project**, for the reason `SectionService.record` states at length: document
   * integrity resolves every activity event's target, and `ActivityEntityType` has no `page`
   * member — adding one would pin every page record alive forever. The verb still says what
   * happened, which is what §57 asks of it.
   */
  private async record(actor: ActorContext, page: ProjectPage): Promise<void> {
    await this.dependencies.activity.record(actor, {
      action: page.enabled ? 'project.page_enabled' : 'project.page_disabled',
      entityType: 'project',
      entityId: page.projectId,
      projectId: page.projectId,
      summary: `${page.enabled ? 'Enabled' : 'Disabled'} the ${page.kind} page`,
    });
  }
}
