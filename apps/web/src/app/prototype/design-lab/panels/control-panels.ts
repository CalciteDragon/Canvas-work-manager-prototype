import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * §67's Controls specimen (slice 72): every shared control primitive in every variant, size and
 * state, rendered once over a pane and once over a sheet so both planes' backings are visible.
 *
 * Hover, pressed and focus cannot be held by a pointer in a capture, so the specimen forces them
 * with `is-hover`, `is-pressed` and `is-focus`. Those classes include the same mixins
 * (`styles/_control-states.scss`) the real `:hover`, `:active` and `:focus-visible` rules do, so
 * a specimen cannot drift from the rule it shows, and `_controls.scss` carries no Lab selector.
 *
 * The removal marks are labelled for the slice 72 checkpoint (open question 4).
 */
@Component({
  selector: 'app-design-lab-control-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Icon],
  templateUrl: './control-panels.html',
  styleUrls: ['./panels.scss', './control-panels.scss'],
})
export class ControlPanels {
  /** The four button ranks, in the order a surface would use them. */
  protected readonly ranks = [
    { label: 'Primary', modifier: 'button--primary' },
    { label: 'Secondary', modifier: '' },
    { label: 'Ghost', modifier: 'button--ghost' },
    { label: 'Danger', modifier: 'button--danger' },
  ] as const;

  /** Forced states, shown left to right for every rank. */
  protected readonly states = [
    { label: 'Rest', force: '' },
    { label: 'Hover', force: 'is-hover' },
    { label: 'Focus', force: 'is-focus' },
    { label: 'Pressed', force: 'is-pressed' },
  ] as const;

  /** The two planes a control sits on. */
  protected readonly planes = [
    { label: 'Over a pane', modifier: 'control-plane--pane' },
    { label: 'Over a sheet', modifier: 'control-plane--sheet' },
  ] as const;
}
