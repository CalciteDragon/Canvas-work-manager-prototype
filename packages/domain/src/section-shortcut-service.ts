import {
  ProjectPageSchema,
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  SectionShortcutSchema,
  ShortcutSourceSchema,
  nameOf,
  type CreateSectionShortcutInput,
  type MoveSectionShortcutInput,
  type Project,
  type ProjectId,
  type ProjectPage,
  type ResolvedSectionShortcut,
  type SectionId,
  type SectionShortcut,
  type SectionShortcutAddResult,
  type SectionShortcutQuery,
  type SectionShortcutRemovalResult,
  type SectionShortcutWriteResult,
  type ShortcutFieldChange,
  type ShortcutSource,
  type ShortcutSourceQuery,
  type UpdateSectionShortcutInput,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  SectionRepository,
  SectionShortcutRepository,
  UnitOfWork,
} from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import type { OperationRecorder } from './operation-recorder';
import { listPlacements, renumberPlacements, snapshotPlacement } from './page-placements';
import { archivedAncestry, assertProjectWritable } from './project-visibility';
import {
  captureShortcutAdd,
  captureShortcutMove,
  captureShortcutRemove,
  captureShortcutUpdate,
  shortcutWriteLabel,
} from './shortcut-history';

export interface SectionShortcutServiceDependencies {
  shortcuts: SectionShortcutRepository;
  sections: SectionRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  activity: ActivityService;
  /**
   * Makes each committed placement write undoable, in the **destination** project's history.
   * The same interface `SectionService` holds and used the same way — inside the caller's unit,
   * asserting no grant of its own — so the service graph gains no new edge: a shortcut inverse
   * writes placements through repositories and never calls back into a service.
   */
  history: OperationRecorder;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

type Destination = { project: Project; page: ProjectPage };

const pageKindOrder = new Map<string, number>([
  ['home', 0],
  ['work', 1],
  ['todos', 2],
  ['archive', 3],
  ['reflections', 4],
]);

/** §27's source resolver. It returns identity and layout, never the source's rows. */
export class SectionShortcutService {
  constructor(private readonly dependencies: SectionShortcutServiceDependencies) {}

  async list(
    actor: ActorContext,
    projectId: ProjectId,
    query: SectionShortcutQuery = {},
  ): Promise<ResolvedSectionShortcut[]> {
    assertPermitted(actor, 'projects.read');
    const destination = await this.requireDestination(actor, projectId, query.pageId);
    const [placements, projects] = await Promise.all([
      this.dependencies.shortcuts.list({ pageId: destination.page.id }),
      this.dependencies.projects.list({ workspaceId: actor.workspaceId }),
    ]);
    return Promise.all(placements.map((placement) => this.resolve(actor, placement, destination, projects)));
  }

  async listSources(
    actor: ActorContext,
    projectId: ProjectId,
    query: ShortcutSourceQuery,
  ): Promise<ShortcutSource[]> {
    assertPermitted(actor, 'projects.read');
    const destination = await this.requireDestination(actor, projectId, query.pageId);
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const byProject = new Map(projects.map((project) => [project.id, project]));
    const ancestry = archivedAncestry(projects);
    const rootId = this.rootOf(destination.project, byProject);
    const alreadyPlaced = new Set(
      (await this.dependencies.shortcuts.list({ pageId: destination.page.id })).map(
        (placement) => placement.sourceSectionId,
      ),
    );
    const sections = await this.dependencies.sections.list();
    const sources: ShortcutSource[] = [];

    for (const section of sections) {
      if (section.pageId === destination.page.id) continue;
      const sourceProject = byProject.get(section.projectId);
      if (sourceProject === undefined || sourceProject.workspaceId !== actor.workspaceId) continue;
      if (this.rootOf(sourceProject, byProject) !== rootId) continue;
      if (sourceProject.status === 'archived' || ancestry.hasArchivedAncestor(sourceProject.id)) continue;
      const page = await this.dependencies.pages.find(section.pageId);
      if (page === null || page.projectId !== sourceProject.id) continue;
      sources.push(
        ShortcutSourceSchema.parse({
          sourceSectionId: section.id,
          type: section.type,
          name: nameOf(section),
          projectId: sourceProject.id,
          projectName: sourceProject.name,
          pageId: page.id,
          pageKind: page.kind,
          breadcrumb: this.breadcrumb(sourceProject, byProject),
          alreadyPlaced: alreadyPlaced.has(section.id),
        }),
      );
    }

    return sources.sort((a, b) => {
      const breadcrumb = this.compareStrings(a.breadcrumb.join('\u0000'), b.breadcrumb.join('\u0000'));
      if (breadcrumb !== 0) return breadcrumb;
      const pageKind = (pageKindOrder.get(a.pageKind) ?? 99) - (pageKindOrder.get(b.pageKind) ?? 99);
      if (pageKind !== 0) return pageKind;
      const name = this.compareStrings(a.name, b.name);
      return name !== 0 ? name : a.sourceSectionId.localeCompare(b.sourceSectionId);
    });
  }

