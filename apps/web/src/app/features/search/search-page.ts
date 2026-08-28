import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** §40 has no slice of its own: search arrives with Slice 21's command palette. */
@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Search" note="Workspace search arrives with the command palette in Slice 21 (§40, §41)." />`,
})
export class SearchPage {}
