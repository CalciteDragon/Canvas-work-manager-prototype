/** APG menu navigation. Tab leaves the menu rather than becoming a focus trap. */
export function menuKeys(event: KeyboardEvent, items: readonly HTMLElement[], close: () => void): void {
  if (event.key === 'Tab') { close(); return; }
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (event.key) {
    case 'ArrowDown': next = (index + 1) % items.length; break;
    case 'ArrowUp': next = (index - 1 + items.length) % items.length; break;
    case 'Home': next = 0; break;
    case 'End': next = items.length - 1; break;
    default: return;
  }
  event.preventDefault();
  items[next]?.focus();
}
