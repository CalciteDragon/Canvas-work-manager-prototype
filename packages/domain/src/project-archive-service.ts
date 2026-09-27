import {
  ProjectArchiveResultSchema,
  isRootProject,
  nameOf,
  ownedKindOf,
  type Project,
  type ProjectArchiveCause,
  type ProjectArchiveItem,
  type ProjectArchiveOrigin,
  type ProjectArchiveRestoration,
  type ProjectId,
  type ProjectPage,
  type ProjectSection,
  type Reflection,
  type Task,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  TaskRepository,
} from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { DomainRuleError, EntityNotFoundError } from './errors';
import { sectionRecoveryOf } from './section-recovery-policy';
import { restoreEligibility } from './restore-eligibility';

export interface ProjectArchiveServiceDependencies {
  projects: ProjectRepository;
  pages: ProjectPageRepository;
  sections: SectionRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const KIND_ORDER = { subproject: 0, section: 1, task: 2, reflection: 3 } as const;

/**
 * §31's root-wide read model. It is deliberately repository-only: Archive composes the
 * canonical records and eligibility here, while all writes remain on their existing services.
 *
 * Section entries are **content-oriented**: a removed section is listed only when
 * `sectionRecoveryOf` finds something to recover in it, and carries that verdict as `recovery`.
 * Disposable view tombstones stay in storage but out of the list. Sub-project, task and
 * reflection entries are listed only when their canonical Restore can run now.
 */
export class ProjectArchiveService {
  constructor(private readonly dependencies: ProjectArchiveServiceDependencies) {}

  async derive(actor: ActorContext, projectId: ProjectId) {
    // A combined read is all-or-nothing, even when the result happens to be empty (§54).
    assertPermitted(actor, 'projects.read');
    assertPermitted(actor, 'tasks.read');
    assertPermitted(actor, 'reflections.read');

    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const root = projects.find(({ id }) => id === projectId);
    if (root === undefined) throw new EntityNotFoundError('project', projectId);
    if (!isRootProject(root)) {
      throw new DomainRuleError(`project "${projectId}" is a unit of work; only a root project has an Archive page`);
    }

    const tree = this.tree(root.id, projects);
    const treeIds = new Set(tree.map(({ id }) => id));
    const pages = await this.dependencies.pages.list();
    const sections = await this.dependencies.sections.list({ includeArchived: true });
    const tasks = await this.dependencies.tasks.list({ includeArchived: true });
    const reflections = await this.dependencies.reflections.list({ includeArchived: true });
    const projectById = new Map<ProjectId, Project>(projects.map((project) => [project.id, project]));
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const eligible = restoreEligibility(projects, sections, tasks);
    // Rows keep their section's project, so the tree scope is also the section's content scope.
    const content = {
      tasks: tasks.filter(({ projectId: owner }) => treeIds.has(owner)),
      reflections: reflections.filter(({ projectId: owner }) => treeIds.has(owner)),
    };
    const items: ProjectArchiveItem[] = [];

    for (const project of tree) {
      if (project.kind !== 'subproject' || !eligible.project(project.id)) continue;
      const page = this.canvasPage(project, pageById);
      items.push({ kind: 'subproject', project, origin: this.origin(project.id, page, projectById),
        cause: { kind: 'own' }, restoration: this.ready('restore_project', 'projects.write') });
    }

    for (const section of sections) {
      if (!treeIds.has(section.projectId) || !eligible.section(section)) continue;
      const page = pageById.get(section.pageId);
      if (page === undefined) continue;
      const decision = sectionRecoveryOf(section, content);
      if (!decision.include) continue;
      const item: ProjectArchiveItem = {
        kind: 'section',
        section,
        origin: this.origin(section.projectId, page, projectById, section),
        cause: { kind: 'own' },
        restoration: this.ready('restore_section', 'projects.write'),
        recovery: decision.recovery,
      };
      if (ownedKindOf(section.type) !== undefined) {
        (item as Extract<ProjectArchiveItem, { kind: 'section' }>).cascadeCount =
          this.cascadeCount(section, tasks, reflections);
      }
      items.push(item);
    }

    for (const task of tasks) {
      if (!treeIds.has(task.projectId) || !eligible.task(task)) continue;
      const section = sectionById.get(task.sectionId);
      const page = section === undefined ? undefined : pageById.get(section.pageId);
      if (section === undefined || page === undefined) continue;
      items.push({
        kind: 'task',
        task,
        origin: this.origin(task.projectId, page, projectById, section),
        cause: this.taskCause(task),
        restoration: this.ready('restore_task', 'tasks.write'),
      });
    }

    for (const reflection of reflections) {
      if (!treeIds.has(reflection.projectId) || !eligible.reflection(reflection)) continue;
      const section = sectionById.get(reflection.sectionId);
      const page = section === undefined ? undefined : pageById.get(section.pageId);
      if (section === undefined || page === undefined) continue;
      items.push({
        kind: 'reflection',
        reflection,
        origin: this.origin(reflection.projectId, page, projectById, section),
        cause: reflection.archivedWithSectionId !== undefined
          ? { kind: 'section-cascade', sectionId: reflection.archivedWithSectionId }
          : { kind: 'own' },
        restoration: this.ready('restore_reflection', 'reflections.write'),
      });
    }

    items.sort((a, b) => {
      const byOwner = compareText(a.origin.projectId, b.origin.projectId);
      if (byOwner !== 0) return byOwner;
      const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (byKind !== 0) return byKind;
      return compareText(this.itemId(a), this.itemId(b));
    });

    return ProjectArchiveResultSchema.parse({ projectId, root, items });
  }

