import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectPageSchema, ProjectSchema, type Project } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { ProjectPageNavigation } from './project-page-navigation';
import { PROJECT_PAGE_REGISTRY, navigablePages } from './project-page-registry';
import type { WorkTreeNode } from './project-workspace-store';

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

const ROOT = project('project-renovation', 'Home renovation');
const KITCHEN = project('project-kitchen', 'Kitchen', 'project-renovation');
const CABINETS = project('project-cabinets', 'Cabinets', 'project-kitchen');

const tree: WorkTreeNode[] = [
  {
    project: KITCHEN,
    children: [{ project: CABINETS, children: [] }],
  },
  { project: project('project-garden', 'Garden', 'project-renovation'), children: [] },
];

const render = async (
  options: {
    pages?: typeof PROJECT_PAGE_REGISTRY;
    workTree?: WorkTreeNode[];
    currentProjectId?: string;
    activeKind?: 'home' | null;
    breadcrumbs?: Project[];
    collapsed?: boolean;
  } = {},
) => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProjectPageNavigation);
  fixture.componentRef.setInput('root', ROOT);
  fixture.componentRef.setInput('pages', options.pages ?? [...PROJECT_PAGE_REGISTRY]);
  fixture.componentRef.setInput('workTree', options.workTree ?? tree);
  fixture.componentRef.setInput('currentProjectId', options.currentProjectId ?? ROOT.id);
  // `?? 'home'` would swallow the `null` a sub-project renders with.
  fixture.componentRef.setInput('activeKind', 'activeKind' in options ? options.activeKind : 'home');
  fixture.componentRef.setInput('breadcrumbs', options.breadcrumbs ?? []);
  fixture.componentRef.setInput('collapsed', options.collapsed ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: Awaited<ReturnType<typeof render>>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

const queryAll = (fixture: Awaited<ReturnType<typeof render>>, selector: string) =>
  [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];

describe('ProjectPageNavigation (§23)', () => {
  it('lists the root’s pages, then the work hierarchy beneath it', async () => {
    const fixture = await render();

    expect(queryAll(fixture, '[data-project-page-tab]').map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['🏠 Home']);
    // Recursive, not one level: the `nested-projects` seed is three deep counting the root.
    expect(queryAll(fixture, '[data-work-project]').map((link) => link.querySelector('.name')?.textContent))
      .toEqual(['Kitchen', 'Cabinets', 'Garden']);
  });

  // The rule the roadmap asks for: a page the root enabled but this build cannot draw is not
  // advertised. `navigablePages` is the filter, and the column renders what it is handed.
  it('advertises no page kind without a renderer, even when the root enabled it', async () => {
    // Parsed rather than cast, so the fixture cannot outlive the contract's shape.
    const enabled = ['home', 'todos'].map((kind) =>
      ProjectPageSchema.parse({
        id: `page-${kind}`,
        projectId: ROOT.id,
        kind,
        enabled: true,
        createdAt: AT,
        updatedAt: AT,
      }),
    );

    const fixture = await render({ pages: navigablePages(enabled) });

    expect(queryAll(fixture, '[data-project-page-tab]').map((tab) => tab.dataset['pageKind']))
      .toEqual(['home']);
  });

  it('marks the open page with aria-current, and nothing else', async () => {
    const fixture = await render();

    const current = queryAll(fixture, '[data-project-page-tab]').filter(
      (tab) => tab.getAttribute('aria-current') === 'page',
    );
    expect(current.map((tab) => tab.dataset['pageKind'])).toEqual(['home']);
  });

  // §26: a sub-project's work canvas is not one of the root's tabs, so no tab is current.
  it('marks the open unit of work, and no page tab, on a sub-project', async () => {
    const fixture = await render({ currentProjectId: CABINETS.id, activeKind: null });

    expect(queryAll(fixture, '[data-project-page-tab][aria-current="page"]')).toHaveLength(0);
    expect(query(fixture, '[data-work-project-id="project-cabinets"] [aria-current="page"]'))
      .not.toBeNull();
  });

  it('walks a depth-three sub-project back to its root with breadcrumbs', async () => {
    const fixture = await render({
      currentProjectId: CABINETS.id,
      activeKind: null,
      breadcrumbs: [ROOT, KITCHEN],
    });

    expect(queryAll(fixture, '[data-project-breadcrumb]').map((link) => link.textContent?.trim()))
      .toEqual(['Home renovation', 'Kitchen']);
  });

  it('says so rather than rendering an empty list when a root has no work yet', async () => {
    const fixture = await render({ workTree: [] });

    expect(query(fixture, '[data-work-empty]')?.textContent).toContain('No sub-projects yet');
  });

  // §23: at narrow widths the column "collapses behind a labelled control rather than
  // disappearing". `hidden` rather than an `@if`, so the links leave the tab order.
  it('collapses behind a labelled button that stays reachable, and restores', async () => {
    const collapsed = await render({ collapsed: true });

    const toggle = query(collapsed, '[data-project-nav-toggle]') as HTMLButtonElement;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.textContent).toContain('Show project navigation');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // The control cannot collapse with what it collapses, or nothing could bring it back.
    expect(toggle.closest('[hidden]')).toBeNull();
    expect(query(collapsed, '#project-nav-panel')?.hasAttribute('hidden')).toBe(true);

    let toggles = 0;
    collapsed.componentInstance.toggleRequested.subscribe(() => (toggles += 1));
    toggle.click();
    expect(toggles).toBe(1);

    const open = await render({ collapsed: false });
    expect(query(open, '[data-project-nav-toggle]')?.getAttribute('aria-expanded')).toBe('true');
    expect(query(open, '#project-nav-panel')?.hasAttribute('hidden')).toBe(false);
  });
});
