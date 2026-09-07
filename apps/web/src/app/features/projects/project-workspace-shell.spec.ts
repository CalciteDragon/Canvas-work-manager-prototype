import { provideLocationMocks } from '@angular/common/testing';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  ProjectPageSchema,
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type Project,
  type ProjectPage,
  type ProjectSection,
  type Task,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { FakeWorkManagerGateway, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
import { testIdentity } from '../../core/gateway/testing/shell-test-providers';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { routes } from '../../app.routes';
import { ProjectCanvas } from './project-canvas';
import { ProjectWorkspaceShell } from './project-workspace-shell';

const AT = '2026-08-27T16:00:00.000Z';

const project = (
  id: string,
  name: string,
  parentProjectId?: string,
  overrides: Record<string, unknown> = {},
): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const page = (id: string, projectId: string, kind: string, enabled = true): ProjectPage =>
  ProjectPageSchema.parse({ id, projectId, kind, enabled, createdAt: AT, updatedAt: AT });

const section = (id: string, projectId: string, pageId: string, type = 'rich-text'): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId,
    pageId,
    type,
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: type === 'rich-text' ? { text: 'Notes' } : {},
    createdAt: AT,
    updatedAt: AT,
  });

const task = (id: string, projectId: string, status: 'todo' | 'done' = 'todo'): Task =>
  TaskSchema.parse({
    id,
    projectId,
    sectionId: 'section-tasks',
    title: `Task ${id}`,
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

/** `nested-projects` in miniature: renovation → kitchen → cabinets, plus a sibling garden. */
const RENOVATION = project('project-renovation', 'Home renovation');
const KITCHEN = project('project-kitchen', 'Kitchen', 'project-renovation');
const CABINETS = project('project-cabinets', 'Cabinets', 'project-kitchen');
const GARDEN = project('project-garden', 'Garden', 'project-renovation');

const defaults = () => ({
  projects: [RENOVATION, KITCHEN, CABINETS, GARDEN],
  pages: [
    page('page-renovation-home', 'project-renovation', 'home'),
    page('page-kitchen-work', 'project-kitchen', 'work'),
    page('page-cabinets-work', 'project-cabinets', 'work'),
    page('page-garden-work', 'project-garden', 'work'),
  ],
  sections: [
    section('section-home', 'project-renovation', 'page-renovation-home'),
    section('section-kitchen', 'project-kitchen', 'page-kitchen-work'),
  ],
  tasks: [task('task-1', 'project-renovation'), task('task-2', 'project-renovation', 'done')],
});

type Options = Partial<ReturnType<typeof defaults>> & {
  failOn?: Record<string, GatewayError>;
};

const open = async (url: string, options: Options = {}) => {
  const gateway = new FakeWorkManagerGateway({ ...defaults(), ...options });
  // Reset first, so a case that opens two workspaces — a refusal and an acceptance — gets two
  // independent routers rather than "the test module has already been instantiated".
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      // Not optional: `SpyLocation` makes `replaceState`, `back()`, `forward()` and
      // `getState()` synchronous. Without it the Back/Forward cases race jsdom's real
      // history, and the fallback notice cannot be read back at all.
      provideLocationMocks(),
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      // A successful archive navigates to `/app`, and the dashboard there reads the persona.
      { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(testIdentity()) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  // The harness drives navigation itself, so the router never starts listening to history on
  // its own — and without this `back()`/`forward()` move `SpyLocation` and nothing else.
  TestBed.inject(Router).setUpLocationChangeListener();
  const component = await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  return { harness, component, gateway, router: TestBed.inject(Router), location: TestBed.inject(Location) };
};

const settle = async (harness: RouterTestingHarness) => {
  // Four passes rather than two: a fallback redirect is a *second* navigation started from an
  // effect, and history navigation is a third — each needs its own stabilisation.
  for (let pass = 0; pass < 4; pass += 1) {
    // A macrotask as well as the microtask queue: a history navigation is dispatched from
    // `SpyLocation`'s subject and the router's own transition runs after it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }
};

const query = (harness: RouterTestingHarness, selector: string) =>
  harness.fixture.nativeElement.querySelector(selector) as HTMLElement | null;

const queryAll = (harness: RouterTestingHarness, selector: string) =>
  [...harness.fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];

describe('ProjectWorkspaceShell — §23’s two columns and §68’s routes', () => {
  it('renders a root’s column beside its canvas, with Home current', async () => {
    const { harness, component } = await open('/projects/project-renovation/pages/home');

    expect(component).toBeInstanceOf(ProjectWorkspaceShell);
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Home renovation');
    expect(query(harness, '#project-nav-panel')).not.toBeNull();
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
    expect(
      queryAll(harness, '[data-project-page-tab][aria-current="page"]').map((tab) => tab.dataset['pageKind']),
    ).toEqual(['home']);
  });

  // The app's own links — the sidebar, project creation, every Sub-Projects section — use the
  // short form. `routerLinkActive` on the tab's `/pages/home` would not match it.
  it('marks Home current when the user arrived at the short /projects/:id URL', async () => {
    const { harness, router } = await open('/projects/project-renovation');

    expect(router.url).toBe('/projects/project-renovation');
    expect(
      queryAll(harness, '[data-project-page-tab][aria-current="page"]').map((tab) => tab.dataset['pageKind']),
    ).toEqual(['home']);
  });

  it('gives a sub-project one canvas, its root’s column, and no page tab of its own', async () => {
    const { harness } = await open('/projects/project-cabinets');

    expect(query(harness, '[data-project-name]')?.textContent).toContain('Cabinets');
    // §26: a sub-project has no pages, so nothing in the column is current — but the column
    // is its *root's*, and it is still there.
    expect(queryAll(harness, '[data-project-page-tab][aria-current="page"]')).toHaveLength(0);
    expect(queryAll(harness, '[data-project-page-tab]').map((tab) => tab.dataset['pageKind'])).toEqual(['home']);
    expect(queryAll(harness, '[data-project-breadcrumb]').map((link) => link.textContent?.trim()))
      .toEqual(['Home renovation', 'Kitchen']);
    expect(queryAll(harness, '[data-section-canvas]')).toHaveLength(1);
  });

  it('passes the shortcut capability only to a root Home renderer', async () => {
    const root = await open('/projects/project-renovation/pages/home');
    const rootShell = root.harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell))
      .componentInstance as ProjectWorkspaceShell;
    expect(rootShell.rendererInputs()?.shortcutsAllowed).toBe(true);

    const subproject = await open('/projects/project-kitchen');
    const subprojectShell = subproject.harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell))
      .componentInstance as ProjectWorkspaceShell;
    expect(subprojectShell.rendererInputs()?.shortcutsAllowed).toBe(false);
  });

  // `pages.list(rootId)` never returns a sub-project's `work` record, so a canvas read off the
  // root's pages would show the wrong sections, or none.
  it('scopes a sub-project’s canvas to its own work page', async () => {
    const { harness, gateway } = await open('/projects/project-kitchen');

    expect(queryAll(harness, '[data-section-item]').map((item) => item.dataset['sectionId'])).toEqual(['section-kitchen']);
    const sectionCalls = gateway.calls.filter(({ method }) => method === 'sections.list');
    expect(sectionCalls[0]?.argument).toEqual({
      projectId: 'project-kitchen',
      pageId: 'page-kitchen-work',
    });
  });

  it('renders a project it cannot read as one visible message, not an empty column and a blank canvas', async () => {
    const { harness } = await open('/projects/project-renovation', {
      failOn: { 'projects.get': new GatewayError('not_found', 404, 'no such project') },
    });

    expect(query(harness, '[data-project-error]')?.textContent).toContain('no such project');
    expect(query(harness, '#project-nav-panel')).toBeNull();
    expect(query(harness, '[data-section-canvas]')).toBeNull();
  });
});

