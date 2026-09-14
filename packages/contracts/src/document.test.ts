import { describe, expect, it } from 'vitest';
import { PrototypeDocumentSchema, SCHEMA_VERSION } from './document';

// §14's document literal, at this prototype's current schema version.
const document = {
  schemaVersion: SCHEMA_VERSION,
  users: [],
  workspaces: [],
  projects: [],
  projectPages: [],
  sections: [],
  sectionShortcuts: [],
  tasks: [],
  milestones: [],
  reflections: [],
  activityEvents: [],
  agentConnections: [],
};

describe('PrototypeDocumentSchema', () => {
  it('is at version 3 — projects split into roots and sub-projects, and pages own sections', () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  it('accepts the §14 document', () => {
    expect(PrototypeDocumentSchema.parse(document)).toEqual({ ...document, undoRecords: [] });
  });

  it('parses a version-3 document written before Undo records existed, with an empty collection', () => {
    // No bump and no converter: the collection is defaulted, so every existing file still loads.
    expect(SCHEMA_VERSION).toBe(3);
    expect(document).not.toHaveProperty('undoRecords');
    expect(PrototypeDocumentSchema.parse(document).undoRecords).toEqual([]);
  });

  it('rejects a file written by an older schema', () => {
    expect(PrototypeDocumentSchema.safeParse({ ...document, schemaVersion: SCHEMA_VERSION - 1 }).success).toBe(false);
  });

  it('rejects a document missing one of the §14 collections', () => {
    const { agentConnections, ...incomplete } = document;
    expect(PrototypeDocumentSchema.safeParse(incomplete).success).toBe(false);
  });

  it('validates the contents of each collection', () => {
    expect(
      PrototypeDocumentSchema.safeParse({ ...document, tasks: [{ id: 'task-1', title: 'No project' }] }).success,
    ).toBe(false);
  });

  it('leaves referential integrity to the store — a task may name a project not present', () => {
    const orphan = PrototypeDocumentSchema.parse({
      ...document,
      tasks: [
        {
          id: 'task-1',
          projectId: 'project-missing',
          sectionId: 'section-missing',
          title: 'Orphan',
          status: 'todo',
          priority: 'medium',
          createdAt: '2026-08-26T10:00:00.000Z',
          updatedAt: '2026-08-26T10:00:00.000Z',
        },
      ],
    });
    expect(orphan.tasks).toHaveLength(1);
  });

  it('tolerates an unknown top-level key in a hand-edited file', () => {
    const parsed = PrototypeDocumentSchema.parse({ ...document, scratch: { note: 'debugging' } });
    expect(parsed).not.toHaveProperty('scratch');
  });
});
