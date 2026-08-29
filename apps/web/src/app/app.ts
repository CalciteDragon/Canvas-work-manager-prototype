import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppShell } from './core/shell/app-shell';
import { DevPanel } from './prototype/dev-panel/dev-panel';

/**
 * The bootstrap component. Everything visible is §23's shell, plus §46's development
 * panel mounted once so Ctrl/Cmd+Shift+D reaches every route.
 *
 * The panel hangs here rather than inside `AppShell` for the same reason the concrete
 * adapters are named in `app.config.ts` and nowhere else: `core/` must not depend on
 * `prototype/`. This is the view's composition root, which is where a development-only
 * surface is allowed to be attached to a production-shaped shell.
 */
@Component({
  imports: [AppShell, DevPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  template: `
    <app-shell />
    <app-dev-panel />
  `,
})
export class App {}
