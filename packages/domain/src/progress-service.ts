import { ProgressResultSchema, type ProgressResult, type ProjectId } from '@cwm/contracts';
import type { ProjectRepository, TaskRepository } from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { EntityNotFoundError } from './errors';

export interface ProgressServiceDependencies {
  projects: ProjectRepository;
  tasks: TaskRepository;
}

/** §39's three formulas over the canonical project setting and existing tasks. */
export class ProgressService {
  constructor(private readonly dependencies: ProgressServiceDependencies) {}

  async calculate(actor: ActorContext, projectId: ProjectId): Promise<ProgressResult> {
    assertPermitted(actor, 'projects.read');
    const project = await this.dependencies.projects.find(projectId);
    if (project === null || project.workspaceId !== actor.workspaceId) {
      throw new EntityNotFoundError('project', projectId);
    }

    const formula = project.progressFormula;
    if (formula === 'manual') {
      const percentage = project.manualProgress ?? 0;
      return ProgressResultSchema.parse({
        projectId,
        formula,
        percentage,
        completed: percentage,
        total: 100,
        explanation: `${percentage}% entered manually`,
      });
    }

    const tasks = await this.dependencies.tasks.list({ projectId });
    if (tasks.length === 0) {
      return ProgressResultSchema.parse({
        projectId,
        formula,
        percentage: null,
        completed: 0,
        total: 0,
        explanation: 'No tasks to measure',
      });
    }

    const weight = formula === 'weighted' ? (estimate: number | undefined) => estimate ?? 1 : () => 1;
    const completed = tasks
      .filter(({ status }) => status === 'done')
      .reduce((sum, task) => sum + weight(task.estimate), 0);
    const total = tasks.reduce((sum, task) => sum + weight(task.estimate), 0);
    const percentage = Math.round((completed / total) * 100);
    const noun = formula === 'weighted' ? 'estimate points' : 'tasks';
    return ProgressResultSchema.parse({
      projectId,
      formula,
      percentage,
      completed,
      total,
      explanation: `${completed} of ${total} ${noun} complete`,
    });
  }
}
