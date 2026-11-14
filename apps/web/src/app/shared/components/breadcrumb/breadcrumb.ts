import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One step of a path: a link when `link` is set, plain text otherwise. */
export interface BreadcrumbItem {
  readonly label: string;
  /** A `routerLink` value; `null` draws the step as text. */
  readonly link: string | readonly unknown[] | null;
  readonly fragment?: string;
}

/**
 * The path to where the person is (§26, Slice 81, L7-004), and the same path written inside a
 * sentence (W2-030).
 *
 * - **`navigation`** (the default): `nav aria-label="Breadcrumb"` over an `ol`; every step but the
 *   last is a link, the last is the current place as text with `aria-current="page"`. Its links are
 *   themed pills, never underlined (decision 2), 44 px tall on touch (Q14 (a)).
 * - **`inline`**: the path as words in running text, such as Archive's "Origin: …". No landmark and
 *   nothing current; a step with a link is an ordinary content link that keeps its text size on
 *   touch, inline under WCAG 2.5.8's exception (Q14 (a)).
 *
 * The `›` separators are decorative. Presentational: the caller builds the steps.
 */
@Component({
  selector: 'app-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
})
export class Breadcrumb {
  readonly items = input.required<readonly BreadcrumbItem[]>();
  readonly variant = input<'navigation' | 'inline'>('navigation');
}
