import { ProjectPageSchema, ProjectSchema, type Project, type ProjectPage } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_PAGE_REGISTRY,
  navigablePages,
  resolveProjectPage,
} from './project-page-registry';
import { ICON_NAMES } from '../../shared/components/icon/icon';

const AT = '2026-08-27T16:00:00.000Z';

const project = (id: string, name: string, parentProjectId?: string): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const page = (id: string, projectId: string, kind: ProjectPage['kind'], enabled = true): ProjectPage =>
  ProjectPageSchema.parse({ id, projectId, kind, enabled, createdAt: AT, updatedAt: AT });

const ROOT = project('project-root', 'Root');
const CHILD = project('project-child', 'Child', ROOT.id);

describe('project page registry (§26, §68)', () => {
  it.each(['missing', 'disabled', 'enabled'])('renders a root Archive with a %s record', (state) => {
    const archive = page('page-archive', ROOT.id, 'archive', state === 'enabled');
    expect(resolveProjectPage({ project: ROOT,
      ownPages: state === 'missing' ? [] : [archive], requestedKind: 'archive' }))
      .toMatchObject({ outcome: 'render', kind: 'archive', pageId: state === 'missing' ? null : archive.id });
  });

  it('still redirects a workstream Archive URL to its canvas', () => {
    expect(resolveProjectPage({ project: CHILD, ownPages: [], requestedKind: 'archive' }))
      .toMatchObject({ outcome: 'redirect', to: ['/projects', CHILD.id] });
  });
  // Slice 72 (L2-013, W1-012): page kinds take marks from the shared SVG set.
  it('gives each page kind its own mark from the shared icon set', () => {
    expect(PROJECT_PAGE_REGISTRY.map(({ kind, icon }) => [kind, icon])).toEqual([
      ['home', 'home'], ['todos', 'todos'], ['archive', 'archive'], ['reflections', 'reflections'],
    ]);
    for (const { icon } of PROJECT_PAGE_REGISTRY) expect(ICON_NAMES as readonly string[]).toContain(icon);
  });

  it('advertises only enabled, renderable root pages in navigation order', () => {
    const pages = [
      page('page-reflections', ROOT.id, 'reflections'),
      page('page-home', ROOT.id, 'home'),
      page('page-todos', ROOT.id, 'todos', false),
    ];

    expect(navigablePages(pages).map(({ kind }) => kind)).toEqual(['home', 'reflections']);
    expect(PROJECT_PAGE_REGISTRY.map(({ kind }) => kind)).toEqual(['home', 'todos', 'archive', 'reflections']);
  });

  it('carries the exact disabled optional kind through the Home fallback', () => {
    const resolution = resolveProjectPage({
      project: ROOT,
      ownPages: [page('page-home', ROOT.id, 'home'), page('page-todos', ROOT.id, 'todos', false)],
      requestedKind: 'todos',
    });

    expect(resolution).toMatchObject({
      outcome: 'redirect',
      to: ['/projects', ROOT.id, 'pages', 'home'],
      enableKind: 'todos',
    });
  });

  it.each([
    ['unknown', 'nonsense'],
    ['work', 'work'],
  ])('does not offer an enable action for %s fallbacks', (_label, requestedKind) => {
    const resolution = resolveProjectPage({
      project: ROOT,
      ownPages: [page('page-home', ROOT.id, 'home')],
      requestedKind,
    });

    expect(resolution.outcome).toBe('redirect');
    expect('enableKind' in resolution).toBe(false);
  });

  it('does not offer an enable action when the required Home page is unavailable', () => {
    const resolution = resolveProjectPage({
      project: ROOT,
      ownPages: [page('page-home', ROOT.id, 'home', false)],
      requestedKind: 'home',
    });

    expect(resolution.outcome).toBe('unavailable');
    expect('enableKind' in resolution).toBe(false);
  });

  it('keeps a subproject on its work canvas and never offers a page toggle', () => {
    const resolution = resolveProjectPage({
      project: CHILD,
      ownPages: [page('page-work', CHILD.id, 'work')],
      requestedKind: 'todos',
    });

    expect(resolution).toMatchObject({
      outcome: 'redirect', to: ['/projects', CHILD.id],
      reason: '“Child” is a workstream with a single canvas, so it has no pages.',
    });
    expect('enableKind' in resolution).toBe(false);
  });

  it('names a workstream when its canonical canvas is unavailable', () => {
    expect(resolveProjectPage({ project: CHILD, ownPages: [], requestedKind: null })).toEqual({
      outcome: 'unavailable', reason: 'This workstream has no canvas to show.',
    });
  });
});
