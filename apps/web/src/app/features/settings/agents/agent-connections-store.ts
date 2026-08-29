import { Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { AgentConnection, AgentConnectionId, AgentPermission } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
/** §53's page state. Component-scoped (§20) — it belongs to the page, not the app. */
@Injectable()
export class AgentConnectionsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private readonly pendingTasks = inject(PendingTasks);
  private readonly itemsState = signal<AgentConnection[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null); private readonly busyState = signal<AgentConnectionId | null>(null);
  readonly connections = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly(); readonly busy = this.busyState.asReadonly();

  async load() { this.loadingState.set(true); this.errorState.set(null); const settled = this.pendingTasks.add(); try { this.itemsState.set(await this.gateway.agents.list()); } catch (e) { this.errorState.set(messageOf(e)); } finally { settled(); this.loadingState.set(false); } }

  /**
   * §53's grid sends the **whole** grant, not the box that moved: the array is the
   * statement of what the connection may do, and two boxes clicked in quick succession
   * would otherwise race each other into different final answers.
   */
  async setPermission(id: AgentConnectionId, permission: AgentPermission, granted: boolean): Promise<boolean> {
    const current = this.itemsState().find((connection) => connection.id === id);
    if (current === undefined) return false;
    const permissions = granted
      ? [...current.permissions, permission]
      : current.permissions.filter((held) => held !== permission);
    return this.write(id, () => this.gateway.agents.setPermissions(id, permissions));
  }

  revoke(id: AgentConnectionId): Promise<boolean> { return this.write(id, () => this.gateway.agents.revoke(id)); }

  private async write(id: AgentConnectionId, operation: () => Promise<AgentConnection>): Promise<boolean> {
    if (this.busyState() !== null) return false;
    this.busyState.set(id); this.errorState.set(null);
    const settled = this.pendingTasks.add();
    try {
      const updated = await operation();
      // Replaced with what the host answered, not with what was asked for: the domain may
      // have refused part of it, and §53 promises the grid shows the grant that is in force.
      this.itemsState.update((connections) => connections.map((connection) => connection.id === id ? updated : connection));
      return true;
    } catch (e) { this.errorState.set(messageOf(e)); return false; } finally { settled(); this.busyState.set(null); }
  }
}
