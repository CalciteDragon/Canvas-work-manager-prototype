import type { Project, ProjectId, ProjectSection, Reflection, Task, TaskId } from '@cwm/contracts';

/** Structural restore eligibility over current canonical records, independent of actor grants. */
export const restoreEligibility = (
  projects: readonly Project[],
  sections: readonly ProjectSection[],
  tasks: readonly Task[],
) => {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const activeProjectChain = (id: ProjectId, includeSelf: boolean): boolean => {
    const seen = new Set<ProjectId>();
    let current = projectById.get(id);
    if (!includeSelf && current?.kind === 'subproject') current = projectById.get(current.parentProjectId);
    else if (!includeSelf) current = undefined;
    while (current !== undefined && !seen.has(current.id)) {
      if (current.status === 'archived') return false;
      seen.add(current.id);
      current = current.kind === 'subproject' ? projectById.get(current.parentProjectId) : undefined;
    }
    return true;
  };

  return {
    project: (id: ProjectId): boolean =>
      projectById.get(id)?.status === 'archived' && activeProjectChain(id, false),
    section: (section: ProjectSection): boolean =>
      section.archivedAt !== undefined && activeProjectChain(section.projectId, true),
    task: (task: Task): boolean => {
      if (task.archivedAt === undefined || !activeProjectChain(task.projectId, true)) return false;
      if (sectionById.get(task.sectionId)?.archivedAt !== undefined) return false;
      const seen = new Set<TaskId>([task.id]);
      let parentId = task.parentTaskId;
      while (parentId !== undefined && !seen.has(parentId)) {
        const parent = taskById.get(parentId);
        if (parent === undefined) break;
        if (parent.archivedAt !== undefined) return false;
        seen.add(parentId);
        parentId = parent.parentTaskId;
      }
      return true;
    },
    reflection: (reflection: Reflection): boolean =>
      reflection.archivedAt !== undefined &&
      activeProjectChain(reflection.projectId, true) &&
      sectionById.get(reflection.sectionId)?.archivedAt === undefined,
  };
};
