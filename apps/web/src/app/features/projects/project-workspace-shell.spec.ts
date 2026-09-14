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
  type ProjectTodosResult,
  type ProjectSection,
  type Task,
} from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
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
  /** §34's chronology, as the query would answer it. The shell only routes to it. */
  todos?: ProjectTodosResult;
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
      'a disabled kind',
      '/projects/project-renovation/pages/todos',
      [page('page-renovation-home', 'project-renovation', 'home'), page('page-renovation-todos', 'project-renovation', 'todos', false)],
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
        // A second root that *does* have Archive enabled — so the page the user asks for is
        // real, and only a resolution against the stale project could refuse it.
        page('page-loft-home', 'project-loft', 'home'),
        page('page-loft-archive', 'project-loft', 'archive'),
        page('page-kitchen-work', 'project-kitchen', 'work'),
      ],
      projects: [RENOVATION, project('project-loft', 'Loft conversion'), KITCHEN, CABINETS, GARDEN],
    });

    await harness.navigateByUrl('/projects/project-loft/pages/archive');
    await settle(harness);

    // The Archive renderer resolves against Loft's context, never the project the user was
    // standing on.
    expect(router.url).toBe('/projects/project-loft/pages/archive');
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Loft conversion');
    expect(query(harness, '[data-archive-page]')).not.toBeNull();
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

  it('offers to re-enable the exact disabled page, then navigates to it after reconciliation', async () => {
    const { harness, router } = await open('/projects/project-renovation/pages/todos', {
      pages: [
        page('page-renovation-home', 'project-renovation', 'home'),
        page('page-renovation-todos', 'project-renovation', 'todos', false),
      ],
    });

    const enable = query(harness, '[data-page-notice-enable]') as HTMLButtonElement;
    expect(enable).not.toBeNull();
    expect(enable.textContent).toContain('Todos');

    enable.click();
    await settle(harness);

    expect(router.url).toBe('/projects/project-renovation/pages/todos');
    expect(query(harness, '[data-todos-empty]')).not.toBeNull();
    expect(query(harness, '[data-page-notice]')).toBeNull();
  });

  it('keeps the root-scoped page manager on a subproject without offering a work toggle', async () => {
    const { harness } = await open('/projects/project-kitchen');

    expect(query(harness, '[data-project-page-manager]')).not.toBeNull();
    expect(query(harness, '[data-page-toggle-kind="work"]')).toBeNull();
    expect(queryAll(harness, '[data-page-toggle-kind]').map((control) => control.dataset['pageToggleKind']))
      .toEqual(['home', 'todos', 'archive', 'reflections']);
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

  it('opens the root Archive from More after enabling its disabled page', async () => {
    const { harness, gateway, router } = await open('/projects/project-renovation');

    query(harness, '[data-project-more]')!.click();
    harness.fixture.detectChanges();
    query(harness, '[data-project-open-archive]')!.click();
    await settle(harness);

    expect(router.url).toBe('/projects/project-renovation/pages/archive');
    expect(query(harness, '[data-archive-page]')).not.toBeNull();
    expect(gateway.calls).toContainEqual({
      method: 'pages.setEnabled',
      argument: { projectId: RENOVATION.id, input: { kind: 'archive', enabled: true } },
    });
  });

  it('passes a stable Archive callback through the page outlet', async () => {
    const { harness, gateway, router } = await open('/projects/project-renovation');
    const shell = harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell)).componentInstance as ProjectWorkspaceShell;
    const callback = shell.rendererInputs()!.onOpenArchive;

    expect(shell.rendererInputs()!.onOpenArchive).toBe(callback);
    callback();
    await settle(harness);

    expect(router.url).toBe('/projects/project-renovation/pages/archive');
    expect(gateway.calls).toContainEqual({
      method: 'pages.setEnabled',
      argument: { projectId: RENOVATION.id, input: { kind: 'archive', enabled: true } },
    });
  });

  it('renders the enabled Reflections page through the page registry', async () => {
    const { harness, router } = await open('/projects/project-renovation/pages/reflections', {
      pages: [
        page('page-renovation-home', 'project-renovation', 'home'),
        page('page-renovation-reflections', 'project-renovation', 'reflections'),
      ],
    });

    expect(router.url).toBe('/projects/project-renovation/pages/reflections');
    expect(query(harness, '[data-reflections-page]')).not.toBeNull();
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

/** §34's chronology for the renovation root: one root task and one unit of work. */
const todoResult = (): ProjectTodosResult => ({
  projectId: RENOVATION.id,
  items: [
    {
      kind: 'task',
      task: task('task-1', 'project-renovation'),
      origin: {
        projectId: RENOVATION.id,
        pageId: page('page-renovation-home', 'project-renovation', 'home').id,
        pageKind: 'home',
        breadcrumb: [{ projectId: RENOVATION.id, name: RENOVATION.name }],
        sectionId: 'section-tasks' as ProjectSection['id'],
        sectionName: 'Task List',
      },
    },
    {
      kind: 'subproject',
      project: KITCHEN as Extract<ProjectTodosResult['items'][number], { kind: 'subproject' }>['project'],
      origin: {
        projectId: KITCHEN.id,
        pageId: page('page-kitchen-work', 'project-kitchen', 'work').id,
        pageKind: 'work',
        breadcrumb: [
          { projectId: RENOVATION.id, name: RENOVATION.name },
          { projectId: KITCHEN.id, name: KITCHEN.name },
        ],
      },
    },
  ],
});

const withTodos = (): Options => ({
  pages: [...defaults().pages, page('page-renovation-todos', 'project-renovation', 'todos')],
  todos: todoResult(),
});

describe('ProjectWorkspaceShell — the Todos page (§34, §68)', () => {
  it('advertises Todos, opens it, and renders the chronology instead of a canvas', async () => {
    const { harness, gateway } = await open('/projects/project-renovation/pages/todos', withTodos());

    expect(queryAll(harness, '[data-project-page-tab]').map((tab) => tab.dataset['pageKind'])).toEqual(['home', 'todos']);
    expect(queryAll(harness, '[data-todo-row]').map((row) => row.getAttribute('data-todo-id'))).toEqual([
      'task-1',
      'project-kitchen',
    ]);
    // A projection, not a canvas: no sections are read for this page at all.
    expect(query(harness, '[data-section-canvas]')).toBeNull();
    expect(gateway.calls.filter(({ method }) => method === 'todos.get').map(({ argument }) => argument)).toEqual([
      'project-renovation',
    ]);
  });

  it('re-reads the chronology when the shell moves to another root, and back', async () => {
    const { harness, gateway } = await open('/projects/project-renovation/pages/todos', {
      ...withTodos(),
      projects: [RENOVATION, project('project-loft', 'Loft conversion'), KITCHEN, CABINETS, GARDEN],
      pages: [
        ...defaults().pages,
        page('page-renovation-todos', 'project-renovation', 'todos'),
        page('page-loft-home', 'project-loft', 'home'),
        page('page-loft-todos', 'project-loft', 'todos'),
      ],
    });

    await harness.navigateByUrl('/projects/project-loft/pages/todos');
    await settle(harness);

    expect(gateway.calls.filter(({ method }) => method === 'todos.get').map(({ argument }) => argument)).toEqual([
      'project-renovation',
      'project-loft',
    ]);
    // The other root's chronology, not this one's: the fake answers by root, and an empty list
    // is the honest answer for a root it was given no rows for.
    expect(queryAll(harness, '[data-todo-row]')).toEqual([]);
    expect(query(harness, '[data-todos-empty]')).not.toBeNull();
  });

  it('gives a unit of work its work canvas for a /pages/todos URL', async () => {
    const { harness, router } = await open('/projects/project-kitchen/pages/todos', withTodos());

    expect(router.url).toBe('/projects/project-kitchen');
    expect(query(harness, '[data-page-notice]')?.textContent).toContain('unit of work');
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
    expect(query(harness, '[data-todos-list]')).toBeNull();
  });

  it('tells the shell to re-read progress when a row is completed on Todos', async () => {
    const { harness, gateway } = await open('/projects/project-renovation/pages/todos', withTodos());
    const progressReads = gateway.calls.filter(({ method }) => method === 'progress.get').length;

    (query(harness, '[data-todo-complete]') as HTMLButtonElement).click();
    await settle(harness);

    expect(gateway.calls.some(({ method }) => method === 'tasks.complete')).toBe(true);
    expect(gateway.calls.filter(({ method }) => method === 'progress.get').length).toBeGreaterThan(progressReads);
  });
});
