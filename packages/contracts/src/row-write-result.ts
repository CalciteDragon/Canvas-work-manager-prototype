import { z } from 'zod';
import { OperationReceiptSchema } from './operation-receipt';
import { ReflectionSchema } from './reflection';
import { TaskSchema } from './task';

/**
 * Every committed row write answers `{ entity, operation }`: a create always carries its receipt,
 * while an update, completion, archive or restore carries `null` when normalization made it a
 * no-op. These transport-facing schemas stay separate from executable row-history payloads so a
 * browser validating a response does not bundle the inverse-operation graph.
 */
export const TaskAddResultSchema = z.object({ task: TaskSchema, operation: OperationReceiptSchema });
export type TaskAddResult = z.infer<typeof TaskAddResultSchema>;

export const TaskWriteResultSchema = z.object({ task: TaskSchema, operation: OperationReceiptSchema.nullable() });
export type TaskWriteResult = z.infer<typeof TaskWriteResultSchema>;

export const ReflectionAddResultSchema = z.object({ reflection: ReflectionSchema, operation: OperationReceiptSchema });
export type ReflectionAddResult = z.infer<typeof ReflectionAddResultSchema>;

export const ReflectionWriteResultSchema = z.object({
  reflection: ReflectionSchema,
  operation: OperationReceiptSchema.nullable(),
});
export type ReflectionWriteResult = z.infer<typeof ReflectionWriteResultSchema>;
