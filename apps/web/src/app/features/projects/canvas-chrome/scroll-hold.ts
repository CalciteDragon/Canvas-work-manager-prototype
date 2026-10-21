/**
 * Keeps the working placement still while placements above it change height (Slice 75, W1-030,
 * W2-010). Stage 0 measured that the browser's own scroll anchoring does not hold the canvas: a
 * quick-added task grew Recent Activity above its list and moved the list 48.5 px at 1440 and
 * 129 px at 375. WebKit has no scroll anchoring at all.
 *
 * The working placement is the one holding focus, or the last one pressed. Each `check` compares
 * its top with the baseline and scrolls by the difference. Growth below it never moves its top,
 * so it never scrolls. Any scroll the hold did not make, whether the person's or a reveal's, is
 * left standing and becomes the new baseline. At scroll offset 0, or with the placement off
 * screen, there is nothing in view to hold, so it only rebases.
 */
export class ScrollHold {
  private working: HTMLElement | null = null;
  private baselineTop = 0;
  private baselineScroll = 0;
  private baselineInView = false;

  constructor(private readonly scroller: HTMLElement) {}

  /** Sets the placement to hold, and takes its current position as the baseline. */
  setWorking(element: HTMLElement | null): void {
    this.working = element;
    this.rebase();
  }

  /**
   * Called on the scroller's `scroll`: a scroll the hold did not make (the person's, or a reveal's)
   * becomes the baseline at once, so growth that follows is held from where it left the page.
   */
  noteScroll(): void {
    if (this.scroller.scrollTop !== this.baselineScroll) this.rebase();
  }

  /** Called after layout changes; scrolls by however far growth above moved the working placement. */
  check(): void {
    const working = this.working;
    if (working === null || !this.scroller.contains(working)) return;
    if (this.scroller.scrollTop !== this.baselineScroll || this.baselineScroll === 0 || !this.baselineInView) {
      this.rebase();
      return;
    }
    const delta = working.getBoundingClientRect().top - this.baselineTop;
    if (Math.abs(delta) < 0.5) return;
    this.scroller.scrollTop += delta;
    this.baselineScroll = this.scroller.scrollTop;
    this.baselineTop = working.getBoundingClientRect().top;
  }

  private rebase(): void {
    this.baselineScroll = this.scroller.scrollTop;
    const working = this.working;
    if (working === null) return;
    const top = working.getBoundingClientRect().top;
    const viewport = this.viewport();
    this.baselineTop = top;
    this.baselineInView = top >= viewport.top && top < viewport.bottom;
  }

  private viewport(): { top: number; bottom: number } {
    if (this.scroller === document.scrollingElement) return { top: 0, bottom: window.innerHeight };
    const { top, bottom } = this.scroller.getBoundingClientRect();
    return { top, bottom };
  }
}

/** The nearest ancestor that scrolls vertically, or the document's own scroller. */
const scrollerOf = (element: HTMLElement): HTMLElement => {
  for (let node = element.parentElement; node !== null && node !== document.body; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
};

/**
 * Wires a `ScrollHold` to a canvas host: placements are watched for size changes, and focus or a
 * press inside one makes it the working placement. Nothing is held while a placement is being
 * dragged. Returns the disposer. A browser without `ResizeObserver` (jsdom) gets a no-op.
 */
export const attachScrollHold = (host: HTMLElement, placementSelector: string): (() => void) => {
  if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;
  const scroller = scrollerOf(host);
  const hold = new ScrollHold(scroller);
  // The document's scroller reports scroll on the window, not on itself.
  const scrollTarget: EventTarget = scroller === document.scrollingElement ? window : scroller;
  const scrolled = () => hold.noteScroll();
  const dragging = () => host.querySelector('.cdk-drop-list-dragging') !== null;
  const resizes = new ResizeObserver(() => (dragging() ? hold.setWorking(null) : hold.check()));
  const observePlacements = () => host.querySelectorAll<HTMLElement>(placementSelector).forEach((element) => resizes.observe(element));
  const mutations = new MutationObserver(observePlacements);
  const work = (event: Event) => {
    const placement = (event.target as Element | null)?.closest<HTMLElement>(placementSelector) ?? null;
    if (placement !== null) hold.setWorking(placement);
  };
  observePlacements();
  mutations.observe(host, { childList: true, subtree: true });
  host.addEventListener('focusin', work);
  host.addEventListener('pointerdown', work);
  scrollTarget.addEventListener('scroll', scrolled, { passive: true });
  return () => {
    scrollTarget.removeEventListener('scroll', scrolled);
    resizes.disconnect();
    mutations.disconnect();
    host.removeEventListener('focusin', work);
    host.removeEventListener('pointerdown', work);
  };
};
