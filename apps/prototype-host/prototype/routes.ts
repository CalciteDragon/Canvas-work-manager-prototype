import {
  CreatePrototypeNoteInputSchema,
  LoadSeedInputSchema,
  SetAIProviderInputSchema,
  SetSimulatedDateInputSchema,
} from '@cwm/contracts';
import type { LiveEventHub } from '../events/hub.ts';
import { appendNote, type AppendNoteOptions } from './notes.ts';
import type { PrototypeRuntime } from './runtime.ts';
import type { RouteResult, RouteTable } from '../router.ts';

const ok = (body: unknown): RouteResult => ({ status: 200, contentType: 'application/json', body });
const created = (body: unknown): RouteResult => ({ status: 201, contentType: 'application/json', body });

/**
 * §46's development panel, over HTTP. Deliberately disposable (§71) — no auth, no
 * layering, and every mutating route answers with the new state so the panel never has to
 * ask twice.
 *
 * These sit under `/prototype/*` beside `/prototype/health` rather than under `/api`,
 * because none of them is application data: they change the *rig*, not the workspace.
 *
 * Two of §46's controls are deliberately absent. Network Delay and Failure Rate live in
 * the Angular gateway instead — §63 puts failure injection where the optimistic revert
 * can be observed, and a host-side copy would be a second source of truth the client had
 * to mirror. See docs/decisions/2026-08-latency-and-failure-live-in-the-client.md.
 */
export const createPrototypeRoutes = (
  runtime: PrototypeRuntime,
  noteOptions: AppendNoteOptions = {},
  events?: LiveEventHub,
): RouteTable => {
  /**
   * §62 for the rig rather than the workspace. No domain service records a seed swap or a
   * clock move, so the frame is emitted here — **one per successful request**, naming which
   * knob moved. Emitting from `PrototypeRuntime` instead would fire three times for one
   * `reset()`, which calls `loadSeed` and `setAIProvider` internally.
   *
   * The tab that pressed the button reloads itself; this is what reaches the *other* ones.
   */
  const reloaded = (knob: string): void => events?.broadcastToAll({ type: 'prototype.reloaded', entityId: knob });

  return {
    'GET /prototype/state': () => ok(runtime.state()),

    'POST /prototype/seed': async (request) => {
      await runtime.loadSeed(LoadSeedInputSchema.parse(request.body).seed);
      reloaded('seed');
      return ok(runtime.state());
    },

    'POST /prototype/reset': async () => {
      await runtime.reset();
      reloaded('reset');
      return ok(runtime.state());
    },

    'POST /prototype/clock': (request) => {
      runtime.setSimulatedNow(SetSimulatedDateInputSchema.parse(request.body).now);
      reloaded('clock');
      return ok(runtime.state());
    },

    'POST /prototype/ai-provider': (request) => {
      runtime.setAIProvider(SetAIProviderInputSchema.parse(request.body).provider);
      reloaded('ai-provider');
      return ok(runtime.state());
    },

    // A §79 note changes nothing anyone is rendering, so it announces nothing.
    'POST /prototype/notes': async (request) =>
      created(await appendNote(CreatePrototypeNoteInputSchema.parse(request.body), noteOptions)),
  };
};
