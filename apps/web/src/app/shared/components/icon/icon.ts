import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Every app-owned mark, in one list so a spec can prove each renders. `remove` is the trash can.
 * User-chosen project and workstream emoji are content, not marks, and never appear here.
 */
export const ICON_NAMES = [
  'grip', 'chevron', 'plus', 'archive', 'remove', 'settings', 'resize', 'undo', 'redo',
  // Text glyphs `⋯ × ✓ ↗` and the three removal marks (W1-038, W4-032).
  'more', 'close', 'check', 'open', 'unlink', 'remove-section', 'rename',
  // Page kinds; `archive` above is the Archive page's mark.
  'home', 'todos', 'reflections',
  // Section types; Reflections sections share the page's mark.
  'markdown', 'task-list', 'progress', 'timeline', 'activity',
  // Dashboard widgets.
  'today', 'upcoming', 'projects', 'trend', 'digest', 'idea',
  // Activity actors.
  'user', 'agent', 'system',
] as const;

/** One of {@link ICON_NAMES}. */
export type IconName = (typeof ICON_NAMES)[number];

/**
 * Decorative, token-sized SVG marks: the one monochrome set for every app-owned mark (slice 72) —
 * chrome glyphs, page kinds, section types, dashboard widgets and activity actors. Every mark is
 * drawn in `currentColor` on a 24-unit grid. The owning control or text supplies the accessible
 * name.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (name()) {
      @case ('rename') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15l-1 5Z" />
        </svg>
      }
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
      @case ('more') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      }
      @case ('close') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      }
      @case ('check') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      }
      @case ('open') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M14 4h6v6M20 4l-9 9" />
          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      }
      @case ('unlink') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M9.5 6.5 11 5a4.2 4.2 0 0 1 6 6l-1.5 1.5M14.5 17.5 13 19a4.2 4.2 0 0 1-6-6l1.5-1.5" />
          <path d="M4 4l3 3M20 20l-3-3" />
        </svg>
      }
      @case ('remove-section') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="m9 9.5 6 5M15 9.5l-6 5" />
        </svg>
      }
      @case ('home') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m4 11 8-7 8 7" />
          <path d="M6 9.5V20h4.5v-5h3v5H18V9.5" />
        </svg>
      }
      @case ('todos') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m4 6.5 1.5 1.5L8 5.5M4 12.5 5.5 14 8 11.5M4 18.5 5.5 20 8 17.5" />
          <path d="M11 7h9M11 13h9M11 19h9" />
        </svg>
      }
      @case ('reflections') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z" />
          <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
        </svg>
      }
      @case ('markdown') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5Z" />
          <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
        </svg>
      }
      @case ('task-list') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <circle cx="5" cy="6.5" r="1.4" />
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="5" cy="17.5" r="1.4" />
          <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
        </svg>
      }
      @case ('progress') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M12 4a8 8 0 1 1-8 8" />
          <path d="M12 4a8 8 0 0 0-8 8M12 12V7.5" />
        </svg>
      }
      @case ('timeline') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M3 12h18" />
          <circle cx="6" cy="12" r="1.8" />
          <circle cx="13" cy="12" r="1.8" />
          <path d="M18 8v8M10 6.5V9M10 15v2.5" />
        </svg>
      }
      @case ('activity') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
        </svg>
      }
      @case ('today') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      }
      @case ('upcoming') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4M10 15h4m-2-2 2 2-2 2" />
        </svg>
      }
      @case ('projects') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
          <path d="M3.5 11h17" />
        </svg>
      }
      @case ('trend') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m3.5 17 6-6 4 4 7-7.5" />
          <path d="M15 7.5h5.5V13" />
        </svg>
      }
      @case ('digest') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M11 3.5 12.6 8a3 3 0 0 0 1.9 1.9L19 11.5l-4.5 1.6a3 3 0 0 0-1.9 1.9L11 19.5 9.4 15a3 3 0 0 0-1.9-1.9L3 11.5l4.5-1.6A3 3 0 0 0 9.4 8Z" />
          <path d="M18.5 3v4M16.5 5h4" />
        </svg>
      }
      @case ('idea') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M9 17.5h6M10 20.5h4" />
          <path d="M8.5 14.5a6 6 0 1 1 7 0c-.6.5-1 1.2-1 2v1h-5v-1c0-.8-.4-1.5-1-2Z" />
        </svg>
      }
      @case ('user') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.8" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      }
      @case ('agent') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <rect x="4.5" y="7.5" width="15" height="12" rx="3" />
          <path d="M12 7.5V4.5M9.5 13.5v1M14.5 13.5v1M2.5 12.5v3M21.5 12.5v3" />
        </svg>
      }
      @case ('system') {
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
          <path d="M8.5 20h7M12 16.5V20M7 9l2.5 2L7 13M12 13h4" />
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
export class Icon {
  /** Selects one of the decorative inline SVGs. */
  readonly name = input.required<IconName>();
}
