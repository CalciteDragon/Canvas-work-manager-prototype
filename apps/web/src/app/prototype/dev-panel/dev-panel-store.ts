import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ProjectId, PrototypeState } from '@cwm/contracts';
import { PROTOTYPE_PERSONA_STORAGE_KEY, writePersona } from '../../core/identity/prototype-identity-provider';
import { PROTOTYPE_CONTROL } from '../control/prototype-control';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Which slice a captured note belongs to (§79). Every entry in `.prototype/notes.json`
 * carries one, and they are how the log stays readable as a history rather than a pile.
 *
 * **Bump this when a slice starts.** It is a named constant rather than a literal inside
 * `addNote` precisely because a forgotten literal would silently file Slice 13's notes
 * under Slice 12 — corrupting the one field the contract goes out of its way to preserve.
 */
export const CURRENT_SLICE = 32;

/** The route shape §68 defines for a project page, and the only one carrying a project. */
const PROJECT_ROUTE = /^\/projects\/([^/?#]+)/;

/**
 * The development panel's own state (§19, §20).
 *
 * **Root-provided**, unlike every other store in the app. On `/prototype/state` the
 * overlay and the inspector page are alive at the same time and render the same controls;
 * two component-scoped stores would show two different ideas of the same host.
 */
@Injectable({ providedIn: 'root' })
export class DevPanelStore {
  private readonly control = inject(PROTOTYPE_CONTROL);
  private readonly router = inject(Router);

  private readonly stateSignal = signal<PrototypeState | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly busyState = signal(false);

  readonly state = this.stateSignal.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busy = this.busyState.asReadonly();

  readonly seeds = computed(() => this.stateSignal()?.seeds ?? []);
  readonly personas = computed(() => this.stateSignal()?.personas ?? []);

  /** Which persona the panel is acting as, read back from where the provider looks. */
  readonly activePersonaId = signal<string | null>(readPersona());

  /**
   * The date control writes an ISO instant, but a date input speaks `YYYY-MM-DD`. Nine in
   * the morning, not midnight: a simulated "today" whose tasks are all still ahead of it
   * reads very differently from one at the start of the day.
   */
  readonly simulatedDay = computed(() => this.stateSignal()?.simulatedNow.slice(0, 10) ?? '');

  async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      this.stateSignal.set(await this.control.state());
    } catch (error) {
      this.errorState.set(messageOf(error));
    } finally {
      this.loadingState.set(false);
    }
  }

  loadSeed(seed: string): Promise<boolean> {
    return this.run(() => this.control.loadSeed(seed), true);
  }

  reset(): Promise<boolean> {
    return this.run(() => this.control.reset(), true);
  }

  setSimulatedDay(day: string): Promise<boolean> {
    return this.run(() => this.control.setSimulatedNow(day === '' ? null : `${day}T09:00:00.000Z`), true);
  }

  setAIProvider(provider: 'mock' | 'real'): Promise<boolean> {
    return this.run(() => this.control.setAIProvider(provider), true);
  }

  /**
   * §17's "Switch Persona", which is a **reload**, not a re-fetch — and still is after
   * Slice 16 built §62's live updates.
   *
   * A persona change is a different session, not a data change: `PrototypeIdentityProvider`
   * memoizes a fulfilled identity for the page's lifetime, and the live stream is opened for
   * *that* persona and filtered to its workspace. Nothing the stream can deliver would move
   * the app to a new identity, so the reload is the honest instruction rather than a
   * shortcut waiting to be replaced.
   */
  switchPersona(personaId: string): void {
    writePersona(personaId);
    this.activePersonaId.set(personaId);
    this.reload();
  }

  addNote(note: string): Promise<boolean> {
    const url = this.router.url;
    return this.run(
      () =>
        this.control.addNote({
          note,
          route: url,
          projectId: projectIdFrom(url),
          slice: CURRENT_SLICE,
        }),
      false,
    );
  }

  /** The project the panel's Layout Mode control acts on, when the route names one. */
  currentProjectId(): ProjectId | null {
    return projectIdFrom(this.router.url);
  }

  private async run(operation: () => Promise<PrototypeState | unknown>, reloadAfter: boolean): Promise<boolean> {
    if (this.busyState()) return false;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      const result = await operation();
      if (isState(result)) this.stateSignal.set(result);
      if (reloadAfter) this.reload();
      return true;
    } catch (error) {
      this.errorState.set(messageOf(error));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  /** Isolated so a spec can observe the decision without the test runner navigating. */
  protected reload(): void {
    location.reload();
  }
}

const isState = (value: unknown): value is PrototypeState =>
  typeof value === 'object' && value !== null && 'seeds' in value;

const projectIdFrom = (url: string): ProjectId | null => {
  const matched = PROJECT_ROUTE.exec(url);
  return matched === null ? null : (decodeURIComponent(matched[1]!) as ProjectId);
};

const readPersona = (): string | null => {
  try {
    return localStorage.getItem(PROTOTYPE_PERSONA_STORAGE_KEY);
  } catch {
    return null;
  }
};
