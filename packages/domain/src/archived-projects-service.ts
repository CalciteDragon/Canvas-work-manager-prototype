import { ArchivedProjectsResultSchema, type Project, type ProjectId } from '@cwm/contracts';
import type { ProjectRepository } from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { restoreEligibility } from './restore-eligibility';

/** Workspace recovery query, independent of any root Archive page or page toggle. */
export class ArchivedProjectsService {
  constructor(private readonly dependencies: { projects: ProjectRepository }) {}

  async list(actor: ActorContext) {
    assertPermitted(actor, 'projects.read');
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const byId = new Map<ProjectId, Project>(projects.map((project) => [project.id, project]));
    const eligibility = restoreEligibility(projects, [], []);
    const items = projects.filter(({ id }) => eligibility.project(id)).map((project) => {
      const breadcrumb: { projectId: ProjectId; name: string }[] = [];
      const seen = new Set<ProjectId>();
      let current: Project | undefined = project;
      while (current !== undefined && !seen.has(current.id)) {
        breadcrumb.unshift({ projectId: current.id, name: current.name });
        seen.add(current.id);
        current = current.kind === 'subproject' ? byId.get(current.parentProjectId) : undefined;
      }
      return { project, breadcrumb };
    });
    items.sort((a, b) => a.project.id.localeCompare(b.project.id));
    return ArchivedProjectsResultSchema.parse({ items });
  }
}
