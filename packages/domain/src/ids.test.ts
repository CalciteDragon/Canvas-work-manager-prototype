import { ActivityEventIdSchema, ProjectIdSchema, TaskIdSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { PrototypeIdGenerator } from './ids';

describe('PrototypeIdGenerator', () => {
  it('mints distinct prefixed ids that parse through the branded id schemas', () => {
    const generator = new PrototypeIdGenerator();
    const ids = Array.from({ length: 100 }, () => generator.next('task'));

    expect(new Set(ids).size).toBe(100);
    expect(ids.every((id) => id.startsWith('task-'))).toBe(true);
    expect(TaskIdSchema.parse(generator.next('task'))).toMatch(/^task-[0-9a-f]{8}$/);
    expect(ProjectIdSchema.parse(generator.next('project'))).toMatch(/^project-/);
    expect(ActivityEventIdSchema.parse(generator.next('activity'))).toMatch(/^activity-/);
  });
});
