import { describe, expect, it } from 'vitest';
import { snapColumnSpan, stepColumnSpan } from './column-span';

describe('column-span', () => {
  it('snaps grid travel to the nearest supported span', () => {
    const column = (1200 - 11 * 12) / 12;
    const startWidth = 6 * column + 5 * 12;
    const eightWidth = 8 * column + 7 * 12;

    expect(
      snapColumnSpan({
        mode: 'grid',
        trackWidth: 1200,
        columnGap: 12,
        startSpan: 6,
        deltaPx: eightWidth - startWidth,
        edge: 'end',
      }),
    ).toBe(8);
  });

  it('snaps flow travel, widens on a tied distance, inverts the start edge, and clamps', () => {
    expect(
      snapColumnSpan({ mode: 'flow', trackWidth: 1200, columnGap: 0, startSpan: 6, deltaPx: 100, edge: 'end' }),
    ).toBe(8);
    expect(
      snapColumnSpan({ mode: 'flow', trackWidth: 1200, columnGap: 0, startSpan: 8, deltaPx: -200, edge: 'start' }),
    ).toBe(12);
    expect(
      snapColumnSpan({ mode: 'flow', trackWidth: 1200, columnGap: 0, startSpan: 6, deltaPx: -1000, edge: 'end' }),
    ).toBe(4);
    expect(
      snapColumnSpan({ mode: 'flow', trackWidth: 1200, columnGap: 0, startSpan: 8, deltaPx: 1000, edge: 'end' }),
    ).toBe(12);
  });

  it('steps through supported spans and stops at either end', () => {
    expect([stepColumnSpan(4, 1), stepColumnSpan(6, 1), stepColumnSpan(8, 1), stepColumnSpan(12, 1)]).toEqual([
      6, 8, 12, 12,
    ]);
    expect([stepColumnSpan(4, -1), stepColumnSpan(6, -1), stepColumnSpan(8, -1), stepColumnSpan(12, -1)]).toEqual([
      4, 4, 6, 8,
    ]);
  });
});
