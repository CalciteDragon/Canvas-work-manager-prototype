import { describe, expect, it } from 'vitest';
import { gridInsertionGaps } from './grid-insertion-gaps';

describe('gridInsertionGaps (§27)', () => {
  it('returns a target after every short row, including the trailing row', () => {
    expect(gridInsertionGaps([8, 6])).toEqual([
      { index: 1, availableColumns: 4, columnSpan: 4 },
      { index: 2, availableColumns: 6, columnSpan: 6 },
    ]);
    expect(gridInsertionGaps([6, 8])).toEqual([
      { index: 1, availableColumns: 6, columnSpan: 6 },
      { index: 2, availableColumns: 4, columnSpan: 4 },
    ]);
    expect(gridInsertionGaps([4, 4, 6])).toEqual([
      { index: 2, availableColumns: 4, columnSpan: 4 },
      { index: 3, availableColumns: 6, columnSpan: 6 },
    ]);
  });

  it('offers no target for full rows, a remainder narrower than four, or an empty canvas', () => {
    expect(gridInsertionGaps([6, 6])).toEqual([]);
    expect(gridInsertionGaps([4, 6, 12])).toEqual([]);
    expect(gridInsertionGaps([])).toEqual([]);
  });
});