describe('ProjectWorkspaceShell — §68’s fallbacks', () => {
  it.each([
    [
      'an enabled kind this build cannot draw',
      '/projects/project-renovation/pages/todos',
      [page('page-renovation-home', 'project-renovation', 'home'), page('page-renovation-todos', 'project-renovation', 'todos')],
      'not built yet',
    ],
    [
      'a disabled kind',
      '/projects/project-renovation/pages/archive',
      [page('page-renovation-home', 'project-renovation', 'home'), page('page-renovation-archive', 'project-renovation', 'archive', false)],
      'switched off',
    ],
    [
      'a kind that is not a page at all',
      '/projects/project-renovation/pages/nonsense',
      undefined,
      'no “nonsense” page',
    ],
    [
      'the work canvas, which is a page record but never a tab',
      '/projects/project-renovation/pages/work',
      undefined,
      'no “work” page',
    ],
  ])('redirects %s to Home and says why', async (_case, url, pages, reason) => {
    const { harness, router } = await open(url, pages === undefined ? {} : { pages: [...pages, page('page-kitchen-work', 'project-kitchen', 'work')] });

    expect(router.url).toBe('/projects/project-renovation/pages/home');
    expect(query(harness, '[data-page-notice]')?.textContent).toContain(reason);
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
  });

  // This one crosses from the three-segment route to the two-segment one, which destroys the
  // component and its store — so the reason cannot be held in a field.
  it('redirects a /pages/ URL on a sub-project to its work canvas, and the explanation survives', async () => {
    const { harness, router } = await open('/projects/project-kitchen/pages/home');

    expect(router.url).toBe('/projects/project-kitchen');
    expect(query(harness, '[data-page-notice]')?.textContent).toContain('unit of work');
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Kitchen');
  });

  it('replaces the URL, so Back leaves the project rather than bouncing off the fallback', async () => {
    const { harness, router, location } = await open('/projects/project-garden');
    await harness.navigateByUrl('/projects/project-renovation/pages/nonsense');
    await settle(harness);
    expect(router.url).toBe('/projects/project-renovation/pages/home');

    location.back();
    await settle(harness);
    expect(router.url).toBe('/projects/project-garden');

    location.forward();
    await settle(harness);
    expect(router.url).toBe('/projects/project-renovation/pages/home');
  });

  // The one case where the component is re-used *and* both halves of the route change at once.
  // The store still holds the previous project while `projects.get` is in flight, so resolving
  // against it would answer for the wrong workspace — and redirect the user there.
  it('does not resolve a new project’s page against the project it is replacing', async () => {
    const { harness, router } = await open('/projects/project-renovation/pages/home', {
      pages: [
        page('page-renovation-home', 'project-renovation', 'home'),
        // A second root that *does* have Todos enabled — so the page the user asks for is real,
        // and only a resolution against the stale project could refuse it.
        page('page-loft-home', 'project-loft', 'home'),
        page('page-loft-todos', 'project-loft', 'todos'),
        page('page-kitchen-work', 'project-kitchen', 'work'),
      ],
      projects: [RENOVATION, project('project-loft', 'Loft conversion'), KITCHEN, CABINETS, GARDEN],
    });

    await harness.navigateByUrl('/projects/project-loft/pages/todos');
    await settle(harness);

    // Todos has no renderer yet, so this must fall back — but to *Loft's* Home, never to the
    // project the user was standing on.
    expect(router.url).toBe('/projects/project-loft/pages/home');
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Loft conversion');
  });

  // The notice is read from history state, which still carries it after a dismissal. Re-reading
  // on every resolution — and the resolution object is rebuilt whenever the project record is —
  // put a dismissed notice back on the next rename or live frame.
  it('keeps a dismissed explanation dismissed through a project write', async () => {
    const { harness } = await open('/projects/project-renovation/pages/nonsense');
    expect(query(harness, '[data-page-notice]')).not.toBeNull();

    query(harness, '[data-page-notice-dismiss]')!.click();
    await settle(harness);
    expect(query(harness, '[data-page-notice]')).toBeNull();

    query(harness, '[data-project-more]')!.click();
    harness.fixture.detectChanges();
    const name = query(harness, '[data-project-rename-input]') as HTMLInputElement;
    name.value = 'Renovation, renamed';
    query(harness, '[data-project-rename-submit]')!.click();
    await settle(harness);

    expect(query(harness, '[data-project-name]')?.textContent).toContain('Renovation, renamed');
    expect(query(harness, '[data-page-notice]')).toBeNull();
  });

  it('renders Home for a shell created directly at its URL, which is what a reload is', async () => {
    const { harness, router } = await open('/projects/project-renovation/pages/home');

    expect(router.url).toBe('/projects/project-renovation/pages/home');
    expect(query(harness, '[data-page-notice]')).toBeNull();
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
  });
});

