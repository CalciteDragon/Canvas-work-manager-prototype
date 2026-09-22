import { describe, expect, it } from 'vitest';
import { isProjectRecordEvent, LiveEventSchema, PROJECT_RECORD_EVENT_TYPES } from './live';

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

describe('project-record frames (Slice 39)', () => {
  it('name the record writes and their Undo/Redo, and nothing on a canvas', () => {
    expect(PROJECT_RECORD_EVENT_TYPES).toEqual([
      'project.updated',
      'project.archived',
      'project.update_undone',
      'project.update_redone',
      'project.archive_undone',
      'project.archive_redone',
      'project.reactivation_undone',
      'project.reactivation_redone',
    ]);
    const frame = (type: string, entityType = 'project') => LiveEventSchema.parse({ type, entityType, entityId: 'project-a', projectId: 'project-a' });
    for (const type of PROJECT_RECORD_EVENT_TYPES) expect(isProjectRecordEvent(frame(type)), type).toBe(true);
    // A create names its own root already, and cannot take a sub-project away from another one.
    expect(isProjectRecordEvent(frame('project.created'))).toBe(false);
    expect(isProjectRecordEvent(frame('project.section_added'))).toBe(false);
    expect(isProjectRecordEvent(frame('project.section_update_undone'))).toBe(false);
    expect(isProjectRecordEvent(frame('project.page_update_redone'))).toBe(false);
    expect(isProjectRecordEvent(frame('project.updated', 'task'))).toBe(false);
  });
});
