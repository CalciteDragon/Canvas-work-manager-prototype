import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** The workspace calendar arrives in Slice 18 (§37). */
@Component({
  selector: 'app-calendar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Calendar" note="The workspace calendar arrives in Slice 18 (§37)." />`,
})
export class CalendarPage {}
