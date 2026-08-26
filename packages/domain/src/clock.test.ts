import { describe, expect, it } from 'vitest';
import { PrototypeClock } from './clock';

describe('PrototypeClock', () => {
  it('returns a detached simulated now', () => {
    const initial = new Date('2026-08-24T16:00:00.000Z');
    const clock = new PrototypeClock(initial);

    initial.setUTCFullYear(2030);
    const first = clock.now();
    first.setUTCFullYear(2040);

    expect(clock.now().toISOString()).toBe('2026-08-24T16:00:00.000Z');
    expect(clock.now()).not.toBe(first);
  });

  it('updates and detaches the simulated now', () => {
    const clock = new PrototypeClock(new Date('2026-08-24T16:00:00.000Z'));
    const friday = new Date('2026-08-28T23:00:00.000Z');

    clock.setNow(friday);
    friday.setUTCFullYear(2030);

    expect(clock.now().toISOString()).toBe('2026-08-28T23:00:00.000Z');
  });

  it('rejects an invalid date at construction', () => {
    expect(() => new PrototypeClock(new Date(Number.NaN))).toThrow('valid date');
  });

  it('rejects an invalid update without changing the prior valid time', () => {
    const clock = new PrototypeClock(new Date('2026-08-24T16:00:00.000Z'));

    expect(() => clock.setNow(new Date(Number.NaN))).toThrow('valid date');
    expect(clock.now().toISOString()).toBe('2026-08-24T16:00:00.000Z');
  });
});
