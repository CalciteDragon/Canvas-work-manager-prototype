import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** The seed and state inspector arrives in Slice 12 (§46). */
@Component({
  selector: 'app-state-inspector-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Prototype state" note="The seed and state inspector arrives in Slice 12 (§46)." />`,
})
export class StateInspectorPage {}
