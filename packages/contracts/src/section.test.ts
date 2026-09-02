import { describe, expect, it } from 'vitest';
import {
  ProjectSectionSchema,
  SectionColumnSpanSchema,
  ownedKindOf,
  sectionKindOf,
} from './section';

const section = {
  id: 'section-1',
  projectId: 'project-a',
  type: 'task_list',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('ProjectSectionSchema', () => {
  it('accepts a half-width section with a frame title', () => {
    const parsed = ProjectSectionSchema.parse({ ...section, columnSpan: 6, title: 'This week' });
    expect(parsed).toMatchObject({ columnSpan: 6, title: 'This week' });
  });

  it('keeps config opaque — the registry owns its shape (§29)', () => {
    const parsed = ProjectSectionSchema.parse({
      ...section,
      config: { statusFilter: ['todo'], showCompleted: false },
    });
    expect(parsed.config).toEqual({ statusFilter: ['todo'], showCompleted: false });
  });

  it('rejects a column span outside the §27 presets', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, columnSpan: 5 }).success).toBe(false);
    expect(SectionColumnSpanSchema.safeParse(3).success).toBe(false);
    expect([...SectionColumnSpanSchema.values]).toEqual([12, 8, 6, 4]);
  });

  it('rejects a config that is not an object', () => {
    // §29 leaves the config's *keys* to the section definition, not its kind. A bare
    // `unknown` let storage hold values no write input could ever produce.
    for (const config of [null, 'text', [], 3]) {
      expect(ProjectSectionSchema.safeParse({ ...section, config }).success).toBe(false);
    }
    expect(ProjectSectionSchema.safeParse({ ...section, config: undefined }).success).toBe(false);
  });

  it('rejects an empty section type', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, type: '' }).success).toBe(false);
  });

  it('rejects a position that is negative or fractional', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, position: -1 }).success).toBe(false);
    expect(ProjectSectionSchema.safeParse({ ...section, position: 1.5 }).success).toBe(false);
  });
});

describe('section ownership', () => {
  it('splits registered types into containers and leaves the rest views', () => {
    expect(sectionKindOf('task-list')).toBe('container');
    expect(sectionKindOf('reflections')).toBe('container');
    expect(sectionKindOf('progress')).toBe('view');
    expect(sectionKindOf('timeline')).toBe('view');
  });

  it('treats an unregistered type as a view, so an unknown type can never cascade', () => {
    expect(sectionKindOf('something-nobody-registered')).toBe('view');
    expect(ownedKindOf('something-nobody-registered')).toBeUndefined();
  });

  it('names what each container owns', () => {
    expect(ownedKindOf('task-list')).toBe('tasks');
    expect(ownedKindOf('reflections')).toBe('reflections');
  });

  it('leaves rich-text out of the map — it owns config.text, not rows', () => {
    expect(sectionKindOf('rich-text')).toBe('view');
  });

  it('does not answer for inherited Object keys', () => {
    expect(sectionKindOf('toString')).toBe('view');
    expect(ownedKindOf('constructor')).toBeUndefined();
  });
});
