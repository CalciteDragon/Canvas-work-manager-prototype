import { describe, expect, it } from 'vitest';
import {
  ResolvedSectionShortcutSchema,
  SectionShortcutSchema,
  ShortcutSourceSchema,
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
