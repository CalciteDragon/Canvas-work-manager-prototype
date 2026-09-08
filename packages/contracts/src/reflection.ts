import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, ReflectionIdSchema, SectionIdSchema, TaskIdSchema } from './ids';
import { TodoBreadcrumbStepSchema } from './project-todos';
import { ProjectStatusSchema } from './project';
import { TaskStatusSchema } from './task';

/** §36's optional link from a reflection to the completed work it is about. */
export const ReflectionSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), id: TaskIdSchema }),
  z.object({ kind: z.literal('subproject'), id: ProjectIdSchema }),
]);
export type ReflectionSubject = z.infer<typeof ReflectionSubjectSchema>;

/** The current, read-only subject facts shown beside a journal entry or in its picker. */
export const ReflectionSubjectViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('task'),
    id: TaskIdSchema,
    name: z.string().min(1),
    status: TaskStatusSchema,
    completedAt: IsoDateTimeSchema.optional(),
    archived: z.boolean(),
    hiddenByArchivedAncestor: z.boolean(),
    breadcrumb: z.array(TodoBreadcrumbStepSchema).min(1),
  }),
  z.object({
    kind: z.literal('subproject'),
    id: ProjectIdSchema,
    name: z.string().min(1),
    status: ProjectStatusSchema,
    completedAt: IsoDateTimeSchema.optional(),
    archived: z.boolean(),
    hiddenByArchivedAncestor: z.boolean(),
    breadcrumb: z.array(TodoBreadcrumbStepSchema).min(1),
  }),
]);
export type ReflectionSubjectView = z.infer<typeof ReflectionSubjectViewSchema>;

/**
 * A lightweight project journal (§36), not a task. Whether reflections end up freeform,
 * prompted, daily, or project-scoped is a §83 question.
 */
export const ReflectionSchema = z.object({
  id: ReflectionIdSchema,
  projectId: ProjectIdSchema,
  /** The `reflections` container that owns this row — see `Task.sectionId`. */
  sectionId: SectionIdSchema,
  subject: ReflectionSubjectSchema.optional(),

  title: z.string().optional(),
  body: z.string().min(1),
  /** Which of §36's prompts was answered, when one was used. Prompting stays optional. */
  prompt: z.string().optional(),

  /**
   * Set when the reflection is archived; archived reflections are excluded from lists by
   * default. It exists for the same reason `Task.archivedAt` does, and because removing a
   * `reflections` container with `cascade` has to be undoable — see
   * docs/decisions/2026-09-what-undo-means-for-an-archived-row.md.
   */
  archivedAt: IsoDateTimeSchema.optional(),
  /**
   * Present means this reflection was archived as part of its container's removal, and
   * names the container it came down with — see `Task.archivedWithSectionId`. Reflections
   * have no parents, so there is no second marker.
   */
  archivedWithSectionId: SectionIdSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Reflection = z.infer<typeof ReflectionSchema>;
