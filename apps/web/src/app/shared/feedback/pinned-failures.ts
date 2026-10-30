import { Injectable, signal } from '@angular/core';

/** The scroll port's edge an off-screen failure is pinned to. */
export type PinEdge = 'top' | 'bottom';

/** What covers a scroll port's edges, in pixels: a stuck control at the top, an open toast at the bottom. */
export interface PinClearance {
  readonly top: number;
  readonly bottom: number;
}

/** One failure occurrence as its reference registers it. */
export interface PinnedFailureInput {
  /** The object's name, “X” in the pinned copy's accessible name "Show “X”: …". */
  readonly subject: string;
  /** The row's sentence, exactly as it renders there. */
  readonly sentence: string;
  /** Brings the sentence into unobscured view and focuses what the failure describes. */
  readonly reveal: () => void;
}

/** The registering reference's handle. Once unregistered, every call is a no-op. */
export interface PinRegistration {
  /** Where the sentence anchor lies wholly outside the unobscured port; `null` once any part is in it. */
  place(edge: PinEdge | null): void;
  unregister(): void;
}

/** The one pinned copy an edge shows: the most recent failure off it, and how many more are. */
export interface ShownPin {
  readonly id: number;
  readonly subject: string;
  /** The row's sentence without its closing "Try again.": the pin leads to the row, it does not retry. */
  readonly sentence: string;
  readonly more: number;
}

interface Entry {
  readonly id: number;
  readonly root: Element;
  readonly subject: string;
  readonly sentence: string;
  readonly edge: PinEdge | null;
  readonly dismissed: boolean;
}

const NO_CLEARANCE: PinClearance = { top: 0, bottom: 0 };

const pinSentence = (sentence: string): string => sentence.replace(/\s*Try again\.$/, '');

/**
 * Off-screen write failures, pinned to their scroll port's edge (Slice 78, §24): the registry
 * the `appPinnedFailure` directive writes and `PinnedFailureSlot` draws, root-provided like
 * `ToastSlot`. Each registration is one failure occurrence; dismissing it hides that occurrence
 * only, and a replacement failure registers afresh. State is in signals, so observer callbacks
 * render in the zoneless app.
 */
@Injectable({ providedIn: 'root' })
export class PinnedFailures {
  private sequence = 0;
  private readonly entries = signal<readonly Entry[]>([]);
  private readonly reveals = new Map<number, () => void>();
  private readonly clearances = signal<ReadonlyMap<Element, PinClearance>>(new Map());

  register(root: Element, failure: PinnedFailureInput): PinRegistration {
    const id = ++this.sequence;
    this.entries.update((entries) => [...entries, { id, root, subject: failure.subject, sentence: failure.sentence, edge: null, dismissed: false }]);
    this.reveals.set(id, failure.reveal);
    return {
      place: (edge) => this.change(id, (entry) => (entry.edge === edge ? entry : { ...entry, edge })),
      unregister: () => {
        this.reveals.delete(id);
        this.entries.update((entries) => entries.filter((entry) => entry.id !== id));
      },
    };
  }

  /** The pinned copy for each edge of `root`; a signal read, so callers wrap it in `computed`. */
  pinsFor(root: Element): { readonly top: ShownPin | null; readonly bottom: ShownPin | null } {
    const shown = (edge: PinEdge): ShownPin | null => {
      const off = this.entries().filter((entry) => entry.root === root && entry.edge === edge && !entry.dismissed);
      const latest = off.at(-1);
      return latest ? { id: latest.id, subject: latest.subject, sentence: pinSentence(latest.sentence), more: off.length - 1 } : null;
    };
    return { top: shown('top'), bottom: shown('bottom') };
  }

  reveal(id: number): void {
    this.reveals.get(id)?.();
  }

  /** Hides this occurrence for good; its row keeps the failure. */
  dismiss(id: number): void {
    this.change(id, (entry) => ({ ...entry, dismissed: true }));
  }

  clearanceOf(root: Element): PinClearance {
    return this.clearances().get(root) ?? NO_CLEARANCE;
  }

  setClearance(root: Element, clearance: PinClearance): void {
    const current = this.clearanceOf(root);
    if (current.top === clearance.top && current.bottom === clearance.bottom) return;
    this.clearances.update((clearances) => new Map(clearances).set(root, clearance));
  }

  private change(id: number, next: (entry: Entry) => Entry): void {
    this.entries.update((entries) => {
      const entry = entries.find((candidate) => candidate.id === id);
      const changed = entry && next(entry);
      return !entry || changed === entry ? entries : entries.map((candidate) => (candidate === entry ? changed! : candidate));
    });
  }
}

/**
 * The nearest scrolling ancestor: the port a pin's edges belong to (`.workspace` in the app),
 * found rather than named, so `shared/` never refers to the shell.
 */
export const scrollPortOf = (element: Element): HTMLElement | null => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    // jsdom does not expand the `overflow` shorthand; browsers report the longhand.
    if (/^(auto|scroll|overlay)$/.test(style.overflowY || style.overflow)) return parent;
  }
  return null;
};
