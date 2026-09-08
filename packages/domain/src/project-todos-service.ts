import {
  ProjectTodosResultSchema,
  isRootProject,
  nameOf,
  type Project,
  type ProjectId,
  type ProjectPage,
  type ProjectSection,
  type ProjectTodoItem,
  type ProjectTodosResult,
  type Subproject,
  type Task,
  type TodoBreadcrumbStep,
} from '@cwm/contracts';
import type { ProjectPageRepository, ProjectRepository, SectionRepository, TaskRepository } from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { DomainRuleError, EntityNotFoundError } from './errors';
import { compareInstants, compareText, instantOf, type Instant } from './instants';
import { archivedAncestry } from './project-visibility';

export interface ProjectTodosServiceDependencies {
  projects: ProjectRepository;
  tasks: TaskRepository;
  sections: SectionRepository;
  pages: ProjectPageRepository;
}

/** §34's tie-break: a unit of work before a task, then the id. */
const KIND_ORDER = { subproject: 0, task: 1 } as const;

interface SortableItem {
  item: ProjectTodoItem;
  due: Instant | undefined;
  id: string;
}

/**
 * §34's Todos page: **one root's whole tree, in due-date order**.
 *
 * It owns nothing. Every row it returns is the canonical `Task` or `Subproject` record, read
 * through the repositories and handed back untouched — there is no Todos collection, no copied
 * row and no write. Completing something "on Todos" is `TaskService.complete` or
 * `ProjectService.update` on the same row; this service never learns that happened.
 *
 * Both grants are asserted **before any content read**, because §54 requires a derived page to
 * hold the permission for each category it returns and to deny rather than answer partially.
 *
 * It depends on repositories and pure comparison only. No `Clock`, no `new Date()`, no
 * timezone: the order of two stored instants is a property of the two strings, and reading a
 * clock to sort them would make the answer depend on when it was asked.
 */
export class ProjectTodosService {
  constructor(private readonly dependencies: ProjectTodosServiceDependencies) {}

  async derive(actor: ActorContext, projectId: ProjectId): Promise<ProjectTodosResult> {
    assertPermitted(actor, 'projects.read');
    assertPermitted(actor, 'tasks.read');

    // The **complete** workspace set, archived projects included: `archivedAncestry` is silently
    // wrong when handed an array a status filter has already thinned (§31).
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const root = projects.find(({ id }) => id === projectId);
    if (root === undefined) throw new EntityNotFoundError('project', projectId);
    if (!isRootProject(root)) {
      // §26: pages belong to roots. A unit of work has one canvas, and asking it for Todos is a
      // mistake about the model rather than a missing record.
      throw new DomainRuleError(`project "${projectId}" is a unit of work; only a root project has a Todos page`);
    }
    // §31: an archived project hides its live contents from ordinary reads. Answering with its
    // work would leak exactly what archiving put away.
    if (root.status === 'archived') return ProjectTodosResultSchema.parse({ projectId, items: [] });

    const ancestry = archivedAncestry(projects);
    const byId = new Map<ProjectId, Project>(projects.map((project) => [project.id, project]));
    const descendants = this.descendants(root.id, projects).filter(
      ({ id }) => !ancestry.isArchived(id) && !ancestry.hasArchivedAncestor(id),
    );
    const owners = new Set<ProjectId>([root.id, ...descendants.map(({ id }) => id)]);

    // Live rows only, which is what both repositories answer by default (§33's `archivedAt`).
    const [tasks, sections, pages] = await Promise.all([
      this.dependencies.tasks.list(),
      this.dependencies.sections.list(),
      this.dependencies.pages.list(),
    ]);
    const sectionById = new Map<string, ProjectSection>(sections.map((section) => [section.id, section]));
    const pageById = new Map<string, ProjectPage>(pages.map((page) => [page.id, page]));
    const canvasOf = new Map<ProjectId, ProjectPage>();
    for (const page of pages) if (page.kind === 'work' || page.kind === 'home') canvasOf.set(page.projectId, page);

    const sortable: SortableItem[] = [];

    for (const project of descendants) {
      const canvas = canvasOf.get(project.id);
      // Unreachable while `validateDocumentIntegrity` holds every project to a canonical page.
      // A read answers with what it can rather than failing the whole page over one record.
      if (canvas === undefined) continue;
      sortable.push({
        item: {
          kind: 'subproject',
          project: project as Subproject,
          origin: {
            projectId: project.id,
            pageId: canvas.id,
            pageKind: canvas.kind,
            breadcrumb: this.breadcrumb(root.id, project.id, byId),
          },
        },
        // §34, §45: a date-only due date is the end of that UTC day, so a task due at 23:59 the
        // same day comes first and a task due at the same instant ties with it.
        due: project.targetDate === undefined ? undefined : instantOf(`${project.targetDate}T23:59:59.999Z`),
        id: project.id,
      });
    }

    for (const task of tasks) {
      if (!owners.has(task.projectId)) continue;
      // A task whose container is archived came down with it (§31) and is not live work, even
      // where a hand-edited document (§14) left the row itself unmarked.
      const section = sectionById.get(task.sectionId);
      if (section === undefined) continue;
      const page = pageById.get(section.pageId);
      if (page === undefined) continue;
      sortable.push({
        item: {
          kind: 'task',
          task: task as Task,
          origin: {
            projectId: task.projectId,
            pageId: page.id,
            pageKind: page.kind,
            breadcrumb: this.breadcrumb(root.id, task.projectId, byId),
            sectionId: section.id,
            sectionName: nameOf(section),
          },
        },
        due: task.dueAt === undefined ? undefined : instantOf(task.dueAt),
        id: task.id,
      });
    }

    sortable.sort(compareItems);
    return ProjectTodosResultSchema.parse({ projectId, items: sortable.map(({ item }) => item) });
  }

  /**
   * The whole tree under the root, archived branches included — the caller filters them, because
   * `archivedAncestry` is the one place that rule is written.
   *
   * The visited set is the same defence `ProjectService` and `archivedAncestry` state: a
   * hand-edited `data.json` (§14) can hold a cycle, and a read must answer rather than hang.
   */
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

  /** Root first, owner last (§34). Cycle-guarded for the reason `descendants` states. */
  private breadcrumb(rootId: ProjectId, ownerId: ProjectId, byId: Map<ProjectId, Project>): TodoBreadcrumbStep[] {
    const steps: TodoBreadcrumbStep[] = [];
    const seen = new Set<ProjectId>();
    let current = byId.get(ownerId);
    while (current !== undefined && !seen.has(current.id)) {
      steps.unshift({ projectId: current.id, name: current.name });
      seen.add(current.id);
      if (current.id === rootId || current.parentProjectId === undefined) break;
      current = byId.get(current.parentProjectId);
    }
    return steps;
  }
}

/** Due date, then undated last, then kind, then id — §34's rule, in its order. */
const compareItems = (a: SortableItem, b: SortableItem): number => {
  if (a.due !== undefined && b.due !== undefined) {
    const byDue = compareInstants(a.due, b.due);
    if (byDue !== 0) return byDue;
  } else if (a.due !== b.due) {
    return a.due === undefined ? 1 : -1;
  }
  return KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || compareText(a.id, b.id);
};