  private tree(rootId: ProjectId, projects: readonly Project[]): Project[] {
    const result: Project[] = [];
    const seen = new Set<ProjectId>();
    let frontier = [rootId];
    while (frontier.length > 0) {
      const next: Project[] = [];
      for (const project of projects) {
        if (seen.has(project.id)) continue;
        if (project.id !== rootId && (project.kind !== 'subproject' || !frontier.includes(project.parentProjectId))) continue;
        seen.add(project.id);
        result.push(project);
        if (project.kind === 'subproject') next.push(project);
      }
      frontier = next.map(({ id }) => id);
    }
    return result;
  }

  private canvasPage(project: Project, pages: ReadonlyMap<string, ProjectPage>): ProjectPage {
    const kind = project.kind === 'root' ? 'home' : 'work';
    const page = [...pages.values()].find((candidate) => candidate.projectId === project.id && candidate.kind === kind);
    if (page === undefined) throw new DomainRuleError(`project "${project.id}" has no ${kind} page`);
    return page;
  }

  private origin(
    projectId: ProjectId,
    page: ProjectPage,
    projects: ReadonlyMap<ProjectId, Project>,
    section?: ProjectSection,
  ): ProjectArchiveOrigin {
    const breadcrumb: { projectId: ProjectId; name: string }[] = [];
    const seen = new Set<ProjectId>();
    let current = projects.get(projectId);
    while (current !== undefined && !seen.has(current.id)) {
      breadcrumb.unshift({ projectId: current.id, name: current.name });
      seen.add(current.id);
      if (current.kind === 'root') break;
      current = projects.get(current.parentProjectId);
    }
    return {
      projectId,
      pageId: page.id,
      pageKind: page.kind,
      pageEnabled: page.enabled,
      breadcrumb,
      ...(section === undefined ? {} : { sectionId: section.id, sectionName: nameOf(section) }),
    };
  }

  private ready(operation: 'restore_project' | 'restore_section' | 'restore_task' | 'restore_reflection', permission: 'projects.write' | 'tasks.write' | 'reflections.write'): ProjectArchiveRestoration {
    return { kind: 'ready', operation, permission };
  }

  private taskCause(task: Task): ProjectArchiveCause {
    if (task.archivedWithSectionId !== undefined) return { kind: 'section-cascade', sectionId: task.archivedWithSectionId };
    if (task.archivedWithTaskId !== undefined) return { kind: 'task-cascade', taskId: task.archivedWithTaskId };
    return { kind: 'own' };
  }

  private cascadeCount(section: ProjectSection, tasks: readonly Task[], reflections: readonly Reflection[]): number {
    return ownedKindOf(section.type) === 'tasks'
      ? tasks.filter(({ archivedWithSectionId }) => archivedWithSectionId === section.id).length
      : reflections.filter(({ archivedWithSectionId }) => archivedWithSectionId === section.id).length;
  }

  private itemId(item: ProjectArchiveItem): string {
    switch (item.kind) {
      case 'subproject': return item.project.id;
      case 'section': return item.section.id;
      case 'task': return item.task.id;
      case 'reflection': return item.reflection.id;
    }
  }
}
