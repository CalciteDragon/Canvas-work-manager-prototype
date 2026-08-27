import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** The configurable widget dashboard arrives in Slice 11 (§24, §25). */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Home" note="The configurable widget dashboard arrives in Slice 11 (§24, §25)." />`,
})
export class DashboardPage {}
