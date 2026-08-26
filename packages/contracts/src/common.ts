import { z } from 'zod';

/**
 * An instant, UTC only: `2026-08-26T10:00:00.000Z` parses, a `+02:00` offset does not.
 * Everything the prototype timestamps — created/updated/completed, task
 * start and due — is a full ISO datetime, so the clock (§45) is the only thing that
 * has to know what "now" means.
 */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/**
 * A calendar day, for the dates a person picks rather than a machine records:
 * project target dates and milestone target dates.
 */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Ordering within a list, canvas, or dashboard. Dense, zero-based, no gaps implied. */
export const PositionSchema = z.number().int().min(0);
export type Position = z.infer<typeof PositionSchema>;
