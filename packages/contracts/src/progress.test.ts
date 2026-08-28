import { describe, expect, it } from 'vitest';
import { ProgressResultSchema } from './progress';

describe('ProgressResultSchema', () => {
  it('represents measurable and unavailable progress', () => {
    expect(ProgressResultSchema.parse({ projectId: 'project-a', formula: 'count', percentage: 50, completed: 1, total: 2, explanation: '1 of 2 tasks' }).percentage).toBe(50);
    expect(ProgressResultSchema.parse({ projectId: 'project-a', formula: 'count', percentage: null, completed: 0, total: 0, explanation: 'No tasks to measure' }).percentage).toBeNull();
  });

  it('bounds percentage', () => {
    expect(ProgressResultSchema.safeParse({ projectId: 'project-a', formula: 'manual', percentage: 101, completed: 101, total: 100, explanation: 'Manual' }).success).toBe(false);
  });
});
