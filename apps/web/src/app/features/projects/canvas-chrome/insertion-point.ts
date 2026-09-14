import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SectionColumnSpan } from '@cwm/contracts';
import { CanvasIcon } from './canvas-icon';

/** The insertion affordance's stable meaning, independent of its current canvas index. */
export type InsertionPointKind = 'before' | 'end' | 'gap';

/** Intent emitted by an insertion point; `beforeId: null` means append at the end. */
export interface InsertionIntent {
  kind: InsertionPointKind;
  beforeId: string | null;
  columnSpan: SectionColumnSpan;
}

/** A keyboard and pointer accessible line-and-plus overlay that only reports placement intent. */
@Component({
  selector: 'app-insertion-point',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasIcon],
  template: `
    <button
      type="button"
      data-insertion-point-button
      [attr.aria-label]="label()"
      (click)="select()"
    >
      <app-canvas-icon name="plus" />
    </button>
  `,
  styleUrl: './insertion-point.scss',
  host: {
    '[attr.data-insertion-point]': 'kind()',
    '[attr.data-before-id]': 'beforeId()',
    '[style.--span]': 'columnSpan()',
  },
})
export class InsertionPoint {
  /** Whether this control precedes a placement, follows the canvas, or fills a grid gap. */
  readonly kind = input.required<InsertionPointKind>();
  /** The stable placement anchor. `null` represents the end of the current order. */
  readonly beforeId = input.required<string | null>();
  /** Initial supported width; a gap target supplies the largest width that fits. */
  readonly columnSpan = input.required<SectionColumnSpan>();
  /** Accessible action label shown to keyboard and assistive-technology users. */
  readonly label = input.required<string>();

  /** Placement intent; the owning canvas resolves the anchor against its current order. */
  readonly selected = output<InsertionIntent>();

  /** Emit the stable anchor rather than an index that live placement reads could change. */
  select(): void {
    this.selected.emit({
      kind: this.kind(),
      beforeId: this.beforeId(),
      columnSpan: this.columnSpan(),
    });
  }
}
