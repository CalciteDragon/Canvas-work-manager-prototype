import { provideLocationMocks } from '@angular/common/testing';
import { By } from '@angular/platform-browser';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  ProjectPageSchema,
  ProjectSchema,
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  TaskSchema,
  type OperationHistoryEntry,
  type OperationHistorySummary,
  type OperationHistoryTransitionResult,
  type Project,
  type ProjectPage,
  type ProjectTodosResult,
  type ProjectSection,
  type Task,
} from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { NavigationContext } from '../../core/shell/navigation-context';
import { FakeWorkManagerGateway, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
import { testIdentity } from '../../core/gateway/testing/shell-test-providers';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { routes } from '../../app.routes';
import { OPERATION_HISTORY_REPORTER } from '../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { FakeLiveUpdates } from '../../core/live/testing/fake-live-updates';
import { ProjectHistoryStore } from './history/project-history-store';
import { ArchivePage } from './pages/archive-page';
import { ReflectionsPage } from './pages/reflections-page';
import { TodosPage } from './pages/todos-page';
import { ProjectCanvas } from './project-canvas';
import { TaskListSection } from './sections/tasks/task-list-section';
import { ShortcutFrame } from './shortcuts/shortcut-frame';
import { ArchiveFocusRequest, ProjectWorkspaceShell } from './project-workspace-shell';

const AT = '2026-08-27T16:00:00.000Z';
const nativeOriginals = [
  { target: HTMLElement.prototype, key: 'hidePopover', descriptor: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover') },
  ...['showModal', 'close'].map((key) => ({ target: HTMLDialogElement.prototype, key, descriptor: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key) })),
];
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});
afterEach(() => {
  TestBed.resetTestingModule();
  document.querySelectorAll('[data-test-opener]').forEach((element) => element.remove());
  for (const { target, key, descriptor } of nativeOriginals) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

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

const section = (id: string, projectId: string, pageId: string, type = 'markdown'): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId,
    pageId,
    type,
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: type === 'markdown' ? { markdown: 'Notes' } : {},
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
  historySummaries?: OperationHistorySummary[];
};

const open = async (url: string, options: Options = {}, deferBlockBehavior = DeferBlockBehavior.Playthrough) => {
  const gateway = new FakeWorkManagerGateway({ ...defaults(), ...options });
  const projectGet = vi.spyOn(gateway.projects, 'get');
  const live = new FakeLiveUpdates();
  // Reset first, so a case that opens two workspaces — a refusal and an acceptance — gets two
  // independent routers rather than "the test module has already been instantiated".
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    deferBlockBehavior,
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      // Not optional: `SpyLocation` makes `replaceState`, `back()`, `forward()` and
      // `getState()` synchronous. Without it the Back/Forward cases race jsdom's real
      // history, and the fallback notice cannot be read back at all.
      provideLocationMocks(),
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
      // A test that leaves the workspace lands on the dashboard, which reads the persona.
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
  return { harness, component, gateway, projectGet, live, router: TestBed.inject(Router), location: TestBed.inject(Location) };
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


/**
 * Slice 81, step 6: the tree's pencil and More's items reach the shell through the handlers it
 * registers on `NavigationContext`. The opener stands in for the menu's button, attached so it
 * can take focus back.
 */
const opener = (): HTMLElement => {
  const button = document.body.appendChild(document.createElement('button'));
  button.setAttribute('data-test-opener', '');
  return button;
};
const requestWork = async (harness: RouterTestingHarness, from: HTMLElement = opener()) => {
  TestBed.inject(NavigationContext).openAddWorkstream({ source: from, returnFocus: from });
  await settle(harness);
  return from;
};
const requestPages = async (harness: RouterTestingHarness, from: HTMLElement | null = opener()) => {
  TestBed.inject(NavigationContext).openPageSettings({ source: from, returnFocus: from ?? opener() });
  await settle(harness);
  return from;
};

describe('Slice 73 Archive landing', () => {
  it.each(['missing', 'disabled', 'enabled'])('directly renders Archive with a %s page record', async (state) => {
    const pages = defaults().pages;
    if (state !== 'missing') pages.push(page('page-archive', RENOVATION.id, 'archive', state === 'enabled'));
    const { harness, router, gateway } = await open('/projects/project-renovation/pages/archive', { pages });
    await settle(harness);
    expect(router.url).toBe('/projects/project-renovation/pages/archive');
    expect(query(harness, '[data-archive-page]')).not.toBeNull();
    expect(query(harness, '[data-page-notice]')).toBeNull();
    expect(gateway.calls.some(({ method }) => method === 'pages.setEnabled')).toBe(false);
  });

  it('keeps Archive rendered as its record appears, changes and vanishes', async () => {
    const { harness, component, gateway, router, live } = await open('/projects/project-renovation/pages/archive');
    for (const state of ['enabled', 'disabled', 'missing']) {
      vi.spyOn(gateway.pages, 'list').mockResolvedValue([
        page('page-renovation-home', RENOVATION.id, 'home'),
        ...(state === 'missing' ? [] : [page('page-archive', RENOVATION.id, 'archive', state === 'enabled')]),
      ]);
      live.emit({ type: 'project.updated', entityType: 'project', entityId: RENOVATION.id,
        projectId: RENOVATION.id, rootProjectId: RENOVATION.id,
        actor: { kind: 'agent', id: 'agent-1', name: 'Claude' }, at: AT } as never);
      await settle(harness);
      expect(router.url).toBe('/projects/project-renovation/pages/archive');
      expect((component as ProjectWorkspaceShell).rendered()?.pageId).toBe(state === 'missing' ? null : 'page-archive');
      expect(query(harness, '[data-archive-page]')).not.toBeNull();
      expect(query(harness, '[data-page-notice]')).toBeNull();
    }
  });

  it('lands on the Archive heading after navigating without a write', async () => {
    const { harness, component, gateway } = await open('/projects/project-kitchen');
    await (component as ProjectWorkspaceShell).openArchive();
    await settle(harness);
    expect(document.activeElement).toBe(query(harness, '#archive-page-title'));
    expect(gateway.calls.some(({ method }) => method === 'pages.setEnabled')).toBe(false);
    expect(TestBed.inject(ArchiveFocusRequest).archiveUrl()).toBeNull();
  });

  for (const control of ['data-project-more', 'data-open-archive', 'data-todo-open-archive']) {
    it(`restores ${control} when Archive navigation is cancelled`, async () => {
      const { harness, component, router } = await open('/projects/project-renovation');
      vi.spyOn(router, 'navigate').mockResolvedValue(false);
      const returnTo = control === 'data-project-more' ? query(harness, '[data-project-more]')! : document.createElement('button');
      if (control !== 'data-project-more') { returnTo.setAttribute(control, ''); harness.fixture.nativeElement.append(returnTo); }
      returnTo.focus();
      const pending = (component as ProjectWorkspaceShell).openArchive(returnTo);
      returnTo.blur();
      await pending;
      await settle(harness);
      expect(document.activeElement).toBe(returnTo);
    });
  }

  it('drops an Archive landing when another navigation wins, including outside the project shell', async () => {
    const { harness, router } = await open('/projects/project-renovation');
    const request = TestBed.inject(ArchiveFocusRequest);
    request.archiveUrl.set('/projects/project-renovation/pages/archive');
    await router.navigateByUrl('/app');
    await settle(harness);
    expect(request.archiveUrl()).toBeNull();
  });

  it('clears the landing and returns to More when Archive navigation is cancelled', async () => {
    const { harness, component, router } = await open('/projects/project-renovation');
    const returnTo = query(harness, '[data-project-more]')!;
    returnTo.focus();
    vi.spyOn(router, 'navigate').mockResolvedValue(false);
    const pending = (component as ProjectWorkspaceShell).openArchive(returnTo);
    returnTo.blur();
    await pending;
    await settle(harness);
    expect(TestBed.inject(ArchiveFocusRequest).archiveUrl()).toBeNull();
    expect(document.activeElement).toBe(returnTo);
  });

  it('keeps the user\'s new focus when Archive navigation is cancelled', async () => {
    const { harness, component, router } = await open('/projects/project-renovation');
      vi.spyOn(router, 'navigate').mockResolvedValue(false);
    const returnTo = query(harness, '[data-project-more]')!;
    const other = document.createElement('button');
    harness.fixture.nativeElement.append(other);
    returnTo.focus();
    const pending = (component as ProjectWorkspaceShell).openArchive(returnTo);
    other.focus();
    await pending;
    await settle(harness);
    expect(document.activeElement).toBe(other);
    expect(TestBed.inject(ArchiveFocusRequest).archiveUrl()).toBeNull();
  });
});

const projectAddEntry = (actionId: string, label: string): OperationHistoryEntry => ({
  actionId: actionId as OperationHistoryEntry['actionId'],
  operation: 'project.add',
  label,
  expiresAt: '2026-08-28T16:00:00.000Z',
  blockedBy: null,
});

const projectAddSummary = (
  projectId: string,
  overrides: Partial<OperationHistorySummary> = {},
): OperationHistorySummary => ({
  projectId: projectId as OperationHistorySummary['projectId'],
  historyId: 'history-created' as OperationHistorySummary['historyId'],
  revision: 1,
  undo: projectAddEntry('operation-created', 'Created "Recoverable project"'),
  redo: null,
  blockedBy: null,
  ...overrides,
});

const creationTransition = (
  direction: 'undo' | 'redo',
  summary: OperationHistorySummary,
  result: unknown,
): OperationHistoryTransitionResult => ({ direction, actionId: 'operation-created' as never, summary, result } as OperationHistoryTransitionResult);

describe('ProjectWorkspaceShell — §23’s two columns and §68’s routes', () => {
  // Slice 81, step 6 (step 8's deletion brought forward, Open question 18): the tree is the
  // navigation, so the workspace is one track — the header, then the canvas.
  it('renders no project column: the header and the canvas are the workspace’s only track', async () => {
    const { harness } = await open('/projects/project-kitchen');
    expect(query(harness, 'app-project-page-navigation')).toBeNull();
    expect(query(harness, '[data-project-nav-placeholder], [data-project-nav-error], #project-nav-panel')).toBeNull();
    const workspace = query(harness, '.project-workspace');
    expect([...workspace!.children].map((child) => child.className)).toEqual(['project-workspace__main']);
  });

  it('same-root project navigation closes the work dialog', async () => {
    const { harness, router } = await open('/projects/project-renovation');
    await requestWork(harness);
    expect(query(harness, '[role="dialog"]')).not.toBeNull();
    await router.navigateByUrl('/projects/project-kitchen'); await settle(harness);
    expect(query(harness, '[role="dialog"]')).toBeNull();
  });

  it('a quiet live reparent to another root closes the work dialog', async () => {
    const other = project('project-other', 'Other');
    const { harness, gateway, live } = await open('/projects/project-kitchen', { projects: [...defaults().projects, other] });
    await requestWork(harness);
    expect(query(harness, '[role="dialog"]')).not.toBeNull();
    const read = gateway.projects.get;
    gateway.projects.get = async (id) => id === KITCHEN.id ? { ...KITCHEN, parentProjectId: other.id } as Project : read(id);
    live.emit({ type: 'project.updated', projectId: KITCHEN.id, entityId: KITCHEN.id, rootProjectId: other.id } as never);
    await settle(harness);
    expect(TestBed.inject(NavigationContext).place()?.root?.name).toBe('Other');
    expect(query(harness, '[role="dialog"]')).toBeNull();
  });
  it('opens work creation from the handler with root-first parents, closes on success and returns focus to the request’s returnFocus', async () => {
    const { harness, gateway, router } = await open('/projects/project-cabinets');
    const from = await requestWork(harness);
    expect(query(harness, '[role="dialog"]')).not.toBeNull();
    const select = query(harness, 'select') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent?.trim())).toEqual(['Home renovation', 'Kitchen', 'Cabinets', 'Garden']);
    expect(select.value).toBe('project-renovation');
    const name = query(harness, '[role="dialog"] input') as HTMLInputElement;
    name.value = 'Paint'; name.dispatchEvent(new Event('input'));
    select.value = 'project-kitchen'; select.dispatchEvent(new Event('change'));
    query(harness, '[role="dialog"] form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(harness);
    expect(gateway.argumentTo('projects.create')).toEqual(expect.objectContaining({ parentProjectId: 'project-kitchen', name: 'Paint' }));
    expect(query(harness, '[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(from);
    expect(router.url).toBe('/projects/project-cabinets');
  });

  it('closes work creation when navigating to another root', async () => {
    const other = project('project-other', 'Other');
    const { harness, router } = await open('/projects/project-renovation', { projects: [...defaults().projects, other] });
    await requestWork(harness);
    expect(query(harness, '[role="dialog"]')).not.toBeNull();
    await router.navigateByUrl('/projects/project-other'); await settle(harness);
    expect(query(harness, '[role="dialog"]')).toBeNull();
  });

  it('a store-initiated prototype reload destroys the dialog without reopening it after the read', async () => {
    const { harness, gateway, live } = await open('/projects/project-renovation');
    await requestWork(harness);
    expect(query(harness, '[role="dialog"]')).not.toBeNull();
    let release!: (value: Project) => void;
    const held = new Promise<Project>((resolve) => { release = resolve; });
    const read = gateway.projects.get;
    gateway.projects.get = () => held;
    live.emit({ type: 'prototype.reloaded', workspaceId: RENOVATION.workspaceId, at: AT } as never);
    harness.fixture.detectChanges();
    expect(query(harness, '[role="dialog"]')).toBeNull();
    gateway.projects.get = read; release(RENOVATION); await settle(harness);
    expect(query(harness, '[role="dialog"]')).toBeNull();
  });

  it('opens no work creation on an archived root: the triggers carry the reason, the handler refuses', async () => {
    const { harness } = await open('/projects/project-renovation', { projects: [project('project-renovation', 'Home renovation', undefined, { status: 'archived' })] });
    expect(TestBed.inject(NavigationContext).place()?.addBlockedReason).toBe('unavailable while Home renovation is archived');
    await requestWork(harness);
    expect(query(harness, '[role="dialog"]')).toBeNull();
  });

  it('registers its handlers while mounted and disposes them when the route leaves the project', async () => {
    const { harness, router } = await open('/projects/project-renovation');
    const navigation = TestBed.inject(NavigationContext);
    expect(navigation.hasHandlers()).toBe(true);
    await router.navigateByUrl('/app'); await settle(harness);
    expect(navigation.hasHandlers()).toBe(false);
    expect(navigation.openAddWorkstream({ source: null, returnFocus: opener() })).toBe(false);
  });

  it('opens page settings in a deferred popover anchored to the request’s source', async () => {
    const show = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
    try {
      const { harness } = await open('/projects/project-renovation');
      expect(query(harness, '[data-project-page-manager]')).toBeNull();
      const from = await requestPages(harness);
      expect(query(harness, '[data-project-page-manager]')).not.toBeNull();
      expect(show).toHaveBeenCalledExactlyOnceWith({ source: from });
      expect(queryAll(harness, '[data-project-page-manager]')).toHaveLength(1);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    }
  });

  it('writes a page toggle from the popover and removes it on Escape, focus back on the opener', async () => {
    const { harness, gateway } = await open('/projects/project-renovation');
    const from = await requestPages(harness);
    (query(harness, '[data-page-toggle-kind="reflections"] input') as HTMLInputElement).click();
    await settle(harness);
    expect(gateway.calls.some(({ method }) => method === 'pages.setEnabled')).toBe(true);
    query(harness, '[data-project-page-manager]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle(harness);
    expect(query(harness, '[data-project-page-manager]')).toBeNull();
    expect(document.activeElement).toBe(from);
  });

  it('closes page settings when the route moves to another root', async () => {
    const other = project('project-other', 'Other');
    const { harness, router } = await open('/projects/project-renovation', { projects: [...defaults().projects, other] });
    await requestPages(harness);
    expect(query(harness, '[data-project-page-manager]')).not.toBeNull();
    await router.navigateByUrl('/projects/project-other'); await settle(harness);
    expect(query(harness, '[data-project-page-manager]')).toBeNull();
  });

  it.each([
    ['page settings', 'pages', '[data-lift-error]', 'Couldn’t open page settings.'],
    ['Add workstream', 'work', '[data-lift-error]', 'Couldn’t open Add workstream.'],
  ] as const)('shows a deferred %s failure with Reload page at the current URL', async (_name, which, selector, sentence) => {
    const { harness } = await open('/projects/project-kitchen', {}, DeferBlockBehavior.Manual);
    const navigation = TestBed.inject(NavigationContext);
    const from = opener();
    if (which === 'pages') navigation.openPageSettings({ source: from, returnFocus: from });
    else navigation.openAddWorkstream({ source: from, returnFocus: from });
    harness.fixture.detectChanges();
    // Every deferred block fails, as a lost network would make them; those with an `@error` show it
    // (the archived banner's block has none and renders nothing).
    for (const block of await harness.fixture.getDeferBlocks()) await block.render(DeferBlockState.Error).catch(() => undefined);
    const failure = query(harness, selector);
    expect(failure?.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe(sentence);
    expect(failure?.querySelector('[role="alert"]')).not.toBeNull();
    expect(failure?.querySelector('a[data-recovery="reload"]')?.getAttribute('href')).toBe('/projects/project-kitchen');
  });
  it('focuses history controls on a direct fragment load without activating Undo', async () => {
    const { harness, gateway } = await open('/projects/project-kitchen#history-controls');
    const group = query(harness, '#history-controls');
    expect(group).not.toBeNull();
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Project history');
    expect(document.activeElement).toBe(group);
    expect(gateway.calls.filter(({ method }) => method === 'history.transition')).toHaveLength(0);
  });

  it('does not return focus to history after a same-project section fragment wins', async () => {
    const { harness, router } = await open('/projects/project-kitchen');
    await router.navigateByUrl('/projects/project-kitchen#history-controls');
    await router.navigateByUrl('/projects/project-kitchen#section-section-kitchen');
    await settle(harness);
    expect(router.url).toBe('/projects/project-kitchen#section-section-kitchen');
    expect(document.activeElement).not.toBe(query(harness, '#history-controls'));
  });

  it('does not focus the prior project history after a different project wins navigation', async () => {
    const { harness, router } = await open('/projects/project-renovation/pages/home');
    const historyArrival = router.navigateByUrl('/projects/project-kitchen#history-controls');
    const nextProject = router.navigateByUrl('/projects/project-garden');
    await Promise.allSettled([historyArrival, nextProject]);
    await settle(harness);
    expect(router.url).toBe('/projects/project-garden');
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Garden');
    expect(document.activeElement).not.toBe(query(harness, '#history-controls'));
  });

  it('renders a root’s first page with Home current in the place', async () => {
    const { harness, component } = await open('/projects/project-renovation/pages/home');

    expect(component).toBeInstanceOf(ProjectWorkspaceShell);
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Home renovation');
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
    expect((component as ProjectWorkspaceShell).place().currentKind).toBe('home');
  });

  it('gives a sub-project one canvas and its root’s place, with no current page kind', async () => {
    const { harness, component } = await open('/projects/project-cabinets');

    expect(query(harness, '[data-project-name]')?.textContent).toContain('Cabinets');
    const place = (component as ProjectWorkspaceShell).place();
    expect(place.currentKind).toBeNull();
    expect(place.ancestors.map(({ name }) => name)).toEqual(['Home renovation', 'Kitchen']);
    expect(queryAll(harness, '[data-section-canvas]')).toHaveLength(1);
  });

  it('passes the shortcut capability and the root id to a canonical page renderer only (Slice 65)', async () => {
    const shellOf = (opened: Awaited<ReturnType<typeof open>>) =>
      opened.harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell)).componentInstance as ProjectWorkspaceShell;

    const root = shellOf(await open('/projects/project-renovation/pages/home'));
    expect(root.rendererInputs()).toMatchObject({ shortcutsAllowed: true, rootProjectId: 'project-renovation' });

    const workstream = shellOf(await open('/projects/project-kitchen'));
    expect(workstream.rendererInputs()).toMatchObject({ shortcutsAllowed: true, rootProjectId: 'project-renovation' });

    const reflections = shellOf(await open('/projects/project-renovation/pages/reflections', {
      pages: [
        page('page-renovation-home', 'project-renovation', 'home'),
        page('page-renovation-reflections', 'project-renovation', 'reflections'),
      ],
    }));
    expect(reflections.rendererInputs()).toMatchObject({ shortcutsAllowed: false, rootProjectId: 'project-renovation' });
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

  it('renders a project it cannot see as the unavailable page: Go to Home, no Try again, no Details, no id (§68, W4-024, L4-014)', async () => {
    const { harness } = await open('/projects/project-renovation', {
      failOn: { 'projects.get': new GatewayError('not_found', 404, 'project "project-renovation" was not found') },
    });

    const unavailable = query(harness, '[data-project-unavailable]');
    const heading = unavailable?.querySelector('h1');
    expect(heading?.textContent?.trim()).toBe('This project isn’t available');
    expect(heading?.hasAttribute('data-route-focus')).toBe(true);
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(unavailable?.textContent).toContain('It may have been removed, or it isn’t shared with you.');
    expect(unavailable?.querySelector('a[data-go-home]')?.getAttribute('href')).toBe('/app');
    expect(harness.fixture.nativeElement.querySelector('details')).toBeNull();
    expect(harness.fixture.nativeElement.querySelector('[data-recovery="try-again"]')).toBeNull();
    expect(harness.fixture.nativeElement.textContent).not.toContain('project-renovation');
    expect(harness.fixture.nativeElement.textContent).not.toContain('was not found');
    expect(query(harness, '[data-project-error]')).toBeNull();
    expect(query(harness, '[data-section-canvas]')).toBeNull();
  });

  it('a project read that fails says so with Try again and Details, not under Project unavailable (Slice 78, §24)', async () => {
    const { harness, gateway, projectGet } = await open('/projects/project-renovation', {
      failOn: { 'projects.get': new GatewayError('internal_error', 500, 'disk on fire') },
    });

    const failure = query(harness, '[data-project-error]');
    // Open question 4: a visible h1 names the failure; the sentence beneath does not say it again.
    const heading = query(harness, 'h1');
    expect(heading?.textContent?.trim()).toBe('Couldn’t load this project');
    expect(heading?.hasAttribute('data-route-focus')).toBe(true);
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(heading?.closest('section')?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(heading?.closest('section')?.contains(failure)).toBe(true);
    expect(failure?.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Something went wrong while it was loading.');
    expect(failure?.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(failure?.querySelector('details')?.open).toBe(false);
    expect(failure?.querySelector('details')?.textContent).toContain('disk on fire');
    expect(query(harness, '#project-error-heading')).toBeNull();
    expect(harness.fixture.nativeElement.textContent).not.toContain('Project unavailable');

    gateway.options.failOn = undefined;
    const reads = projectGet.mock.calls.length;
    (failure?.querySelector('[data-recovery="try-again"]') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    expect(query(harness, '[data-project-error] [data-recovery]')?.getAttribute('aria-disabled')).toBe('true');
    expect(query(harness, '[data-project-loading]')).toBeNull();
    await settle(harness);

    expect(projectGet.mock.calls.length).toBe(reads + 1);
    expect(query(harness, '[data-project-error]')).toBeNull();
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Home renovation');
  });

  // Real use (Acceptance check 7): with every read failing, the history read fails beside the
  // project's, and a Try again that re-read only the project left a bare header Retry behind.
  it('Try again on a failed project read also re-reads a history read that failed with it (Slice 78, §24, §68)', async () => {
    const unreachable = new GatewayError('unreachable', 0, 'host stopped');
    const { harness, gateway } = await open('/projects/project-renovation', {
      failOn: { 'projects.get': unreachable, 'history.summary': unreachable },
    });
    await settle(harness);
    const summaries = () => gateway.calls.filter(({ method }) => method === 'history.summary').length;
    const before = summaries();

    gateway.options.failOn = undefined;
    (query(harness, '[data-project-error] [data-recovery="try-again"]') as HTMLButtonElement).click();
    await settle(harness);

    expect(query(harness, '[data-project-name]')?.textContent).toContain('Home renovation');
    expect(summaries()).toBe(before + 1);
    expect(query(harness, '[data-history-retry]')).toBeNull();
  });
});

describe('ProjectWorkspaceShell — creation recovery (§68)', () => {
  const createdProject = project('project-created', 'Recoverable project');
  const creationRedo = projectAddSummary(createdProject.id, {
    undo: null,
    redo: projectAddEntry('operation-created', 'Created "Recoverable project"'),
    revision: 2,
  });

  it('shows the creator’s Redo controls at the missing project URL without an extra cold-load retry', async () => {
    const { harness, gateway, projectGet } = await open(`/projects/${createdProject.id}`, {
      projects: [],
      pages: [],
      historySummaries: [creationRedo],
    });
    await settle(harness);

    const recovery = query(harness, '[data-project-creation-recovery]');
    expect(recovery).not.toBeNull();
    expect(recovery?.textContent).toContain('Creation undone');
    expect(recovery?.textContent).toContain('Undo removed "Recoverable project".');
    expect(query(harness, '[data-history-redo]')?.getAttribute('aria-label')).toBe('Redo: Created "Recoverable project"');
    expect(query(harness, '[data-history-redo]')?.getAttribute('aria-disabled')).toBeNull();
    expect(query(harness, 'app-project-workspace-shell > app-toast')).not.toBeNull();
    expect(projectGet).toHaveBeenCalledTimes(1);
    expect(gateway.calls.filter(({ method }) => method === 'history.summary')).toHaveLength(1);
  });

  it('keeps the unavailable page when the missing id has no creation Redo', async () => {
    const { harness } = await open('/projects/project-missing', {
      projects: [],
      pages: [],
      historySummaries: [projectAddSummary('project-missing', { historyId: null, revision: 0, undo: null, redo: null })],
    });

    expect(query(harness, '[data-project-unavailable]')).not.toBeNull();
    expect(query(harness, '[data-project-creation-recovery]')).toBeNull();
  });

  // What the host actually answers another person, a foreign workspace or an id that never
  // existed: a not-found history, which no Retry can turn into a Redo.
  it('offers no Retry when the missing project’s history is itself not found', async () => {
    const { harness } = await open('/projects/project-missing', {
      projects: [],
      pages: [],
      failOn: { 'history.summary': new GatewayError('not_found', 404, 'project "project-missing" was not found') },
    });
    await settle(harness);

    expect(query(harness, '[data-project-unavailable]')).not.toBeNull();
    expect(query(harness, '[data-project-creation-recovery]')).toBeNull();
    expect(query(harness, '[data-project-history-retry]')).toBeNull();
  });

  it('can retry an unavailable history read from the missing-project route', async () => {
    const { harness, gateway } = await open(`/projects/${createdProject.id}`, {
      projects: [],
      pages: [],
      historySummaries: [creationRedo],
      failOn: { 'history.summary': new GatewayError('unreachable', 0, 'host stopped') },
    });
    await settle(harness);

    expect(query(harness, '[data-project-unavailable]')).not.toBeNull();
    expect(query(harness, '[data-project-creation-recovery]')).toBeNull();
    const retry = query(harness, '[data-project-history-retry]') as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    expect(retry?.textContent).toContain('Retry');

    gateway.options.failOn = undefined;
    retry?.click();
    await settle(harness);

    expect(query(harness, '[data-project-creation-recovery]')).not.toBeNull();
    expect(query(harness, '[data-history-redo]')?.getAttribute('aria-label')).toBe('Redo: Created "Recoverable project"');
    expect(gateway.calls.filter(({ method }) => method === 'history.summary')).toHaveLength(2);
  });

  it('reloads project context once when a creation Undo response lands without its live frame', async () => {
    const beforeUndo = projectAddSummary(createdProject.id);
    const afterUndo = projectAddSummary(createdProject.id, {
      revision: 2,
      undo: null,
      redo: projectAddEntry('operation-created', 'Created "Recoverable project"'),
    });
    const { harness, gateway, projectGet } = await open(`/projects/${createdProject.id}`, {
      projects: [createdProject],
      pages: [page(`page-${createdProject.id}`, createdProject.id, 'home')],
      historySummaries: [beforeUndo],
    });
    await settle(harness);
    gateway.options.projects = [];
    gateway.options.pages = [];
    gateway.transitionAnswers.push(creationTransition('undo', afterUndo, {
      operation: 'project.add', outcome: 'removed', projectId: createdProject.id,
    }));

    (query(harness, '[data-history-undo]') as HTMLButtonElement).click();
    await settle(harness);

    expect(query(harness, '[data-project-creation-recovery]')).not.toBeNull();
    expect(projectGet).toHaveBeenCalledTimes(2);
    expect(gateway.calls.filter(({ method }) => method === 'history.summary')).toHaveLength(1);
  });

  it('reloads a missing project once when a creation Redo response lands without its live frame', async () => {
    const afterRedo = projectAddSummary(createdProject.id, {
      revision: 3,
      undo: projectAddEntry('operation-created', 'Created "Recoverable project"'),
      redo: null,
    });
    const { harness, gateway, projectGet } = await open(`/projects/${createdProject.id}`, {
      projects: [],
      pages: [],
      historySummaries: [creationRedo],
    });
    await settle(harness);
    gateway.options.projects = [createdProject];
    gateway.options.pages = [page(`page-${createdProject.id}`, createdProject.id, 'home')];
    gateway.transitionAnswers.push(creationTransition('redo', afterRedo, {
      operation: 'project.add', outcome: 'reapplied', project: createdProject,
      page: page(`page-${createdProject.id}`, createdProject.id, 'home'),
    }));

    (query(harness, '[data-history-redo]') as HTMLButtonElement).click();
    await settle(harness);

    expect(query(harness, '[data-project-creation-recovery]')).toBeNull();
    expect(query(harness, '[data-project-name]')?.textContent).toContain('Recoverable project');
    expect(projectGet).toHaveBeenCalledTimes(2);
    expect(gateway.calls.filter(({ method }) => method === 'history.summary')).toHaveLength(1);
  });

  it('retries a stale Redo summary only once while the project is already present', async () => {
    const { harness, gateway, projectGet } = await open(`/projects/${createdProject.id}`, {
      projects: [createdProject],
      pages: [page(`page-${createdProject.id}`, createdProject.id, 'home')],
      historySummaries: [creationRedo],
    });
    await settle(harness);

    expect(query(harness, '[data-project-name]')?.textContent).toContain('Recoverable project');
    expect(projectGet).toHaveBeenCalledTimes(2);
    expect(gateway.calls.filter(({ method }) => method === 'history.summary')).toHaveLength(1);
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

  // Slice 81: the column's narrow hand-off to its toggle is gone. A tree link that §68 redirects
  // leaves focus on the link the person pressed (the tree is outside the shell), with the notice.
  it('keeps focus on the pressed tree link when §68 redirects its disabled page', async () => {
    const { harness, router } = await open('/projects/project-renovation', {
      pages: [...defaults().pages, page('page-renovation-todos', 'project-renovation', 'todos', false)],
    });
    const link = document.body.appendChild(document.createElement('a'));
    link.setAttribute('data-test-opener', '');
    link.href = '/projects/project-renovation/pages/todos';
    link.focus();
    await router.navigateByUrl('/projects/project-renovation/pages/todos');
    await settle(harness);
    expect(router.url).toBe('/projects/project-renovation/pages/home');
    expect(query(harness, '[data-page-notice]')?.textContent).toContain('switched off');
    expect(document.activeElement).toBe(link);
  });

  // This one crosses from the three-segment route to the two-segment one, which destroys the
  // component and its store — so the reason cannot be held in a field.
  it('redirects a /pages/ URL on a sub-project to its work canvas, and the explanation survives', async () => {
    const { harness, router } = await open('/projects/project-kitchen/pages/home');

    expect(router.url).toBe('/projects/project-kitchen');
    expect(query(harness, '[data-page-notice]')?.textContent).toContain('workstream');
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
    query(harness, '[data-project-edit-details]')!.click();
    await settle(harness);
    const name = query(harness, '[data-project-rename-input]') as HTMLInputElement;
    name.value = 'Renovation, renamed';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    query(harness, '[data-project-details-save]')!.click();
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

  /**
   * Undo of a first enable removes the record (Slice 38), which is not the same as switching it
   * off: there is nothing to re-enable, so the fallback shows Home and offers no Enable button.
   */
  it('falls back to Home without a re-enable offer when the page record is absent', async () => {
    const { harness } = await open('/projects/project-renovation/pages/todos', {
      pages: [page('page-renovation-home', 'project-renovation', 'home')],
    });

    expect(query(harness, '[data-page-notice]')).not.toBeNull();
    expect(query(harness, '[data-page-notice-enable]')).toBeNull();
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
  });

  it('keeps the root-scoped page manager on a subproject without offering a work toggle', async () => {
    const { harness } = await open('/projects/project-kitchen');
    await requestPages(harness);

    expect(query(harness, '[data-project-page-manager]')).not.toBeNull();
    expect(query(harness, '[data-page-toggle-kind="work"]')).toBeNull();
    expect(queryAll(harness, '[data-page-toggle-kind]').map((control) => control.dataset['pageToggleKind']))
      .toEqual(['home', 'todos', 'archive', 'reflections']);
  });
});

describe('ProjectWorkspaceShell — the header, the canvas and what crosses between them', () => {
  // Slice 80: what the tree knows is listed, and what is on screen is what is named.
  it('gives the confirmation the live subtree, and commits naming it', async () => {
    const { harness, gateway } = await open('/projects/project-renovation');
    query(harness, '[data-project-more]')!.click();
    harness.fixture.detectChanges();
    query(harness, '[data-project-archive]')!.click();
    await settle(harness);

    expect(query(harness, 'h2#project-archive-title')?.textContent).toBe('Archive “Home renovation” and its 3 workstreams?');
    expect(gateway.calls.some(({ method }) => method === 'projects.update')).toBe(false);

    query(harness, '[data-project-archive-confirm-yes]')!.click();
    await settle(harness);

    const write = gateway.calls.find(({ method }) => method === 'projects.update');
    expect(JSON.stringify(write)).toContain('"archiveWorkstreamIds":["project-kitchen","project-cabinets","project-garden"]');
  });

  it('after a banner restore on a marked project, focus reaches the heading and no restore choice took it first', async () => {
    const kitchen = project('project-kitchen', 'Kitchen', 'project-renovation', { status: 'archived' });
    const cabinets = { ...project('project-cabinets', 'Cabinets', 'project-kitchen', { status: 'archived' }), archivedWithProject: { projectId: 'project-kitchen', status: 'active' } } as typeof kitchen;
    const { harness, gateway } = await open('/projects/project-cabinets', { projects: [defaults().projects[0]!, kitchen, cabinets] });
    expect(query(harness, 'app-archived-banner [data-archived-sentence]')?.textContent?.trim()).toBe('“Cabinets” was archived with “Kitchen”. Restoring “Kitchen” brings it back.');
    const { archivedWithProject: _marker, ...revived } = cabinets as typeof cabinets & { archivedWithProject?: unknown };
    const liveKitchen = { ...kitchen, status: 'active' as const };
    const liveCabinets = { ...revived, status: 'active' as const } as typeof kitchen;
    gateway.options.projects = [defaults().projects[0]!, liveKitchen, liveCabinets];
    gateway.projects.update = async () => ({ project: liveKitchen, operation: null, cascaded: [liveCabinets] });
    const focused: (string | null)[] = [];
    document.addEventListener('focusin', (event) => focused.push((event.target as HTMLElement).tagName));

    query(harness, 'app-archived-banner [data-restore-action]')!.click();
    await settle(harness);

    expect(query(harness, 'app-archived-banner [data-archived-sentence]')).toBeNull();
    expect(document.activeElement).toBe(query(harness, 'h1[data-project-name]'));
    expect(focused).not.toContain('SELECT');
  });

  it('stays on the archived project with its Undo, and stays put with the reason when the domain refuses', async () => {
    // A stale tree: Cabinets shows no live workstream, so the commit form lets the domain decide.
    const refused = await open('/projects/project-cabinets', {
      failOn: { 'projects.update': new GatewayError('rule_violation', 409, 'project "project-cabinets" still has active workstreams') },
    });
    query(refused.harness, '[data-project-more]')!.click();
    refused.harness.fixture.detectChanges();
    query(refused.harness, '[data-project-archive]')!.click();
    await settle(refused.harness);
    query(refused.harness, '[data-project-archive-confirm-yes]')!.click();
    await settle(refused.harness);

    expect(refused.router.url).toBe('/projects/project-cabinets');
    expect(query(refused.harness, '[data-project-write-error] [role="alert"]')?.textContent?.trim()).toBe('The workstreams under “Cabinets” changed. Choose Archive again to confirm the current list.');
    expect(query(refused.harness, '[data-project-write-error] details')?.textContent).toContain('still has active workstreams');

    // Slice 41: a successful archive no longer navigates to `/app`, where no header could offer
    // the one step the per-step blocker exists for.
    const accepted = await open('/projects/project-garden');
    const update = accepted.gateway.projects.update.bind(accepted.gateway.projects);
    accepted.gateway.projects.update = async (id, input) => {
      const result = await update(id, input);
      if (result.operation !== null) accepted.gateway.historySummaries.set(id, {
        projectId: id, historyId: result.operation.historyId, revision: result.operation.revision,
        undo: { ...result.operation, blockedBy: null }, redo: null, blockedBy: null,
      });
      return result;
    };
    query(accepted.harness, '[data-project-more]')!.click();
    accepted.harness.fixture.detectChanges();
    query(accepted.harness, '[data-project-archive]')!.click();
    await settle(accepted.harness);
    query(accepted.harness, '[data-project-archive-confirm-yes]')!.click();
    await settle(accepted.harness);

    expect(accepted.router.url).toBe('/projects/project-garden');
    expect(query(accepted.harness, '[data-project-status]')?.textContent?.trim()).toBe('archived');
    expect(query(accepted.harness, 'app-project-workspace-shell > app-toast [data-toast]')?.textContent).toContain('Archived Garden.');
    expect(query(accepted.harness, 'app-project-workspace-shell > app-toast [data-toast-undo]')).not.toBeNull();
    expect(query(accepted.harness, '.project-header [data-toast]')).toBeNull();
    expect(query(accepted.harness, '[data-history-undo]')).not.toBeNull();
  });

  it('opens the root Archive from More without enabling its hidden page', async () => {
    const { harness, gateway, router } = await open('/projects/project-renovation');

    query(harness, '[data-project-more]')!.click();
    harness.fixture.detectChanges();
    query(harness, '[data-project-open-archive]')!.click();
    await settle(harness);

    expect(router.url).toBe('/projects/project-renovation/pages/archive');
    expect(query(harness, '[data-archive-page]')).not.toBeNull();
    expect(gateway.calls.some(({ method }) => method === 'pages.setEnabled')).toBe(false);
  });

  it('passes a stable Archive callback through the page outlet', async () => {
    const { harness, gateway, router } = await open('/projects/project-renovation');
    const shell = harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell)).componentInstance as ProjectWorkspaceShell;
    const callback = shell.rendererInputs()!.onOpenArchive;

    expect(shell.rendererInputs()!.onOpenArchive).toBe(callback);
    callback(query(harness, '[data-project-more]')!);
    await settle(harness);

    expect(router.url).toBe('/projects/project-renovation/pages/archive');
    expect(gateway.calls.some(({ method }) => method === 'pages.setEnabled')).toBe(false);
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
    const { harness, gateway, component } = await open('/projects/project-renovation/pages/todos', withTodos());

    expect((component as ProjectWorkspaceShell).place().pages.map(({ kind }) => kind)).toEqual(['todos']);
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
    expect(query(harness, '[data-page-notice]')?.textContent).toContain('workstream');
    expect(query(harness, '[data-section-canvas]')).not.toBeNull();
    expect(query(harness, '[data-todos-list]')).toBeNull();
  });

  it('tells the shell to re-read progress when a row is completed on Todos', async () => {
    const { harness, gateway } = await open('/projects/project-renovation/pages/todos', withTodos());
    const progressReads = gateway.calls.filter(({ method }) => method === 'progress.get').length;

    (query(harness, '[data-todo-toggle]') as HTMLInputElement).click();
    await settle(harness);

    expect(gateway.calls.some(({ method }) => method === 'tasks.complete')).toBe(true);
    expect(gateway.calls.filter(({ method }) => method === 'progress.get').length).toBeGreaterThan(progressReads);
  });
});

describe('ProjectWorkspaceShell — the header’s Undo/Redo (Slice 41)', () => {
  const HISTORY_PAGES = [
    page('page-renovation-home', 'project-renovation', 'home'),
    page('page-renovation-todos', 'project-renovation', 'todos'),
    page('page-renovation-archive', 'project-renovation', 'archive'),
    page('page-renovation-reflections', 'project-renovation', 'reflections'),
    page('page-kitchen-work', 'project-kitchen', 'work'),
    page('page-cabinets-work', 'project-cabinets', 'work'),
    page('page-garden-work', 'project-garden', 'work'),
  ];

  it('renders both controls on every root page, a sub-project, and an unavailable page', async () => {
    for (const url of [
      '/projects/project-renovation',
      '/projects/project-renovation/pages/todos',
      '/projects/project-renovation/pages/archive',
      '/projects/project-renovation/pages/reflections',
      '/projects/project-kitchen',
    ]) {
      const { harness } = await open(url, { pages: HISTORY_PAGES });
      await settle(harness);
      expect(query(harness, '[data-history-undo]')?.getAttribute('aria-label'), url).toBe('Nothing to undo');
      expect(query(harness, '[data-history-redo]')?.getAttribute('aria-label'), url).toBe('Nothing to redo');
      expect(query(harness, '[data-history-undo]')?.getAttribute('aria-disabled'), url).toBe('true');
    }
    const unavailable = await open('/projects/project-renovation/pages/unbuilt-kind', { pages: HISTORY_PAGES });
    await settle(unavailable.harness);
    expect(query(unavailable.harness, '[data-history-undo]')).not.toBeNull();
  });

  it('loads the history of the routed project, again on a project change', async () => {
    const { harness, gateway } = await open('/projects/project-renovation', { pages: HISTORY_PAGES });
    await harness.navigateByUrl('/projects/project-garden');
    await settle(harness);
    const reads = gateway.calls.filter(({ method }) => method === 'history.summary').map(({ argument }) => argument);
    expect(reads).toContain('project-renovation');
    expect(reads.at(-1)).toBe('project-garden');
  });

  it('binds every writer store inside the shell to the header’s history, outlet pages and shortcut lists included', async () => {
    const shortcut = ResolvedSectionShortcutSchema.parse({
      id: 'shortcut-1', pageId: 'page-renovation-home', sourceSectionId: 'section-kitchen-tasks', position: 1,
      columnSpan: 12, collapsed: false, createdAt: AT, updatedAt: AT,
      source: section('section-kitchen-tasks', 'project-kitchen', 'page-kitchen-work', 'task-list'),
      sourceProjectId: 'project-kitchen', sourceProjectName: 'Kitchen', sourcePageKind: 'work',
      breadcrumb: ['Home renovation', 'Kitchen'], availability: 'available',
    });
    const home = await open('/projects/project-renovation', { pages: HISTORY_PAGES, shortcuts: [shortcut] } as Options);
    await settle(home.harness);
    const shell = home.harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell));
    const history = shell.injector.get(ProjectHistoryStore);
    expect(home.harness.fixture.debugElement.query(By.directive(ProjectCanvas)).injector.get(OPERATION_HISTORY_REPORTER)).toBe(history);
    const shortcutList = home.harness.fixture.debugElement.query(By.directive(ShortcutFrame)).query(By.directive(TaskListSection));
    expect(shortcutList.injector.get(OPERATION_HISTORY_REPORTER)).toBe(history);

    const outlets: Array<[string, unknown]> = [
      ['/projects/project-renovation/pages/todos', TodosPage],
      ['/projects/project-renovation/pages/archive', ArchivePage],
      ['/projects/project-renovation/pages/reflections', ReflectionsPage],
    ];
    for (const [url, component] of outlets) {
      const opened = await open(url, { pages: HISTORY_PAGES });
      await settle(opened.harness);
      const outletPage = opened.harness.fixture.debugElement.query(By.directive(component as never));
      const shellHistory = opened.harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell)).injector.get(ProjectHistoryStore);
      expect(outletPage.injector.get(OPERATION_HISTORY_REPORTER), url).toBe(shellHistory);
    }
  });
});

describe('ProjectWorkspaceShell — read-only projects and the archived banner (Slice 79, §26, §31, L4-007)', () => {
  const archived = (record: Project): Project => ({ ...record, status: 'archived' });
  const ROOT_PAGES = [
    page('page-renovation-home', 'project-renovation', 'home'),
    page('page-renovation-todos', 'project-renovation', 'todos'),
    page('page-renovation-archive', 'project-renovation', 'archive'),
    page('page-renovation-reflections', 'project-renovation', 'reflections'),
    page('page-kitchen-work', 'project-kitchen', 'work'),
    page('page-cabinets-work', 'project-cabinets', 'work'),
    page('page-garden-work', 'project-garden', 'work'),
  ];
  /** Writes land in the fake's records, so a re-read agrees with the write. */
  const persisting = (gateway: FakeWorkManagerGateway) => {
    const update = gateway.projects.update.bind(gateway.projects);
    gateway.projects.update = async (id, input) => {
      const result = await update(id, input);
      gateway.options.projects = (gateway.options.projects ?? []).map((record) => (record.id === id ? result.project : record));
      return result;
    };
  };
  const shellOf = (harness: RouterTestingHarness) =>
    harness.fixture.debugElement.query(By.directive(ProjectWorkspaceShell)).componentInstance as ProjectWorkspaceShell;
  const banner = (harness: RouterTestingHarness) => query(harness, 'app-archived-banner');
  const sentence = (harness: RouterTestingHarness) => query(harness, 'app-archived-banner [data-archived-sentence]')?.textContent?.trim();
  const restoreButton = (harness: RouterTestingHarness) => query(harness, 'app-archived-banner [data-restore-action]') as HTMLButtonElement;

  it('shows the banner on every page of a read-only project, under the header, and none on a live one', async () => {
    const projects = [archived(RENOVATION), KITCHEN, CABINETS, GARDEN];
    for (const url of [
      '/projects/project-renovation',
      '/projects/project-renovation/pages/todos',
      '/projects/project-renovation/pages/archive',
      '/projects/project-renovation/pages/reflections',
    ]) {
      const { harness } = await open(url, { projects, pages: ROOT_PAGES });
      await settle(harness);
      expect(sentence(harness), url).toBe('“Home renovation” is archived.');
      const header = query(harness, 'app-project-header')!;
      expect(header.compareDocumentPosition(banner(harness)!) & Node.DOCUMENT_POSITION_FOLLOWING, url).toBeTruthy();
      expect(banner(harness)!.closest('.project-workspace__main'), url).not.toBeNull();
      expect(shellOf(harness).rendererInputs()?.readOnly, url).toBe(true);
    }

    const cabinets = await open('/projects/project-cabinets', { projects, pages: ROOT_PAGES });
    await settle(cabinets.harness);
    expect(sentence(cabinets.harness)).toBe('“Cabinets” is inside “Home renovation”, which is archived.');
    expect(shellOf(cabinets.harness).rendererInputs()?.readOnly).toBe(true);

    for (const url of ['/projects/project-renovation', '/projects/project-renovation/pages/archive', '/projects/project-kitchen']) {
      const { harness } = await open(url, { pages: ROOT_PAGES });
      await settle(harness);
      expect(banner(harness), url).toBeNull();
      expect(shellOf(harness).rendererInputs()?.readOnly, url).toBe(false);
    }
  });

  it('keeps the header’s More and Edit details… (rename and Parent) on a read-only project', async () => {
    const { harness } = await open('/projects/project-cabinets', { projects: [RENOVATION, archived(KITCHEN), CABINETS, GARDEN] });
    await settle(harness);
    expect(banner(harness)).not.toBeNull();
    query(harness, '[data-project-more]')!.click();
    harness.fixture.detectChanges();
    expect(query(harness, '[data-project-edit-details]')).not.toBeNull();
  });

  it('closes an open drawer when a live frame makes the project read-only', async () => {
    const { harness, gateway, live } = await open('/projects/project-kitchen');
    const shell = shellOf(harness);
    let release: () => void = () => {};
    const close = vi.fn(() => release());
    release = shell.drawerCoordinator.select('section-kitchen' as never, close);

    gateway.options.projects = [RENOVATION, archived(KITCHEN), CABINETS, GARDEN];
    live.emit({ type: 'project.updated', entityType: 'project', entityId: KITCHEN.id, projectId: KITCHEN.id, rootProjectId: RENOVATION.id,
      actor: { kind: 'agent', id: 'agent-1', name: 'Claude' }, at: AT } as never);
    await settle(harness);

    expect(banner(harness)).not.toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(shell.drawerCoordinator.open()).toBe(false);
  });

  it('restores its own project from the banner: busy meanwhile, then no banner, focus on the heading and no toast', async () => {
    const { harness, gateway } = await open('/projects/project-kitchen', { projects: [RENOVATION, archived(KITCHEN), CABINETS, GARDEN] });
    persisting(gateway);
    await settle(harness);
    expect(sentence(harness)).toBe('“Kitchen” is archived.');

    let land: () => void = () => {};
    const update = gateway.projects.update;
    gateway.projects.update = (id, input) => new Promise((resolve) => { land = () => resolve(update(id, input)); });
    restoreButton(harness).focus();
    restoreButton(harness).click();
    harness.fixture.detectChanges();
    expect(banner(harness)!.getAttribute('aria-busy')).toBe('true');
    expect(restoreButton(harness).getAttribute('aria-disabled')).toBe('true');

    land();
    await settle(harness);
    expect(gateway.calls.filter(({ method }) => method === 'projects.update').map(({ argument }) => argument))
      .toEqual([{ id: 'project-kitchen', input: { status: 'active' } }]);
    expect(banner(harness)).toBeNull();
    expect(shellOf(harness).rendererInputs()?.readOnly).toBe(false);
    expect(document.activeElement).toBe(query(harness, 'h1[data-project-name]'));
    expect(shellOf(harness).toast.state()).toBeNull();
  });

  it('restores an archived ancestor from the banner: focus on the heading and the cross-owner toast', async () => {
    const { harness, gateway } = await open('/projects/project-cabinets', {
      projects: [RENOVATION, archived(KITCHEN), CABINETS, GARDEN],
      historySummaries: [{ projectId: 'project-cabinets', historyId: 'history-cabinets', revision: 1, undo: null, redo: null, blockedBy: null } as never],
    });
    persisting(gateway);
    await settle(harness);
    expect(sentence(harness)).toBe('“Cabinets” is inside “Kitchen”, which is archived.');

    restoreButton(harness).click();
    await settle(harness);

    expect(gateway.argumentTo('projects.update')).toEqual({ id: 'project-kitchen', input: { status: 'active' } });
    expect(banner(harness)).toBeNull();
    expect(query(harness, 'h1[data-project-name]')?.textContent?.trim()).toBe('Cabinets');
    expect(document.activeElement).toBe(query(harness, 'h1[data-project-name]'));
    expect(query(harness, 'app-project-workspace-shell > app-toast a[data-toast-open]')?.textContent?.trim()).toBe('Open Kitchen');
  });

  it('moves on to the next owner after restoring the outer one, with focus on its restore choice', async () => {
    const { harness, gateway } = await open('/projects/project-kitchen', { projects: [archived(RENOVATION), archived(KITCHEN), CABINETS, GARDEN] });
    persisting(gateway);
    await settle(harness);
    expect(sentence(harness)).toBe('“Kitchen” is archived, and so is “Home renovation”, which holds it.');

    restoreButton(harness).click();
    await settle(harness);

    expect(gateway.argumentTo('projects.update')).toEqual({ id: 'project-renovation', input: { status: 'active' } });
    expect(sentence(harness)).toBe('“Kitchen” is archived.');
    expect(restoreButton(harness).getAttribute('aria-label')).toBe('Restore Kitchen');
    expect(document.activeElement).toBe(query(harness, 'app-archived-banner select[data-restore-status]'));
  });

  it('shows a failed restore in the banner, not the header, and Try again repeats it', async () => {
    const { harness, gateway } = await open('/projects/project-kitchen', {
      projects: [RENOVATION, archived(KITCHEN), CABINETS, GARDEN],
      failOn: { 'projects.update': new GatewayError('unreachable', 0, 'Host unreachable') },
    });
    await settle(harness);

    const select = query(harness, 'app-archived-banner select[data-restore-status]') as HTMLSelectElement;
    select.value = 'on_hold';
    select.dispatchEvent(new Event('change'));
    harness.fixture.detectChanges();
    restoreButton(harness).click();
    await settle(harness);

    expect(query(harness, 'app-archived-banner [data-archived-restore-error] [data-failure-sentence]')?.textContent?.trim())
      .toBe('Couldn’t restore “Kitchen”. Try again.');
    expect(query(harness, '[data-project-write-error]')).toBeNull();
    query(harness, 'app-archived-banner [data-recovery="try-again"]')!.click();
    await settle(harness);
    expect(gateway.calls.filter(({ method }) => method === 'projects.update').map(({ argument }) => argument)).toEqual([
      { id: 'project-kitchen', input: { status: 'on_hold' } },
      { id: 'project-kitchen', input: { status: 'on_hold' } },
    ]);
  });

  it('moves no focus when the restore lands after the person has opened another project', async () => {
    const { harness, gateway, router } = await open('/projects/project-kitchen', { projects: [RENOVATION, archived(KITCHEN), CABINETS, GARDEN] });
    await settle(harness);
    let land: () => void = () => {};
    const update = gateway.projects.update.bind(gateway.projects);
    gateway.projects.update = (id, input) => new Promise((resolve) => { land = () => resolve(update(id, input)); });
    restoreButton(harness).click();
    harness.fixture.detectChanges();

    // Not `settle`: the held restore is a pending task, so the fixture is not stable until it lands.
    await router.navigateByUrl('/projects/project-garden');
    for (let pass = 0; pass < 3; pass += 1) { await new Promise((resolve) => setTimeout(resolve, 0)); harness.fixture.detectChanges(); }
    expect(query(harness, 'h1[data-project-name]')?.textContent?.trim()).toBe('Garden');
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    land();
    await settle(harness);

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});

describe('Slice 81: the project place for the navigation tree (R2)', () => {
  const placeOf = () => TestBed.inject(NavigationContext).place();

  it('publishes the root, its enabled pages without the first page, and the current kind on a root page', async () => {
    const pages = [...defaults().pages, page('page-todos', RENOVATION.id, 'todos'), page('page-reflections', RENOVATION.id, 'reflections', false)];
    const { harness } = await open('/projects/project-renovation/pages/todos', { pages });
    await settle(harness);

    expect(placeOf()).toEqual({
      projectId: RENOVATION.id,
      status: 'ready',
      root: { id: RENOVATION.id, name: 'Home renovation', status: 'active' },
      ancestors: [],
      current: { id: RENOVATION.id, name: 'Home renovation', status: 'active' },
      pages: [{ kind: 'todos', label: 'Todos' }],
      currentKind: 'todos',
      addBlockedReason: null,
    });
  });

  it('publishes the first page as the current kind on a root’s own route', async () => {
    const { harness } = await open('/projects/project-renovation');
    await settle(harness);

    expect(placeOf()).toMatchObject({ status: 'ready', currentKind: 'home', pages: [] });
  });

  it('publishes a workstream as the current project, with its path from the root and no current kind', async () => {
    const { harness } = await open('/projects/project-cabinets');
    await settle(harness);

    expect(placeOf()).toMatchObject({
      projectId: CABINETS.id,
      status: 'ready',
      root: { id: RENOVATION.id },
      ancestors: [{ id: RENOVATION.id, name: 'Home renovation', status: 'active' }, { id: KITCHEN.id, name: 'Kitchen', status: 'active' }],
      current: { id: CABINETS.id, name: 'Cabinets', status: 'active' },
      currentKind: null,
    });
  });

  it('publishes archived states: an archived current project, and Add workstream’s reason on an archived root', async () => {
    const archivedRoot = { ...RENOVATION, status: 'archived' as const };
    const archivedKitchen = { ...KITCHEN, status: 'archived' as const };
    const { harness } = await open('/projects/project-kitchen', { projects: [archivedRoot, archivedKitchen, CABINETS, GARDEN] });
    await settle(harness);

    expect(placeOf()).toMatchObject({
      root: { id: RENOVATION.id, status: 'archived' },
      current: { id: KITCHEN.id, status: 'archived' },
      addBlockedReason: 'unavailable while Home renovation is archived',
    });
  });

  it('publishes a not-found project as missing, with nothing current', async () => {
    const { harness } = await open('/projects/project-renovation', {
      failOn: { 'projects.get': new GatewayError('not_found', 404, 'project "project-renovation" was not found') },
    });
    await settle(harness);

    expect(placeOf()).toEqual({
      projectId: RENOVATION.id, status: 'missing', root: null, ancestors: [], current: null, pages: [], currentKind: null, addBlockedReason: null,
    });
  });

  it('publishes a failed read as missing too', async () => {
    const { harness } = await open('/projects/project-renovation', {
      failOn: { 'projects.get': new GatewayError('internal_error', 500, 'disk on fire') },
    });
    await settle(harness);

    expect(placeOf()).toMatchObject({ status: 'missing', root: null, current: null });
  });

  // Step 4 review: the publish effect runs before the load effect, so the old record is still
  // loaded and `loading` still false; that frame must read as loading, never missing.
  it('never publishes missing, or loses the root’s rows, on a same-root move', async () => {
    const { harness, router } = await open('/projects/project-cabinets');
    await settle(harness);
    const context = TestBed.inject(NavigationContext);
    const published: string[] = [];
    const publish = context.publish.bind(context);
    vi.spyOn(context, 'publish').mockImplementation((place) => { published.push(place.status); publish(place); });
    const seen: (string | null)[] = [];
    const watch = setInterval(() => seen.push(context.place()?.root?.id ?? null), 0);

    await router.navigateByUrl('/projects/project-garden');
    seen.push(context.place()?.root?.id ?? null);
    await settle(harness);
    clearInterval(watch);

    expect(published).not.toContain('missing');
    expect(published.at(-1)).toBe('ready');
    expect(seen.every((rootId) => rootId === RENOVATION.id)).toBe(true);
  });

  it('moves the place to the next project, and clears it on leaving for the dashboard', async () => {
    const { harness, router } = await open('/projects/project-cabinets');
    await settle(harness);

    await router.navigateByUrl('/projects/project-garden');
    await settle(harness);
    expect(placeOf()).toMatchObject({ projectId: GARDEN.id, status: 'ready', current: { id: GARDEN.id } });

    await router.navigateByUrl('/app');
    await settle(harness);
    expect(placeOf()).toBeNull();
  });
});
