import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * §68's `/settings`: entry to agent permissions and workspace-wide archived projects.
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
      <li>
        <a data-settings-archived-projects routerLink="/settings/archived-projects">Archived projects</a>
        <p>Find and restore archived projects across this workspace.</p>
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

    .settings__sections li + li { margin-top: var(--space-4); }
  `,
})
export class SettingsPage {}
