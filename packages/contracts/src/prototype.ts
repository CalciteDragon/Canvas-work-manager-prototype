import { z } from 'zod';
import { AgentConnectionViewSchema } from './agent';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema } from './ids';
import { UserSchema } from './user';

/**
 * §46's development panel talks to the host over `/prototype/*`, and these are the shapes
 * both ends agree on. They live here for the same reason every other contract does (§11):
 * the host route and the Angular control adapter must not each carry their own idea of
 * what a prototype state looks like.
 *
 * Seed *names* deliberately stay `string`. They are defined in `@cwm/prototype-data`, and
 * importing that here would give the contracts package a dependency on the seed builders
 * so that a schema could enumerate five strings. The host validates the name and reports
 * the valid set in `seeds`, which is what the panel renders.
 */

/** §44's switch, as a value the panel can send back. */
export const AIProviderModeSchema = z.enum(['mock', 'real']);
export type AIProviderMode = z.infer<typeof AIProviderModeSchema>;

/**
 * A persona the panel can switch to. **Picked from `UserSchema`, never re-declared** — the
 * four fields the switcher needs are already defined there, and a parallel object literal
 * would be the second definition §11 exists to prevent.
 */
export const PrototypePersonaSchema = UserSchema.pick({
  id: true,
  name: true,
  avatar: true,
  workspaceId: true,
});
export type PrototypePersona = z.infer<typeof PrototypePersonaSchema>;

/**
 * What the panel needs to render itself. Notably absent: the host's data file path. It
 * would be an absolute filesystem path shipped to a browser, and nothing on the panel
 * reads it.
 */
export const PrototypeStateSchema = z.object({
  /** The last seed the host loaded, or `null` when it booted onto an existing data file. */
  seed: z.string().min(1).nullable(),
  seeds: z.array(z.string().min(1)),
  /** What the domain's `Clock` currently answers — §45's simulated now, not real time. */
  simulatedNow: IsoDateTimeSchema,
  /** How far that clock sits from real time. `0` means the two agree. */
  clockOffsetMs: z.number().int(),
  aiProvider: AIProviderModeSchema,
  personas: z.array(PrototypePersonaSchema),
  /**
   * §46's Agent Connection control. Carries the bearer token, which is why it rides here
   * and not on `/api/agent-connections` — the panel is the rig, and §51's tokens are part
   * of the rig.
   */
  agentConnections: z.array(AgentConnectionViewSchema),
});
export type PrototypeState = z.infer<typeof PrototypeStateSchema>;

export const LoadSeedInputSchema = z.object({ seed: z.string().min(1) });
export type LoadSeedInput = z.infer<typeof LoadSeedInputSchema>;

/**
 * `null` is not "missing" — it is the panel saying *back to real time*, which is a
 * different instruction from "leave the clock alone". `SimulatedClock.reset()` is what
 * answers it.
 */
export const SetSimulatedDateInputSchema = z.object({ now: IsoDateTimeSchema.nullable() });
export type SetSimulatedDateInput = z.infer<typeof SetSimulatedDateInputSchema>;

export const SetAIProviderInputSchema = z.object({ provider: AIProviderModeSchema });
export type SetAIProviderInput = z.infer<typeof SetAIProviderInputSchema>;

/**
 * §79's note, shaped by the file that already exists rather than by a fresh design.
 *
 * `route` and `projectId` are **nullable, not optional**: of the entries written so far,
 * 23 carry `route: null` and 16 carry a real route, so a schema using `.optional()` would
 * not round-trip the file and one using `z.null()` would reject two thirds of it. `slice`
 * is optional because a note captured from the running app knows the route but not which
 * slice is being built — the panel stamps it, and a hand-written entry may not.
 */
export const PrototypeNoteSchema = z.object({
  id: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  route: z.string().nullable(),
  projectId: ProjectIdSchema.nullable(),
  slice: z.number().int().positive().optional(),
  note: z.string().min(1),
});
export type PrototypeNote = z.infer<typeof PrototypeNoteSchema>;

/** The envelope on disk. `.prototype/notes.json` is `{ "notes": [...] }`, not a bare array. */
export const PrototypeNotesFileSchema = z.object({ notes: z.array(PrototypeNoteSchema) });
export type PrototypeNotesFile = z.infer<typeof PrototypeNotesFileSchema>;

/**
 * What the panel sends. The id and the timestamp are the host's to assign — a note is a
 * record of when an observation happened, so letting the caller pick either would make the
 * file's ordering a matter of trust.
 */
export const CreatePrototypeNoteInputSchema = z.object({
  note: z.string().min(1).max(2000),
  route: z.string().nullable(),
  projectId: ProjectIdSchema.nullable(),
  slice: z.number().int().positive().optional(),
});
export type CreatePrototypeNoteInput = z.infer<typeof CreatePrototypeNoteInputSchema>;
