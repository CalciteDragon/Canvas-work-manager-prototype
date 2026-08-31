import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ThemeService } from '../../core/theme/theme-service';
import { DesignLabStore } from './design-lab-store';
import { DESIGN_LAB_TOKENS, type DesignLabToken } from './design-lab-tokens';
import { LivePanels } from './panels/live-panels';
import { PrimitivePanels } from './panels/primitive-panels';

/**
 * §22 and §67's Design Lab, at `/prototype/design`: a control rail that writes live tokens,
 * beside a catalogue of what they change.
 *
 * **One deviation from §22's wording, stated plainly:** §22 frames the Design Lab as a third
 * *theme* alongside Dark and Light. It is built as a route with live knobs instead, because
 * §67 defines it as a route and because a knob that only applied inside its own theme could
 * not answer "what does this accent look like on the dashboard".
 *
 * The page injects **no gateway**. Every panel is presentational and every fixture is a
 * plain contract object, which `design-lab-page.spec.ts` proves by providing no gateway
 * token at all.
 */
@Component({
  selector: 'app-design-lab-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LivePanels, PrimitivePanels],
  templateUrl: './design-lab-page.html',
  styleUrl: './design-lab-page.scss',
})
export class DesignLabPage {
  protected readonly store = inject(DesignLabStore);
  protected readonly tokens = DESIGN_LAB_TOKENS;
  private readonly theme = inject(ThemeService);

  constructor() {
    // The two themes declare different accents and sidebar widths, so an untouched control
    // must re-read the stylesheet when the theme moves — otherwise the rail sits there
    // showing the other theme's accent.
    effect(() => {
      this.theme.theme();
      this.store.rereadStylesheet();
    });
  }

  protected onInput(token: DesignLabToken, event: Event): void {
    this.store.write(token, (event.target as HTMLInputElement).value);
  }
}
