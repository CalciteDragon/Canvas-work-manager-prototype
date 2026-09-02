import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, ReflectionIdSchema, SectionIdSchema } from './ids';

/**
 * A lightweight project journal (§36), not a task. Whether reflections end up freeform,
 * prompted, daily, or project-scoped is a §83 question.
 */
export const ReflectionSchema = z.object({
  id: ReflectionIdSchema,
  projectId: ProjectIdSchema,
  /** The `reflections` container that owns this row — see `Task.sectionId`. */
  sectionId: SectionIdSchema,

  title: z.string().optional(),
  body: z.string().min(1),
  /** Which of §36's prompts was answered, when one was used. Prompting stays optional. */
  prompt: z.string().optional(),

  /**
   * Set when the reflection is archived; archived reflections are excluded from lists by
   * default. It exists for the same reason `Task.archivedAt` does, and because removing a
   * `reflections` container with `cascade` has to be undoable — see
   * docs/decisions/2026-09-sections-own-their-data.md.
   */
  archivedAt: IsoDateTimeSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Reflection = z.infer<typeof ReflectionSchema>;
