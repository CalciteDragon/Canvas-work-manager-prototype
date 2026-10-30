import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UnavailablePage } from '../unavailable-page/unavailable-page';

/**
 * The `**` route. §68 defines no wildcard, but the alternative is a blank screen on a
 * typo — and a prototype gets typed into a lot. It shares the unavailable project's layout and
 * its way back to Home (Slice 78, L4-014).
 */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UnavailablePage],
  template: `
    <app-unavailable-page heading="This page doesn’t exist" sentence="Check the address, or go to Home." />
  `,
})
export class NotFoundPage {}
