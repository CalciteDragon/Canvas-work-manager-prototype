/** Follow every focus arrival, including the canvas restoring a moved grip. */
export function toolbarFocusin(event: FocusEvent): void {
  const toolbar = event.currentTarget as HTMLElement;
  for (const button of toolbar.querySelectorAll('button')) button.tabIndex = button === event.target ? 0 : -1;
}

/** One toolbar stop: horizontal arrows wrap, Home/End jump; vertical keys belong to Move. */
export function toolbarKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll('button')];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
}
