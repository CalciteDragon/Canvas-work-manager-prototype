import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../shared/components/placeholder-page/placeholder-page';

/** The project page and its section canvas arrive in Slice 8 (§26, §27). */
@Component({
  selector: 'app-project-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Project" note="The project page and its section canvas arrive in Slice 8 (§26, §27)." />`,
})
export class ProjectPage {}
