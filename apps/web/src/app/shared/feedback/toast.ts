import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';

/** Eight seconds of unattended status feedback; focus, hover, pending Undo and open details hold it open. */
export const TOAST_DISMISS_MS = 8000;

let nextId = 0;

/**
 * Presentational top-layer feedback. Owners supply actions, slot ownership and focus recovery.
 * The toast says one short `message` (Slice 79 Q9, user decision): a longer `reason`, repair
 * `lines` or a raw `detail` open from **View details** in a modal view headed by the message.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.html',
  // Every part is out of flow (absolute live regions, a top-layer popover), so the host must not
  // become a grid or flex item that takes a gap in whatever track it is placed in.
  styles: ':host { display: contents; }',
})
export class Toast {
  readonly open = input(false);
  readonly tone = input<'status' | 'alert'>('status');
  readonly message = input('');
  /** The full sentence behind a short message: announced, and shown in the details view. */
  readonly reason = input<string | null>(null);
  /** One line per repair: announced, and listed in the details view. */
  readonly lines = input<readonly string[]>([]);
  /** A failure's raw reason: shown in the details view, never announced (Slice 78). */
  readonly detail = input<string | null>(null);
  readonly suppressed = input(false);
  readonly pendingUndo = input(false);
  readonly dismissed = output<void>();
  protected readonly hovered = signal(false);
  protected readonly focused = signal(false);
  protected readonly hasDetails = computed(() => !!this.reason() || this.lines().length > 0 || !!this.detail());
  protected readonly detailsOpen = signal(false);
  protected readonly headingId = `toast-details-${nextId++}`;
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');
  private readonly details = viewChild<ElementRef<HTMLDialogElement>>('details');
  private readonly opener = viewChild<ElementRef<HTMLButtonElement>>('opener');

  constructor() {
    effect(() => {
      const element = this.popover()?.nativeElement;
      if (!element) return;
      if (this.open() && !this.suppressed()) element.showPopover?.();
      else {
        element.hidePopover?.();
        this.hovered.set(false);
        this.focused.set(false);
      }
    });
    // A toast that closes, is suppressed or loses its reason takes its view with it.
    effect(() => {
      if (this.detailsOpen() && (!this.open() || this.suppressed() || !this.hasDetails())) this.closeDetails(false);
    });
    inject(DestroyRef).onDestroy(() => this.details()?.nativeElement.close?.());
    effect((onCleanup) => {
      // Reading the content also restarts the timer when an acknowledged write becomes Undo.
      this.message();
      this.lines();
      if (!this.open() || this.suppressed() || this.tone() === 'alert' || this.pendingUndo() || this.hovered() || this.focused() || this.detailsOpen()) return;
      const timer = setTimeout(() => this.dismissed.emit(), TOAST_DISMISS_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected escape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dismissed.emit();
  }

  protected focusOut(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !this.popover()?.nativeElement.contains(event.relatedTarget)) {
      this.focused.set(false);
    }
  }

  protected openDetails(): void {
    const dialog = this.details()?.nativeElement;
    if (!dialog) return;
    this.detailsOpen.set(true);
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-toast-details-close]')?.focus();
  }

  /** Escape closes the view only; the toast and anything under it never see the key. */
  protected detailsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.closeDetails();
  }

  protected closeDetails(restore = true): void {
    this.details()?.nativeElement.close?.();
    this.detailsOpen.set(false);
    if (restore) this.opener()?.nativeElement.focus();
  }
}
