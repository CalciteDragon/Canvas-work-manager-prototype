import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { PROTOTYPE_PERSONA_STORAGE_KEY } from '../../core/identity/prototype-identity-provider';
import { PROTOTYPE_CONTROL } from '../control/prototype-control';
import { FakePrototypeControl, testPrototypeState } from '../control/testing/fake-prototype-control';
import { DevPanelStore } from './dev-panel-store';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

const setup = (control = new FakePrototypeControl()) => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'app', component: PlaceholderPage },
        { path: 'projects/:projectId', component: PlaceholderPage },
      ]),
      { provide: PROTOTYPE_CONTROL, useValue: control },
    ],
  });
  const store = TestBed.inject(DevPanelStore);
  // The panel reloads the app after a host-state change; a spec must not reload the runner.
  const reload = vi.spyOn(store as unknown as { reload: () => void }, 'reload').mockImplementation(() => undefined);
  return { store, control, reload, router: TestBed.inject(Router) };
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('DevPanelStore', () => {
  it('loads the host state the panel renders itself from', async () => {
    const { store } = setup();

    await store.load();

    expect(store.state()?.seed).toBe('busy-week');
    expect(store.seeds()).toContain('overdue-chaos');
    expect(store.personas().map(({ name }) => name)).toEqual(['Demo User', 'Alex']);
    expect(store.error()).toBeNull();
  });

  it('reports a load failure instead of rendering a half-empty panel', async () => {
    const { store } = setup(new FakePrototypeControl(testPrototypeState(), new GatewayError('unreachable', 0, 'host is down')));

    await store.load();

    expect(store.state()).toBeNull();
    expect(store.error()).toBe('host is down');
  });

  it('loads a seed and reloads the app, because every store has already loaded once', async () => {
    const { store, control, reload } = setup();

    await expect(store.loadSeed('overdue-chaos')).resolves.toBe(true);

    expect(control.calls.at(-1)).toEqual({ method: 'loadSeed', argument: 'overdue-chaos' });
    expect(store.state()?.seed).toBe('overdue-chaos');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('sends nine in the morning for a picked day, and null to return to real time', async () => {
    const { store, control } = setup();

    await store.setSimulatedDay('2026-08-18');
    expect(control.calls.at(-1)).toEqual({ method: 'setSimulatedNow', argument: '2026-08-18T09:00:00.000Z' });

    await store.setSimulatedDay('');
    expect(control.calls.at(-1)).toEqual({ method: 'setSimulatedNow', argument: null });
  });

  it('swaps the AI provider and reports the new mode', async () => {
    const { store } = setup();

    await store.setAIProvider('real');

    expect(store.state()?.aiProvider).toBe('real');
  });

  it('resets to the default seed and real time (§76)', async () => {
    const { store } = setup();

    await store.reset();

    expect(store.state()?.seed).toBe('personal-workspace');
    expect(store.state()?.clockOffsetMs).toBe(0);
  });

  // §17: the persona is the storage key the identity provider reads, and a reload is what
  // makes it visible — the resolved identity is memoized for the page's lifetime.
  it('switches persona by writing the key the identity provider reads, then reloading', () => {
    const { store, reload } = setup();

    store.switchPersona('user-alex');

    expect(localStorage.getItem(PROTOTYPE_PERSONA_STORAGE_KEY)).toBe('user-alex');
    expect(store.activePersonaId()).toBe('user-alex');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves prior state intact when an action fails', async () => {
    const { store } = setup();
    await store.load();
    const failing = new FakePrototypeControl(testPrototypeState(), new GatewayError('busy', 503, 'a unit of work is in progress'));
    TestBed.resetTestingModule();
    const second = setup(failing);
    await second.store.load();

    expect(await second.store.loadSeed('empty')).toBe(false);
    expect(second.store.error()).toBe('a unit of work is in progress');
    expect(second.reload).not.toHaveBeenCalled();
  });

  describe('§79 notes', () => {
    it('captures the route and the project when one is open', async () => {
      const { store, control, router } = setup();
      await router.navigateByUrl('/projects/project-launch');

      await store.addNote('The seed control needs a confirmation step.');

      expect(control.notes.at(-1)).toMatchObject({
        route: '/projects/project-launch',
        projectId: 'project-launch',
        slice: 13,
        note: 'The seed control needs a confirmation step.',
      });
    });

    it('captures a null project off a project page, and does not reload', async () => {
      const { store, control, reload, router } = setup();
      await router.navigateByUrl('/app');

      await store.addNote('The dashboard is the right first screen.');

      expect(control.notes.at(-1)).toMatchObject({ route: '/app', projectId: null });
      expect(reload).not.toHaveBeenCalled();
    });

    it('knows the project the Layout Mode control should act on', async () => {
      const { store, router } = setup();
      await router.navigateByUrl('/projects/project-launch');
      expect(store.currentProjectId()).toBe('project-launch');

      await router.navigateByUrl('/app');
      expect(store.currentProjectId()).toBeNull();
    });
  });
});
