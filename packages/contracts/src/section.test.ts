import { describe, expect, it } from 'vitest';
import {
  ProjectSectionSchema,
  SectionColumnSpanSchema,
  SectionRemovalRefusalDetailsSchema,
  containerTypeFor,
  displayNameOf,
  nameOf,
  normaliseSectionTitle,
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

  it('names the container type to create for each owned kind, from the same map', () => {
    expect(containerTypeFor('tasks')).toBe('task-list');
    expect(containerTypeFor('reflections')).toBe('reflections');
    expect(ownedKindOf(containerTypeFor('tasks'))).toBe('tasks');
  });

  it('does not answer for inherited Object keys', () => {
    expect(sectionKindOf('toString')).toBe('view');
    expect(ownedKindOf('constructor')).toBeUndefined();
  });
});

describe('what a section is called', () => {
  it('derives every registered display name, and overrides the one it cannot', () => {
    // The seven registered types, against `SECTION_REGISTRY`'s own display names. Six derive
    // from the kebab type; `sub-projects` is the entry the overrides table exists for, and
    // the spec (line 1109) spells it with the hyphen.
    expect(displayNameOf('rich-text')).toBe('Rich Text');
    expect(displayNameOf('task-list')).toBe('Task List');
    expect(displayNameOf('progress')).toBe('Progress');
    expect(displayNameOf('reflections')).toBe('Reflections');
    expect(displayNameOf('timeline')).toBe('Timeline');
    expect(displayNameOf('recent-activity')).toBe('Recent Activity');
    expect(displayNameOf('sub-projects')).toBe('Sub-Projects');
  });

  it('does not read a display name off Object.prototype', () => {
    // `type` is an open string an agent can write and `data.json` can hold, so the hole
    // `sectionKindOf` closes twenty lines above is reachable here too — a `??` lookup would
    // answer `Object` from a signature declaring `: string`.
    expect(displayNameOf('toString')).toBe('ToString');
    expect(displayNameOf('constructor')).toBe('Constructor');
  });

  it('prefers the section’s own override and falls back to the derived default', () => {
    expect(nameOf({ type: 'task-list', title: 'Backlog' })).toBe('Backlog');
    expect(nameOf({ type: 'task-list', title: undefined })).toBe('Task List');
  });

  it('trims a legacy override, and falls back rather than rendering a blank name', () => {
    // `ProjectSectionSchema.title` stays a plain optional string, so a hand-edited document
    // (§14) written before this phase can hold whitespace. `nameOf` is the compatibility
    // boundary: it keeps such a record visibly named without invalidating the document.
    expect(nameOf({ type: 'task-list', title: '  Backlog  ' })).toBe('Backlog');
    expect(nameOf({ type: 'task-list', title: '   ' })).toBe('Task List');
    expect(nameOf({ type: 'task-list', title: '' })).toBe('Task List');
    expect(normaliseSectionTitle('  Backlog ')).toBe('Backlog');
    expect(normaliseSectionTitle('   ')).toBeUndefined();
    expect(normaliseSectionTitle(null)).toBeUndefined();
  });

  it('discriminates the one refusal the canvas can turn into a question', () => {
    expect(
      SectionRemovalRefusalDetailsSchema.parse({ reason: 'section_not_empty', liveRowCount: 2 }),
    ).toEqual({ reason: 'section_not_empty', liveRowCount: 2 });
    // A count of zero is not the question this dialog answers, and a different reason is a
    // different 409 — both stay ordinary errors.
    expect(SectionRemovalRefusalDetailsSchema.safeParse({ reason: 'section_not_empty', liveRowCount: 0 }).success).toBe(false);
    expect(SectionRemovalRefusalDetailsSchema.safeParse({ reason: 'section_not_empty', liveRowCount: 1.5 }).success).toBe(false);
    expect(SectionRemovalRefusalDetailsSchema.safeParse({ reason: 'section_archived', liveRowCount: 2 }).success).toBe(false);
    expect(SectionRemovalRefusalDetailsSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('ProjectSectionSchema archivedAt', () => {
  const section = {
    id: 'section-1',
    projectId: 'project-1',
    type: 'task-list',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
  };

  it('accepts an archived section, keeping its config', () => {
    const parsed = ProjectSectionSchema.parse({
      ...section,
      type: 'rich-text',
      config: { text: 'Measure the hallway shelf' },
      archivedAt: '2026-09-02T06:13:32.422Z',
    });
    expect(parsed.archivedAt).toBe('2026-09-02T06:13:32.422Z');
    // The whole point of archiving a view rather than deleting it: the prose survives.
    expect(parsed.config).toEqual({ text: 'Measure the hallway shelf' });
  });

  it('parses a section written before this field existed', () => {
    // `archivedAt` is optional, so `SCHEMA_VERSION` does not move and no reseed is needed.
    expect(ProjectSectionSchema.parse(section).archivedAt).toBeUndefined();
  });

  it('rejects a date-only archivedAt — it is an instant like the other timestamps', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, archivedAt: '2026-09-02' }).success).toBe(false);
  });
});

