import { z } from 'zod';
import { OperationReceiptSchema } from './operation-receipt';
import { ProjectSchema } from './project';

/**
 * **What a committed project write answers** (§§26, 31). Kept beside
 * `page-write-result.ts`, and away from `project-history.ts`, for the same reason that one is: a
 * browser validating a response should not bundle the inverse-operation graph to do it.
 *
 * Creation, `PATCH /api/projects/:id`, `update_project`, `archive_project` and `restore_project`
 * all answer it.
 * The receipt is `null` for a normalized no-op — archiving an archived project, or a PATCH that sets
 * what is already there — because that write did not happen and must not look like one that did.
 * Creation always has a receipt; an existing-project write has `null` only for a normalized no-op.
 */
export const ProjectWriteResultSchema = z.strictObject({
  project: ProjectSchema,
  operation: OperationReceiptSchema.nullable(),
});
export type ProjectWriteResult = z.infer<typeof ProjectWriteResultSchema>;
