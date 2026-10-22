import { describe, expect, it } from 'vitest';
import {
  ResolvedSectionShortcutSchema,
  SectionShortcutSchema,
  ShortcutSourceSchema,
  shortcutNameOf,
} from './section-shortcut';

const placement = {
  id: 'shortcut-1',
  pageId: 'page-home',
  sourceSectionId: 'section-source',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  createdAt: '2026-08-01T16:00:00.000Z',
  updatedAt: '2026-08-01T16:00:00.000Z',
};

const source = {
  id: 'section-source',
  projectId: 'project-child',
  pageId: 'page-project-child',
  type: 'task-list',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: placement.createdAt,
  updatedAt: placement.updatedAt,
};

describe('§27 shortcut contracts', () => {
  it.each([
    [undefined, 'Garden', 'Markdown (Garden)'],
    ['   ', 'Garden', 'Markdown (Garden)'],
    ['Launch brief', 'Garden', 'Launch brief'],
    [undefined, null, 'Markdown'],
    [undefined, '   ', 'Markdown'],
    [undefined, ' Garden ', 'Markdown (Garden)'],
  ])('names a shortcut with title %j and owner %j as %s', (title, owner, expected) => {
    expect(shortcutNameOf({ type: 'markdown', title }, owner)).toBe(expected);
  });

  it('keeps the persisted record a placement rather than a copy of its source', () => {
    expect(SectionShortcutSchema.parse(placement)).toEqual(placement);
    expect(SectionShortcutSchema.parse({ ...placement, source })).not.toHaveProperty('source');
  });

  it('resolves a placement with source identity, breadcrumbs, and availability', () => {
    expect(
      ResolvedSectionShortcutSchema.parse({
        ...placement,
        source,
        sourceProjectId: 'project-child',
        sourceProjectName: 'Kitchen',
        sourcePageKind: 'work',
        breadcrumb: ['Renovation', 'Kitchen'],
        availability: 'available',
      }),
    ).toMatchObject({ sourceProjectId: 'project-child', availability: 'available' });
  });

  it('describes a picker source without exposing any rows', () => {
    expect(
      ShortcutSourceSchema.parse({
        section: source,
        sourceSectionId: 'section-source',
        type: 'task-list',
        name: 'Tasks',
        projectId: 'project-child',
        projectName: 'Kitchen',
        pageId: 'page-project-child',
        pageKind: 'work',
        breadcrumb: ['Renovation', 'Kitchen'],
        alreadyPlaced: true,
      }),
    ).not.toHaveProperty('tasks');
  });
});

it('requires the canonical section for a picker Preview, never rows (§27)', () => {
  const entry = { sourceSectionId: source.id, type: source.type, name: 'Tasks', projectId: source.projectId, projectName: 'Kitchen', pageId: source.pageId, pageKind: 'work', breadcrumb: ['Renovation', 'Kitchen'], alreadyPlaced: false };
  expect(ShortcutSourceSchema.safeParse(entry).success).toBe(false);
  expect(ShortcutSourceSchema.parse({ ...entry, section: source, tasks: [] })).toHaveProperty('section', { ...source, archiveGeneration: 0 });
  expect(ShortcutSourceSchema.parse({ ...entry, section: source, tasks: [] })).not.toHaveProperty('tasks');
});


