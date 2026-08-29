import {
  CreatePrototypeNoteInputSchema,
  LoadSeedInputSchema,
  SetAIProviderInputSchema,
  SetSimulatedDateInputSchema,
} from '@cwm/contracts';
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
): RouteTable => ({
  'GET /prototype/state': () => ok(runtime.state()),

  'POST /prototype/seed': async (request) => {
    await runtime.loadSeed(LoadSeedInputSchema.parse(request.body).seed);
    return ok(runtime.state());
  },

  'POST /prototype/reset': async () => {
    await runtime.reset();
    return ok(runtime.state());
  },

  'POST /prototype/clock': (request) => {
    runtime.setSimulatedNow(SetSimulatedDateInputSchema.parse(request.body).now);
    return ok(runtime.state());
  },

  'POST /prototype/ai-provider': (request) => {
    runtime.setAIProvider(SetAIProviderInputSchema.parse(request.body).provider);
    return ok(runtime.state());
  },

  'POST /prototype/notes': async (request) =>
    created(await appendNote(CreatePrototypeNoteInputSchema.parse(request.body), noteOptions)),
});
