import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Project } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { provideRouter } from '@angular/router';
import { shellTestProviders } from '../../gateway/testing/shell-test-providers';
import type { Failure } from '../../../shared/feedback/failure';
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
  inputs: { projectTree?: ProjectTreeNode[]; failure?: Failure | null; loading?: boolean; createError?: Failure | null } = {},
) => {
  TestBed.configureTestingModule({ imports: [Sidebar], providers: shellTestProviders() });
  const fixture: ComponentFixture<Sidebar> = TestBed.createComponent(Sidebar);
  fixture.componentRef.setInput('projectTree', inputs.projectTree ?? []);
  fixture.componentRef.setInput('failure', inputs.failure ?? null);
  fixture.componentRef.setInput('loading', inputs.loading ?? false);
  fixture.componentRef.setInput('createError', inputs.createError ?? null);
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

const textOf = (element: HTMLElement, selector: string) =>
  [...element.querySelectorAll(selector)].map((node) => node.textContent?.trim());

describe('Sidebar', () => {
  it('lists §23’s destinations, in §23’s order', async () => {
    const { element } = await render();

    expect(textOf(element, '[data-nav-item]')).toEqual(['Home', 'Projects', 'Calendar', 'Search', 'Settings']);
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

  // §68 defines `/projects/:projectId` and no `/projects`, so the group header navigates
  // nowhere. A `<div (click)>` would satisfy "not a link" while being unreachable by
  // keyboard, which is why the tag and aria-expanded are pinned.
  it('makes Projects a keyboard-operable group header rather than a link', async () => {
    const { fixture, element } = await render({ projectTree: [node('project-1', 'Personal workspace')] });
    const header = element.querySelector<HTMLElement>('[data-projects-toggle]');

    expect(header?.tagName).toBe('BUTTON');
    expect(header?.getAttribute('href')).toBeNull();
    expect(header?.getAttribute('aria-expanded')).toBe('true');

    header?.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-projects-toggle]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders all three levels of the nested-projects seed inline', async () => {
    const { element } = await render({
      projectTree: [
        node('project-renovation', 'Home renovation', [
          node('project-kitchen', 'Kitchen', [node('project-cabinets', 'Cabinets')]),
          node('project-garden', 'Garden'),
        ]),
      ],
    });

    expect(textOf(element, '[data-project]')).toEqual(['Home renovation', 'Kitchen', 'Cabinets', 'Garden']);
    const cabinets = element.querySelector('[data-project-id="project-cabinets"]');
    expect(cabinets?.closest('[data-project-id="project-kitchen"]')).not.toBeNull();
  });

  it('says so when there are no projects, rather than leaving a gap', async () => {
    const { element } = await render({ projectTree: [] });

    expect(element.querySelector('[data-projects-empty]')?.textContent).toContain('No projects');
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

  it('offers New project with the group collapsed', async () => {
    const { fixture, element } = await render({ projectTree: [node('project-1', 'Personal workspace')] });

    element.querySelector<HTMLElement>('[data-projects-toggle]')!.click();
    await fixture.whenStable();

    expect(element.querySelector('[data-project]')).toBeNull();
    expect(element.querySelector('[data-new-project]')).not.toBeNull();
  });
});
