import { Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { AgentConnection, AgentConnectionId, AgentPermission } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { readFailure, type Failure } from '../../../shared/feedback/failure';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
/** §53's page state. Component-scoped (§20) — it belongs to the page, not the app. */
@Injectable()
export class AgentConnectionsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private readonly pendingTasks = inject(PendingTasks);
  private readonly itemsState = signal<AgentConnection[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<Failure | null>(null); private readonly revokeErrorState = signal<string | null>(null); private readonly busyState = signal<AgentConnectionId | null>(null);
  /** A refused permission change, per connection, said in that connection's card (Slice 75, L4-005). */
  private readonly permissionFailuresState = signal<ReadonlyMap<AgentConnectionId, { permission: AgentPermission; reason: string }>>(new Map());
  readonly permissionFailures = this.permissionFailuresState.asReadonly();
  readonly connections = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly busy = this.busyState.asReadonly();

  /**
   * The list read's failure (Slice 78), kept apart from Revoke's. A failure stays on screen while
   * Try again re-reads, its button busy on `loading()`, until a read answers.
   */
  readonly error = this.errorState.asReadonly();
  /**
   * Revoke's page-level failure: the raw reason, the one this slice leaves (carried to slice 8's
   * Revoke work). It never offers Try again and never clears the list.
   */
  readonly revokeError = this.revokeErrorState.asReadonly();

  async load() { this.loadingState.set(true); const settled = this.pendingTasks.add(); try { this.itemsState.set(await this.gateway.agents.list()); this.errorState.set(null); } catch (e) { this.errorState.set(readFailure(e, 'your agent connections')); } finally { settled(); this.loadingState.set(false); } }

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
    return this.write(id, () => this.gateway.agents.setPermissions(id, permissions), (reason) =>
      this.permissionFailuresState.update((failures) => new Map(failures).set(id, { permission, reason })));
  }

  revoke(id: AgentConnectionId): Promise<boolean> { return this.write(id, () => this.gateway.agents.revoke(id)); }

  /** A write's failure goes to `failed` when it has an object of its own to be said on, else to the page. */
  private async write(id: AgentConnectionId, operation: () => Promise<AgentConnection>, failed?: (reason: string) => void): Promise<boolean> {
    if (this.busyState() !== null) return false;
    this.busyState.set(id); this.revokeErrorState.set(null);
    if (this.permissionFailuresState().has(id)) this.permissionFailuresState.update((failures) => { const next = new Map(failures); next.delete(id); return next; });
    const settled = this.pendingTasks.add();
    try {
      const updated = await operation();
      // Replaced with what the host answered, not with what was asked for: the domain may
      // have refused part of it, and §53 promises the grid shows the grant that is in force.
      this.itemsState.update((connections) => connections.map((connection) => connection.id === id ? updated : connection));
      return true;
    } catch (e) { if (failed === undefined) this.revokeErrorState.set(messageOf(e)); else failed(messageOf(e)); return false; } finally { settled(); this.busyState.set(null); }
  }
}
