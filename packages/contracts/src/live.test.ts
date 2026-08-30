import { describe, expect, it } from 'vitest';
import { LiveEventSchema } from './live';

describe('LiveEventSchema', () => {
  it('accepts §62’s example event verbatim', () => {
    expect(LiveEventSchema.parse({ type: 'task.updated', entityId: 'task-123' })).toEqual({
      type: 'task.updated',
      entityId: 'task-123',
    });
  });

  it('accepts the routed event a client filters on', () => {
    const event = {
      type: 'task.completed',
      entityType: 'task',
      entityId: 'task-1',
      projectId: 'project-1',
    };
    expect(LiveEventSchema.parse(event)).toEqual(event);
  });

  it('rejects a type that is not entity.verb, so a typo cannot reach a client', () => {
    expect(LiveEventSchema.safeParse({ type: 'taskupdated', entityId: 'task-1' }).success).toBe(false);
  });

  it('rejects an empty entityId', () => {
    expect(LiveEventSchema.safeParse({ type: 'task.updated', entityId: '' }).success).toBe(false);
  });
});
