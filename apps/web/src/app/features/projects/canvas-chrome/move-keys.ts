/** The keyboard alternative to dragging a grip: one place earlier or later in the canvas order. */
export type MoveDirection = 'previous' | 'next';

/** Maps a grip key to a move, or `null` for every key a grip must leave alone (Tab included). */
export const moveDirectionFor = (key: string): MoveDirection | null => {
  if (key === 'ArrowUp' || key === 'ArrowLeft') return 'previous';
  if (key === 'ArrowDown' || key === 'ArrowRight') return 'next';
  return null;
};
