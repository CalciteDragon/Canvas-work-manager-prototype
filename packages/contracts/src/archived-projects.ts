import * as z from 'zod';
import { ArchiveBreadcrumbStepSchema } from './project-archive';
import { ProjectSchema } from './project';

/** Workspace-wide archived projects whose ancestors are currently live. */
export const ArchivedProjectsResultSchema = z.object({
  items: z.array(z.object({
    project: ProjectSchema.refine(({ status }) => status === 'archived', 'project must be archived'),
    breadcrumb: z.array(ArchiveBreadcrumbStepSchema).min(1),
    /** The workstreams marked with this owner, which its restore brings back. Absent when none. */
    cascadeCount: z.number().int().positive().optional(),
  })),
});
export type ArchivedProjectsResult = z.infer<typeof ArchivedProjectsResultSchema>;
