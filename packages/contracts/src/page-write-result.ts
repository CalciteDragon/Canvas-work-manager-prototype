import { z } from 'zod';
import { OperationReceiptSchema } from './operation-receipt';
import { ProjectPageSchema } from './project-page';

/**
 * **What a committed optional-page toggle answers** (Slice 38, §§26, 31). Kept beside
 * `row-write-result.ts` and `shortcut-write-result.ts`, and away from `page-history.ts`, for the
 * same reason those two are: a browser validating a response should not bundle the
 * inverse-operation graph to do it.
 *
 * One envelope covers both writes §26 gives a page, because the caller addresses a toggle by
 * *kind* and cannot know whether it is about to create the record or change an existing boolean.
 * The receipt is therefore nullable: a first enable and a real change both carry one, while a
 * toggle set to where it already is carries `null`, because that write did not happen and must
 * not look like one that did.
 */
export const ProjectPageWriteResultSchema = z.object({
  page: ProjectPageSchema,
  operation: OperationReceiptSchema.nullable(),
});
export type ProjectPageWriteResult = z.infer<typeof ProjectPageWriteResultSchema>;
