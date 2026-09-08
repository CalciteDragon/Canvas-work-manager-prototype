import { ProjectPageSchema, ProjectSchema, type Project, type ProjectPage } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_PAGE_REGISTRY,
  navigablePages,
  resolveProjectPage,
} from './project-page-registry';

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

    expect(resolution).toMatchObject({ outcome: 'redirect', to: ['/projects', CHILD.id] });
    expect('enableKind' in resolution).toBe(false);
  });
});
