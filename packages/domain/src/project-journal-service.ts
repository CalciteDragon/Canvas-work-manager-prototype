import {
  ProjectCompletedWorkResultSchema,
  ProjectJournalResultSchema,
  isRootProject,
  nameOf,
  type Project,
  type ProjectCompletedWorkCandidate,
  type ProjectId,
  type ProjectJournalEntry,
  type ReflectionSubject,
  type ReflectionSubjectView,
  type Subproject,
  type Task,
  type TodoBreadcrumbStep,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  TaskRepository,
} from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { compareInstants, compareText, instantOf, type Instant } from './instants';
import { DomainRuleError, EntityNotFoundError } from './errors';
import { archivedAncestry, type ArchivedAncestry } from './project-visibility';

export interface ProjectJournalServiceDependencies {
  projects: ProjectRepository;
  pages: ProjectPageRepository;
  sections: SectionRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
}

interface TreeContext {
  root: Project;
  projects: Project[];
  projectById: Map<ProjectId, Project>;
  treeIds: Set<ProjectId>;
  ancestry: ArchivedAncestry;
}

interface JournalSortable {
  entry: ProjectJournalEntry;
  createdAt: Instant;
  id: string;
}

interface CandidateSortable {
  candidate: ProjectCompletedWorkCandidate;
  completedAt: Instant | undefined;
  kind: 'subproject' | 'task';
  id: string;
}

/** §36's root-wide journal and its completed-work picker. */
export class ProjectJournalService {
  constructor(private readonly dependencies: ProjectJournalServiceDependencies) {}

  async journal(actor: ActorContext, projectId: ProjectId) {
    this.assertJournalPermissions(actor);
    const context = await this.context(actor, projectId);
    if (context.root.status === 'archived') return ProjectJournalResultSchema.parse({ projectId, items: [] });

    const [pages, sections, reflections, tasks] = await Promise.all([
      this.dependencies.pages.list(),
      this.dependencies.sections.list(),
      this.dependencies.reflections.list(),
      this.dependencies.tasks.list({ includeArchived: true }),
    ]);
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const sortable: JournalSortable[] = [];

    for (const reflection of reflections) {
      if (!this.isLiveOwner(reflection.projectId, context)) continue;
      const section = sectionById.get(reflection.sectionId);
      const page = section === undefined ? undefined : pageById.get(section.pageId);
      if (section === undefined || page === undefined) continue;

      const entry: ProjectJournalEntry = {
        reflection,
        origin: {
          projectId: reflection.projectId,
          pageId: page.id,
          pageKind: page.kind,
          breadcrumb: this.breadcrumb(context.root.id, reflection.projectId, context.projectById),
          sectionId: section.id,
          sectionName: nameOf(section),
        },
      };
      const subject = reflection.subject === undefined
        ? undefined
        : this.subjectView(reflection.subject, context, taskById);
      if (subject !== undefined) entry.subject = subject;
      sortable.push({ entry, createdAt: instantOf(reflection.createdAt), id: reflection.id });
    }

    sortable.sort((a, b) => {
      const byCreated = compareInstants(b.createdAt, a.createdAt);
      return byCreated !== 0 ? byCreated : compareText(b.id, a.id);
    });
    return ProjectJournalResultSchema.parse({ projectId, items: sortable.map(({ entry }) => entry) });
  }

  async completedWork(actor: ActorContext, projectId: ProjectId) {
    assertPermitted(actor, 'projects.read');
    assertPermitted(actor, 'tasks.read');
    const context = await this.context(actor, projectId);
    if (context.root.status === 'archived') return ProjectCompletedWorkResultSchema.parse({ projectId, candidates: [] });

    const [pages, sections, tasks] = await Promise.all([
      this.dependencies.pages.list(),
      this.dependencies.sections.list(),
      this.dependencies.tasks.list(),
    ]);
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const candidates: CandidateSortable[] = [];

    for (const project of context.projects) {
      if (project.kind !== 'subproject' || project.status !== 'completed') continue;
      if (context.ancestry.hasArchivedAncestor(project.id)) continue;
      candidates.push({
        candidate: this.subjectViewForProject(project, context),
        completedAt: project.completedAt === undefined ? undefined : instantOf(project.completedAt),
        kind: 'subproject',
        id: project.id,
      });
    }

    for (const task of tasks) {
      if (task.status !== 'done' || task.archivedAt !== undefined) continue;
      if (!this.isLiveOwner(task.projectId, context)) continue;
      const section = sectionById.get(task.sectionId);
      const page = section === undefined ? undefined : pageById.get(section.pageId);
      if (section === undefined || page === undefined) continue;
      candidates.push({
        candidate: this.subjectViewForTask(task, context),
        completedAt: task.completedAt === undefined ? undefined : instantOf(task.completedAt),
        kind: 'task',
        id: task.id,
      });
    }

    candidates.sort((a, b) => {
      if (a.completedAt !== undefined && b.completedAt !== undefined) {
        const byCompleted = compareInstants(b.completedAt, a.completedAt);
        if (byCompleted !== 0) return byCompleted;
      } else if (a.completedAt !== b.completedAt) {
        return a.completedAt === undefined ? 1 : -1;
      }
      return (a.kind === 'subproject' ? 0 : 1) - (b.kind === 'subproject' ? 0 : 1) || compareText(a.id, b.id);
    });

    return ProjectCompletedWorkResultSchema.parse({
      projectId,
      candidates: candidates.map(({ candidate }) => candidate),
    });
  }

