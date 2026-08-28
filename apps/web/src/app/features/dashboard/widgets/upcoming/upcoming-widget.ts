import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DashboardQuerySchema, type DashboardResult, type DashboardWidget } from '@cwm/contracts';
import { z } from 'zod';

/**
 * This widget's own config, parsed here and nowhere else — the same rule the section
 * configs follow. §24 calls Upcoming's range "configurable"; `days` is what configures it.
 */
export const UpcomingWidgetConfigSchema = z.object({ days: DashboardQuerySchema.shape.upcomingDays });

/**
 * A malformed or absent config still renders: `data.json` is hand-editable, so an
 * unreadable `days` falls back to the contract default rather than blanking the tile.
 */
export const upcomingWidgetQuery = (config: unknown) => {
  const parsed = UpcomingWidgetConfigSchema.safeParse(config);
  return parsed.success ? { upcomingDays: parsed.data.days } : {};
};

/** §24's "work approaching within configurable range". */
@Component({
  selector: 'app-upcoming-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upcoming-widget.html',
  styleUrl: '../widget-content.scss',
})
export class UpcomingWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();
}
