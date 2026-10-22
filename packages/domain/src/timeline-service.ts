import { TimelineResultSchema, type Project, type ProjectId, type TimelineItem, type TimelineResult } from '@cwm/contracts';
import type { MilestoneRepository, ProjectPageRepository, ProjectRepository, SectionRepository, TaskRepository } from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { EntityNotFoundError } from './errors';
import { taskOrigin } from './task-origin';

export interface TimelineServiceDependencies {
  projects: ProjectRepository;
  tasks: TaskRepository;
  milestones: MilestoneRepository;
  sections: SectionRepository;
  pages: ProjectPageRepository;
}

const dateOf = (value: string): string => value.slice(0, 10);

export class TimelineService {
  constructor(private readonly dependencies: TimelineServiceDependencies) {}

  async derive(actor: ActorContext, projectId: ProjectId): Promise<TimelineResult> {
    assertPermitted(actor, 'projects.read');
    const projects = await this.dependencies.projects.list({ workspaceId: actor.workspaceId });
    const root = projects.find(({ id }) => id === projectId);
    if (root === undefined) throw new EntityNotFoundError('project', projectId);

    const descendants = this.descendants(projectId, projects);
    const included = new Set<ProjectId>([projectId, ...descendants.map(({ id }) => id)]);
    const tasks = (await this.dependencies.tasks.list()).filter(({ projectId: id }) => included.has(id));
    const milestones = (await this.dependencies.milestones.list()).filter(({ projectId: id }) => included.has(id));
    const items: TimelineItem[] = [];
    const [sections, pages] = await Promise.all([this.dependencies.sections.list(), this.dependencies.pages.list()]);

    for (const project of descendants) {
      if (project.targetDate !== undefined) {
        const page = pages.find(({ projectId: ownerId, kind }) => ownerId === project.id && kind === 'work');
        items.push({ id: project.id, kind: 'sub-project', title: project.name, startDate: project.targetDate, endDate: project.targetDate, status: project.status,
          ...(page === undefined ? {} : { link: { projectId: project.id, pageKind: page.kind } }),
        });
      }
    }
    for (const task of tasks) {
      const rawStart = task.startAt === undefined ? undefined : dateOf(task.startAt);
      const rawEnd = task.dueAt === undefined ? undefined : dateOf(task.dueAt);
      const only = rawStart ?? rawEnd;
      if (only === undefined) continue;
      const invalidRange = rawStart !== undefined && rawEnd !== undefined && rawStart > rawEnd;
      const startDate = rawStart === undefined || rawEnd === undefined ? only : rawStart < rawEnd ? rawStart : rawEnd;
      const endDate = rawStart === undefined || rawEnd === undefined ? only : rawStart < rawEnd ? rawEnd : rawStart;
      const origin = taskOrigin(task, projects, sections, pages);
      items.push({ id: task.id, kind: 'task', title: task.title, startDate, endDate, status: task.status, invalidRange: invalidRange || undefined,
        ...(origin === undefined ? {} : { link: { projectId: origin.projectId, pageKind: origin.pageKind, sectionId: origin.sectionId } }),
      });
    }
    for (const milestone of milestones) {
      if (milestone.targetDate !== undefined) {
        items.push({ id: milestone.id, kind: 'milestone', title: milestone.title, startDate: milestone.targetDate, endDate: milestone.targetDate, status: milestone.status });
      }
    }

    if (root.targetDate !== undefined) {
      const earliest = items.reduce<string | undefined>((value, item) => value === undefined || item.startDate < value ? item.startDate : value, undefined);
      items.push({
        id: root.id,
        kind: 'project',
        title: root.name,
        startDate: earliest !== undefined && earliest < root.targetDate ? earliest : root.targetDate,
        endDate: root.targetDate,
        status: root.status,
      });
    }

    items.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title));
    return TimelineResultSchema.parse({ projectId, items });
  }

  private descendants(rootId: ProjectId, projects: Project[]): Project[] {
    const result: Project[] = [];
    const seen = new Set<ProjectId>([rootId]);
    let frontier = [rootId];
    while (frontier.length > 0) {
      const parents = new Set(frontier);
      const children = projects.filter(({ id, parentProjectId, status }) => status !== 'archived' && parentProjectId !== undefined && parents.has(parentProjectId) && !seen.has(id));
      for (const child of children) seen.add(child.id);
      result.push(...children);
      frontier = children.map(({ id }) => id);
    }
    return result;
  }
}
