import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * §68's `/settings`. There is exactly one thing to configure so far — §53's agent
 * permissions — so this is a way in rather than a settings surface. It grows when a slice
 * gives it something else to hold.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>Settings</h1>
    <ul class="settings__sections">
      <li>
        <a data-settings-agents routerLink="/settings/agents">AI &amp; Agents</a>
        <p>What each connected agent is allowed to do, and when it last called.</p>
      </li>
    </ul>
  `,
  styles: `
    .settings__sections {
      margin: var(--space-4) 0 0;
      padding: 0;
      list-style: none;
      max-width: var(--layout-reading-width);
    }

    .settings__sections p {
      margin: var(--space-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
})
export class SettingsPage {}
