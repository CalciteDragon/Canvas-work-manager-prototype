import { describe, expect, it } from 'vitest';
import { DAY_MS, isoDayOf, isoDayOfInstant, startOfUtcDay } from './calendar';

describe('isoDayOf', () => {
  it('agrees with the platform for ordinary days, month ends, and leap days', () => {
    for (const instant of [
      '2026-08-24T16:00:00.000Z',
      '2026-08-31T23:59:59.999Z',
      '2026-09-01T00:00:00.000Z',
      '2024-02-29T12:00:00.000Z',
      '2000-02-29T00:00:00.000Z',
      '1999-12-31T23:00:00.000Z',
      '2100-03-01T00:00:00.000Z',
      '1970-01-01T00:00:00.000Z',
    ]) {
      expect(isoDayOf(Date.parse(instant))).toBe(instant.slice(0, 10));
    }
  });

  it('rolls a year over when days are added across a boundary', () => {
    expect(isoDayOf(Date.parse('2026-12-28T00:00:00.000Z') + 7 * DAY_MS)).toBe('2027-01-04');
  });
});

describe('startOfUtcDay', () => {
  it('floors an instant to its UTC midnight', () => {
    expect(isoDayOf(startOfUtcDay(Date.parse('2026-08-24T23:59:00.000Z')))).toBe('2026-08-24');
    expect(startOfUtcDay(Date.parse('2026-08-24T00:00:00.000Z'))).toBe(Date.parse('2026-08-24T00:00:00.000Z'));
  });
});

describe('isoDayOfInstant', () => {
  it('takes the day off a UTC timestamp without parsing it', () => {
    expect(isoDayOfInstant('2026-08-24T16:00:00.000Z')).toBe('2026-08-24');
  });
});
