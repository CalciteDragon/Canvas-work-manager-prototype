import { z } from 'zod';
import { ProjectIdSchema } from './ids';
import { ProgressFormulaSchema } from './project';

export const ProgressResultSchema = z.object({
  projectId: ProjectIdSchema,
  formula: ProgressFormulaSchema,
  percentage: z.number().min(0).max(100).nullable(),
  completed: z.number().nonnegative(),
  total: z.number().nonnegative(),
  explanation: z.string().min(1),
});
export type ProgressResult = z.infer<typeof ProgressResultSchema>;
