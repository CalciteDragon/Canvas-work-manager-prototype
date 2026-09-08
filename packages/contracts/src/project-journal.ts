import { z } from 'zod';
import { ProjectIdSchema } from './ids';
import { ReflectionSchema, ReflectionSubjectViewSchema } from './reflection';
import { TodoTaskOriginSchema } from './project-todos';

/** The root scope shared by the journal and completed-work picker reads. */
export const ProjectJournalQuerySchema = z.object({ projectId: ProjectIdSchema });
export type ProjectJournalQuery = z.infer<typeof ProjectJournalQuerySchema>;

/** A named alias for callers that validate the picker request independently. */
export const ProjectCompletedWorkQuerySchema = ProjectJournalQuerySchema;
export type ProjectCompletedWorkQuery = ProjectJournalQuery;

/** One reflection in the root-wide journal, with its canonical owner resolved. */
export const ProjectJournalEntrySchema = z.object({
  reflection: ReflectionSchema,
  origin: TodoTaskOriginSchema,
  subject: ReflectionSubjectViewSchema.optional(),
});
export type ProjectJournalEntry = z.infer<typeof ProjectJournalEntrySchema>;

/** Compatibility with the result's `items` vocabulary used by other derived projections. */
export const ProjectJournalItemSchema = ProjectJournalEntrySchema;
export type ProjectJournalItem = ProjectJournalEntry;

export const ProjectJournalResultSchema = z.object({
  projectId: ProjectIdSchema,
  items: z.array(ProjectJournalEntrySchema),
});
export type ProjectJournalResult = z.infer<typeof ProjectJournalResultSchema>;

/** A completed task or sub-project eligible for a new subject link. */
export const ProjectCompletedWorkCandidateSchema = ReflectionSubjectViewSchema;
export type ProjectCompletedWorkCandidate = z.infer<typeof ProjectCompletedWorkCandidateSchema>;

export const ProjectCompletedWorkResultSchema = z.object({
  projectId: ProjectIdSchema,
  candidates: z.array(ProjectCompletedWorkCandidateSchema),
});
export type ProjectCompletedWorkResult = z.infer<typeof ProjectCompletedWorkResultSchema>;
