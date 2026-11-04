/**
 * The empty sentence of an archived root's Todos or Reflections page (Slice 79, Q7, the user's
 * wording): "Restore to view N hidden todos." while the domain's `hiddenItemCount` is above 0,
 * singular for one, else the page's ordinary sentence, because then it is true.
 *
 * One function for both pages, and a string rather than template branches, to hold the initial
 * bundle ceiling.
 */
export const hiddenCountSentence = (count: number, noun: 'todo' | 'reflection', ordinary: string): string =>
  count > 0 ? `Restore to view ${count} hidden ${noun}${count === 1 ? '' : 's'}.` : ordinary;
