import { PrototypeDocumentSchema, type ProjectPage } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { resolveUndoDestination } from './section-removal-undo';

const AT = '2026-09-14T10:00:00.000Z';

const page = (id: string, kind: ProjectPage['kind'], enabled = true): ProjectPage =>
  PrototypeDocumentSchema.shape.projectPages.element.parse({ id, projectId: 'project-1', kind, enabled, createdAt: AT, updatedAt: AT });

const shortcutTo = (sourceSectionId: string) =>
  PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
    id: 'shortcut-1',
    pageId: 'page-home',
    sourceSectionId,
    position: 0,
    columnSpan: 12,
    collapsed: false,
    createdAt: AT,
    updatedAt: AT,
  });

/**
 * Hand-built inputs, because a valid version-3 document cannot lose a retained section's page:
 * pages have no `remove`, and integrity rejects a section on a missing one. The fallback becomes
 * reachable end to end only once a later slice recreates deleted sections.
 */
describe('resolveUndoDestination', () => {
  const section = { id: 'section-1', type: 'task-list' } as never;

  it('returns the original page whenever it exists, even disabled', () => {
    const reflections = page('page-reflections', 'reflections', false);
    expect(
      resolveUndoDestination({ originalPage: reflections, canonicalPage: page('page-home', 'home'), section, shortcutsOnCanonicalPage: [] }),
    ).toEqual({ kind: 'original', page: reflections });
  });

  it('falls back to the canonical page when the original is missing and the page takes the type', () => {
    const home = page('page-home', 'home');
    expect(
      resolveUndoDestination({ originalPage: null, canonicalPage: home, section, shortcutsOnCanonicalPage: [shortcutTo('section-other')] }),
    ).toEqual({ kind: 'fallback', page: home });
  });

  it('refuses when the canonical page holds a shortcut to the section', () => {
    expect(
      resolveUndoDestination({
        originalPage: null,
        canonicalPage: page('page-home', 'home'),
        section,
        shortcutsOnCanonicalPage: [shortcutTo('section-1')],
      }),
    ).toEqual({ kind: 'unavailable', problem: 'shortcut-on-fallback-page' });
  });

  it('refuses when there is no canonical page that takes the type', () => {
    // A task list cannot sit on a Reflections page; standing in for any incompatible canonical page.
    expect(
      resolveUndoDestination({ originalPage: null, canonicalPage: page('page-r', 'reflections'), section, shortcutsOnCanonicalPage: [] }),
    ).toEqual({ kind: 'unavailable', problem: 'no-compatible-page' });
    expect(
      resolveUndoDestination({ originalPage: null, canonicalPage: undefined, section, shortcutsOnCanonicalPage: [] }),
    ).toEqual({ kind: 'unavailable', problem: 'no-compatible-page' });
  });
});
