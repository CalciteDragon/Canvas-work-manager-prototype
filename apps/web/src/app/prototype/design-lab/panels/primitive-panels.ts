import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * §67's catalogue, primitive half.
 *
 * §67 lists buttons, inputs, cards, project cards and menus. Since slice 72, buttons and inputs
 * are **shared**: the global primitive classes in `styles/_controls.scss`, rendered here as they
 * are, and the Controls panel shows every variant and state. Cards, project cards, menus and
 * states are still token-styled markup inside features, so their panels are *representative
 * markup* labelled **not yet a shared component**. That label is the useful output: a primitive
 * everybody keeps re-styling is evidence for extracting it, and §78 is where that evidence goes.
 *
 * The project-card shapes are copied from the `active-projects` widget rows and the
 * historical hierarchy-view rows, which is why they get a panel of their own rather than folding
 * into "cards" — §67 names them separately and the markup genuinely differs.
 */
@Component({
  selector: 'app-design-lab-primitive-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './primitive-panels.html',
  styleUrls: ['./panels.scss', './primitive-panels.scss'],
})
export class PrimitivePanels {}
