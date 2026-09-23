import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CanvasIcon } from '../canvas-chrome/canvas-icon';
import type { HistoryControlView } from './history-feedback';

const NOTHING: HistoryControlView = { name: 'Loading history…', enabled: false };

/**
 * §26's header Undo and Redo icons (Slice 41). **Presentational**: it renders what
 * `ProjectHistoryStore` decided and emits clicks; the shell projects it into `ProjectHeader`.
 *
 * Both buttons are always focusable. Unavailability is `aria-disabled="true"` with a guarded
 * click, never the native `disabled` attribute, which would drop a button from the tab order and
 * hide the reason it cannot act from keyboard users. The accessible name and `title` are one string,
 * so the reason is never hover-only.
 */
@Component({
  selector: 'app-project-history-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasIcon],
  templateUrl: './project-history-controls.html',
  styleUrl: './project-history-controls.scss',
})
export class ProjectHistoryControls {
  readonly undo = input<HistoryControlView>(NOTHING);
  readonly redo = input<HistoryControlView>(NOTHING);
  /** The history could not be read; a read-only Retry is offered. */
  readonly retryAvailable = input(false);

  readonly undoRequested = output<void>();
  readonly redoRequested = output<void>();
  readonly retryRequested = output<void>();

  requestUndo(): void {
    if (this.undo().enabled) this.undoRequested.emit();
  }

  requestRedo(): void {
    if (this.redo().enabled) this.redoRequested.emit();
  }
}
