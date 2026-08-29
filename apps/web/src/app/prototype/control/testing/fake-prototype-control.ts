import { PrototypeStateSchema, type CreatePrototypeNoteInput, type PrototypeNote, type PrototypeState } from '@cwm/contracts';
import type { GatewayError } from '../../../core/gateway/gateway-error';
import type { PrototypeControlPort } from '../prototype-control';

/**
 * The port every panel spec runs against, mirroring `testing/fake-gateway.ts`. Its
 * existence is what keeps §8 structural: no spec has a reason to reach for
 * `PrototypeHttpControl`, so none of them do.
 */
export const testPrototypeState = (overrides: Partial<PrototypeState> = {}): PrototypeState =>
  PrototypeStateSchema.parse({
    seed: 'busy-week',
    seeds: ['empty', 'personal-workspace', 'busy-week', 'nested-projects', 'overdue-chaos'],
    simulatedNow: '2026-08-24T16:00:00.000Z',
    clockOffsetMs: 0,
    aiProvider: 'mock',
    personas: [
      { id: 'user-demo', name: 'Demo User', avatar: '🧭', workspaceId: 'workspace-demo' },
      { id: 'user-alex', name: 'Alex', avatar: '🌱', workspaceId: 'workspace-alex' },
    ],
    ...overrides,
  });

export class FakePrototypeControl implements PrototypeControlPort {
  constructor(
    private current: PrototypeState = testPrototypeState(),
    private readonly failWith?: GatewayError,
  ) {}

  /** Every call the spec made, in order, so a test can assert what the panel sent. */
  readonly calls: Array<{ method: string; argument: unknown }> = [];
  readonly notes: PrototypeNote[] = [];

  state(): Promise<PrototypeState> {
    return this.answer('state', undefined, this.current);
  }

  loadSeed(seed: string): Promise<PrototypeState> {
    return this.answer('loadSeed', seed, (this.current = { ...this.current, seed }));
  }

  reset(): Promise<PrototypeState> {
    return this.answer('reset', undefined, (this.current = { ...this.current, seed: 'personal-workspace', clockOffsetMs: 0 }));
  }

  setSimulatedNow(now: string | null): Promise<PrototypeState> {
    const simulatedNow = now ?? '2026-08-24T16:00:00.000Z';
    return this.answer('setSimulatedNow', now, (this.current = { ...this.current, simulatedNow, clockOffsetMs: now === null ? 0 : 1 }));
  }

  setAIProvider(provider: 'mock' | 'real'): Promise<PrototypeState> {
    return this.answer('setAIProvider', provider, (this.current = { ...this.current, aiProvider: provider }));
  }

  addNote(input: CreatePrototypeNoteInput): Promise<PrototypeNote> {
    const note: PrototypeNote = {
      id: `note-${this.notes.length + 1}`,
      createdAt: '2026-08-28T12:00:00.000Z',
      route: input.route,
      projectId: input.projectId,
      ...(input.slice === undefined ? {} : { slice: input.slice }),
      note: input.note,
    };
    this.notes.push(note);
    return this.answer('addNote', input, note);
  }

  private answer<T>(method: string, argument: unknown, value: T): Promise<T> {
    this.calls.push({ method, argument });
    return this.failWith === undefined ? Promise.resolve(value) : Promise.reject(this.failWith);
  }
}
