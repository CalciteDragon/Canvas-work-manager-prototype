import type { PrototypeState } from '@cwm/contracts';
import { PrototypeAIProvider, type SimulatedClock } from '@cwm/domain';
import { DEFAULT_SEED_NAME, SEED_NAMES, buildSeed, isSeedName } from '@cwm/prototype-data';
import { RealAIProvider } from '../api/real-ai-provider.ts';
import type { Persistence } from '../persistence/store.ts';
import type { SwitchableAIProvider } from './switchable-ai-provider.ts';

/**
 * What §46's panel can change about a running host, in one object.
 *
 * It holds the *same instances* the domain services were wired with — the clock and the
 * switchable provider — which is what makes a change take effect without a restart. The
 * services never learn that any of this exists.
 */
export interface PrototypeRuntimeOptions {
  persistence: Persistence;
  clock: SimulatedClock;
  ai: SwitchableAIProvider;
  /** Which seed the process started on, when it is known. */
  seed?: string | null;
  aiProvider?: 'mock' | 'real';
}

export class PrototypeRuntime {
  private readonly persistence: Persistence;
  private readonly clock: SimulatedClock;
  private readonly ai: SwitchableAIProvider;
  private seedName: string | null;
  private aiProviderMode: 'mock' | 'real';

  constructor(options: PrototypeRuntimeOptions) {
    this.persistence = options.persistence;
    this.clock = options.clock;
    this.ai = options.ai;
    this.seedName = options.seed ?? null;
    this.aiProviderMode = options.aiProvider ?? 'mock';
  }

  state(): PrototypeState {
    const document = this.persistence.store.snapshot();
    return {
      seed: this.seedName,
      seeds: [...SEED_NAMES],
      simulatedNow: this.clock.now().toISOString(),
      clockOffsetMs: this.clock.offset,
      aiProvider: this.aiProviderMode,
      personas: document.users.map(({ id, name, avatar, workspaceId }) => ({ id, name, avatar, workspaceId })),
    };
  }

  /**
   * §76's reseed, at runtime. The replacement runs inside the unit of work, so it queues
   * behind whatever writes are already pending instead of racing them, and the unit's own
   * commit validates and persists the new document to the data file.
   *
   * `buildSeed` produces the document directly — there is no write-then-read-back, which
   * is also why `CWM_DATA_FILE` is honoured for free: the store knows its own path.
   */
  async loadSeed(seed: string): Promise<void> {
    if (!isSeedName(seed)) {
      throw new RangeError(`Unknown seed "${seed}". Valid seeds: ${SEED_NAMES.join(', ')}`);
    }
    await this.persistence.unitOfWork.run(() => this.persistence.store.replaceActiveDocument(buildSeed(seed)));
    this.seedName = seed;
  }

  /**
   * §76: back to a known state. That means the default seed, real time, **and** the mock
   * AI provider — a reset that left the provider on `real` would keep `/api/dashboard`
   * answering 500, which makes the button look broken rather than restorative.
   */
  async reset(): Promise<void> {
    await this.loadSeed(DEFAULT_SEED_NAME);
    this.clock.reset();
    this.setAIProvider('mock');
  }

  /** `null` means "back to real time", which is a different instruction from "no change". */
  setSimulatedNow(now: string | null): void {
    if (now === null) this.clock.reset();
    else this.clock.setNow(new Date(now));
  }

  setAIProvider(provider: 'mock' | 'real'): void {
    this.ai.use(provider === 'real' ? new RealAIProvider() : new PrototypeAIProvider());
    this.aiProviderMode = provider;
  }
}
