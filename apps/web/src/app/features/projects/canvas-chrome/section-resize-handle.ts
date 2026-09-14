import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { ProjectLayoutMode, SectionColumnSpan } from '@cwm/contracts';
import { snapColumnSpan, stepColumnSpan } from './column-span';
import { CanvasIcon } from './canvas-icon';

/** Canvas geometry needed to translate pointer travel into a supported column span. */
export interface ResizeMeasurement {
  trackWidth: number;
  columnGap: number;
}

/** A pointer-captured width handle with a keyboard equivalent on its end edge. */
@Component({
  selector: 'app-section-resize-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasIcon],
  template: `
    <button
      type="button"
      data-resize-handle
      [attr.aria-label]="accessibleName()"
      [attr.aria-hidden]="edge() === 'start' ? 'true' : null"
      [attr.aria-valuenow]="displayedSpan()"
      [attr.aria-valuemin]="4"
      [attr.aria-valuemax]="12"
      [attr.aria-valuetext]="displayedSpan() + ' of 12 columns'"
      [attr.tabindex]="edge() === 'end' ? 0 : -1"
      (pointerdown)="pointerDown($event)"
      (pointermove)="pointerMove($event)"
      (pointerup)="pointerUp($event)"
      (pointercancel)="pointerCancel($event)"
      (lostpointercapture)="pointerCancel($event)"
      (keydown)="keyDown($event)"
      (blur)="commitKeyboardPreview()"
    >
      <app-canvas-icon name="resize" />
    </button>
  `,
  styleUrl: './section-resize-handle.scss',
  host: { '[attr.data-edge]': 'edge()' },
})
export class SectionResizeHandle {
  /** Which side the handle controls; dragging the start edge reverses pointer direction. */
  readonly edge = input.required<'start' | 'end'>();
  /** The currently rendered canvas mode. */
  readonly mode = input.required<ProjectLayoutMode>();
  /** Resolved section or shortcut name, used to label the keyboard handle. */
  readonly name = input.required<string>();
  /** Persisted width, or the canvas's live preview width. */
  readonly columnSpan = input.required<SectionColumnSpan>();
  /** Measures the canvas track; injectable so the component stays layout-independent in tests. */
  readonly measure = input.required<() => ResizeMeasurement>();

  /** A live span preview while the user drags or presses a resize key. */
  readonly preview = output<SectionColumnSpan>();
  /** The span to persist on pointer release, Enter, or blur. */
  readonly commit = output<SectionColumnSpan>();
  /** Escape or pointer cancellation abandons the current preview. */
  readonly cancel = output<void>();

  private readonly keyboardSpan = signal<SectionColumnSpan | null>(null);
  private pointerDrag: {
    pointerId: number;
    startX: number;
    startSpan: SectionColumnSpan;
    previewSpan: SectionColumnSpan;
    button: HTMLButtonElement;
  } | null = null;

  /** The label follows the live width so the focused slider announces its current value. */
  readonly accessibleName = () => `Resize ${this.name()}, ${this.displayedSpan()} of 12 columns`;

  /** The local keyboard draft takes precedence until it is committed or cancelled. */
  readonly displayedSpan = () => this.keyboardSpan() ?? this.columnSpan();

  /** Starts pointer capture so mouse, pen, and touch can leave the small handle safely. */
  pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.pointerDrag !== null) return;
    const button = event.currentTarget as HTMLButtonElement;
    const startSpan = this.columnSpan();
    this.keyboardSpan.set(null);
    this.pointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startSpan,
      previewSpan: startSpan,
      button,
    };
    event.preventDefault();
    event.stopPropagation();
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and an element detached during navigation have no capturable pointer.
    }
  }

  /** Paint the nearest supported span while the captured pointer moves. */
  pointerMove(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.previewPointer(event, drag);
  }

  /** The final pointer position is previewed before its span is committed. */
  pointerUp(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    this.previewPointer(event, drag);
    this.releasePointer(drag);
    this.pointerDrag = null;
    this.commit.emit(drag.previewSpan);
    event.preventDefault();
    event.stopPropagation();
  }

  /** A browser-cancelled touch or pen gesture restores the canvas's saved value. */
  pointerCancel(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    this.releasePointer(drag);
    this.pointerDrag = null;
    this.cancel.emit();
    event.preventDefault();
    event.stopPropagation();
  }

  /** Arrow keys step spans; Home/End select the narrowest and widest supported values. */
  keyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.pointerDrag !== null) {
        this.cancelPointerDrag();
        event.preventDefault();
        event.stopPropagation();
      } else if (this.edge() === 'end' && this.keyboardSpan() !== null) {
        this.keyboardSpan.set(null);
        this.cancel.emit();
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (this.edge() !== 'end') return;

    if (event.key === 'Enter') {
      this.commitKeyboardPreview();
      if (this.keyboardSpan() === null) event.preventDefault();
      return;
    }

    let next: SectionColumnSpan | null = null;
    const current = this.displayedSpan();
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = stepColumnSpan(current, 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      next = stepColumnSpan(current, -1);
    else if (event.key === 'Home') next = 4;
    else if (event.key === 'End') next = 12;
    if (next === null) return;

    event.preventDefault();
    if (next === current) return;
    this.keyboardSpan.set(next);
    this.preview.emit(next);
  }

  /** Blur is the keyboard handle's second commit path, matching inline title editing. */
  commitKeyboardPreview(): void {
    const span = this.keyboardSpan();
    if (span === null) return;
    this.keyboardSpan.set(null);
    this.commit.emit(span);
  }

  private previewPointer(
    event: PointerEvent,
    drag: NonNullable<SectionResizeHandle['pointerDrag']>,
  ): void {
    const geometry = this.measure()();
    const span = snapColumnSpan({
      mode: this.mode(),
      trackWidth: geometry.trackWidth,
      columnGap: geometry.columnGap,
      startSpan: drag.startSpan,
      deltaPx: event.clientX - drag.startX,
      edge: this.edge(),
    });
    if (span === drag.previewSpan) return;
    drag.previewSpan = span;
    this.preview.emit(span);
  }

  private cancelPointerDrag(): void {
    const drag = this.pointerDrag;
    if (drag === null) return;
    this.releasePointer(drag);
    this.pointerDrag = null;
    this.cancel.emit();
  }

  private releasePointer(drag: NonNullable<SectionResizeHandle['pointerDrag']>): void {
    try {
      if (drag.button.hasPointerCapture(drag.pointerId))
        drag.button.releasePointerCapture(drag.pointerId);
    } catch {
      // The browser may already have released capture as it delivered pointercancel.
    }
  }
}
