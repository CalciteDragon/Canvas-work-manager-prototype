import { describe, expect, it } from 'vitest';
import { CreatePrototypeNoteInputSchema, PrototypeNotesFileSchema } from './prototype';

describe('prototype note contracts (§79)', () => {
  it('round-trips the fractional slice labels already used by the notes history', () => {
    const note = {
      id: 'note-2026-09-08-001',
      createdAt: '2026-09-08T08:16:00.000Z',
      route: '/projects/project-kitchen',
      projectId: 'project-kitchen',
      slice: 25.8,
      note: 'The manager is easier to use from the root navigation column.',
    };

    expect(PrototypeNotesFileSchema.parse({ notes: [note] }).notes[0]?.slice).toBe(25.8);
    expect(CreatePrototypeNoteInputSchema.parse({
      note: note.note,
      route: note.route,
      projectId: note.projectId,
      slice: note.slice,
    }).slice).toBe(25.8);
  });

  it('preserves resolved metadata already present in the notes history', () => {
    const note = {
      id: 'note-2026-09-01-001',
      createdAt: '2026-09-02T06:15:04.048Z',
      route: '/projects/project-personal',
      projectId: 'project-personal',
      resolvedAt: '2026-09-04T05:45:00.000Z',
      resolution: 'Closed by the names phase.',
      slice: 25.4,
      note: 'The section removal dialog needs a titled target.',
    };

    expect(PrototypeNotesFileSchema.parse({ notes: [note] }).notes[0]).toMatchObject({
      resolvedAt: note.resolvedAt,
      resolution: note.resolution,
    });
  });
});
