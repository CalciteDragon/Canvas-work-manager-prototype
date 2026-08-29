import { Injectable, signal } from '@angular/core';

/**
 * §47's flags, verbatim. **One service, never a scattered `if (prototypeMode)`** — this is
 * the only place in the application that says what a prototype flag is, and every consumer
 * reads the signal rather than inventing its own check.
 *
 * Two of the six gate something today. `subtasks` (Slice 20), `manualProgress`,
 * `aiSummarySections` and `agentConfirmations` (Slice 22) gate features that do not exist
 * yet: they are declared because §47 pins the interface, and because the slice that builds
 * each one should find its flag already here rather than adding a seventh idea of what a
 * flag is. The panel labels them so the UI does not claim otherwise.
 */
export interface PrototypeFlags {
  gridProjectLayout: boolean;
  nestedProjects: boolean;
  subtasks: boolean;
  manualProgress: boolean;
  aiSummarySections: boolean;
  agentConfirmations: boolean;
}

export const DEFAULT_FLAGS: PrototypeFlags = {
  gridProjectLayout: true,
  nestedProjects: true,
  subtasks: true,
  manualProgress: true,
  aiSummarySections: true,
  agentConfirmations: true,
};

/** §46's own example list: `none / 300 ms / 1 second / 3 seconds`. */
export const NETWORK_DELAYS = [0, 300, 1000, 3000] as const;

/** §46 gives no ladder for this one. A quarter, a half and always is enough to feel it. */
export const FAILURE_RATES = [0, 0.25, 0.5, 1] as const;

export const PROTOTYPE_SETTINGS_STORAGE_KEY = 'cwm.prototype.settings';

interface StoredSettings {
  networkDelayMs: number;
  failureRate: number;
  flags: PrototypeFlags;
}

/**
 * `sessionStorage` throws a `SecurityError` on *access* — not merely on write — in a
 * sandboxed iframe and with site data disabled. Unguarded, that would take down the
 * service every component injects, which is a much worse failure than losing a setting.
 */
const readStored = (): Partial<StoredSettings> => {
  try {
    const raw = sessionStorage.getItem(PROTOTYPE_SETTINGS_STORAGE_KEY);
    if (raw === null) return {};
    // `JSON.parse('null')` succeeds and returns null, so the catch below never sees it —
    // and the constructor then dereferences null and takes the whole app down, because
    // this service is root-provided and injected by both the shell and the gateway. The
    // same goes for a stored `"3"` or `"[]"`.
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Partial<StoredSettings>)
      : {};
  } catch {
    return {};
  }
};

const write = (settings: StoredSettings): void => {
  try {
    sessionStorage.setItem(PROTOTYPE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A setting that cannot be remembered is still a setting that works this session.
  }
};

const numberFrom = (value: unknown, allowed: readonly number[]): number | undefined =>
  typeof value === 'number' && allowed.includes(value) ? value : undefined;

const flagsFrom = (value: unknown): PrototypeFlags => {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_FLAGS };
  const stored = value as Record<string, unknown>;
  // Key-by-key off `DEFAULT_FLAGS`, so a stale stored blob from before a flag existed —
  // or one carrying a key that no longer does — cannot change the flag set.
  return Object.fromEntries(
    Object.keys(DEFAULT_FLAGS).map((key) => [
      key,
      typeof stored[key] === 'boolean' ? stored[key] : DEFAULT_FLAGS[key as keyof PrototypeFlags],
    ]),
  ) as unknown as PrototypeFlags;
};

/**
 * The prototype's runtime knobs: §47's feature flags and §63's latency and failure
 * injection.
 *
 * It lives in `core/config/` beside `PROTOTYPE_API_BASE_URL` rather than in `prototype/`
 * because the gateway and the feature components read it — a `core/` → `prototype/` import
 * would invert what that folder means.
 *
 * **Held in signals**, not plain fields: `ShellStore.projectTree` is a `computed`, and a
 * flag that is not a signal would make the sidebar need a reload to notice a change.
 *
 * Mirrored to `sessionStorage` because the panel reloads the app after a host-state change
 * (a persona switch, a seed load), and a setting wiped by the panel's own reload is a
 * setting you cannot use. Closing the tab still clears it.
 */
@Injectable({ providedIn: 'root' })
export class PrototypeSettings {
  private readonly delayState = signal(0);
  private readonly failureState = signal(0);
  private readonly flagsState = signal<PrototypeFlags>({ ...DEFAULT_FLAGS });

  readonly networkDelayMs = this.delayState.asReadonly();
  readonly failureRate = this.failureState.asReadonly();
  readonly flags = this.flagsState.asReadonly();

  constructor() {
    const stored = readStored();
    this.delayState.set(numberFrom(stored.networkDelayMs, NETWORK_DELAYS) ?? 0);
    this.failureState.set(numberFrom(stored.failureRate, FAILURE_RATES) ?? 0);
    this.flagsState.set(flagsFrom(stored.flags));
  }

  setNetworkDelay(milliseconds: number): void {
    this.delayState.set(milliseconds);
    this.persist();
  }

  setFailureRate(rate: number): void {
    this.failureState.set(rate);
    this.persist();
  }

  setFlag<Key extends keyof PrototypeFlags>(flag: Key, enabled: boolean): void {
    this.flagsState.update((flags) => ({ ...flags, [flag]: enabled }));
    this.persist();
  }

  /**
   * §46's "this allows loading states to actually be evaluated".
   *
   * Deliberately **transport-agnostic**: it waits, and it says whether a call should fail,
   * but it never constructs the error. That belongs to the gateway — a `GatewayError` built
   * here would have `core/config/` reaching into `core/gateway/`, and an error thrown from
   * outside the gateway's own `try` would escape §8's "the only failure type the UI sees".
   */
  delay(): Promise<void> {
    const milliseconds = this.delayState();
    if (milliseconds === 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  shouldFail(): boolean {
    const rate = this.failureState();
    // Strictly-less-than against a half-open [0, 1) random: rate 0 can never fire and
    // rate 1 can never miss, which is what makes the two ends of the ladder assertable.
    return rate > 0 && Math.random() < rate;
  }

  private persist(): void {
    write({ networkDelayMs: this.delayState(), failureRate: this.failureState(), flags: this.flagsState() });
  }
}
