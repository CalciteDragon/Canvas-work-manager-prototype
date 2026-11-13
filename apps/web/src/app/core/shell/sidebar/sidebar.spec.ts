import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Project, ProjectId } from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { shellTestProviders } from '../../gateway/testing/shell-test-providers';
import type { Failure } from '../../../shared/feedback/failure';
import type { ProjectPlace } from '../navigation-context';
import type { ProjectTreeNode } from '../shell-store';
import { Sidebar } from './sidebar';

const CREATE_FAILED: Failure = { sentence: 'Couldn’t create “Prototype review”. Try again.', reason: 'the prototype host is not running' };
const AT = '2026-08-01T16:00:00.000Z';

const node = (id: string, name: string, children: ProjectTreeNode[] = []): ProjectTreeNode => ({
  project: {
    id,
    workspaceId: 'workspace-demo',
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  } as unknown as Project,
  children,
});

const render = async (
  inputs: { projectTree?: ProjectTreeNode[]; failure?: Failure | null; loading?: boolean; createError?: Failure | null; hasArchived?: boolean } = {},
) => {
  TestBed.configureTestingModule({ imports: [Sidebar], providers: shellTestProviders() });
  const fixture: ComponentFixture<Sidebar> = TestBed.createComponent(Sidebar);
  fixture.componentRef.setInput('projectTree', inputs.projectTree ?? []);
  fixture.componentRef.setInput('failure', inputs.failure ?? null);
  fixture.componentRef.setInput('loading', inputs.loading ?? false);
  fixture.componentRef.setInput('createError', inputs.createError ?? null);
  if (inputs.hasArchived !== undefined) fixture.componentRef.setInput('hasArchived', inputs.hasArchived);
  const created: string[] = [];
  fixture.componentInstance.createRequested.subscribe((name) => created.push(name));
  let retries = 0;
  fixture.componentInstance.retryRequested.subscribe(() => retries++);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement, created, retries: () => retries };
};

const openCreateForm = async (
  fixture: ComponentFixture<Sidebar>,
  element: HTMLElement,
): Promise<HTMLInputElement> => {
  element.querySelector<HTMLElement>('[data-new-project]')!.click();
  await fixture.whenStable();
  return element.querySelector<HTMLInputElement>('[data-create-project-name]')!;
};

