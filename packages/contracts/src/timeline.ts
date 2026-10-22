import { z } from 'zod';
import { IsoDateSchema } from './common';
import { ProjectIdSchema, SectionIdSchema } from './ids';
import { ProjectPageKindSchema } from './project-page';

export const TimelineItemKindSchema = z.enum(['project', 'sub-project', 'task', 'milestone']);
export type TimelineItemKind = z.infer<typeof TimelineItemKindSchema>;

export const TimelineItemSchema = z.object({
  id: z.string().min(1),
  kind: TimelineItemKindSchema,
  title: z.string().min(1),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  status: z.string().optional(),
  invalidRange: z.boolean().optional(),
  /** Canonical owner identity; routes belong to the reader (§38). */
  link: z.object({
    projectId: ProjectIdSchema,
    pageKind: ProjectPageKindSchema,
    sectionId: SectionIdSchema.optional(),
  }).optional(),
}).refine((item) => item.link?.sectionId === undefined || item.kind === 'task', {
  message: 'Only a task links to a section', path: ['link', 'sectionId'],
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const TimelineResultSchema = z.object({
  projectId: ProjectIdSchema,
  items: z.array(TimelineItemSchema),
});
export type TimelineResult = z.infer<typeof TimelineResultSchema>;
