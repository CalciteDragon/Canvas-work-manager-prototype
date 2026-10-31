import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * §68's way back from a place the user cannot reach: an unavailable project and the `**` route
 * share it (Slice 78, L4-014). A heading that route focus lands on, one sentence, and **Go to
 * Home** — no Try again, because nothing to retry would change the answer, and no Details,
 * because the reason would only say whose it is (W4-024). A caller may project one further
 * control, as the workspace keeps its history Retry.
 */
@Component({
  selector: 'app-unavailable-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './unavailable-page.scss',
  template: `
    <section class="unavailable">
      <h1 data-route-focus data-unavailable-heading tabindex="-1">{{ heading() }}</h1>
      <p data-unavailable-sentence>{{ sentence() }}</p>
      <div class="unavailable__actions">
        <a class="button button--primary" data-go-home data-recovery="go-home" routerLink="/app">Go to Home</a>
        <ng-content />
      </div>
    </section>
  `,
})
export class UnavailablePage {
  readonly heading = input.required<string>();
  readonly sentence = input.required<string>();
}
