import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppShell } from './core/shell/app-shell';

/** The bootstrap component. Everything visible is §23's shell. */
@Component({
  imports: [AppShell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  template: `<app-shell />`,
})
export class App {}
