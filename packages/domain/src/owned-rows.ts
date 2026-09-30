import {
  ReflectionSchema,
  TaskSchema,
  type OwnedDataKind,
  type Reflection,
  type SectionId,
  type Task,
} from '@cwm/contracts';
import type { ReflectionRepository, TaskRepository } from '@cwm/repositories';
import type { Clock } from './clock';

/**
 * **The row writes a section's removal and its inverse share.** Shared functions, not a
 * service: `SectionService.remove` and Undo both archive or repoint a container's rows as one
 * step of an operation the caller has already been permitted for, and routing that through
 * `TaskService` or `ReflectionService` would make each depend on services that depend on it.
 */

/** A row of an owned kind: everything a removal or its Undo archives, repoints or restores. */
export type OwnedRow = Task | Reflection;

export interface OwnedRowRepositories {
  tasks: TaskRepository;
  reflections: ReflectionRepository;
}

/** Every row a container holds, archived ones included. */
export const rowsOf = (
  repositories: OwnedRowRepositories,
  sectionId: SectionId,
  owned: OwnedDataKind,
): Promise<OwnedRow[]> =>
  owned === 'tasks'
    ? repositories.tasks.list({ sectionId, includeArchived: true })
    : repositories.reflections.list({ sectionId, includeArchived: true });

/**
 * Written through the schema rather than through the owning service, for the reason above.
 * `updatedAt` moves, so a live client sees the row change.
 */
export const writeRow = async (
  repositories: OwnedRowRepositories,
  clock: Clock,
  owned: OwnedDataKind,
  row: OwnedRow,
): Promise<void> => {
  const updatedAt = clock.now().toISOString();
  if (owned === 'tasks') await repositories.tasks.update(TaskSchema.parse({ ...row, updatedAt }));
  else await repositories.reflections.update(ReflectionSchema.parse({ ...row, updatedAt }));
};
