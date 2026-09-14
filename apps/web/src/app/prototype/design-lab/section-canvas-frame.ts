import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SectionColumnSpan } from '@cwm/contracts';

/**
 * The canvas wrapper a `ProjectSectionFrame` needs in order to have a **width**.
 *
 * The frame itself writes only `[attr.data-column-span]`; the actual width comes from
 * `.section-canvas--flow .section-canvas__item--span-N` in `project-canvas.scss`, applied by
 * `ProjectCanvas` to a wrapper element, in *that* component's emulated-encapsulation
 * stylesheet. A bare frame shows no width difference at all — so "Full Width" and "Half
 * Width" would be pixel-identical and the variant set would be a lie.
 *
 * This reproduces those rules for the Design Lab panel **and** the Storybook story set,
 * which is why it lives here rather than inside either one.
 */
@Component({
  selector: 'app-section-canvas-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .canvas {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-4);
      width: 100%;
    }
    .canvas--grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .canvas__item {
      position: relative;
      min-width: 0;
      --canvas-chrome-opacity: 0;
      --canvas-overlay-opacity: 0;
    }
    .canvas__item:hover,
    .canvas__item:focus-within {
      --canvas-chrome-opacity: 1;
      --canvas-overlay-opacity: 1;
    }
    .canvas--flow .canvas__item--span-12 { width: 100%; }
    .canvas--flow .canvas__item--span-8 { width: 66.666%; }
    .canvas--flow .canvas__item--span-6 { width: 50%; }
    .canvas--flow .canvas__item--span-4 { width: 33.333%; }
    .canvas--grid .canvas__item--span-12 { grid-column: span 12; }
    .canvas--grid .canvas__item--span-8 { grid-column: span 8; }
    .canvas--grid .canvas__item--span-6 { grid-column: span 6; }
    .canvas--grid .canvas__item--span-4 { grid-column: span 4; }
    @media (hover: none), (any-pointer: coarse) {
      .canvas__item {
        --canvas-chrome-opacity: 1;
        --canvas-overlay-opacity: 1;
      }
    }
  `,
  template: `
    <div
      data-section-canvas-frame
      class="canvas"
      [class.canvas--flow]="mode() === 'flow'"
      [class.canvas--grid]="mode() === 'grid'"
    >
      <div
        class="canvas__item"
        [attr.data-column-span]="columnSpan()"
        [class.canvas__item--span-12]="columnSpan() === 12"
        [class.canvas__item--span-8]="columnSpan() === 8"
        [class.canvas__item--span-6]="columnSpan() === 6"
        [class.canvas__item--span-4]="columnSpan() === 4"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class SectionCanvasFrame {
  readonly columnSpan = input.required<SectionColumnSpan>();
  readonly mode = input<'flow' | 'grid'>('flow');
}
