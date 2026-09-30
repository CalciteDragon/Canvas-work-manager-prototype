# How the dashboard works

## Runtime flow

1. `/app` activates `DashboardPage`, which provides `DashboardStore`.
2. The store reads the persona's widget list from `IDENTITY_PROVIDER`, looks each
   visible type up in `DASHBOARD_WIDGET_REGISTRY`, and merges every definition's
   `queryFrom(config)` into one query (for example `upcomingDays`).
3. One call to `dashboard.load(query)` returns §24's content; each widget renders its
   slice of it inside `DashboardWidgetFrame` at the size the layout names.
4. On a live frame the store re-reads quietly; on `prototype.reloaded` the tab reloads. The Recent
   Agent Activity widget reuses `ActivityFeed`, so a removed row displays its captured historical
   label supplied by the host rather than disappearing.
5. Switching persona reloads the page; the new persona's list and query produce a
   different dashboard with nothing in this feature knowing why.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `DashboardPage` | component | The page | [API](../../../api/components/DashboardPage.html) |
| `DashboardStore` | injectable | Layout ⋈ content | [API](../../../api/injectables/DashboardStore.html) |
| `DASHBOARD_WIDGET_REGISTRY` | const | Type → component and `queryFrom` | [API](../../../api/miscellaneous/variables.html#DASHBOARD_WIDGET_REGISTRY) |
| `DashboardWidgetDefinition`, `DashboardWidgetComponent`, `DashboardWidgetInputs` | interfaces | The widget contract | [API](../../../api/interfaces/DashboardWidgetDefinition.html) |
| `DashboardWidgetFrame` | component | Chrome and sizes | [API](../../../api/components/DashboardWidgetFrame.html) |
| `TodayWidget`, `UpcomingWidget`, `ActiveProjectsWidget`, `RecentProgressWidget`, `DailyDigestWidget`, `FunFactWidget`, `RecentAgentActivityWidget` | components | The seven widgets | [API](../../../api/components/TodayWidget.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `IDENTITY_PROVIDER` for the layout,
  `WORK_MANAGER_GATEWAY.dashboard` for the content, `LIVE_UPDATES`.
- `features/activity` — `ActivityFeed` inside the agent-activity widget.
- [contracts](../../contracts/overview.md) — `dashboard.ts` and `DashboardWidgetType`.

**Depended on by**

- [testing](../../testing/overview.md) — the web e2e journey ends on the dashboard.

## Invariants and lints

- **One read per load** — `dashboard-store.spec.ts`.
- **The registry list is pinned** — `widgets/registry.spec.ts`.
- **Config is read only inside the widget that owns it** — through `queryFrom`.
- **Every widget has an empty state**, verified in the browser against `empty`.
- **Overdue rows print the date, not the time** — a defect only the browser showed,
  now a test.

## Commands

```bash
pnpm --filter web test -- dashboard
pnpm prototype:seed overdue-chaos && pnpm dev:host   # then move the date in the panel and watch /app re-derive
```

## Changing it

- **A new widget:** a folder under `widgets/`, a component implementing
  `DashboardWidgetComponent`, one registry line with `queryFrom` if it needs a query,
  and the registry spec's expectation. Widget types 8–9 of §24 already exist in the
  contract.
- **New content:** `DashboardService` and the `dashboard.ts` contract first; the widget
  reads its slice.
- **The trap:** deriving anything from `new Date()` in a widget. The host's one clock
  reading is what keeps the digest and Today in agreement; format on the client, never
  compute.
