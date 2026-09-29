import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ProjectSchema } from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../gateway/work-manager-gateway';
import { shellTestProviders, testIdentity } from '../gateway/testing/shell-test-providers';
import { AppShell } from './app-shell';

const render = async (options: Parameters<typeof shellTestProviders>[0] = {}) => {
  TestBed.configureTestingModule({ imports: [AppShell], providers: shellTestProviders(options) });
  const fixture: ComponentFixture<AppShell> = TestBed.createComponent(AppShell);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

const renderShell = async (options: Parameters<typeof shellTestProviders>[0] = {}) => {
  TestBed.configureTestingModule({ imports: [AppShell], providers: shellTestProviders(options) });
  const fixture: ComponentFixture<AppShell> = TestBed.createComponent(AppShell);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
};

afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('AppShell', () => {
  it('lays out §23’s three regions', async () => {
    const element = await render();

    expect(element.querySelector('app-top-bar')).not.toBeNull();
    expect(element.querySelector('app-sidebar')).not.toBeNull();
    expect(element.querySelector('router-outlet')).not.toBeNull();
  });

  // Asserted as a transition, not an end state: a `data-theme` left behind by another test
  // would let an end-state assertion pass without the wiring existing at all.
  it('seeds the theme from the loaded identity (§22)', async () => {
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    await render({ identity: testIdentity('light') });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  // §19's half of §81's create: the store decided, the shell navigates. Nothing else proves
  // the create path ends where the user expects.
  it('navigates to the project the store created', async () => {
    const { fixture, element } = await renderShell({ projects: [] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    element.querySelector<HTMLElement>('[data-new-project]')!.click();
    fixture.detectChanges();
    const name = element.querySelector<HTMLInputElement>('[data-create-project-name]')!;
    name.value = 'Prototype review';
    element.querySelector<HTMLElement>('[data-create-project-submit]')!.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/projects', 'project-created']);
  });
});

/**
 * Slice 58's phone layout. jsdom has no `matchMedia`, so the query is stubbed and its listener
 * kept, which lets a case flip it the way a real resize does. jsdom also does not enforce
 * `inert` or run a real focus trap: those halves are `apps/e2e/phone-layout.spec.ts`'s evidence.
 */
describe('AppShell — the phone navigation drawer (Slice 58)', () => {
  const stubMatchMedia = (matches: boolean) => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const original = globalThis.matchMedia;
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches,
        media: query,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
          listeners.delete(listener),
        // The legacy pair, which the CDK's `MediaMatcher` still subscribes through.
        addListener: () => {},
        removeListener: () => {},
      }),
    });
    return {
      listeners,
      flip: (next: boolean) => [...listeners].forEach((listener) => listener({ matches: next })),
      restore: () =>
        Object.defineProperty(globalThis, 'matchMedia', { configurable: true, writable: true, value: original }),
    };
  };

  let media: ReturnType<typeof stubMatchMedia> | null = null;
  afterEach(() => {
    media?.restore();
    media = null;
    document.body.replaceChildren();
  });

  type Query = <T extends HTMLElement = HTMLElement>(selector: string) => T | null;

  /** Attached, so `focus()` and `document.activeElement` behave as they do in a page. */
  const renderAt = async (narrow: boolean, options: Parameters<typeof shellTestProviders>[0] = {}) => {
    media = stubMatchMedia(narrow);
    TestBed.configureTestingModule({ imports: [AppShell], providers: shellTestProviders(options) });
    const fixture: ComponentFixture<AppShell> = TestBed.createComponent(AppShell);
    document.body.appendChild(fixture.nativeElement);
    // Every link here is followed by the drawer, not by a route table: the empty test router
    // would reject the navigation, and nothing in this suite depends on where it lands.
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const q: Query = (selector) => element.querySelector(selector);
    // Two passes: a state change renders, and the focus move registered for after that render
    // runs on the pass it schedules.
    const stable = async () => {
      await fixture.whenStable();
      await fixture.whenStable();
    };
    const openDrawer = async () => {
      q('[data-shell-menu]')!.click();
      await stable();
    };
    return { fixture, element, q, stable, openDrawer };
  };

  it('keeps the inline sidebar at desktop width, with no Menu and no dialog semantics', async () => {
    const { q } = await renderAt(false);

    expect(q('[data-shell-menu]')).toBeNull();
    const drawer = q('#shell-navigation')!;
    expect(drawer.querySelector('app-sidebar')).not.toBeNull();
    expect(drawer.getAttribute('role')).toBeNull();
    expect(drawer.getAttribute('aria-modal')).toBeNull();
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(q('app-top-bar')!.hasAttribute('inert')).toBe(false);
    expect(q('main')!.hasAttribute('inert')).toBe(false);
    expect(q('[data-shell-drawer-close]')).toBeNull();
    expect(q('[data-shell-drawer-backdrop]')).toBeNull();
  });

  it('opens the sidebar as a labelled modal drawer at narrow width and inerts the workspace behind it', async () => {
    const { q, openDrawer } = await renderAt(true);
    const drawer = q('#shell-navigation')!;

    expect(q('[data-shell-menu]')!.getAttribute('aria-expanded')).toBe('false');
    expect(drawer.hasAttribute('inert')).toBe(true);
    expect(drawer.getAttribute('role')).toBeNull();

    await openDrawer();

    expect(q('[data-shell-menu]')!.getAttribute('aria-expanded')).toBe('true');
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-label')).toBe('Navigation');
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(q('app-top-bar')!.hasAttribute('inert')).toBe(true);
    expect(q('main')!.hasAttribute('inert')).toBe(true);
    // The sidebar's own landmark is untouched inside the dialog.
    expect(drawer.querySelector('nav[aria-label="Workspace"]')).not.toBeNull();
    expect(document.activeElement).toBe(drawer);
  });

  it.each([
    [
      'Escape inside the drawer',
      (q: Query) =>
        q('[data-shell-drawer-close]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ],
    ['the backdrop', (q: Query) => q('[data-shell-drawer-backdrop]')!.click()],
    ['Close', (q: Query) => q('[data-shell-drawer-close]')!.click()],
  ])('closes on %s and returns focus to Menu', async (_case, dismiss) => {
    const { q, stable, openDrawer } = await renderAt(true);
    await openDrawer();

    dismiss(q);
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBeNull();
    expect(q('#shell-navigation')!.hasAttribute('inert')).toBe(true);
    expect(q('main')!.hasAttribute('inert')).toBe(false);
    expect(q('[data-shell-menu]')!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(q('[data-shell-menu]'));
  });

  // The development panel closes on a `document` Escape. One key must not close both.
  it('ignores an Escape that did not come from inside the drawer', async () => {
    const { q, stable, openDrawer } = await renderAt(true);
    await openDrawer();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBe('dialog');
  });

  it.each([
    ['a destination', 'Settings'],
    ['the route already current, where the router emits no navigation', 'Home'],
  ])('closes after choosing %s and focuses the workspace', async (_case, label) => {
    const { element, q, stable, openDrawer } = await renderAt(true);
    await openDrawer();
    const link = [...element.querySelectorAll<HTMLAnchorElement>('a[data-nav-item]')].find(
      (anchor) => anchor.textContent?.trim() === label,
    )!;

    link.click();
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBeNull();
    expect(document.activeElement).toBe(q('main'));
  });

  it('closes after choosing a project from the tree', async () => {
    const project = ProjectSchema.parse({
      id: 'project-phone',
      workspaceId: 'workspace-demo',
      kind: 'root',
      name: 'Phone project',
      status: 'active',
      projectLayoutMode: 'flow',
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    });
    const { q, stable, openDrawer } = await renderAt(true, { projects: [project] });
    await openDrawer();

    q('a[data-project]')!.click();
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBeNull();
    expect(document.activeElement).toBe(q('main'));
  });

  it('stays open for the Projects toggle, New project, and a modified or middle click', async () => {
    const { q, stable, openDrawer } = await renderAt(true);
    await openDrawer();

    q('[data-projects-toggle]')!.click();
    q('[data-new-project]')!.click();
    q('a[data-nav-item]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    q('a[data-nav-item]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }));
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBe('dialog');
  });

  const submitCreate = async (q: Query, stable: () => Promise<void>) => {
    q('[data-new-project]')!.click();
    await stable();
    q<HTMLInputElement>('[data-create-project-name]')!.value = 'Phone project';
    q('[data-create-project-submit]')!.click();
    await stable();
  };

  it('closes behind a successful create and focuses the workspace', async () => {
    const { q, stable, openDrawer } = await renderAt(true, { projects: [] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openDrawer();

    await submitCreate(q, stable);

    expect(navigate).toHaveBeenCalledWith(['/projects', 'project-created']);
    expect(q('#shell-navigation')!.getAttribute('role')).toBeNull();
    expect(document.activeElement).toBe(q('main'));
  });

  it('keeps the drawer, the draft and focus in the form when the create fails', async () => {
    const { q, stable, openDrawer } = await renderAt(true, {
      projects: [],
      failOn: { 'projects.create': new GatewayError('unreachable', 0, 'the prototype host is not running') },
    });
    await openDrawer();

    await submitCreate(q, stable);

    expect(q('#shell-navigation')!.getAttribute('role')).toBe('dialog');
    expect(q('[data-create-error]')?.textContent).toContain('not running');
    expect(q<HTMLInputElement>('[data-create-project-name]')?.value).toBe('Phone project');
    expect(document.activeElement).toBe(q('[data-create-project-name]'));
  });

  // A create that fails after the person dismissed the drawer would otherwise report its error,
  // and reopen its form, inside a hidden, inert drawer where nobody hears or reaches it.
  it('reopens a dismissed drawer when a create it sent fails', async () => {
    const { q, stable, openDrawer } = await renderAt(true, { projects: [] });
    let fail: (error: unknown) => void = () => {};
    vi.spyOn(TestBed.inject(WORK_MANAGER_GATEWAY).projects, 'create').mockReturnValue(
      new Promise((_resolve, reject) => (fail = reject)),
    );
    await openDrawer();
    q('[data-new-project]')!.click();
    await stable();
    q<HTMLInputElement>('[data-create-project-name]')!.value = 'Phone project';
    q('[data-create-project-submit]')!.click();
    q('[data-shell-drawer-backdrop]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(q('#shell-navigation')!.getAttribute('role')).toBeNull();

    fail(new GatewayError('unreachable', 0, 'the prototype host is not running'));
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBe('dialog');
    expect(q('[data-create-error]')?.textContent).toContain('not running');
    expect(document.activeElement).toBe(q('[data-create-project-name]'));
  });

  // An identical second refusal does not change the sidebar's `createError` input — a template
  // binding compares by value — yet the form it closed on submit must still come back with focus.
  it('reopens the form with focus after a second, identical refusal', async () => {
    const { q, stable, openDrawer } = await renderAt(true, {
      identity: new GatewayError('unauthorized', 401, 'no persona'),
    });
    await openDrawer();

    await submitCreate(q, stable);
    expect(q('[data-create-error]')?.textContent).toContain('nowhere to put');
    q('[data-create-project-submit]')!.click();
    await stable();

    expect(q('[data-create-project-form]')).not.toBeNull();
    expect(document.activeElement).toBe(q('[data-create-project-name]'));
  });

  it('reopens the form with focus after a second, identical write failure', async () => {
    const { q, stable, openDrawer } = await renderAt(true, {
      projects: [],
      failOn: { 'projects.create': new GatewayError('unreachable', 0, 'the prototype host is not running') },
    });
    await openDrawer();

    await submitCreate(q, stable);
    q('[data-create-project-submit]')!.click();
    await stable();

    expect(q('[data-create-error]')?.textContent).toContain('not running');
    expect(q('[data-create-project-form]')).not.toBeNull();
    expect(document.activeElement).toBe(q('[data-create-project-name]'));
  });

  it('does not reopen the drawer for an old failure when the window narrows', async () => {
    const { q, stable } = await renderAt(false, {
      projects: [],
      failOn: { 'projects.create': new GatewayError('unreachable', 0, 'the prototype host is not running') },
    });
    await submitCreate(q, stable);
    expect(q('[data-create-error]')).not.toBeNull();

    media!.flip(true);
    await stable();

    expect(q('#shell-navigation')!.getAttribute('role')).toBeNull();
  });

  it('resets an open drawer on widening and leaves focus on the link it was on', async () => {
    const { q, stable, openDrawer } = await renderAt(true);
    await openDrawer();
    const link = q('a[data-nav-item]')!;
    link.focus();

    media!.flip(false);
    await stable();

    expect(q('[data-shell-menu]')).toBeNull();
    const drawer = q('#shell-navigation')!;
    expect(drawer.getAttribute('role')).toBeNull();
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(q('app-top-bar')!.hasAttribute('inert')).toBe(false);
    expect(q('main')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(link);

    // Narrowing again starts closed: no stale open state survived the round trip.
    media!.flip(true);
    await stable();
    expect(q('[data-shell-menu]')!.getAttribute('aria-expanded')).toBe('false');
  });

  it.each([
    ['Close', (q: Query) => q('[data-shell-drawer-close]')!.focus()],
    ['the dialog itself', (_q: Query) => undefined],
  ])('moves focus to the first navigation item when widening removes %s', async (_case, place) => {
    const { q, stable, openDrawer } = await renderAt(true);
    await openDrawer();
    place(q);

    media!.flip(false);
    await stable();

    expect(document.activeElement).toBe(q('[data-nav-item]'));
  });

  // Found in real use: Escape returns focus to Menu, and Menu does not exist at desktop width.
  it('moves focus to the first navigation item when widening removes the Menu it was on', async () => {
    const { q, stable } = await renderAt(true);
    q('[data-shell-menu]')!.focus();

    media!.flip(false);
    await stable();

    expect(document.activeElement).toBe(q('[data-nav-item]'));
  });

  it('rescues focus from the sidebar to Menu when narrowing hides it', async () => {
    const { q, stable } = await renderAt(false);
    q('a[data-nav-item]')!.focus();

    media!.flip(true);
    await stable();

    expect(document.activeElement).toBe(q('[data-shell-menu]'));
  });

  it('leaves focus alone when narrowing and it was not in the sidebar', async () => {
    const { q, stable } = await renderAt(false);
    q('[data-theme-toggle]')!.focus();

    media!.flip(true);
    await stable();

    expect(document.activeElement).toBe(q('[data-theme-toggle]'));
  });

  it('stops listening to the query when destroyed', async () => {
    const { fixture } = await renderAt(true);
    expect(media!.listeners.size).toBe(1);

    fixture.destroy();

    expect(media!.listeners.size).toBe(0);
  });
});
