import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** Live token editing arrives in Slice 17 (§22, §67). */
@Component({
  selector: 'app-design-lab-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Design Lab" note="Live token editing arrives in Slice 17 (§22, §67)." />`,
})
export class DesignLabPage {}
