import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from './placeholder-page';

/**
 * The `**` route. §68 defines no wildcard, but the alternative is a blank screen on a
 * typo — and a prototype gets typed into a lot.
 */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `
    <app-placeholder-page heading="No such page" note="That address is not one of §68's routes." />
  `,
})
export class NotFoundPage {}