  async create(
    actor: ActorContext,
    projectId: ProjectId,
    input: CreateSectionShortcutInput,
  ): Promise<SectionShortcutAddResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    return this.dependencies.unitOfWork.run(async () => {
      const destination = await this.requireDestination(actor, projectId, input.pageId);
      await assertProjectWritable(this.dependencies.projects, destination.project.id);
      const source = await this.requireSource(actor, input.sourceSectionId);
      const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
      const byProject = new Map(projects.map((project) => [project.id, project]));
      await this.assertSourceUsable(source, destination, byProject);
      const placements = await listPlacements(this.dependencies, destination.page.id);
      const position = Math.min(Math.max(input.position ?? placements.length, 0), placements.length);
      const now = this.dependencies.clock.now().toISOString();
      const shortcut = SectionShortcutSchema.parse({
        id: this.dependencies.ids.next('shortcut'),
        pageId: destination.page.id,
        sourceSectionId: source.id,
        position,
        columnSpan: input.columnSpan ?? 12,
        collapsed: false,
        createdAt: now,
        updatedAt: now,
      });
      await this.dependencies.shortcuts.insert(shortcut);
      const ordered = [...placements];
      ordered.splice(position, 0, { kind: 'shortcut', value: shortcut });
      await renumberPlacements(this.dependencies, this.dependencies.clock, ordered);
      await this.record(actor, destination.project, 'project.shortcut_added', `Added a shortcut to ${nameOf(source)}`);
      const stored = await this.requireShortcut(actor, shortcut.id);
      const operation = await this.dependencies.history.record(actor, {
        // The **destination** root, always: the action belongs to the canvas the placement is on,
        // never to the sub-project the source happens to live in.
        projectId: destination.project.id,
        label: shortcutWriteLabel('shortcut.add', [], nameOf(source)),
        operation: captureShortcutAdd(
          destination.project.id,
          stored,
          snapshotPlacement(await listPlacements(this.dependencies, destination.page.id), {
            kind: 'shortcut',
            id: stored.id,
          }),
        ),
      });
      return { shortcut: await this.resolve(actor, stored, destination, projects), operation };
    });
  }

