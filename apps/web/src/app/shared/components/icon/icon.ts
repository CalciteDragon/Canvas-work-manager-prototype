import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The small set of SVG marks used by the project canvas's interaction chrome. */
export type CanvasIconName =
  'grip' | 'chevron' | 'plus' | 'archive' | 'remove' | 'settings' | 'resize' | 'undo' | 'redo';

/** Decorative, token-sized SVG chrome shared by the canvas and its section frames. */
@Component({
  selector: 'app-canvas-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (name()) {
      @case ('grip') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <circle cx="7" cy="5" r="1.5" />
          <circle cx="17" cy="5" r="1.5" />
          <circle cx="7" cy="12" r="1.5" />
          <circle cx="17" cy="12" r="1.5" />
          <circle cx="7" cy="19" r="1.5" />
          <circle cx="17" cy="19" r="1.5" />
        </svg>
      }
      @case ('chevron') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m5 9 7 7 7-7" />
        </svg>
      }
      @case ('plus') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      }
      @case ('archive') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" />
        </svg>
      }
      @case ('remove') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 3v7m6-7v7" />
        </svg>
      }
      @case ('settings') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          <path
            d="m19.4 15 .1.1 1.3 1-1.4 2.4-1.6-.6a8 8 0 0 1-1.8 1l-.3 1.7h-2.8l-.3-1.7a8 8 0 0 1-1.8-1l-1.6.6-1.4-2.4 1.3-1a8 8 0 0 1 0-2l-1.3-1 1.4-2.4 1.6.6a8 8 0 0 1 1.8-1L13 7.5h2.8l.3 1.7a8 8 0 0 1 1.8 1l1.6-.6 1.4 2.4-1.3 1a8 8 0 0 1-.2 2Z"
          />
        </svg>
      }
      @case ('undo') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-4" />
        </svg>
      }
      @case ('redo') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9a5 5 0 0 0 0 10h4" />
        </svg>
      }
      @case ('resize') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M8 4 3 9l5 5M3 9h10M16 20l5-5-5-5m5 5H11" />
          <path d="M12 3v18" />
        </svg>
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline-grid;
        inline-size: var(--size-icon-sm);
        block-size: var(--size-icon-sm);
        place-items: center;
        color: inherit;
      }

      svg {
        display: block;
        inline-size: 100%;
        block-size: 100%;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
      }

      circle {
        fill: currentColor;
        stroke: none;
      }
    `,
  ],
})
export class CanvasIcon {
  /** Selects one of the decorative inline SVGs. */
  readonly name = input.required<CanvasIconName>();
}
