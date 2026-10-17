/** A lift's real opener, independent of native restoration through an intermediate menu item. */
export class LiftFocus {
  constructor(private readonly opener: HTMLElement | null, private readonly fallback: () => HTMLElement | null) {}

  enter(target: HTMLElement | null): void { target?.focus(); }

  restore(lift?: HTMLElement | null): void {
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== this.opener && !lift?.contains(active)) return;
    const target = this.opener?.isConnected ? this.opener : this.fallback();
    if (target?.isConnected) target.focus();
  }
}
