import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_PAGE_KINDS,
  PageAddOperationSchema,
  PageAddRedoResultSchema,
  PageAddUndoResultSchema,
  PageUndoOperationSchema,
  PageUpdateOperationSchema,
  PageUpdateRedoResultSchema,
  PageUpdateUndoResultSchema,
  isOptionalPageKind,
} from './page-history';
import { RedoResultSchema, UndoOperationSchema, UndoResultSchema, operationProjectOf, operationSubjectOf } from './undo';

const AT = '2026-09-21T10:00:00.000Z';
const LATER = '2026-09-21T11:00:00.000Z';

const page = (overrides: Record<string, unknown> = {}) => ({
  id: 'page-reflections',
  projectId: 'project-root',
  kind: 'reflections',
  enabled: true,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
});

const add = (overrides: Record<string, unknown> = {}) => ({ version: 1, type: 'page.add', page: page(overrides) });

const update = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'page.update',
  projectId: 'project-root',
  pageId: 'page-reflections',
  kind: 'reflections',
  before: true,
  after: false,
  ...overrides,
});

describe('page.add payloads (§§26, 31)', () => {
  it('accept every optional kind, with the record Redo recreates', () => {
    for (const kind of OPTIONAL_PAGE_KINDS) {
      const parsed = PageAddOperationSchema.parse(add({ kind, id: `page-${kind}` }));
      expect(parsed.page.kind).toBe(kind);
      expect(parsed.page.createdAt).toBe(AT);
    }
  });

  it('reject the structural pages no toggle can create', () => {
    expect(PageAddOperationSchema.safeParse(add({ kind: 'home' })).success).toBe(false);
    expect(PageAddOperationSchema.safeParse(add({ kind: 'work' })).success).toBe(false);
  });

  it('reject a created page that is not enabled, which is what creating it meant', () => {
    expect(PageAddOperationSchema.safeParse(add({ enabled: false })).success).toBe(false);
  });

  it('reject an unknown version, an unknown key and a missing record', () => {
    expect(PageAddOperationSchema.safeParse({ ...add(), version: 2 }).success).toBe(false);
    expect(PageAddOperationSchema.safeParse({ ...add(), pageId: 'page-reflections' }).success).toBe(false);
    expect(PageAddOperationSchema.safeParse({ version: 1, type: 'page.add' }).success).toBe(false);
  });
});

describe('page.update payloads (§§26, 31)', () => {
  it('capture the owning root, the subject and both distinct booleans', () => {
    const parsed = PageUpdateOperationSchema.parse(update());
    expect([parsed.projectId, parsed.pageId, parsed.before, parsed.after]).toEqual([
      'project-root',
      'page-reflections',
      true,
      false,
    ]);
  });

  it('treat the kind as optional evidence rather than identity', () => {
    const parsed = PageUpdateOperationSchema.parse({ ...update(), kind: undefined });
    expect(parsed.kind).toBeUndefined();
    expect(PageUpdateOperationSchema.safeParse(update({ kind: 'home' })).success).toBe(false);
    expect(PageUpdateOperationSchema.safeParse(update({ kind: 'work' })).success).toBe(false);
  });

  it('reject an unchanged boolean, which is a toggle that recorded nothing', () => {
    expect(PageUpdateOperationSchema.safeParse(update({ before: true, after: true })).success).toBe(false);
    expect(PageUpdateOperationSchema.safeParse(update({ before: false, after: false })).success).toBe(false);
  });

  it('reject arbitrary fields, an unknown version and a page record smuggled in', () => {
    expect(PageUpdateOperationSchema.safeParse({ ...update(), version: 2 }).success).toBe(false);
    expect(PageUpdateOperationSchema.safeParse({ ...update(), enabled: false }).success).toBe(false);
    expect(PageUpdateOperationSchema.safeParse({ ...update(), page: page() }).success).toBe(false);
  });
});

describe('the page operation union', () => {
  it('discriminates both members and rejects an unknown page operation', () => {
    expect(PageUndoOperationSchema.parse(add()).type).toBe('page.add');
    expect(PageUndoOperationSchema.parse(update()).type).toBe('page.update');
    expect(PageUndoOperationSchema.safeParse({ version: 1, type: 'page.remove', pageId: 'page-1' }).success).toBe(false);
  });

  it('is part of the one operation union a stored action holds', () => {
    expect(UndoOperationSchema.parse(add()).type).toBe('page.add');
    expect(UndoOperationSchema.parse(update()).type).toBe('page.update');
  });

  it('answers the owning root and the subject for both members', () => {
    expect(operationProjectOf(UndoOperationSchema.parse(add()))).toBe('project-root');
    expect(operationProjectOf(UndoOperationSchema.parse(update()))).toBe('project-root');
    expect(operationSubjectOf(UndoOperationSchema.parse(add()))).toBe('page-reflections');
    expect(operationSubjectOf(UndoOperationSchema.parse(update()))).toBe('page-reflections');
  });

  it('names the optional kinds and nothing else', () => {
    expect(isOptionalPageKind('reflections')).toBe(true);
    expect(isOptionalPageKind('home')).toBe(false);
    expect(isOptionalPageKind('work')).toBe(false);
  });
});

describe('page transition results', () => {
  const subject = { projectId: 'project-root', pageId: 'page-reflections', kind: 'reflections' } as const;

  it('report an absent page on Undo of a first enable', () => {
    const parsed = PageAddUndoResultSchema.parse({ ...subject, operation: 'page.add', outcome: 'removed' });
    expect('page' in parsed).toBe(false);
    expect(UndoResultSchema.parse({ ...subject, operation: 'page.add', outcome: 'removed' }).outcome).toBe('removed');
  });

  it('report the recreated record on Redo of a first enable', () => {
    const result = { ...subject, operation: 'page.add', outcome: 'reapplied', page: page({ updatedAt: LATER }) };
    expect(PageAddRedoResultSchema.parse(result).page.id).toBe('page-reflections');
    expect(RedoResultSchema.parse(result).operation).toBe('page.add');
    expect(PageAddRedoResultSchema.safeParse({ ...subject, operation: 'page.add', outcome: 'reapplied' }).success).toBe(false);
  });

  it('report the page in either direction of a boolean change', () => {
    const undone = { ...subject, operation: 'page.update', outcome: 'restored', page: page({ enabled: true, updatedAt: LATER }) };
    const redone = { ...subject, operation: 'page.update', outcome: 'reapplied', page: page({ enabled: false, updatedAt: LATER }) };
    expect(PageUpdateUndoResultSchema.parse(undone).page.enabled).toBe(true);
    expect(PageUpdateRedoResultSchema.parse(redone).page.enabled).toBe(false);
    expect(UndoResultSchema.parse(undone).operation).toBe('page.update');
    expect(RedoResultSchema.parse(redone).operation).toBe('page.update');
  });

  it('refuse an outcome from the other direction', () => {
    expect(PageAddUndoResultSchema.safeParse({ ...subject, operation: 'page.add', outcome: 'reapplied' }).success).toBe(false);
    expect(
      PageUpdateRedoResultSchema.safeParse({ ...subject, operation: 'page.update', outcome: 'restored', page: page() }).success,
    ).toBe(false);
  });

  it('refuse a structural kind in a result the caller would reconcile navigation from', () => {
    expect(
      PageAddUndoResultSchema.safeParse({ ...subject, kind: 'home', operation: 'page.add', outcome: 'removed' }).success,
    ).toBe(false);
  });
});
