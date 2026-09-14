import type { SectionColumnSpan } from '@cwm/contracts';

/** A fitted insertion position after the last placement in a partially filled grid row. */
export interface GridInsertionGap {
  /** Combined placement index immediately after this row. */
  index: number;
  /** Unused columns at the end of the row. */
  availableColumns: number;
  /** Widest supported placement span that fits the unused columns. */
  columnSpan: SectionColumnSpan;
}

const GRID_COLUMNS = 12;
const SUPPORTED_SPANS = [8, 6, 4] as const satisfies readonly SectionColumnSpan[];

/** Replay sparse 12-column auto-placement and return every row with room for a section. */
export const gridInsertionGaps = (spans: readonly SectionColumnSpan[]): GridInsertionGap[] => {
  const gaps: GridInsertionGap[] = [];
  let index = 0;
  let columnsUsed = 0;

  for (const span of spans) {
    if (columnsUsed > 0 && columnsUsed + span > GRID_COLUMNS) {
      addGap(gaps, index, GRID_COLUMNS - columnsUsed);
      columnsUsed = 0;
    }

    columnsUsed += span;
    index += 1;
    if (columnsUsed === GRID_COLUMNS) columnsUsed = 0;
  }

  if (columnsUsed > 0) addGap(gaps, index, GRID_COLUMNS - columnsUsed);
  return gaps;
};

const addGap = (gaps: GridInsertionGap[], index: number, availableColumns: number): void => {
  const columnSpan = SUPPORTED_SPANS.find((span) => span <= availableColumns);
  if (columnSpan === undefined) return;
  gaps.push({ index, availableColumns, columnSpan });
};