describe('ProjectWorkspaceShell — §23’s narrow widths', () => {
  /**
   * A `matchMedia` stub, because jsdom has none and the shell reads the query at construction
   * and then listens for changes. The listener is kept so a test can flip the query the way a
   * real resize does.
   */
  const stubMatchMedia = (matches: boolean) => {
    const listeners: Array<(event: { matches: boolean }) => void> = [];
    const original = globalThis.matchMedia;
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches,
        media: query,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
          listeners.push(listener),
        removeEventListener: () => {},
      }),
    });
    return {
      flip: (next: boolean) => listeners.forEach((listener) => listener({ matches: next })),
      restore: () => Object.defineProperty(globalThis, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      }),
    };
  };

  it('opens with the column collapsed when the narrow query already matches', async () => {
    const media = stubMatchMedia(true);
    try {
      const { harness } = await open('/projects/project-renovation');

      expect(query(harness, '#project-nav-panel')?.hasAttribute('hidden')).toBe(true);
      expect(query(harness, '[data-project-nav-toggle]')?.textContent).toContain('Show project navigation');
    } finally {
      media.restore();
    }
  });

  it('collapses when the window becomes narrow, and restores when it widens again', async () => {
    const media = stubMatchMedia(false);
    try {
      const { harness } = await open('/projects/project-renovation');
      expect(query(harness, '#project-nav-panel')?.hasAttribute('hidden')).toBe(false);

      media.flip(true);
      await settle(harness);
      expect(query(harness, '#project-nav-panel')?.hasAttribute('hidden')).toBe(true);

      // A column that stayed collapsed after the window widened would hide navigation the
      // user never chose to hide.
      media.flip(false);
      await settle(harness);
      expect(query(harness, '#project-nav-panel')?.hasAttribute('hidden')).toBe(false);
    } finally {
      media.restore();
    }
  });

  it('leaves the toggle in the user’s hands once they have used it', async () => {
    const media = stubMatchMedia(true);
    try {
      const { harness } = await open('/projects/project-renovation');

      query(harness, '[data-project-nav-toggle]')!.click();
      await settle(harness);

      expect(query(harness, '#project-nav-panel')?.hasAttribute('hidden')).toBe(false);
    } finally {
      media.restore();
    }
  });
});

