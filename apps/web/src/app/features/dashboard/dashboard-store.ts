import { Injectable, computed, inject, signal } from '@angular/core';
import type { DashboardQuery, DashboardResult, DashboardWidget } from '@cwm/contracts';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
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

  /** A widget whose type nothing registers still gets a tile, so the gap is visible. */
  readonly tiles = computed(() =>
    this.widgetsState().map((widget) => ({ widget, definition: widgetDefinitionFor(widget.type) })),
  );

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loadingState.set(true);
    this.errorState.set(null);

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
      if (generation !== this.generation) return;
      this.widgetsState.set([]);
      this.dashboardState.set(null);
      this.errorState.set(messageOf(error));
    } finally {
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
