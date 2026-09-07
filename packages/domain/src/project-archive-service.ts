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
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const items: ProjectArchiveItem[] = [];

    for (const project of tree) {
      if (project.kind !== 'subproject') continue;
      const page = this.canvasPage(project, pageById);
      const projectBlocker = this.highestArchivedProject(project.id, projectById, false);
      const cause: ProjectArchiveCause =
        project.status === 'archived'
          ? { kind: 'own' }
          : projectBlocker === undefined
            ? { kind: 'own' }
            : { kind: 'hidden-by-project', projectId: projectBlocker.id };
      // The sub-project item is useful only when it is archived or hidden beneath an ancestor.
      if (project.status === 'archived' || projectBlocker !== undefined) {
        items.push({
          kind: 'subproject',
          project,
          origin: this.origin(project.id, page, projectById),
          cause,
          restoration:
            projectBlocker === undefined
              ? this.ready('restore_project', 'projects.write')
              : { kind: 'blocked', blocker: this.projectBlocker(projectBlocker) },
        });
      }
    }

    for (const section of sections) {
      if (!treeIds.has(section.projectId)) continue;
      const page = pageById.get(section.pageId);
      if (page === undefined) continue;
      const projectBlocker = this.highestArchivedProject(section.projectId, projectById, true);
      const isVisibleInArchive = section.archivedAt !== undefined || projectBlocker !== undefined;
      if (!isVisibleInArchive) continue;
      const restoration =
        projectBlocker !== undefined
          ? ({ kind: 'blocked', blocker: this.projectBlocker(projectBlocker) } satisfies ProjectArchiveRestoration)
          : this.ready('restore_section', 'projects.write');
      const item: ProjectArchiveItem = {
        kind: 'section',
        section,
        origin: this.origin(section.projectId, page, projectById, section),
        cause:
          section.archivedAt === undefined
            ? { kind: 'hidden-by-project', projectId: projectBlocker!.id }
            : { kind: 'own' },
        restoration,
      };
      if (ownedKindOf(section.type) !== undefined) {
        (item as Extract<ProjectArchiveItem, { kind: 'section' }>).cascadeCount =
          this.cascadeCount(section, tasks, reflections);
      }
      items.push(item);
    }

    for (const task of tasks) {
      if (!treeIds.has(task.projectId)) continue;
      const section = sectionById.get(task.sectionId);
      const page = section === undefined ? undefined : pageById.get(section.pageId);
      if (section === undefined || page === undefined) continue;
      const projectBlocker = this.highestArchivedProject(task.projectId, projectById, true);
      const taskAncestor = this.highestArchivedTask(task, taskById);
      const sectionBlocker = section.archivedAt === undefined ? undefined : section;
      const archived = task.archivedAt !== undefined;
      const hidden = !archived && projectBlocker !== undefined;
      if (!archived && !hidden) continue;
      items.push({
        kind: 'task',
        task,
        origin: this.origin(task.projectId, page, projectById, section),
        cause: archived ? this.taskCause(task) : { kind: 'hidden-by-project', projectId: projectBlocker!.id },
        restoration: archived
          ? this.restoreTaskState(projectBlocker, sectionBlocker, taskAncestor)
          : { kind: 'not-archived', blocker: this.projectBlocker(projectBlocker!) },
      });
    }

    for (const reflection of reflections) {
      if (!treeIds.has(reflection.projectId)) continue;
      const section = sectionById.get(reflection.sectionId);
      const page = section === undefined ? undefined : pageById.get(section.pageId);
      if (section === undefined || page === undefined) continue;
      const projectBlocker = this.highestArchivedProject(reflection.projectId, projectById, true);
      const archived = reflection.archivedAt !== undefined;
      const hidden = !archived && projectBlocker !== undefined;
      if (!archived && !hidden) continue;
      items.push({
        kind: 'reflection',
        reflection,
        origin: this.origin(reflection.projectId, page, projectById, section),
        cause: archived
          ? reflection.archivedWithSectionId !== undefined
            ? { kind: 'section-cascade', sectionId: reflection.archivedWithSectionId }
            : { kind: 'own' }
          : { kind: 'hidden-by-project', projectId: projectBlocker!.id },
        restoration: archived
          ? projectBlocker === undefined
            ? section.archivedAt === undefined
              ? this.ready('restore_reflection', 'reflections.write')
              : { kind: 'blocked', blocker: this.sectionBlocker(section) }
            : { kind: 'blocked', blocker: this.projectBlocker(projectBlocker) }
          : { kind: 'not-archived', blocker: this.projectBlocker(projectBlocker!) },
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

  private highestArchivedProject(
    projectId: ProjectId,
    projects: ReadonlyMap<ProjectId, Project>,
    includeSelf: boolean,
  ): Project | undefined {
    const chain: Project[] = [];
    const seen = new Set<ProjectId>();
    let current = projects.get(projectId);
    while (current !== undefined && !seen.has(current.id)) {
      chain.unshift(current);
      seen.add(current.id);
      if (current.kind === 'root') break;
      current = projects.get(current.parentProjectId);
    }
    const candidates = includeSelf ? chain : chain.slice(0, -1);
    return candidates.find(({ status }) => status === 'archived');
  }

  private projectBlocker(project: Project): { kind: 'project'; projectId: ProjectId; name: string } {
    return { kind: 'project', projectId: project.id, name: project.name };
  }

  private sectionBlocker(section: ProjectSection): { kind: 'section'; sectionId: ProjectSection['id']; name: string } {
    return { kind: 'section', sectionId: section.id, name: nameOf(section) };
  }

  private taskBlocker(task: Task): { kind: 'task'; taskId: Task['id']; name: string } {
    return { kind: 'task', taskId: task.id, name: task.title };
  }

  private ready(operation: 'restore_project' | 'restore_section' | 'restore_task' | 'restore_reflection', permission: 'projects.write' | 'tasks.write' | 'reflections.write'): ProjectArchiveRestoration {
    return { kind: 'ready', operation, permission };
  }

  private taskCause(task: Task): ProjectArchiveCause {
    if (task.archivedWithSectionId !== undefined) return { kind: 'section-cascade', sectionId: task.archivedWithSectionId };
    if (task.archivedWithTaskId !== undefined) return { kind: 'task-cascade', taskId: task.archivedWithTaskId };
    return { kind: 'own' };
  }

  private restoreTaskState(
    projectBlocker: Project | undefined,
    sectionBlocker: ProjectSection | undefined,
    taskBlocker: Task | undefined,
  ): ProjectArchiveRestoration {
    if (projectBlocker !== undefined) return { kind: 'blocked', blocker: this.projectBlocker(projectBlocker) };
    if (sectionBlocker !== undefined) return { kind: 'blocked', blocker: this.sectionBlocker(sectionBlocker) };
    if (taskBlocker !== undefined) return { kind: 'blocked', blocker: this.taskBlocker(taskBlocker) };
    return this.ready('restore_task', 'tasks.write');
  }

  private highestArchivedTask(task: Task, tasks: ReadonlyMap<Task['id'], Task>): Task | undefined {
    const ancestors: Task[] = [];
    const seen = new Set<Task['id']>([task.id]);
    let parentId = task.parentTaskId;
    while (parentId !== undefined && !seen.has(parentId)) {
      const parent = tasks.get(parentId);
      if (parent === undefined) break;
      ancestors.unshift(parent);
      seen.add(parent.id);
      parentId = parent.parentTaskId;
    }
    return ancestors.find(({ archivedAt }) => archivedAt !== undefined);
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
