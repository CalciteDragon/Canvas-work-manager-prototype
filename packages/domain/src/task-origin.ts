import { nameOf, type Project, type ProjectId, type ProjectPage, type ProjectSection, type Task, type TodoBreadcrumbStep, type TodoTaskOrigin } from '@cwm/contracts';

/** Resolve a task's canonical owner and container for derived reads (§24, §34, §38). */
export const taskOrigin = (
  task: Task,
  projects: readonly Project[],
  sections: readonly ProjectSection[],
  pages: readonly ProjectPage[],
): TodoTaskOrigin | undefined => {
  const owner = projects.find(({ id }) => id === task.projectId);
  const section = sections.find(({ id, projectId }) => id === task.sectionId && projectId === task.projectId);
  if (owner === undefined || section === undefined) return undefined;
  const page = pages.find(({ id, projectId }) => id === section.pageId && projectId === owner.id);
  if (page === undefined) return undefined;
  const byId = new Map(projects.map((project) => [project.id, project]));
  const breadcrumb: TodoBreadcrumbStep[] = [];
  const seen = new Set<ProjectId>();
  let current: Project | undefined = owner;
  while (current !== undefined && !seen.has(current.id)) {
    breadcrumb.unshift({ projectId: current.id, name: current.name });
    seen.add(current.id);
    current = current.parentProjectId === undefined ? undefined : byId.get(current.parentProjectId);
  }
  return { projectId: owner.id, pageId: page.id, pageKind: page.kind, sectionId: section.id, sectionName: nameOf(section), breadcrumb };
};
