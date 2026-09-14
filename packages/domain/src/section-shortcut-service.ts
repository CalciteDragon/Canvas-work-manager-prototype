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
  type SectionShortcutQuery,
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
import { listPlacements, renumberPlacements } from './page-placements';
import { archivedAncestry, assertProjectWritable } from './project-visibility';

export interface SectionShortcutServiceDependencies {
  shortcuts: SectionShortcutRepository;
  sections: SectionRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  activity: ActivityService;
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
  ): Promise<ResolvedSectionShortcut> {
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
      return this.resolve(actor, shortcut, destination, projects);
    });
  }

  async update(
    actor: ActorContext,
    id: SectionShortcut['id'],
    input: UpdateSectionShortcutInput,
  ): Promise<ResolvedSectionShortcut> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.requireShortcut(actor, id);
      const destination = await this.destinationForShortcut(actor, current.pageId);
      await assertProjectWritable(this.dependencies.projects, destination.project.id);
      const next = { ...current, ...input };
      if (next.columnSpan === current.columnSpan && next.collapsed === current.collapsed) {
        return this.resolveCurrent(actor, current, destination);
      }
      const updated = SectionShortcutSchema.parse({
        ...next,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      await this.dependencies.shortcuts.update(updated);
      await this.record(actor, destination.project, 'project.shortcut_updated', 'Updated a shortcut');
      return this.resolveCurrent(actor, updated, destination);
    });
  }

  async move(
    actor: ActorContext,
    id: SectionShortcut['id'],
    input: MoveSectionShortcutInput | number,
  ): Promise<ResolvedSectionShortcut> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    const requestedPosition = typeof input === 'number' ? input : input.position;
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.requireShortcut(actor, id);
      const destination = await this.destinationForShortcut(actor, current.pageId);
      await assertProjectWritable(this.dependencies.projects, destination.project.id);
      const placements = await listPlacements(this.dependencies, current.pageId);
      const index = placements.findIndex((placement) => placement.kind === 'shortcut' && placement.value.id === id);
      if (index === -1) throw new EntityNotFoundError('sectionShortcut', id);
      const without = placements.filter((_, placementIndex) => placementIndex !== index);
      const target = Math.min(Math.max(requestedPosition, 0), without.length);
      const [moved] = placements.splice(index, 1);
      if (moved === undefined) throw new EntityNotFoundError('sectionShortcut', id);
      without.splice(target, 0, moved);
      await renumberPlacements(this.dependencies, this.dependencies.clock, without);
      const updated = await this.dependencies.shortcuts.find(id);
      if (updated === null) throw new EntityNotFoundError('sectionShortcut', id);
      if (updated.position === current.position) return this.resolveCurrent(actor, updated, destination);
      await this.record(actor, destination.project, 'project.shortcut_moved', 'Moved a shortcut');
      return this.resolveCurrent(actor, updated, destination);
    });
  }

  async remove(actor: ActorContext, id: SectionShortcut['id']): Promise<void> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');
    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.requireShortcut(actor, id);
      const destination = await this.destinationForShortcut(actor, current.pageId);
      const placements = await listPlacements(this.dependencies, current.pageId);
      const remaining = placements.filter((placement) => !(placement.kind === 'shortcut' && placement.value.id === id));
      if (remaining.length === placements.length) throw new EntityNotFoundError('sectionShortcut', id);
      await this.dependencies.shortcuts.remove(id);
      await renumberPlacements(this.dependencies, this.dependencies.clock, remaining);
      await this.record(actor, destination.project, 'project.shortcut_removed', 'Removed a shortcut');
    });
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
