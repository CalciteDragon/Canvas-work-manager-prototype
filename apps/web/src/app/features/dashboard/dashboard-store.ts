import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { DashboardQuery, DashboardResult, DashboardWidget, LiveEvent } from '@cwm/contracts';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { widgetDefinitionFor } from './widgets/registry';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The dashboard's one store (§20 — no global mega-store).
 *
 * It joins two sources that stay separate on purpose: the **layout** comes from the persona
 * through `IdentityProvider` (§25's widgets live on `UserPreferences`), and the **content**
 * comes from the gateway in a single call. Switching persona therefore changes the
 * dashboard without anything here knowing personas exist.
 */
@Injectable()
export class DashboardStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly identity = inject(IDENTITY_PROVIDER);

  /** Guards against a slow first load landing after a later one (persona switch, reload). */
  private generation = 0;

  private readonly widgetsState = signal<DashboardWidget[]>([]);
  private readonly dashboardState = signal<DashboardResult | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);

  readonly widgets = this.widgetsState.asReadonly();
  readonly dashboard = this.dashboardState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe((event) => this.onLiveEvent(event));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /** A widget whose type nothing registers still gets a tile, so the gap is visible. */
  readonly tiles = computed(() =>
    this.widgetsState().map((widget) => ({ widget, definition: widgetDefinitionFor(widget.type) })),
  );

  async load(): Promise<void> {
    return this.read({ quiet: false });
  }

  /**
   * §62's re-read. Same two sources as `load`, but it never sets `loading` and never clears
   * the rendered dashboard on failure — an agent finishing a task must not blank six tiles,
   * and a host blip during someone else's write must not report an error the user did not
   * cause.
   */
  private refresh(): Promise<void> {
    return this.read({ quiet: true });
  }

  /**
   * §62's routing. The widgets render tasks, projects and reflections, so a change to any of
   * them is news; an `agent_connection` event is not — nothing on this page shows a
   * connection, and §53's page owns those anyway.
   */
  private onLiveEvent(event: LiveEvent): void {
    if (event.type.startsWith('agent_connection.')) return;
    void this.refresh();
  }

  private async read({ quiet }: { quiet: boolean }): Promise<void> {
    const generation = ++this.generation;
    if (!quiet) {
      this.loadingState.set(true);
      this.errorState.set(null);
    }

    try {
      const { user } = await this.identity.getCurrentIdentity();
      // Hidden widgets are excluded before the query is built: an invisible Upcoming tile
      // must not widen the range for the ones that are on screen.
      const widgets = [...user.preferences.dashboardWidgets]
        .filter(({ hidden }) => !hidden)
        .sort((a, b) => a.position - b.position);
      const dashboard = await this.gateway.dashboard.get(queryFor(widgets));

      if (generation !== this.generation) return;
      this.widgetsState.set(widgets);
      this.dashboardState.set(dashboard);
    } catch (error) {
      if (generation !== this.generation || quiet) return;
      this.widgetsState.set([]);
      this.dashboardState.set(null);
      this.errorState.set(messageOf(error));
    } finally {
      // Deliberately **not** `&& !quiet`. Both paths claim a generation, so a live frame
      // arriving mid-load leaves the quiet read holding the newest one — and if only the
      // loud path could clear the flag, the load would skip its `finally` on the generation
      // check and the dashboard would sit on a skeleton forever with its data already in
      // hand. Whoever is current clears it; only the loud path ever sets it.
      if (generation === this.generation) this.loadingState.set(false);
    }
  }
}

/**
 * §25 keeps `config` opaque, and this store keeps it that way: each definition reads its
 * own config and returns query members, so nothing here learns that Upcoming's `days` and
 * Recent Progress's `days` are different parameters.
 */
const queryFor = (widgets: readonly DashboardWidget[]): Partial<DashboardQuery> =>
  widgets.reduce<Partial<DashboardQuery>>(
    (query, widget) => ({ ...query, ...(widgetDefinitionFor(widget.type)?.queryFrom?.(widget.config) ?? {}) }),
    {},
  );
