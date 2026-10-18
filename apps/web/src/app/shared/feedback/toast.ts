import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';

/** Eight seconds of unattended status feedback; focus, hover and pending Undo hold it open. */
export const TOAST_DISMISS_MS = 8000;

/** Presentational top-layer feedback. Owners supply actions, slot ownership and focus recovery. */
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
  readonly lines = input<readonly string[]>([]);
  readonly suppressed = input(false);
  readonly pendingUndo = input(false);
  readonly dismissed = output<void>();
  protected readonly hovered = signal(false);
  protected readonly focused = signal(false);
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');

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
    effect((onCleanup) => {
      // Reading the content also restarts the timer when an acknowledged write becomes Undo.
      this.message();
      this.lines();
      if (!this.open() || this.suppressed() || this.tone() === 'alert' || this.pendingUndo() || this.hovered() || this.focused()) return;
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
}