describe('ProjectWorkspaceShell — the header, the canvas and what crosses between them', () => {
  it('leaves the workspace only after an archive resolves, and stays put when the domain refuses', async () => {
    const refused = await open('/projects/project-renovation', {
      failOn: { 'projects.update': new GatewayError('conflict', 409, 'archive its live sub-projects first') },
    });
    query(refused.harness, '[data-project-more]')!.click();
    refused.harness.fixture.detectChanges();
    query(refused.harness, '[data-project-archive]')!.click();
    refused.harness.fixture.detectChanges();
    query(refused.harness, '[data-project-archive-confirm-yes]')!.click();
    await settle(refused.harness);

    expect(refused.router.url).toBe('/projects/project-renovation');
    expect(query(refused.harness, '[data-project-write-error]')?.textContent).toContain('live sub-projects');

    const accepted = await open('/projects/project-renovation');
    query(accepted.harness, '[data-project-more]')!.click();
    accepted.harness.fixture.detectChanges();
    query(accepted.harness, '[data-project-archive]')!.click();
    accepted.harness.fixture.detectChanges();
    query(accepted.harness, '[data-project-archive-confirm-yes]')!.click();
    await settle(accepted.harness);

    expect(accepted.router.url).toBe('/app');
  });

  // The one assertion that proves an input crosses `NgComponentOutlet` into the renderer, and
  // §63's guard: `setStatus` paints `active` before the write lands, so the loaded status
  // alone would enable a Restore the domain would still refuse.
  it('disables every Restore in the mounted canvas through an optimistic reactivation', async () => {
    let resolveUpdate!: (project: Project) => void;
    const pending = new Promise<Project>((resolve) => (resolveUpdate = resolve));
    const archivedProject = project('project-renovation', 'Home renovation', undefined, { status: 'archived' });
    const { harness, gateway } = await open('/projects/project-renovation', {
      projects: [archivedProject, KITCHEN, CABINETS, GARDEN],
      sections: [
        section('section-home', 'project-renovation', 'page-renovation-home'),
        ProjectSectionSchema.parse({
          ...section('section-archived', 'project-renovation', 'page-renovation-home'),
          archivedAt: AT,
        }),
      ],
    });

    expect((query(harness, '[data-archived-section-restore]') as HTMLButtonElement).disabled).toBe(true);

    const update = vi.spyOn(gateway.projects, 'update').mockReturnValue(pending);
    query(harness, '[data-project-more]')!.click();
    harness.fixture.detectChanges();
    query(harness, '[data-project-status-option][data-status="active"]')!.click();
    harness.fixture.detectChanges();

    expect((query(harness, '[data-archived-section-restore]') as HTMLButtonElement).disabled).toBe(true);

    resolveUpdate(project('project-renovation', 'Home renovation'));
    await settle(harness);

    expect((query(harness, '[data-archived-section-restore]') as HTMLButtonElement).disabled).toBe(false);
    update.mockRestore();
  });

  it('moves header progress when a row on the canvas changes, through the renderer’s callback', async () => {
    const { harness, gateway } = await open('/projects/project-renovation');
    const before = gateway.calls.filter(({ method }) => method === 'progress.get').length;

    // Read off the *mounted canvas*, not off the shell: that is what proves the callback
    // crossed `NgComponentOutlet`, which binds inputs only and has no output API.
    const canvas = harness.fixture.debugElement.query(By.directive(ProjectCanvas));
    expect(canvas).not.toBeNull();
    (canvas.componentInstance as ProjectCanvas).projectDataChanged();
    await settle(harness);

    expect(gateway.calls.filter(({ method }) => method === 'progress.get').length).toBeGreaterThan(before);
  });
});