  async update(
    actor: ActorContext,
    id: SectionShortcut['id'],
    input: UpdateSectionShortcutInput,
  ): Promise<SectionShortcutWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.requireShortcut(actor, id);
      const destination = await this.destinationForShortcut(actor, current.pageId);
      await assertProjectWritable(this.dependencies.projects, destination.project.id);
      const next = { ...current, ...input };
      // A same-value gesture — Escape out of a resize, re-picking the current width — stays a true
      // no-op: no write, no event and no action, so it cannot bury the caller's Redo branch.
      const changes: ShortcutFieldChange[] = [];
      if (next.columnSpan !== current.columnSpan) {
        changes.push({ field: 'columnSpan', before: current.columnSpan, after: next.columnSpan });
      }
      if (next.collapsed !== current.collapsed) {
        changes.push({ field: 'collapsed', before: current.collapsed, after: next.collapsed });
      }
      if (changes.length === 0) {
        return { shortcut: await this.resolveCurrent(actor, current, destination), operation: null };
      }
      const updated = SectionShortcutSchema.parse({
        ...next,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      await this.dependencies.shortcuts.update(updated);
      await this.record(actor, destination.project, 'project.shortcut_updated', 'Updated a shortcut');
      const operation = await this.dependencies.history.record(actor, {
        projectId: destination.project.id,
        label: shortcutWriteLabel('shortcut.update', changes, await this.sourceNameOf(updated)),
        operation: captureShortcutUpdate({
          shortcutId: updated.id,
          projectId: destination.project.id,
          pageId: updated.pageId,
          changes,
        }),
      });
      return { shortcut: await this.resolveCurrent(actor, updated, destination), operation };
    });
  }

  async move(
    actor: ActorContext,
    id: SectionShortcut['id'],
    input: MoveSectionShortcutInput | number,
  ): Promise<SectionShortcutWriteResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    const requestedPosition = typeof input === 'number' ? input : input.position;
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.requireShortcut(actor, id);
      const destination = await this.destinationForShortcut(actor, current.pageId);
      await assertProjectWritable(this.dependencies.projects, destination.project.id);
      const placements = await listPlacements(this.dependencies, current.pageId);
      const index = placements.findIndex((placement) => placement.kind === 'shortcut' && placement.value.id === id);
      const moved = placements[index];
      if (index === -1 || moved === undefined) throw new EntityNotFoundError('sectionShortcut', id);
      const placementBefore = snapshotPlacement(placements, { kind: 'shortcut', id });
      const without = placements.filter((_, placementIndex) => placementIndex !== index);
      // Clamped, not rejected: a caller that asks for "last" by overshooting means last.
      const target = Math.min(Math.max(requestedPosition, 0), without.length);

      // **Compared before writing**, exactly as `SectionService.move` does. Renumbering first and
      // then noticing that `position` had not changed was wrong twice over: on a hand-edited sparse
      // page (§14) a clamped no-op silently normalized every sibling and stamped the subject, and a
      // dense page could not tell "did not move" from "moved and landed on the same number".
      if (index === target) {
        return { shortcut: await this.resolveCurrent(actor, current, destination), operation: null };
      }
      without.splice(target, 0, moved);
      const placementAfter = snapshotPlacement(without, { kind: 'shortcut', id });

      await renumberPlacements(this.dependencies, this.dependencies.clock, without, { kind: 'shortcut', id });
      const updated = await this.dependencies.shortcuts.find(id);
      if (updated === null) throw new EntityNotFoundError('sectionShortcut', id);
      await this.record(actor, destination.project, 'project.shortcut_moved', 'Moved a shortcut');
      const operation = await this.dependencies.history.record(actor, {
        projectId: destination.project.id,
        label: shortcutWriteLabel('shortcut.move', [], await this.sourceNameOf(updated)),
        operation: captureShortcutMove({
          shortcutId: id,
          projectId: destination.project.id,
          pageId: updated.pageId,
          placementBefore,
          placementAfter,
        }),
      });
      return { shortcut: await this.resolveCurrent(actor, updated, destination), operation };
    });
  }

  /**
   * Deletes one placement and answers what it deleted plus the receipt that puts it back. There is
   * no live placement left to return, so the result names ids rather than a record that would read
   * as current, and the receipt is never `null` — removing a stored placement always writes.
   *
   * Permitted while the destination project is archived, like section removal: the freeze stops
   * work coming back into a project someone has put away, not someone tidying one. A transition on
   * the receipt still answers `history_blocked` until that ancestry is reactivated.
   */
  async remove(actor: ActorContext, id: SectionShortcut['id']): Promise<SectionShortcutRemovalResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.requireShortcut(actor, id);
      const destination = await this.destinationForShortcut(actor, current.pageId);
      const placements = await listPlacements(this.dependencies, current.pageId);
      const remaining = placements.filter((placement) => !(placement.kind === 'shortcut' && placement.value.id === id));
      if (remaining.length === placements.length) throw new EntityNotFoundError('sectionShortcut', id);
      // Captured while the placement is still in the order, so Undo returns it between the same
      // neighbours rather than at an index the page has since reused.
      const placement = snapshotPlacement(placements, { kind: 'shortcut', id });
      await this.dependencies.shortcuts.remove(id);
      await renumberPlacements(this.dependencies, this.dependencies.clock, remaining);
      await this.record(actor, destination.project, 'project.shortcut_removed', 'Removed a shortcut');
      const operation = await this.dependencies.history.record(actor, {
        projectId: destination.project.id,
        label: shortcutWriteLabel('shortcut.remove', [], await this.sourceNameOf(current)),
        operation: captureShortcutRemove(destination.project.id, current, placement),
      });
      return { shortcutId: id, projectId: destination.project.id, pageId: current.pageId, operation };
    });
  }

  /**
   * The source section's name for a history label, read with a plain `find` — deliberately not
   * `requireSource`/`assertSourceScope`, because a removal may run while the source is archived or
   * hidden, and a label must never add a refusal. `null` when the source cannot be read.
   */
  private async sourceNameOf(placement: SectionShortcut): Promise<string | null> {
    const source = await this.dependencies.sections.find(placement.sourceSectionId);
    return source === null ? null : nameOf(source);
  }

  private async resolveCurrent(
    actor: ActorContext,
    placement: SectionShortcut,
    destination: Destination,
  ): Promise<ResolvedSectionShortcut> {
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    return this.resolve(actor, placement, destination, projects);
  }

  private async resolve(
    actor: ActorContext,
    placement: SectionShortcut,
    destination: Destination,
    projects: Project[],
  ): Promise<ResolvedSectionShortcut> {
    const source = await this.requireSource(actor, placement.sourceSectionId);
    const byProject = new Map(projects.map((project) => [project.id, project]));
    await this.assertSourceScope(source, destination, byProject);
    const sourceProject = byProject.get(source.projectId);
    if (sourceProject === undefined) throw new EntityNotFoundError('section', source.id);
    const page = await this.dependencies.pages.find(source.pageId);
    if (page === null || page.projectId !== sourceProject.id) throw new EntityNotFoundError('projectPage', source.pageId);
    const ancestry = archivedAncestry(projects);
    const availability =
      source.archivedAt !== undefined
        ? 'source_archived'
        : sourceProject.status === 'archived' || ancestry.hasArchivedAncestor(sourceProject.id)
          ? 'source_hidden'
          : 'available';
    return ResolvedSectionShortcutSchema.parse({
      ...placement,
      source,
      sourceProjectId: sourceProject.id,
      sourceProjectName: sourceProject.name,
      sourcePageKind: page.kind,
      breadcrumb: this.breadcrumb(sourceProject, byProject),
      availability,
    });
  }

  private async requireDestination(
    actor: ActorContext,
    projectId: ProjectId,
    pageId?: ProjectPage['id'],
  ): Promise<Destination> {
    const project = await this.dependencies.projects.find(projectId);
    if (project === null || project.workspaceId !== actor.workspaceId) {
      throw new EntityNotFoundError('project', projectId);
    }
    if (project.kind !== 'root') {
      throw new DomainRuleError('shortcuts can only be placed on a root project\'s Home page');
    }
    const page =
      pageId === undefined
        ? (await this.dependencies.pages.list({ projectId, kind: 'home' }))[0]
        : await this.dependencies.pages.find(pageId);
    if (page === undefined || page === null || page.projectId !== projectId) {
      throw new EntityNotFoundError('projectPage', pageId ?? `home:${projectId}`);
    }
    ProjectPageSchema.parse(page);
    if (page.kind !== 'home') throw new DomainRuleError('shortcuts can only be placed on a root project\'s Home page');
    return { project, page };
  }

  private async requireShortcut(actor: ActorContext, id: SectionShortcut['id']): Promise<SectionShortcut> {
    const shortcut = await this.dependencies.shortcuts.find(id);
    if (shortcut === null) throw new EntityNotFoundError('sectionShortcut', id);
    const page = await this.dependencies.pages.find(shortcut.pageId);
    const project = page === null ? null : await this.dependencies.projects.find(page.projectId);
    if (page === null || project === null || project.workspaceId !== actor.workspaceId) {
      throw new EntityNotFoundError('sectionShortcut', id);
    }
    return shortcut;
  }

  private async destinationForShortcut(actor: ActorContext, pageId: SectionShortcut['pageId']): Promise<Destination> {
    const page = await this.dependencies.pages.find(pageId);
    if (page === null) throw new EntityNotFoundError('sectionShortcut', pageId);
    return this.requireDestination(actor, page.projectId, page.id);
  }

  private async requireSource(actor: ActorContext, id: SectionId): Promise<ReturnType<typeof ProjectSectionSchema.parse>> {
    const source = await this.dependencies.sections.find(id);
    if (source === null) throw new EntityNotFoundError('section', id);
    const project = await this.dependencies.projects.find(source.projectId);
    if (project === null || project.workspaceId !== actor.workspaceId) throw new EntityNotFoundError('section', id);
    return source;
  }

  private async assertSourceUsable(
    source: ReturnType<typeof ProjectSectionSchema.parse>,
    destination: Destination,
    byProject: Map<ProjectId, Project>,
  ): Promise<void> {
    await this.assertSourceScope(source, destination, byProject);
    const sourceProject = byProject.get(source.projectId);
    if (source.archivedAt !== undefined) throw new DomainRuleError('the source section is archived');
    if (sourceProject?.status === 'archived' || sourceProject !== undefined && this.hasArchivedAncestor(sourceProject, byProject)) {
      throw new DomainRuleError('the source project is archived or hidden by an archived ancestor');
    }
  }

  private async assertSourceScope(
    source: ReturnType<typeof ProjectSectionSchema.parse>,
    destination: Destination,
    byProject: Map<ProjectId, Project>,
  ): Promise<void> {
    const sourceProject = byProject.get(source.projectId);
    if (sourceProject === undefined || this.rootOf(sourceProject, byProject) !== destination.project.id) {
      throw new EntityNotFoundError('section', source.id);
    }
    if (source.pageId === destination.page.id) {
      throw new DomainRuleError('a shortcut cannot reference a section on its destination page');
    }
  }

  private rootOf(project: Project, byProject: Map<ProjectId, Project>): ProjectId {
    let current = project;
    const seen = new Set<ProjectId>();
    while (current.parentProjectId !== undefined) {
      if (seen.has(current.id)) throw new DomainRuleError('project hierarchy contains a cycle');
      seen.add(current.id);
      const parent = byProject.get(current.parentProjectId);
      if (parent === undefined) throw new EntityNotFoundError('project', current.parentProjectId);
      current = parent;
    }
    return current.id;
  }

  private hasArchivedAncestor(project: Project, byProject: Map<ProjectId, Project>): boolean {
    let current = project;
    const seen = new Set<ProjectId>();
    while (current.parentProjectId !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byProject.get(current.parentProjectId);
      if (parent === undefined) return false;
      if (parent.status === 'archived') return true;
      current = parent;
    }
    return false;
  }

  private breadcrumb(project: Project, byProject: Map<ProjectId, Project>): string[] {
    const names: string[] = [];
    let current = project;
    const seen = new Set<ProjectId>();
    while (!seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      if (current.parentProjectId === undefined) return names;
      const parent = byProject.get(current.parentProjectId);
      if (parent === undefined) throw new EntityNotFoundError('project', current.parentProjectId);
      current = parent;
    }
    throw new DomainRuleError('project hierarchy contains a cycle');
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b);
  }

  private async record(
    actor: ActorContext,
    project: Project,
    action: 'project.shortcut_added' | 'project.shortcut_updated' | 'project.shortcut_moved' | 'project.shortcut_removed',
    summary: string,
  ): Promise<void> {
    await this.dependencies.activity.record(actor, {
      action,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      summary,
    });
  }
}
