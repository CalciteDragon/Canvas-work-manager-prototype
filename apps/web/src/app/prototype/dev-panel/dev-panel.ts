import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, HostListener, effect, signal, viewChild, type ElementRef } from '@angular/core';
import { DevPanelControls } from './dev-panel-controls';

/**
 * §46's development panel, summoned with **Ctrl/Cmd + Shift + D** from anywhere.
 *
 * Mounted once, at the shell, so it is available on every route — including
 * `/prototype/state`, which renders the same controls inline as §68's seed/state
 * inspector.
 *
 * `code === 'KeyD'` rather than `key === 'd'`: with Shift held the browser reports `D`,
 * and on a non-US layout `key` is whatever that layout produces. The physical key is what
 * a shortcut like this actually means.
 */
@Component({
  selector: 'app-dev-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, DevPanelControls],
  styleUrl: './dev-panel.scss',
  templateUrl: './dev-panel.html',
})
export class DevPanel {
  protected readonly open = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // Focus is moved explicitly rather than by `cdkTrapFocusAutoCapture`: that resolves on
    // zone stability, and this app is zoneless, so the capture never fires. The trap still
    // does its real job — keeping Tab inside the dialog once focus is there.
    effect(() => {
      if (this.open()) this.dialog()?.nativeElement.focus();
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.code === 'KeyD' && event.shiftKey && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.open.update((open) => !open);
      return;
    }
    // Esc closes from anywhere inside the panel, including the note textarea.
    if (event.key === 'Escape' && this.open()) {
      this.open.set(false);
    }
  }

  protected close(): void {
    this.open.set(false);
  }
}
