import { describe, expect, it } from 'vitest';
import { PrototypeClock, SimulatedClock } from './clock';

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

describe('SimulatedClock', () => {
  it('tracks real time so successive readings differ', async () => {
    const clock = new SimulatedClock();

    const first = clock.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = clock.now();

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it('jumps to a simulated moment and keeps running from it', async () => {
    const clock = new SimulatedClock();
    const friday = new Date('2026-08-28T15:00:00.000Z');

    clock.setNow(friday);
    const atJump = clock.now();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(Math.abs(atJump.getTime() - friday.getTime())).toBeLessThan(50);
    expect(clock.now().getTime()).toBeGreaterThan(atJump.getTime());
  });

  it('returns to real time on reset', () => {
    const clock = new SimulatedClock();
    clock.setNow(new Date('2020-01-01T00:00:00.000Z'));

    clock.reset();

    expect(clock.offset).toBe(0);
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(50);
  });

  it('rejects an invalid simulated moment', () => {
    expect(() => new SimulatedClock().setNow(new Date('nonsense'))).toThrow(TypeError);
  });
});
