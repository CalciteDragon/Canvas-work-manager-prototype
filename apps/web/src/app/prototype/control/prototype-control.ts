import { InjectionToken } from '@angular/core';
import type { CreatePrototypeNoteInput, PrototypeNote, PrototypeState } from '@cwm/contracts';

/**
 * What §46's development panel can ask of the host.
 *
 * This is an **interface behind a token**, exactly like `WORK_MANAGER_GATEWAY` and
 * `IDENTITY_PROVIDER`, because §8's boundary is about what a component depends on, not
 * about which folder a class sits in: a panel injecting a concrete `fetch`-holding class
 * would be a component depending on HTTP, whatever it was called.
 *
 * It is deliberately **not** part of `WorkManagerGateway`. None of this is application
 * data — it changes the rig, not the workspace — and keeping it separate is what lets the
 * panel keep working when the work-manager gateway is at 100 % injected failure. A panel
 * you cannot use to turn the failures back off is not a development panel.
 */
export interface PrototypeControlPort {
  state(): Promise<PrototypeState>;
  loadSeed(seed: string): Promise<PrototypeState>;
  reset(): Promise<PrototypeState>;
  /** `null` means back to real time, which is not the same as "leave it alone". */
  setSimulatedNow(now: string | null): Promise<PrototypeState>;
  setAIProvider(provider: 'mock' | 'real'): Promise<PrototypeState>;
  addNote(input: CreatePrototypeNoteInput): Promise<PrototypeNote>;
}

export const PROTOTYPE_CONTROL = new InjectionToken<PrototypeControlPort>('PROTOTYPE_CONTROL');
