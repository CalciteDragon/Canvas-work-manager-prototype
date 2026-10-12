import { describe, expect, it } from 'vitest';
import {
  ProjectSectionSchema,
  SECTION_CAPABILITIES,
  SECTION_OWNERSHIP,
  SectionCapabilitySchema,
  sectionCapabilityOf,
  SectionColumnSpanSchema,
  containerTypeFor,
  displayNameOf,
  isRetiredSectionType,
  retiredSectionReplacement,
  MarkdownConfigSchema,
  nameOf,
  SECTION_CONFIG_SCHEMAS,
  sectionConfigRefusal,
  RETIRED_SECTION_TYPES,
  normaliseSectionTitle,
  ownedKindOf,
  sectionKindOf,
} from './section';

const section = {
  id: 'section-1',
  projectId: 'project-a',
  pageId: 'page-a',
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

  it('leaves markdown out of the map — it owns config.markdown, not rows', () => {
    expect(sectionKindOf('markdown')).toBe('view');
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

describe('section capabilities (Refactor §§6–8)', () => {
  it('declares exactly the six registered types, each with one recovery capability', () => {
    expect(Object.keys(SECTION_CAPABILITIES).sort()).toEqual(
      ['markdown', 'progress', 'recent-activity', 'reflections', 'task-list', 'timeline'],
    );
    expect(SECTION_CAPABILITIES).toEqual({
      'task-list': { ownedData: 'tasks', recovery: 'owned-content' },
      reflections: { ownedData: 'reflections', recovery: 'owned-content' },
      markdown: { recovery: 'config', proseKey: 'markdown' },
      progress: { recovery: 'none' },
      timeline: { recovery: 'none' },
      'recent-activity': { recovery: 'none' },
    });
    for (const capability of Object.values(SECTION_CAPABILITIES)) {
      expect(SectionCapabilitySchema.parse(capability)).toEqual(capability);
    }
  });

  it('markdown is config prose keyed by markdown', () => {
    expect(sectionCapabilityOf('markdown')).toEqual({ recovery: 'config', proseKey: 'markdown' });
    expect(sectionKindOf('markdown')).toBe('view');
    expect(ownedKindOf('markdown')).toBeUndefined();
    expect(displayNameOf('markdown')).toBe('Markdown');
  });

  it('proseKey is present exactly for config recovery', () => {
    expect(SectionCapabilitySchema.parse({ recovery: 'config', proseKey: 'markdown' }))
      .toEqual({ recovery: 'config', proseKey: 'markdown' });
    expect(SectionCapabilitySchema.safeParse({ recovery: 'config' }).success).toBe(false);
    expect(SectionCapabilitySchema.safeParse({ recovery: 'config', proseKey: '' }).success).toBe(false);
    expect(SectionCapabilitySchema.safeParse({ recovery: 'none', proseKey: 'markdown' }).success).toBe(false);
    expect(SectionCapabilitySchema.safeParse({ ownedData: 'tasks', recovery: 'owned-content', proseKey: 'markdown' }).success).toBe(false);
  });

  it('refuses a capability whose owned data and recovery disagree', () => {
    expect(SectionCapabilitySchema.safeParse({ recovery: 'owned-content' }).success).toBe(false);
    expect(SectionCapabilitySchema.safeParse({ ownedData: 'tasks', recovery: 'none' }).success).toBe(false);
    expect(SectionCapabilitySchema.safeParse({ ownedData: 'tasks' }).success).toBe(false);
    expect(SectionCapabilitySchema.safeParse({ recovery: 'deletable' }).success).toBe(false);
  });

  it('derives the ownership map from the capabilities, so the two cannot drift', () => {
    expect(SECTION_OWNERSHIP).toEqual({ 'task-list': 'tasks', reflections: 'reflections' });
  });

  it('answers undefined — unknown, never disposable — for an unregistered, retired or inherited type', () => {
    for (const type of ['something-nobody-registered', 'rich-text', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(sectionCapabilityOf(type)).toBeUndefined();
      expect(ownedKindOf(type)).toBeUndefined();
      expect(sectionKindOf(type)).toBe('view');
    }
  });
});

describe('section configs validated by type (Slice 64)', () => {
  it('declares a schema for markdown only, a capability-declared type', () => {
    expect(Object.keys(SECTION_CONFIG_SCHEMAS)).toEqual(['markdown']);
    expect(Object.hasOwn(SECTION_CAPABILITIES, 'markdown')).toBe(true);
  });

  it('accepts an empty config and exactly { markdown: string } for markdown', () => {
    expect(sectionConfigRefusal('markdown', {})).toBeUndefined();
    expect(sectionConfigRefusal('markdown', { markdown: '' })).toBeUndefined();
    expect(sectionConfigRefusal('markdown', { markdown: '# Notes' })).toBeUndefined();
    expect(MarkdownConfigSchema.parse({ markdown: 'x' })).toEqual({ markdown: 'x' });
  });

  it('names every key markdown does not take', () => {
    expect(sectionConfigRefusal('markdown', { markdown: 'x', summary: 'y', tone: 'calm' })).toBe(
      'A Markdown section’s config takes only "markdown", or nothing; it does not take "summary", "tone".',
    );
  });

  it('names a markdown value that is not a string, and one that is missing', () => {
    expect(sectionConfigRefusal('markdown', { markdown: 5 })).toBe(
      'A Markdown section’s config takes only "markdown", or nothing; "markdown" must be a string.',
    );
    expect(sectionConfigRefusal('markdown', { text: 'x' })).toBe(
      'A Markdown section’s config takes only "markdown", or nothing; "markdown" must be a string; it does not take "text".',
    );
  });

  it('checks nothing for a type that declares no schema, unregistered or inherited', () => {
    for (const type of ['progress', 'task-list', 'calendar', 'toString', 'constructor', '__proto__']) {
      expect(sectionConfigRefusal(type, { anything: ['goes'] })).toBeUndefined();
    }
  });
});

describe('retired section types (Slice 63)', () => {
  it('sub-projects is retired with a workstream replacement (Slice 66)', () => {
    expect(RETIRED_SECTION_TYPES).toEqual({
      'rich-text': 'add a Markdown section instead',
      'sub-projects': 'create a workstream under the project instead',
    });
    expect(Object.isFrozen(RETIRED_SECTION_TYPES)).toBe(true);
    expect(isRetiredSectionType('sub-projects')).toBe(true);
    expect(sectionCapabilityOf('sub-projects')).toBeUndefined();
    expect(retiredSectionReplacement('sub-projects')).toBe('create a workstream under the project instead');
    expect(retiredSectionReplacement('rich-text')).toBe('add a Markdown section instead');
    expect(retiredSectionReplacement('toString')).toBeUndefined();
  });

  it('retires Rich Text and Sub-Projects, which no capability declares any more', () => {
    expect(Object.keys(RETIRED_SECTION_TYPES)).toEqual(['rich-text', 'sub-projects']);
    for (const type of Object.keys(RETIRED_SECTION_TYPES)) expect(Object.hasOwn(SECTION_CAPABILITIES, type)).toBe(false);
  });

  it('answers by exact type, never for a registered, unknown or inherited one', () => {
    expect(isRetiredSectionType('rich-text')).toBe(true);
    for (const type of ['markdown', 'task-list', 'something-nobody-registered', 'Rich-Text', 'toString', 'constructor']) {
      expect(isRetiredSectionType(type)).toBe(false);
    }
  });
});

describe('what a section is called', () => {
  it('derives every registered display name, and overrides the one it cannot', () => {
    // The six registered types derive from their kebab types. Retired Sub-Projects keeps
    // its display-name override for refusals; Rich Text still derives its historical name.
    expect(displayNameOf('rich-text')).toBe('Rich Text');
    expect(displayNameOf('markdown')).toBe('Markdown');
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

});

describe('ProjectSectionSchema archivedAt', () => {
  const section = {
    id: 'section-1',
    projectId: 'project-1',
    pageId: 'page-1',
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
      type: 'markdown',
      config: { markdown: 'Measure the hallway shelf' },
      archivedAt: '2026-09-02T06:13:32.422Z',
    });
    expect(parsed.archivedAt).toBe('2026-09-02T06:13:32.422Z');
    // The whole point of archiving a view rather than deleting it: the prose survives.
    expect(parsed.config).toEqual({ markdown: 'Measure the hallway shelf' });
  });

  it('parses a section that has never been archived', () => {
    expect(ProjectSectionSchema.parse(section).archivedAt).toBeUndefined();
  });

  it('rejects a date-only archivedAt — it is an instant like the other timestamps', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, archivedAt: '2026-09-02' }).success).toBe(false);
  });
});

