import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** Workspace search arrives in Slice 10 (§40). */
@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Search" note="Workspace search arrives in Slice 10 (§40)." />`,
})
export class SearchPage {}