/** The visible words, without decorative (`aria-hidden`) icons. */
const wordsOf = (item: Element): string => {
  const copy = item.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const textOf = (element: HTMLElement, selector: string) => [...element.querySelectorAll(selector)].map(wordsOf);

describe('Sidebar', () => {
  it('lists §23’s destinations, in §23’s order', async () => {
    const { element } = await render();

    // Slice 81, B's top level: Projects is a group label between the destinations and Settings.
    expect(textOf(element, '[data-nav-item]')).toEqual(['Home', 'Calendar', 'Search', 'Settings', 'AI & Agents', 'Archived projects']);
    expect(textOf(element, '[data-projects-label]')).toEqual(['Projects']);
  });

  // Asserted on the rendered href, not on a `routerLink` attribute: routerLink is an input
  // and is never reflected into the DOM, so a `[routerLink]` selector would match nothing.
  it('points each destination at its §68 route', async () => {
    const { element } = await render({ projectTree: [node('project-1', 'Personal workspace')] });

    const hrefs = Object.fromEntries(
      [...element.querySelectorAll('a[data-nav-item], a[data-project]')].map((anchor) => [
        anchor.textContent?.trim(),
        anchor.getAttribute('href'),
      ]),
    );

    expect(hrefs).toMatchObject({
      Home: '/app',
      Calendar: '/calendar',
      Search: '/search',
      Settings: '/settings',
      'Personal workspace': '/projects/project-1',
    });
  });

  // Slice 81, B: "Projects" is a group label, not a toggle and not a heading (§68 has no
  // `/projects`). It takes focus only programmatically, as the failed read's recovery target.
  it('makes Projects a group label, not a toggle, a link or a heading', async () => {
    const { element } = await render({ projectTree: [node('project-1', 'Personal workspace')] });
    const label = element.querySelector<HTMLElement>('[data-projects-label]')!;

    expect(label.tagName).toBe('SPAN');
    expect(label.getAttribute('aria-expanded')).toBeNull();
    expect(label.getAttribute('tabindex')).toBe('-1');
    expect(label.hasAttribute('data-recovery-focus')).toBe(true);
    expect(element.querySelector('[data-projects-toggle]')).toBeNull();
    expect(element.querySelector('ul.projects')?.getAttribute('aria-labelledby')).toBe(label.id);
  });

  // B's top level: the live roots as links, with no disclosure; a root opens by navigating to it.
  it('lists only the roots at the top level, as links with no disclosure', async () => {
    const { element } = await render({
      projectTree: [
        node('project-renovation', 'Home renovation', [
          node('project-kitchen', 'Kitchen', [node('project-cabinets', 'Cabinets')]),
          node('project-garden', 'Garden'),
        ]),
        node('project-launch', 'Website launch'),
      ],
    });

    expect(textOf(element, '[data-project]')).toEqual(['Home renovation', 'Website launch']);
    expect(element.querySelector('[data-nav-work], [data-project-id] ul, [aria-expanded]:not([data-new-project])')).toBeNull();
    const lists = [...element.querySelectorAll('ul')];
    for (const list of lists) expect([...list.children].every((child) => child.tagName === 'LI')).toBe(true);
  });

  it('says so when there are no projects, rather than leaving a gap', async () => {
    const { element } = await render({ projectTree: [] });

    expect(element.querySelector('[data-projects-empty]')?.textContent?.trim()).toBe('No projects yet');
    expect(element.querySelector('[data-projects-empty] a')).toBeNull();
  });

  // Slice 79 (W4-034): only archived projects exist, so "No projects yet" would be false.
  it('says No active projects. with a link to Settings › Archived projects when only archived ones exist', async () => {
    const { element } = await render({ projectTree: [], hasArchived: true });
    const empty = element.querySelector<HTMLElement>('[data-projects-empty]')!;

    expect(empty.classList).toContain('state-message--empty');
    expect(empty.textContent).toContain('No active projects.');
    expect(empty.textContent).not.toContain('No projects yet');
    const link = empty.querySelector<HTMLAnchorElement>('a')!;
    expect(link.textContent?.trim()).toBe('View archives');
    expect(link.getAttribute('href')).toBe('/settings/archived-projects');
    // Slice 81, decision 2: a themed small button-link, not an underlined content link; the sidebar grows it to 44 px under a coarse pointer.
    expect([link.classList.contains('button'), link.hasAttribute('data-projects-archived-link')]).toEqual([true, true]);
  });

  it('says neither while loading or after a failure, with only archived projects', async () => {
    const loading = await render({ projectTree: [], hasArchived: true, loading: true });
    expect(loading.element.querySelector('[data-projects-empty]')).toBeNull();
    TestBed.resetTestingModule();

    const failed = await render({ projectTree: [], hasArchived: true, failure: { sentence: 'Couldn’t load your projects.', reason: null } });
    expect(failed.element.querySelector('[data-projects-empty]')).toBeNull();
  });

  it('keeps the tree, with no archived wording, when live projects exist beside archived ones', async () => {
    const { element } = await render({ projectTree: [node('project-1', 'Personal workspace')], hasArchived: true });

    expect(textOf(element, '[data-project]')).toEqual(['Personal workspace']);
    expect(element.querySelector('[data-projects-empty]')).toBeNull();
  });

  // Slice 78 (L4-001): loading is not empty.
  it('says Loading projects… while the first read is in flight, and never No projects yet', async () => {
    const { element } = await render({ projectTree: [], loading: true });

    expect(element.querySelector('[data-projects-loading]')?.textContent?.trim()).toBe('Loading projects…');
    expect(element.querySelector('[data-projects-empty]')).toBeNull();
    expect(element.querySelector('[data-projects-region]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('keeps the tree, not a loading line, when a read runs over projects already shown', async () => {
    const { element } = await render({ projectTree: [node('project-1', 'Personal workspace')], loading: true });

    expect(textOf(element, '[data-project]')).toEqual(['Personal workspace']);
    expect(element.querySelector('[data-projects-loading]')).toBeNull();
  });

  // Slice 78 (L4-002): a sentence in product words, the reason under Details, Try again — and
  // polite, not an alert, so Home's own failure is the one alert on the page.
  it('shows a failed load as a polite sentence with Try again and the reason under Details', async () => {
    const { fixture, element, retries } = await render({
      failure: { sentence: 'Couldn’t load your projects.', reason: 'could not reach the prototype host' },
    });

    const failure = element.querySelector<HTMLElement>('[data-projects-error]')!;
    expect(failure.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t load your projects.');
    expect(failure.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(failure.querySelector('details')?.textContent).toContain('could not reach');
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(failure.closest('[role="status"]')).not.toBeNull();
    expect(element.querySelector('[data-projects-empty]')).toBeNull();

    failure.querySelector<HTMLElement>('[data-recovery="try-again"]')!.click();
    await fixture.whenStable();
    expect(retries()).toBe(1);
  });

  it('keeps the failure and its Try again, busy, while the retry runs', async () => {
    const { fixture, element, retries } = await render({
      failure: { sentence: 'Couldn’t load your projects.', reason: 'boom' },
      loading: true,
    });

    const button = element.querySelector<HTMLElement>('[data-projects-error] [data-recovery="try-again"]')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(element.querySelector('[data-projects-loading]')).toBeNull();
    button.click();
    await fixture.whenStable();
    expect(retries()).toBe(0);
  });

  // §81's create, and the boundary that keeps §19 honest. The gateway is deliberately
  // **not provided**: a sidebar that injected one would throw at creation, so this fails
  // the moment a presentational component starts talking to the boundary itself.
  it('emits a create request and injects no gateway', async () => {
    TestBed.configureTestingModule({ imports: [Sidebar], providers: [provideRouter([])] });
    const fixture: ComponentFixture<Sidebar> = TestBed.createComponent(Sidebar);
    fixture.componentRef.setInput('projectTree', []);
    fixture.componentRef.setInput('failure', null);
    const created: string[] = [];
    fixture.componentInstance.createRequested.subscribe((name) => created.push(name));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const name = await openCreateForm(fixture, element);
    name.value = '  Prototype review  ';
    element.querySelector<HTMLElement>('[data-create-project-submit]')!.click();
    await fixture.whenStable();

    expect(created).toEqual(['Prototype review']);
    // And the form closed behind it — the navigation is the confirmation.
    expect(element.querySelector('[data-create-project-form]')).toBeNull();
  });

  it('refuses a blank name without emitting', async () => {
    const { fixture, element, created } = await render();
    const name = await openCreateForm(fixture, element);

    name.value = '   ';
    element.querySelector<HTMLElement>('[data-create-project-submit]')!.click();
    await fixture.whenStable();

    expect(created).toEqual([]);
    // The form stays open, because there is nothing yet to close it over.
    expect(element.querySelector('[data-create-project-form]')).not.toBeNull();
  });

  it('says Enter a name. beside a refused blank name, keeps focus there, and clears on typing (Slice 75, L4-024)', async () => {
    const { fixture, element } = await render();
    const name = await openCreateForm(fixture, element);
    expect(element.querySelector('[data-create-project-form]')?.hasAttribute('novalidate')).toBe(true);

    name.value = '';
    element.querySelector<HTMLElement>('[data-create-project-submit]')!.click();
    await fixture.whenStable();

    const message = element.querySelector<HTMLElement>('[data-create-project-name-error]')!;
    expect(message.textContent?.trim()).toBe('Enter a name.');
    expect(message.getAttribute('role')).toBe('alert');
    const field = element.querySelector<HTMLInputElement>('[data-create-project-name]')!;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(message.id);
    expect(document.activeElement).toBe(field);

    field.value = 'R';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelector('[data-create-project-name-error]')).toBeNull();
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });

  it('forgets a refusal when the form is closed and opened again', async () => {
    const { fixture, element } = await render();
    const name = await openCreateForm(fixture, element);
    name.value = '';
    element.querySelector<HTMLElement>('[data-create-project-submit]')!.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-create-project-name-error]')).not.toBeNull();

    element.querySelector<HTMLElement>('[data-new-project]')!.click();
    await fixture.whenStable();
    await openCreateForm(fixture, element);
    expect(element.querySelector('[data-create-project-name-error]')).toBeNull();
  });

  // The regression: `error` replaces the tree, so routing a failed creation onto it would
  // wipe navigation because one write failed.
  it('renders the project tree and the create error at the same time', async () => {
    const { element } = await render({
      projectTree: [node('project-1', 'Personal workspace')],
      createError: CREATE_FAILED,
    });

    // Slice 78: the sentence, polite to nothing else on Home, its reason under a closed Details.
    const error = element.querySelector<HTMLElement>('[data-create-error]')!;
    expect(error.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t create “Prototype review”. Try again.');
    expect(error.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(error.querySelector('details')?.open).toBe(false);
    expect(error.querySelector('details')?.textContent).toContain('not running');
    expect(textOf(element, '[data-project]')).toEqual(['Personal workspace']);
    expect(element.querySelector('[data-projects-error]')).toBeNull();
  });

  // A failed creation must not cost the user their typing: they would otherwise be looking
  // at an error beside a closed, empty form and have to retype the name to retry.
  it('puts the form back, with the name still in it, when the creation fails', async () => {
    const { fixture, element } = await render();
    const name = await openCreateForm(fixture, element);
    name.value = 'Prototype review';
    element.querySelector<HTMLElement>('[data-create-project-submit]')!.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-create-project-form]')).toBeNull();

    fixture.componentRef.setInput('createError', CREATE_FAILED);
    await fixture.whenStable();

    expect(element.querySelector('[data-create-project-form]')).not.toBeNull();
    const field = element.querySelector<HTMLInputElement>('[data-create-project-name]')!;
    expect(field.value).toBe('Prototype review');
    // The reopened name is described by the sentence alone, never the reason.
    const sentence = element.querySelector('[data-create-error] [data-failure-sentence]');
    expect(sentence?.textContent?.trim()).toBe('Couldn’t create “Prototype review”. Try again.');
    expect(element.querySelector(`#${field.getAttribute('aria-describedby')}`)).toBe(sentence);
  });

  // Slice 58: the optimistic close removed the focused Create button, so without this focus
  // falls to the document — at every width, and out of the phone drawer entirely.
  it('moves focus back into the name input when a failed creation reopens the form', async () => {
    const { fixture, element } = await render();
    document.body.appendChild(element);
    try {
      const name = await openCreateForm(fixture, element);
      name.value = 'Prototype review';
      const submit = element.querySelector<HTMLElement>('[data-create-project-submit]')!;
      submit.focus();
      submit.click();
      await fixture.whenStable();

      fixture.componentRef.setInput('createError', CREATE_FAILED);
      await fixture.whenStable();
      await fixture.whenStable();

      expect(document.activeElement).toBe(element.querySelector('[data-create-project-name]'));
    } finally {
      element.remove();
    }
  });

  // Slice 72 (W2-001, W4-002, W1-004, W3-007): opening the form is the form's own control, so
  // focus goes straight into the name rather than staying on the "+" that opened it.
  it('moves focus into the name field when New project opens the form', async () => {
    const { fixture, element } = await render();
    document.body.appendChild(element);
    try {
      const plus = element.querySelector<HTMLElement>('[data-new-project]')!;
      plus.focus();
      plus.click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(document.activeElement).toBe(element.querySelector('[data-create-project-name]'));
    } finally {
      element.remove();
    }
  });

  // Slice 72 (W1-003): the label is visible, not clipped away, and it keeps the name the core
  // task script uses.
  it('labels the name field with a visible "Project name" control label', async () => {
    const { fixture, element } = await render();
    await openCreateForm(fixture, element);

    const label = element.querySelector<HTMLLabelElement>('label[for="new-project-name"]')!;
    expect(label.textContent?.trim()).toBe('Project name');
    expect(label.classList).toContain('control-label');
    expect(label.classList).not.toContain('create-project__label');
  });
});

@Component({ template: '' })
class Blank {}

const HOME_RENOVATION = { id: 'project-renovation' as ProjectId, name: 'Home renovation', status: 'active' as const };
const KITCHEN = { id: 'project-kitchen' as ProjectId, name: 'Kitchen', status: 'active' as const };
const LEGACY_ATTIC = { id: 'project-attic' as ProjectId, name: 'Legacy attic', status: 'archived' as const };
const LEGACY_SHELVING = { id: 'project-shelving' as ProjectId, name: 'Legacy shelving', status: 'active' as const };

/** `nested-projects`' shape, as `ShellStore` reads it: Legacy attic is archived, so neither it nor its live child is listed. */
const TREE = (): ProjectTreeNode[] => [
  node('project-renovation', 'Home renovation', [
    node('project-kitchen', 'Kitchen', [node('project-cabinets', 'Cabinets')]),
    node('project-garden', 'Garden'),
  ]),
  node('project-launch', 'Website launch'),
];

const place = (overrides: Partial<ProjectPlace> = {}): ProjectPlace => ({
  projectId: HOME_RENOVATION.id,
  status: 'ready',
  root: HOME_RENOVATION,
  ancestors: [],
  current: HOME_RENOVATION,
  pages: [{ kind: 'todos', label: 'Todos' }, { kind: 'reflections', label: 'Reflections' }],
  currentKind: 'home',
  addBlockedReason: null,
  ...overrides,
});

/** The tree at a real URL, so `routerLinkActive` marks destinations as the app does. */
const renderAt = async (url: string, projectPlace: ProjectPlace | null, projectTree: ProjectTreeNode[] = TREE()) => {
  TestBed.configureTestingModule({
    imports: [Sidebar],
    providers: [...shellTestProviders(), provideRouter([{ path: '**', component: Blank }])],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(Sidebar);
  fixture.componentRef.setInput('projectTree', projectTree);
  fixture.componentRef.setInput('failure', null);
  fixture.componentRef.setInput('projectPlace', projectPlace);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const current = () => [...element.querySelectorAll('[aria-current]')].map((item) => [wordsOf(item), item.getAttribute('aria-current')]);
  return { fixture, element, current };
};

describe('Sidebar — one navigation tree (Slice 81, B)', () => {
  it('lists destinations, Projects with the live roots, and Settings with its children outside a project', async () => {
    const { element } = await renderAt('/calendar', null);

    expect(textOf(element, '[data-nav-item]')).toEqual(['Home', 'Calendar', 'Search', 'Settings', 'AI & Agents', 'Archived projects']);
    expect(textOf(element, '[data-project]')).toEqual(['Home renovation', 'Website launch']);
    expect(element.querySelector('[data-nav-root]')).toBeNull();
    const hrefs = Object.fromEntries([...element.querySelectorAll('a[data-nav-item]')].map((link) => [link.textContent?.trim(), link.getAttribute('href')]));
    expect(hrefs).toMatchObject({ 'AI & Agents': '/settings/agents', 'Archived projects': '/settings/archived-projects' });
  });

  it('shows only the root level inside a project: the root’s row, its enabled pages and its workstreams', async () => {
    const { element } = await renderAt('/projects/project-renovation', place());

    expect(element.querySelector('[data-nav-item], [data-project], [data-projects-label]')).toBeNull();
    const root = element.querySelector<HTMLAnchorElement>('a[data-nav-root]')!;
    expect(wordsOf(root)).toBe('Home renovation');
    expect(root.getAttribute('href')).toBe('/projects/project-renovation');
    // Q5 (d): no Home row; the root's own row opens its first page. Q16 (b): only enabled pages.
    expect([...element.querySelectorAll('a[data-nav-page]')].map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Todos', '/projects/project-renovation/pages/todos'],
      ['Reflections', '/projects/project-renovation/pages/reflections'],
    ]);
    // Step 5 (Q4 (a)): a workstream's children are behind its disclosure, closed unless they hold the current item.
    expect(textOf(element, 'a[data-nav-work]')).toEqual(['Kitchen', 'Garden']);
    for (const list of element.querySelectorAll('ul')) expect([...list.children].every((child) => child.tagName === 'LI')).toBe(true);
  });

  it.each([
    ['the dashboard', '/app', null, [['Home', 'page']]],
    ['a Settings child', '/settings/agents', null, [['AI & Agents', 'page']]],
    ['Settings itself', '/settings', null, [['Settings', 'page']]],
    ['a root’s first page', '/projects/project-renovation', place(), [['Home renovation', 'page']]],
    ['a root page', '/projects/project-renovation/pages/todos', place({ currentKind: 'todos' }), [['Todos', 'page']]],
    ['a workstream', '/projects/project-cabinets', place({ projectId: 'project-cabinets' as ProjectId, current: { id: 'project-cabinets' as ProjectId, name: 'Cabinets', status: 'active' }, ancestors: [HOME_RENOVATION, KITCHEN], currentKind: null }), [['Cabinets', 'page']]],
    ['an archived workstream', '/projects/project-attic', place({ projectId: LEGACY_ATTIC.id, current: LEGACY_ATTIC, ancestors: [HOME_RENOVATION], currentKind: null }), [['Legacy attic Archived', 'page']]],
  ] as const)('marks exactly one current item on %s', async (_name, url, projectPlace, expected) => {
    const { current } = await renderAt(url, projectPlace);

    expect(current()).toEqual(expected);
  });

  // Q11 (a): live work under an archived ancestor is not in the projects read; while current it is drawn under its real path.
  it('draws the current item under its real path when the read does not list it', async () => {
    const { element, current } = await renderAt(
      '/projects/project-shelving',
      place({ projectId: LEGACY_SHELVING.id, current: LEGACY_SHELVING, ancestors: [HOME_RENOVATION, LEGACY_ATTIC], currentKind: null }),
    );

    expect(current()).toEqual([['Legacy shelving', 'page']]);
    const attic = element.querySelector('[data-nav-work-id="project-attic"]')!;
    expect(wordsOf(attic.querySelector('a[data-nav-work]')!)).toBe('Legacy attic Archived');
    expect(attic.querySelector('[data-nav-work-id="project-shelving"]')).not.toBeNull();
  });

  it('shows the top level without navigating, and marks the current root as the location, not the page', async () => {
    const { fixture, element, current } = await renderAt('/projects/project-cabinets', place({
      projectId: 'project-cabinets' as ProjectId, current: { id: 'project-cabinets' as ProjectId, name: 'Cabinets', status: 'active' }, ancestors: [HOME_RENOVATION, KITCHEN], currentKind: null,
    }));
    const url = TestBed.inject(Router).url;

    fixture.componentInstance.showTopLevel();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(url);
    expect(element.querySelector('[data-nav-root]')).toBeNull();
    expect(textOf(element, '[data-project]')).toEqual(['Home renovation', 'Website launch']);
    expect(current()).toEqual([['Home renovation', 'location']]);
  });

  // Q11 (a) at the top level: the read leaves an archived root out, so while it is current it is
  // drawn there, marked, to carry the location (step 4 review).
  it('draws an archived current root at the top level as the location, marked Archived', async () => {
    const archived = { ...HOME_RENOVATION, status: 'archived' as const };
    const { fixture, element, current } = await renderAt('/projects/project-renovation', place({ root: archived, current: archived }), [node('project-launch', 'Website launch')]);
    expect(current()).toEqual([['Home renovation Archived', 'page']]);

    fixture.componentInstance.showTopLevel();
    await fixture.whenStable();

    expect(textOf(element, '[data-project]')).toEqual(['Website launch', 'Home renovation Archived']);
    expect(current()).toEqual([['Home renovation Archived', 'location']]);
  });

  it('keeps the top level for a modified or middle click, which opens elsewhere', async () => {
    const { fixture, element } = await renderAt('/projects/project-renovation', place());
    fixture.componentInstance.showTopLevel();
    await fixture.whenStable();
    const link = element.querySelector<HTMLAnchorElement>('[data-project-id="project-launch"] a')!;
    link.addEventListener('click', (event) => event.preventDefault());

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }));
    await fixture.whenStable();

    expect(element.querySelector('[data-nav-root]')).toBeNull();
  });

  it('returns to the current place’s level on a place change', async () => {
    const { fixture, element, current } = await renderAt('/projects/project-renovation', place());
    fixture.componentInstance.showTopLevel();
    await fixture.whenStable();

    await TestBed.inject(Router).navigateByUrl('/projects/project-renovation/pages/todos');
    fixture.componentRef.setInput('projectPlace', place({ currentKind: 'todos' }));
    await fixture.whenStable();

    expect(element.querySelector('[data-nav-root]')).not.toBeNull();
    expect(current()).toEqual([['Todos', 'page']]);
  });

  it('returns to the root level when a link in the tree is chosen, even one to the current page', async () => {
    const { fixture, element } = await renderAt('/projects/project-renovation', place());
    fixture.componentInstance.showTopLevel();
    await fixture.whenStable();

    element.querySelector<HTMLAnchorElement>('[data-project-id="project-renovation"] a')!.click();
    await fixture.whenStable();

    expect(element.querySelector('[data-nav-root]')).not.toBeNull();
  });

  it('keeps the previous root’s rows while a project of the same root loads', async () => {
    const { element, current } = await renderAt('/projects/project-kitchen', place({ projectId: KITCHEN.id, status: 'loading', currentKind: null }));

    expect(wordsOf(element.querySelector('[data-nav-root]')!)).toBe('Home renovation');
    expect(textOf(element, 'a[data-nav-page]')).toEqual(['Todos', 'Reflections']);
    expect(current()).toEqual([['Kitchen', 'page']]);
  });

  it('shows another root’s row alone, with nothing of the previous root, until its pages arrive', async () => {
    const { element } = await renderAt('/projects/project-launch', place({ projectId: 'project-launch' as ProjectId, status: 'loading', currentKind: null }));

    expect(wordsOf(element.querySelector('[data-nav-root]')!)).toBe('Website launch');
    expect(element.querySelector('[data-nav-page], [data-nav-work]')).toBeNull();
  });

  it('marks nothing in a project whose load failed or was not found', async () => {
    const { element, current } = await renderAt('/projects/project-gone', place({ projectId: 'project-gone' as ProjectId, status: 'missing', root: null, current: null, pages: [], currentKind: null }));

    expect(current()).toEqual([]);
    expect(element.querySelector('[data-nav-root]')).toBeNull();
    expect(textOf(element, '[data-project]')).toEqual(['Home renovation', 'Website launch']);
  });

  // L5-008, L2-012: the marker is a shape (a bar and weight) from tokens, drawn by the one global
  // `.tree-link` row in `_controls.scss`, so it is the same in both themes and kept under forced
  // colours. Unit tests load no global styles, so the browser check is the e2e rig's; here every
  // current item, destinations included, has to be that row.
  it.each([
    ['/app', null],
    ['/settings/agents', null],
    ['/projects/project-renovation/pages/todos', place({ currentKind: 'todos' })],
    ['/projects/project-cabinets', place({ projectId: 'project-cabinets' as ProjectId, current: { id: 'project-cabinets' as ProjectId, name: 'Cabinets', status: 'active' }, ancestors: [HOME_RENOVATION, KITCHEN], currentKind: null })],
  ] as const)('draws the current item at %s as the one tree row', async (url, projectPlace) => {
    const { element } = await renderAt(url, projectPlace);
    const marked = [...element.querySelectorAll<HTMLElement>('[aria-current]')];

    expect(marked).toHaveLength(1);
    expect(marked[0]!.classList).toContain('tree-link');
    expect(marked[0]!.getAttribute('style')).toBeNull();
    expect(element.querySelectorAll('a:not(.tree-link):not([data-projects-archived-link])')).toHaveLength(0);
  });
});

/** A chain of `depth` workstreams under Home renovation, each the only child of the one before. */
const chain = (depth: number): ProjectTreeNode[] => {
  let nodes: ProjectTreeNode[] = [];
  for (let level = depth; level >= 1; level--) nodes = [node(`project-level-${level}`, `Level ${level}`, nodes)];
  return [node('project-renovation', 'Home renovation', nodes)];
};

const CABINETS_PLACE = (): ProjectPlace => place({
  projectId: 'project-cabinets' as ProjectId, current: { id: 'project-cabinets' as ProjectId, name: 'Cabinets', status: 'active' }, ancestors: [HOME_RENOVATION, KITCHEN], currentKind: null,
});

/** Attached, so focus behaves as in a page. */
const renderAttached = async (url: string, projectPlace: ProjectPlace | null, options: { projectTree?: ProjectTreeNode[]; projectActions?: boolean } = {}) => {
  const rendered = await renderAt(url, projectPlace, options.projectTree);
  if (options.projectActions !== undefined) rendered.fixture.componentRef.setInput('projectActions', options.projectActions);
  document.body.appendChild(rendered.element);
  await rendered.fixture.whenStable();
  const settle = async () => { await rendered.fixture.whenStable(); await rendered.fixture.whenStable(); };
  const disclosure = (name: string) => [...rendered.element.querySelectorAll<HTMLButtonElement>('button[data-nav-disclosure]')].find((button) => button.getAttribute('aria-label')?.endsWith(`${name}’s workstreams`));
  return { ...rendered, settle, disclosure };
};

describe('Sidebar — tree interaction (Slice 81, step 5)', () => {
  afterEach(() => document.body.replaceChildren());

  it('puts a chevron named All projects at the start of the root level’s action row, with a tooltip from its name', async () => {
    const { element } = await renderAttached('/projects/project-renovation', place());
    const row = element.querySelector('[data-nav-actions]')!;
    const chevron = row.querySelector<HTMLButtonElement>('button[data-nav-up]')!;

    expect(row.firstElementChild).toBe(chevron);
    expect(chevron.getAttribute('aria-label')).toBe('All projects');
    expect(chevron.classList).toContain('icon-button');
    expect(chevron.getAttribute('data-tooltip')).toBe('All projects');
    expect(chevron.hasAttribute('title')).toBe(false);
  });

  it('has no action row outside a project', async () => {
    const { element } = await renderAttached('/calendar', null, { projectActions: true });

    expect(element.querySelector('[data-nav-actions], [data-nav-up], [data-edit-project]')).toBeNull();
  });

  it('goes up a level from the chevron without navigating, with focus on the current root’s row', async () => {
    const { element, settle, current } = await renderAttached('/projects/project-cabinets', CABINETS_PLACE());
    const url = TestBed.inject(Router).url;

    element.querySelector<HTMLButtonElement>('[data-nav-up]')!.click();
    await settle();

    expect(TestBed.inject(Router).url).toBe(url);
    expect(current()).toEqual([['Home renovation', 'location']]);
    expect(document.activeElement).toBe(element.querySelector('[data-project-id="project-renovation"] a'));
  });

  it('draws the pencil only while a project shell listens, and names the root in its menu', async () => {
    const without = await renderAttached('/projects/project-renovation', place());
    expect(without.element.querySelector('[data-edit-project]')).toBeNull();
    without.element.remove();
    TestBed.resetTestingModule();

    const { element } = await renderAttached('/projects/project-renovation', place(), { projectActions: true });
    const row = element.querySelector('[data-nav-actions]')!;

    expect(row.lastElementChild?.querySelector('[data-edit-project]')).not.toBeNull();
    expect(element.querySelector('[data-edit-project-pages]')?.textContent?.trim()).toBe('Pages of Home renovation…');
    const add = element.querySelector<HTMLElement>('[data-edit-project-add]')!;
    expect(element.querySelector(`#${add.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('in Home renovation');
  });

  it('hands an archived root’s reason to its unavailable Add workstream', async () => {
    const reason = 'Home renovation is archived. Restore it to add workstreams.';
    const { element } = await renderAttached('/projects/project-renovation', place({ addBlockedReason: reason }), { projectActions: true });
    const add = element.querySelector<HTMLElement>('[data-edit-project-add]')!;

    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(element.querySelector(`#${add.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe(reason);
  });

  it('passes the pencil’s two requests on, with the pencil', async () => {
    const { fixture, element, settle } = await renderAttached('/projects/project-renovation', place(), { projectActions: true });
    const pages: HTMLElement[] = [];
    const add: HTMLElement[] = [];
    fixture.componentInstance.pageSettingsRequested.subscribe((source) => pages.push(source));
    fixture.componentInstance.addWorkstreamRequested.subscribe((source) => add.push(source));

    element.querySelector<HTMLElement>('[data-edit-project-pages]')!.click();
    element.querySelector<HTMLElement>('[data-edit-project-add]')!.click();
    await settle();

    const pencil = element.querySelector('[data-edit-project]');
    expect(pages).toEqual([pencil]);
    expect(add).toEqual([pencil]);
  });

  // WCAG 1.4.13: a tooltip can be dismissed without moving focus. Inside the drawer, which closes
  // on any Escape that reaches it, the first Escape hides the tooltip and the second closes it.
  it.each([['the chevron', '[data-nav-up]'], ['the pencil', '[data-edit-project]']])('hides %s’s showing tooltip on Escape, keeping that Escape from a parent; a second reaches it', async (_name, selector) => {
    const { element, settle } = await renderAttached('/projects/project-renovation', place(), { projectActions: true });
    const parentEscape = vi.fn();
    document.body.addEventListener('keydown', parentEscape);
    const control = element.querySelector<HTMLElement>(selector)!;
    const escape = () => control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    control.focus();

    escape();
    expect(control.hasAttribute('data-tooltip-hidden')).toBe(true);
    expect(parentEscape).not.toHaveBeenCalled();
    escape();
    expect(parentEscape).toHaveBeenCalledOnce();

    control.blur();
    await settle();
    expect(control.hasAttribute('data-tooltip-hidden')).toBe(false);
    document.body.removeEventListener('keydown', parentEscape);
  });

  // Q4 (a): disclosure links, every control in the Tab order, in the tree's reading order.
  it('orders Tab as chevron, pencil, root, pages, then each workstream and its expand button', async () => {
    const { element } = await renderAttached('/projects/project-cabinets', CABINETS_PLACE(), { projectActions: true });
    const focusable = [...element.querySelectorAll<HTMLElement>('a[href], button')].filter((item) => item.tabIndex >= 0 && item.closest('[popover]') === null);

    expect(focusable.map((item) => item.getAttribute('aria-label') ?? wordsOf(item))).toEqual([
      'All projects', 'Edit project', 'Home renovation', 'Todos', 'Reflections',
      'Kitchen', 'Hide Kitchen’s workstreams', 'Cabinets', 'Garden',
    ]);
  });

  it('gives only a workstream with children a disclosure, closed unless it holds the current item', async () => {
    const { element, disclosure, settle } = await renderAttached('/projects/project-renovation', place());
    const kitchen = disclosure('Kitchen')!;

    expect(element.querySelectorAll('button[data-nav-disclosure]')).toHaveLength(1);
    expect(kitchen.getAttribute('aria-expanded')).toBe('false');
    expect(kitchen.getAttribute('aria-label')).toBe('Show Kitchen’s workstreams');
    expect(element.querySelector('[data-nav-work-id="project-cabinets"]')).toBeNull();

    kitchen.click();
    await settle();

    expect(kitchen.getAttribute('aria-expanded')).toBe('true');
    expect(kitchen.getAttribute('aria-label')).toBe('Hide Kitchen’s workstreams');
    expect(element.querySelector('[data-nav-work-id="project-kitchen"] [data-nav-work-id="project-cabinets"]')).not.toBeNull();
  });

  it('expands the current item’s ancestors', async () => {
    const { element, disclosure } = await renderAttached('/projects/project-cabinets', CABINETS_PLACE());

    expect(disclosure('Kitchen')!.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('[data-nav-work-id="project-cabinets"] a')?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps a workstream opened by hand open across a place change in the same root', async () => {
    const { fixture, disclosure, settle } = await renderAttached('/projects/project-renovation', place());
    disclosure('Kitchen')!.click();
    await settle();

    await TestBed.inject(Router).navigateByUrl('/projects/project-renovation/pages/todos');
    fixture.componentRef.setInput('projectPlace', place({ currentKind: 'todos' }));
    await settle();

    expect(disclosure('Kitchen')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('indents depth 6 as depth 4, and carries the whole path', async () => {
    const deepest = { id: 'project-level-6' as ProjectId, name: 'Level 6', status: 'active' as const };
    const ancestors = [1, 2, 3, 4, 5].map((level) => ({ id: `project-level-${level}` as ProjectId, name: `Level ${level}`, status: 'active' as const }));
    const { element } = await renderAttached('/projects/project-level-6', place({ projectId: deepest.id, current: deepest, ancestors: [HOME_RENOVATION, ...ancestors], currentKind: null }), { projectTree: chain(6) });
    const indents = (id: string) => {
      let count = 0;
      for (let at = element.querySelector(`[data-nav-work-id="${id}"]`)?.parentElement ?? null; at !== null; at = at.parentElement) {
        if (at.matches('ul.tree-children:not(.tree-children--flat)')) count++;
      }
      return count;
    };

    expect(element.querySelector('[data-nav-work-id="project-level-6"] a')?.getAttribute('aria-current')).toBe('page');
    expect(indents('project-level-4')).toBe(4);
    expect(indents('project-level-5')).toBe(4);
    expect(indents('project-level-6')).toBe(4);
  });

  // Q11 (a): an archived row is muted by a contrast-passing token colour (the browser check
  // measures it), not by opacity.
  it('marks archived rows with the archived row class and no inline opacity', async () => {
    const { element } = await renderAttached('/projects/project-shelving', place({ projectId: LEGACY_SHELVING.id, current: LEGACY_SHELVING, ancestors: [HOME_RENOVATION, LEGACY_ATTIC], currentKind: null }));
    const attic = element.querySelector<HTMLElement>('[data-nav-work-id="project-attic"] > .tree-row > a')!;

    expect(attic.classList).toContain('tree-link--archived');
    expect(attic.getAttribute('style')).toBeNull();
  });

  it('puts no heading in the tree, at either level', async () => {
    const inside = await renderAttached('/projects/project-renovation', place(), { projectActions: true });
    expect(inside.element.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')).toBeNull();
    inside.fixture.componentInstance.showTopLevel();
    await inside.settle();
    expect(inside.element.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')).toBeNull();
  });

  // Decision 2: no underlined blue link in the navigation. View archives is a themed button-link.
  it('draws View archives as a themed control, not a content link', async () => {
    const { element } = await render({ projectTree: [], hasArchived: true });
    const link = element.querySelector('[data-projects-archived-link]')!;

    expect(link.classList).toContain('button');
    expect(link.classList).not.toContain('link');
  });
});
