import { describe, expect, it } from 'vitest';
import { IsoDateSchema, IsoDateTimeSchema } from './common';

describe('IsoDateTimeSchema', () => {
  it('accepts an instant', () => {
    expect(IsoDateTimeSchema.parse('2026-08-26T10:00:00.000Z')).toBe('2026-08-26T10:00:00.000Z');
  });

  it('rejects a date without a time — the two are easy to confuse', () => {
    expect(IsoDateTimeSchema.safeParse('2026-08-26').success).toBe(false);
  });

  it('rejects a local time and a non-UTC offset — the clock (§45) works in UTC', () => {
    expect(IsoDateTimeSchema.safeParse('2026-08-26T10:00:00').success).toBe(false);
    expect(IsoDateTimeSchema.safeParse('2026-08-26T10:00:00+02:00').success).toBe(false);
  });
});

describe('IsoDateSchema', () => {
  it('accepts a calendar date', () => {
    expect(IsoDateSchema.parse('2026-08-26')).toBe('2026-08-26');
  });

  it('rejects a full instant and an impossible date', () => {
    expect(IsoDateSchema.safeParse('2026-08-26T10:00:00.000Z').success).toBe(false);
    expect(IsoDateSchema.safeParse('2026-13-40').success).toBe(false);
  });
});
