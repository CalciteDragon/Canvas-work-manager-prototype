import { describe, expect, it } from 'vitest';
import {
  NAVIGABLE_PAGE_KINDS,
  ProjectPageKindSchema,
  ProjectPageSchema,
  canonicalPageKindFor,
  isNavigablePageKind,
  pageAcceptsSections,
} from './project-page';

const page = {
  id: 'page-a',
  projectId: 'project-a',
  kind: 'home',
  enabled: true,
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('ProjectPageSchema', () => {
  it('accepts a root’s home page', () => {
    expect(ProjectPageSchema.parse(page)).toMatchObject({ kind: 'home', enabled: true });
  });

  it('accepts a sub-project’s work canvas', () => {
    expect(ProjectPageSchema.parse({ ...page, kind: 'work' }).kind).toBe('work');
  });

  it('rejects a kind outside §26’s list', () => {
    expect(ProjectPageSchema.safeParse({ ...page, kind: 'calendar' }).success).toBe(false);
  });
});

describe('page capabilities', () => {
  /**
   * §30's table. The capability lives here rather than in the Angular registry because the
   * repository's integrity rules and the domain's create path both need the same answer, and
   * neither can import from `apps/web`.
   */
  it('lets home and work hold sections, and derived pages hold none', () => {
    expect(pageAcceptsSections('home')).toBe(true);
    expect(pageAcceptsSections('work')).toBe(true);
    expect(pageAcceptsSections('reflections')).toBe(true);
    expect(pageAcceptsSections('todos')).toBe(false);
    expect(pageAcceptsSections('archive')).toBe(false);
  });

  it('follows the owner kind to its canonical page', () => {
    expect(canonicalPageKindFor('root')).toBe('home');
    expect(canonicalPageKindFor('subproject')).toBe('work');
  });

  /**
   * The distinction §26 rests on: `work` is a page *record*, so every section names a page,
   * but it is not a tab — it cannot be added, disabled or navigated to. Only a root has tabs.
   */
  it('counts only the four root kinds as navigation', () => {
    expect(NAVIGABLE_PAGE_KINDS).toEqual(['home', 'todos', 'archive', 'reflections']);
    expect(isNavigablePageKind('work')).toBe(false);
    expect(ProjectPageKindSchema.options).toEqual(['home', 'work', 'todos', 'archive', 'reflections']);
  });
});
