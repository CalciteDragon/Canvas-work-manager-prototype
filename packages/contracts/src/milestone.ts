import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema } from './common';
import { MilestoneIdSchema, ProjectIdSchema } from './ids';

/** §35 names `status` without values; this is the starting set, not a decision. */
export const MilestoneStatusSchema = z.enum(['upcoming', 'achieved', 'missed']);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

/**
 * §35 keeps milestones distinct from tasks *initially*. Whether they deserve their own
 * model is a question the prototype must answer — see Slice 19.
 */
export const MilestoneSchema = z.object({
  id: MilestoneIdSchema,
  projectId: ProjectIdSchema,

  title: z.string().min(1),
  description: z.string().optional(),
  targetDate: IsoDateSchema.optional(),
  status: MilestoneStatusSchema,

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Milestone = z.infer<typeof MilestoneSchema>;
