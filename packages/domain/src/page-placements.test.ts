import { PlacementSnapshotSchema, PrototypeDocumentSchema, type PlacementSnapshot } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { resolveRestoreIndex, snapshotPlacement, type PagePlacement } from './page-placements';

const AT = '2026-09-14T10:00:00.000Z';

const section = (id: string, position: number, pageId = 'page-home'): PagePlacement => ({
  kind: 'section',
  value: PrototypeDocumentSchema.shape.sections.element.parse({
    id,
    projectId: 'project-1',
    pageId,
    type: 'rich-text',
    position,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
  }),
});

const shortcut = (id: string, position: number): PagePlacement => ({
  kind: 'shortcut',
  value: PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
    id,
    pageId: 'page-home',
    sourceSectionId: 'section-elsewhere',
    position,
    columnSpan: 12,
    collapsed: false,
    createdAt: AT,
    updatedAt: AT,
  }),
});

/** section-a, shortcut-b, section-c, section-d — a Home mixing both kinds. */
const page = () => [section('section-a', 0), shortcut('shortcut-b', 1), section('section-c', 2), section('section-d', 3)];

describe('snapshotPlacement', () => {
  it('records both neighbours and the index for a middle placement, across kinds', () => {
    expect(snapshotPlacement(page(), { kind: 'section', id: 'section-c' })).toEqual({
      pageId: 'page-home',
      previous: { kind: 'shortcut', id: 'shortcut-b' },
      next: { kind: 'section', id: 'section-d' },
      index: 2,
    });
  });

  it('has no previous neighbour for the first placement and no next for the last', () => {
    expect(snapshotPlacement(page(), { kind: 'section', id: 'section-a' })).toEqual({
      pageId: 'page-home',
      next: { kind: 'shortcut', id: 'shortcut-b' },
      index: 0,
    });
    expect(snapshotPlacement(page(), { kind: 'section', id: 'section-d' })).toEqual({
      pageId: 'page-home',
      previous: { kind: 'section', id: 'section-c' },
      index: 3,
    });
  });

  it('has no neighbours for the sole placement', () => {
    expect(snapshotPlacement([section('section-a', 0)], { kind: 'section', id: 'section-a' })).toEqual({
      pageId: 'page-home',
      index: 0,
    });
  });

  it('refuses a subject that is not in the order', () => {
    expect(() => snapshotPlacement(page(), { kind: 'section', id: 'section-z' })).toThrow(TypeError);
  });
});

describe('resolveRestoreIndex', () => {
  const snapshot: PlacementSnapshot = PlacementSnapshotSchema.parse({
    pageId: 'page-home',
    previous: { kind: 'shortcut', id: 'shortcut-b' },
    next: { kind: 'section', id: 'section-d' },
    index: 2,
  });
  /** The page after section-c was removed. */
  const after = () => [section('section-a', 0), shortcut('shortcut-b', 1), section('section-d', 2)];

  it('inserts after the surviving previous neighbour', () => {
    expect(resolveRestoreIndex(snapshot, after())).toEqual({ index: 2, strategy: 'previous' });
  });

  it('follows the previous neighbour when something was inserted before it', () => {
    const current = [section('section-new', 0), ...after()];
    expect(resolveRestoreIndex(snapshot, current)).toEqual({ index: 3, strategy: 'previous' });
  });

  it('inserts before the next neighbour when the previous is gone', () => {
    const current = [section('section-a', 0), section('section-d', 1)];
    expect(resolveRestoreIndex(snapshot, current)).toEqual({ index: 1, strategy: 'next' });
  });

  it('clamps the original index when both neighbours are gone', () => {
    expect(resolveRestoreIndex(snapshot, [section('section-a', 0), section('section-x', 1), section('section-y', 2)])).toEqual({
      index: 2,
      strategy: 'index',
    });
    expect(resolveRestoreIndex(snapshot, [section('section-a', 0)])).toEqual({ index: 1, strategy: 'index' });
  });

  it('treats a neighbour of the wrong kind — the same id, a different record — as gone', () => {
    const current = [section('section-a', 0), section('shortcut-b', 1), section('section-d', 2)];
    expect(resolveRestoreIndex(snapshot, current)).toEqual({ index: 2, strategy: 'next' });
  });

  it('restores onto an empty page at index 0', () => {
    expect(resolveRestoreIndex(snapshot, [])).toEqual({ index: 0, strategy: 'index' });
  });
});
