import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { AgentConnection, AgentConnectionId, AgentPermission } from '@cwm/contracts';
import { AgentConnectionsStore } from './agent-connections-store';

interface PermissionRow {
  key: AgentPermission;
  label: string;
  /** Said out loud when the grant is wider than its name suggests. */
  note?: string;
}

/**
 * §53's grid shows five rows; `AgentPermissionSchema` has seven.
 *
 * All seven are rendered. A grid that hid two grants a connection actually holds would be
 * a permission UI that lies, which is the one thing a permission UI must not do — and §53's
 * mock predates the tool families §54 settled.
 */
const PERMISSIONS: readonly PermissionRow[] = [
  { key: 'projects.read', label: 'Read projects' },
  { key: 'projects.write', label: 'Modify projects' },
  { key: 'tasks.read', label: 'Read tasks' },
  { key: 'tasks.write', label: 'Modify tasks' },
  { key: 'reflections.read', label: 'Read reflections' },
  { key: 'reflections.write', label: 'Write reflections' },
  {
    key: 'workspace.read',
    label: 'Read workspace overview',
    note: 'Includes task and project content in aggregate — a wider grant than it sounds.',
  },
];

/**
 * §53's Settings → AI & Agents: the permission grid, "Last used", and Revoke.
 *
 * Changes take effect on the connection's **next call** — the host re-reads the connection
 * on every authenticated request, so there is nothing to restart and no token to reissue.
 */
@Component({
  selector: 'app-agent-connections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AgentConnectionsStore],
  templateUrl: './agent-connections-page.html',
  styleUrl: './agent-connections-page.scss',
})
export class AgentConnectionsPage {
  protected readonly store = inject(AgentConnectionsStore);
  protected readonly permissions = PERMISSIONS;

  constructor() {
    void this.store.load();
  }

  protected holds(connection: AgentConnection, permission: AgentPermission): boolean {
    return connection.permissions.includes(permission);
  }

  /**
   * The checkbox is the browser's to move, not Angular's: it is already in its new state by
   * the time this runs, and `[checked]` will not put it back because the bound value never
   * changed. So a refused write has to un-tick it by hand — otherwise the grid would show a
   * permission the connection does not have, which is the one thing §53's UI must never do.
   */
  protected async toggle(id: AgentConnectionId, permission: AgentPermission, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const granted = input.checked;
    if (!(await this.store.setPermission(id, permission, granted))) {
      input.checked = !granted;
    }
  }

  /**
   * §53's "Last used: 4 minutes ago".
   *
   * Read against **real** time, deliberately, not the simulated clock: this answers "is
   * anything still using this connection?", which is a question about the session you are
   * sitting in. The stamp itself is written by the domain from the injected `Clock` (§45),
   * so moving the simulated date does move what gets recorded — this only reads it back,
   * and says "in the future" rather than a negative when the two disagree.
   */
  protected lastUsed(connection: AgentConnection): string {
    if (connection.lastUsedAt === undefined) return 'Never used';
    const elapsed = Date.now() - Date.parse(connection.lastUsedAt);
    if (Number.isNaN(elapsed)) return 'Never used';
    return `Last used: ${relative(elapsed)}`;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'} ago`;

/** Coarse on purpose: §53 wants "4 minutes ago", not a duration to the second. */
const relative = (elapsed: number): string => {
  if (elapsed < 0) return 'in the future';
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');
  return plural(Math.floor(elapsed / DAY), 'day');
};
