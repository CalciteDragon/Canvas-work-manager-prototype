import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DashboardQuerySchema, type DashboardResult, type DashboardWidget } from '@cwm/contracts';
import { z } from 'zod';

/** This widget's own config: how far back "recently" reaches (§24). */
export const RecentProgressWidgetConfigSchema = z.object({ days: DashboardQuerySchema.shape.recentDays });

export const recentProgressWidgetQuery = (config: unknown) => {
  const parsed = RecentProgressWidgetConfigSchema.safeParse(config);
  return parsed.success ? { recentDays: parsed.data.days } : {};
};

/** §24's "recently completed work". */
@Component({
  selector: 'app-recent-progress-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recent-progress-widget.html',
  styleUrl: '../widget-content.scss',
})
export class RecentProgressWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();
}
