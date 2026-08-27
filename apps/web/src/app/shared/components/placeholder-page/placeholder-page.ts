import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What a route will become, and which slice builds it. One component rather than eight
 * near-identical ones — a placeholder is not feature code, so it lives in `shared/` (§65).
 *
 * Every one of these disappears as its slice lands. If one is still here at the end of the
 * first milestone (§81), that is a finding, not a feature.
 */
@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './placeholder-page.scss',
  template: `
    <section class="placeholder">
      <h1>{{ heading() }}</h1>
      <p>{{ note() }}</p>
    </section>
  `,
})
export class PlaceholderPage {
  readonly heading = input.required<string>();
  readonly note = input.required<string>();
}
