import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ProjectId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { NavigationContext, type ProjectPlace, type ProjectPlaceHandlers } from './navigation-context';

@Component({ template: '' })
class Blank {}

const ROOT = { id: 'project-home' as ProjectId, name: 'Home renovation', status: 'active' as const };
const KITCHEN = { id: 'project-kitchen' as ProjectId, name: 'Kitchen', status: 'active' as const };

const ready = (overrides: Partial<ProjectPlace> = {}): ProjectPlace => ({
  projectId: ROOT.id,
  status: 'ready',
  root: ROOT,
  ancestors: [],
  current: ROOT,
  pages: [{ kind: 'todos', label: 'Todos' }],
  currentKind: 'home',
  addBlockedReason: null,
  ...overrides,
});

const setup = async () => {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'app', component: Blank }, { path: 'projects/:id', component: Blank }, { path: 'projects/:id/pages/:kind', component: Blank }])],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/projects/project-home');
  return { context: TestBed.inject(NavigationContext), router };
};

const request = () => ({ source: null, returnFocus: document.createElement('button') });

describe('NavigationContext', () => {
  it('replaces the place when a new shell for the same root publishes, without an empty frame between', async () => {
    const { context, router } = await setup();
    context.publish(ready());
    const seen: (ProjectPlace | null)[] = [];
    // The route config changes, so the old shell is destroyed and a new one publishes its load.
    await router.navigateByUrl('/projects/project-home/pages/todos');
    seen.push(context.place());
    context.publish({ projectId: ROOT.id, status: 'loading', root: null, ancestors: [], current: null, pages: [], currentKind: 'todos', addBlockedReason: null });
    seen.push(context.place());
    context.publish(ready({ currentKind: 'todos' }));
    seen.push(context.place());

    expect(seen.every((place) => place !== null)).toBe(true);
    // While loading, the previous root's rows stay and the requested place is the new one.
    expect(seen[1]).toMatchObject({ status: 'loading', root: ROOT, pages: [{ kind: 'todos', label: 'Todos' }], currentKind: 'todos' });
    expect(seen[2]).toMatchObject({ status: 'ready', currentKind: 'todos' });
  });

  it('keeps nothing of the previous root while another project loads', async () => {
    const { context } = await setup();
    context.publish(ready());
    context.publish({ projectId: KITCHEN.id, status: 'loading', root: null, ancestors: [], current: null, pages: [], currentKind: null, addBlockedReason: null });

    // The context cannot tell which root Kitchen is in; it keeps the old rows and the sidebar decides.
    expect(context.place()).toMatchObject({ projectId: KITCHEN.id, status: 'loading', root: ROOT });
  });

  it('clears the place on a NavigationEnd outside /projects/', async () => {
    const { context, router } = await setup();
    context.publish(ready());

    await router.navigateByUrl('/projects/project-home/pages/todos');
    expect(context.place()).not.toBeNull();
    await router.navigateByUrl('/app');
    expect(context.place()).toBeNull();
  });

  it('a failed or not-found load clears the root’s pages and current', async () => {
    const { context } = await setup();
    context.publish(ready());
    context.publish({ projectId: ROOT.id, status: 'missing', root: null, ancestors: [], current: null, pages: [], currentKind: null, addBlockedReason: null });

    expect(context.place()).toMatchObject({ status: 'missing', root: null, pages: [], current: null, currentKind: null });
  });

  it('does not call a handler that was registered and then disposed', async () => {
    const { context } = await setup();
    const handlers: ProjectPlaceHandlers = { openPageSettings: vi.fn(), openAddWorkstream: vi.fn() };
    const dispose = context.register(handlers);
    dispose();

    expect(context.hasHandlers()).toBe(false);
    expect(context.openPageSettings(request())).toBe(false);
    expect(context.openAddWorkstream(request())).toBe(false);
    expect(handlers.openPageSettings).not.toHaveBeenCalled();
    expect(handlers.openAddWorkstream).not.toHaveBeenCalled();
  });

  it('calls a re-created shell’s handler, once, and an old disposer does not remove it', async () => {
    const { context } = await setup();
    const first: ProjectPlaceHandlers = { openPageSettings: vi.fn(), openAddWorkstream: vi.fn() };
    const second: ProjectPlaceHandlers = { openPageSettings: vi.fn(), openAddWorkstream: vi.fn() };
    const disposeFirst = context.register(first);
    // The new shell is created before the old one is destroyed.
    context.register(second);
    disposeFirst();

    const pressed = request();
    expect(context.hasHandlers()).toBe(true);
    expect(context.openAddWorkstream(pressed)).toBe(true);
    expect(second.openAddWorkstream).toHaveBeenCalledTimes(1);
    expect(second.openAddWorkstream).toHaveBeenCalledWith(pressed);
    expect(first.openAddWorkstream).not.toHaveBeenCalled();
  });
});
