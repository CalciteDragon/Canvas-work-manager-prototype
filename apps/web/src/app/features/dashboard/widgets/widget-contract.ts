import type { DashboardResult, DashboardWidget } from '@cwm/contracts';

/**
 * What every widget receives, mirroring `sections/section-contract.ts`.
 *
 * A widget takes **data**, never a gateway: the whole dashboard is one derivation over one
 * clock reading (§24), so a widget that fetched for itself could contradict the tile beside
 * it. `widget` travels with it because §25's `config` belongs to the widget type.
 *
 * The record's identity must be stable for the same reason the section frame's is —
 * `NgComponentOutlet` re-applies its inputs on every change-detection pass, so
 * `DashboardWidgetFrame` builds this in a `computed()`.
 */
export interface DashboardWidgetInputs extends Record<string, unknown> {
  widget: DashboardWidget;
  dashboard: DashboardResult;
}

/** Declared members, so a widget registered without them fails to compile. */
export interface DashboardWidgetComponent {
  readonly widget: unknown;
  readonly dashboard: unknown;
}
