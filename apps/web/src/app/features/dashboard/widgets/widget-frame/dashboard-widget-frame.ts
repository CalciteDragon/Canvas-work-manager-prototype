import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';
import type { DashboardWidgetDefinition } from '../registry';
import type { DashboardWidgetInputs } from '../widget-contract';

/**
 * The chrome every widget renders inside: title, icon, and §25's preset size. It owns no
 * data and calls no gateway — the widget host hands it a definition and the one derived
 * dashboard.
 *
 * It exists rather than looping `NgComponentOutlet` in the page because the inputs record
 * has to keep a stable identity per widget, and only a component with its own `computed()`
 * can give it one (see `widget-contract.ts`).
 */
@Component({
  selector: 'app-dashboard-widget-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  templateUrl: './dashboard-widget-frame.html',
  styleUrl: './dashboard-widget-frame.scss',
})
export class DashboardWidgetFrame {
  readonly widget = input.required<DashboardWidget>();
  readonly definition = input.required<DashboardWidgetDefinition>();
  readonly dashboard = input.required<DashboardResult>();

  readonly contentInputs = computed<DashboardWidgetInputs>(() => ({
    widget: this.widget(),
    dashboard: this.dashboard(),
  }));
}
