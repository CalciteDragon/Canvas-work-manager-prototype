import { z } from 'zod';
import { IsoDateSchema } from './common';
import { ProjectIdSchema } from './ids';

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
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const TimelineResultSchema = z.object({
  projectId: ProjectIdSchema,
  items: z.array(TimelineItemSchema),
});
export type TimelineResult = z.infer<typeof TimelineResultSchema>;
