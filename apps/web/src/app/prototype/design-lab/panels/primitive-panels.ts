import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * §67's catalogue, primitive half.
 *
 * §67 lists buttons, inputs, cards, project cards and menus. **None of those exist as
 * components** — they are token-styled markup inside features, and the repository has
 * exactly one shared component (`PlaceholderPage`). Extracting a component library is a
 * plausible project and is not this slice; doing it here would rewrite most of the
 * application under the banner of a development page.
 *
 * So each panel here is *representative markup* carrying the same token-based classes the
 * features use, and each is labelled **not yet a shared component**. That label is the
 * useful output: a primitive everybody keeps re-styling is evidence for extracting it, and
 * §78 is where that evidence goes.
 *
 * The project-card shapes are copied from the `active-projects` widget rows and the
 * sub-projects section rows, which is why they get a panel of their own rather than folding
 * into "cards" — §67 names them separately and the markup genuinely differs.
 */
@Component({
  selector: 'app-design-lab-primitive-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './primitive-panels.html',
  styleUrls: ['./panels.scss', './primitive-panels.scss'],
})
export class PrimitivePanels {}
