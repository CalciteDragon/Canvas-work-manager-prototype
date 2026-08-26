import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, ReflectionIdSchema } from './ids';

/**
 * A lightweight project journal (§36), not a task. Whether reflections end up freeform,
 * prompted, daily, or project-scoped is a §83 question.
 */
export const ReflectionSchema = z.object({
  id: ReflectionIdSchema,
  projectId: ProjectIdSchema,

  title: z.string().optional(),
  body: z.string().min(1),
  /** Which of §36's prompts was answered, when one was used. Prompting stays optional. */
  prompt: z.string().optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Reflection = z.infer<typeof ReflectionSchema>;