  private assertJournalPermissions(actor: ActorContext): void {
    assertPermitted(actor, 'projects.read');
    assertPermitted(actor, 'tasks.read');
    assertPermitted(actor, 'reflections.read');
  }

  private async context(actor: ActorContext, projectId: ProjectId): Promise<TreeContext> {
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const root = projects.find(({ id }) => id === projectId);
    if (root === undefined) throw new EntityNotFoundError('project', projectId);
    if (!isRootProject(root)) {
      throw new DomainRuleError(`project "${projectId}" is a unit of work; only a root project has a Reflections page`);
    }
    const descendants = this.descendants(root.id, projects);
    return {
      root,
      projects: [root, ...descendants],
      projectById: new Map(projects.map((project) => [project.id, project])),
      treeIds: new Set([root.id, ...descendants.map(({ id }) => id)]),
      ancestry: archivedAncestry(projects),
    };
  }

  private descendants(rootId: ProjectId, projects: readonly Project[]): Subproject[] {
    const result: Subproject[] = [];
    const seen = new Set<ProjectId>([rootId]);
    let frontier = [rootId];
    while (frontier.length > 0) {
      const parents = new Set(frontier);
      const children = projects.filter(
        (project): project is Subproject =>
          project.kind === 'subproject' && parents.has(project.parentProjectId) && !seen.has(project.id),
      );
      for (const child of children) seen.add(child.id);
      result.push(...children);
      frontier = children.map(({ id }) => id);
    }
    return result;
  }

  private isLiveOwner(projectId: ProjectId, context: TreeContext): boolean {
    return context.treeIds.has(projectId) &&
      context.projectById.get(projectId)?.status !== 'archived' &&
      !context.ancestry.hasArchivedAncestor(projectId);
  }

  private subjectView(subject: ReflectionSubject, context: TreeContext, taskById: ReadonlyMap<string, Task>): ReflectionSubjectView | undefined {
    if (subject.kind === 'task') {
      const task = taskById.get(subject.id);
      if (task === undefined || !context.treeIds.has(task.projectId)) return undefined;
      return this.subjectViewForTask(task, context);
    }
    const project = context.projectById.get(subject.id);
    if (project === undefined || project.kind !== 'subproject' || !context.treeIds.has(project.id)) return undefined;
    return this.subjectViewForProject(project, context);
  }

  private subjectViewForTask(task: Task, context: TreeContext): ReflectionSubjectView {
    return {
      kind: 'task',
      id: task.id,
      name: task.title,
      status: task.status,
      ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
      archived: task.archivedAt !== undefined,
      hiddenByArchivedAncestor:
        context.projectById.get(task.projectId)?.status === 'archived' || context.ancestry.hasArchivedAncestor(task.projectId),
      breadcrumb: this.breadcrumb(context.root.id, task.projectId, context.projectById),
    };
  }

  private subjectViewForProject(project: Subproject, context: TreeContext): ReflectionSubjectView {
    return {
      kind: 'subproject',
      id: project.id,
      name: project.name,
      status: project.status,
      ...(project.completedAt === undefined ? {} : { completedAt: project.completedAt }),
      archived: project.status === 'archived',
      hiddenByArchivedAncestor: context.ancestry.hasArchivedAncestor(project.id),
      breadcrumb: this.breadcrumb(context.root.id, project.id, context.projectById),
    };
  }

  private breadcrumb(rootId: ProjectId, ownerId: ProjectId, byId: ReadonlyMap<ProjectId, Project>): TodoBreadcrumbStep[] {
    const steps: TodoBreadcrumbStep[] = [];
    const seen = new Set<ProjectId>();
    let current = byId.get(ownerId);
    while (current !== undefined && !seen.has(current.id)) {
      steps.unshift({ projectId: current.id, name: current.name });
      seen.add(current.id);
      if (current.id === rootId || current.kind === 'root') break;
      current = byId.get(current.parentProjectId);
    }
    return steps;
  }
}
