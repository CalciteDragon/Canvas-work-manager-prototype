import { describe, expect, it } from 'vitest';
import {
  ShortcutAddOperationSchema,
  ShortcutAddRedoResultSchema,
  ShortcutAddUndoResultSchema,
  ShortcutMoveOperationSchema,
  ShortcutMoveUndoResultSchema,
  ShortcutRemoveOperationSchema,
  ShortcutRemoveUndoResultSchema,
  ShortcutUpdateOperationSchema,
  ShortcutUpdateRedoResultSchema,
} from './shortcut-history';
import { RedoResultSchema, UndoOperationSchema, UndoResultSchema } from './undo';

const shortcut = {
  id: 'shortcut-1',
  pageId: 'page-home',
  sourceSectionId: 'section-9',
  position: 1,
  columnSpan: 6,
  collapsed: false,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
};

const placement = { pageId: 'page-home', previous: { kind: 'section', id: 'section-1' }, index: 1 };

const add = (over: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'shortcut.add',
  projectId: 'project-root',
  shortcut,
  placement,
  ...over,
});

const update = (over: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'shortcut.update',
  shortcutId: 'shortcut-1',
  projectId: 'project-root',
  pageId: 'page-home',
  changes: [{ field: 'columnSpan', before: 12, after: 6 }],
  ...over,
});

const move = (over: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'shortcut.move',
  shortcutId: 'shortcut-1',
  projectId: 'project-root',
  pageId: 'page-home',
  placementBefore: { pageId: 'page-home', next: { kind: 'section', id: 'section-1' }, index: 0 },
  placementAfter: placement,
  ...over,
});

describe('shortcut operation payloads', () => {
  it('capture the canonical placement and the destination project that owns the history', () => {
    const parsed = ShortcutAddOperationSchema.parse(add());
    expect(parsed.projectId).toBe('project-root');
    expect(parsed.shortcut.sourceSectionId).toBe('section-9');
    expect(ShortcutRemoveOperationSchema.parse({ ...add(), type: 'shortcut.remove' }).shortcut.id).toBe('shortcut-1');
  });

  it('hold no snapshot of the source section’s content', () => {
    expect(Object.keys(ShortcutAddOperationSchema.parse(add()).shortcut)).not.toContain('source');
    expect(ShortcutAddOperationSchema.safeParse(add({ source: { id: 'section-9' } })).success).toBe(false);
  });

  it('reject an unknown version and a placement on another page than the placement’s own', () => {
    expect(ShortcutAddOperationSchema.safeParse(add({ version: 2 })).success).toBe(false);
    expect(
      ShortcutAddOperationSchema.safeParse(add({ placement: { pageId: 'page-work', index: 0 } })).success,
    ).toBe(false);
  });

  it('reject a placement that names the subject as its own neighbour', () => {
    expect(
      ShortcutAddOperationSchema.safeParse(
        add({ placement: { pageId: 'page-home', previous: { kind: 'shortcut', id: 'shortcut-1' }, index: 1 } }),
      ).success,
    ).toBe(false);
    expect(
      ShortcutMoveOperationSchema.safeParse(
        move({ placementAfter: { pageId: 'page-home', next: { kind: 'shortcut', id: 'shortcut-1' }, index: 1 } }),
      ).success,
    ).toBe(false);
  });

  it('record each changed presentation field once, and only fields that actually changed', () => {
    expect(ShortcutUpdateOperationSchema.parse(update()).changes).toHaveLength(1);
    expect(
      ShortcutUpdateOperationSchema.safeParse(
        update({ changes: [{ field: 'collapsed', before: true, after: true }] }),
      ).success,
    ).toBe(false);
    expect(
      ShortcutUpdateOperationSchema.safeParse({
        ...update(),
        changes: [
          { field: 'collapsed', before: false, after: true },
          { field: 'collapsed', before: true, after: false },
        ],
      }).success,
    ).toBe(false);
    expect(ShortcutUpdateOperationSchema.safeParse(update({ changes: [] })).success).toBe(false);
  });

  it('reject a move whose two placements are not both on the subject’s page', () => {
    expect(
      ShortcutMoveOperationSchema.safeParse(move({ placementBefore: { pageId: 'page-work', index: 0 } })).success,
    ).toBe(false);
  });

  it('all join the operation union', () => {
    expect(UndoOperationSchema.parse(add()).type).toBe('shortcut.add');
    expect(UndoOperationSchema.parse({ ...add(), type: 'shortcut.remove' }).type).toBe('shortcut.remove');
    expect(UndoOperationSchema.parse(update()).type).toBe('shortcut.update');
    expect(UndoOperationSchema.parse(move()).type).toBe('shortcut.move');
  });
});

describe('shortcut transition results', () => {
  it('name the destination and omit the placement record when nothing remains', () => {
    const result = ShortcutAddUndoResultSchema.parse({
      operation: 'shortcut.add',
      outcome: 'removed',
      shortcutId: 'shortcut-1',
      projectId: 'project-root',
      pageId: 'page-home',
    });
    expect(result).not.toHaveProperty('shortcut');
    expect(UndoResultSchema.parse(result).operation).toBe('shortcut.add');
  });

  it('carry the recreated placement and the rule that placed it', () => {
    const result = ShortcutAddRedoResultSchema.parse({
      operation: 'shortcut.add',
      outcome: 'reapplied',
      shortcutId: 'shortcut-1',
      projectId: 'project-root',
      pageId: 'page-home',
      shortcut,
      placement: { pageId: 'page-home', index: 1, strategy: 'previous', pageEnabled: true },
    });
    expect(result.placement.strategy).toBe('previous');
    expect(RedoResultSchema.parse(result).operation).toBe('shortcut.add');
  });

  it('report a lost location as partial on a recreation and a move', () => {
    expect(
      ShortcutRemoveUndoResultSchema.parse({
        operation: 'shortcut.remove',
        outcome: 'partial',
        shortcutId: 'shortcut-1',
        projectId: 'project-root',
        pageId: 'page-home',
        shortcut,
        placement: { pageId: 'page-home', index: 0, strategy: 'index', pageEnabled: true },
      }).outcome,
    ).toBe('partial');
    expect(
      ShortcutMoveUndoResultSchema.safeParse({
        operation: 'shortcut.move',
        outcome: 'removed',
        shortcutId: 'shortcut-1',
        projectId: 'project-root',
        pageId: 'page-home',
        shortcut,
        placement: { pageId: 'page-home', index: 0, strategy: 'index', pageEnabled: true },
      }).success,
    ).toBe(false);
  });

  it('return the placement record for a presentation change, with no source content', () => {
    const result = ShortcutUpdateRedoResultSchema.parse({
      operation: 'shortcut.update',
      outcome: 'reapplied',
      shortcutId: 'shortcut-1',
      projectId: 'project-root',
      pageId: 'page-home',
      shortcut,
    });
    expect(result.shortcut.columnSpan).toBe(6);
    expect(result.shortcut).not.toHaveProperty('source');
  });
});
