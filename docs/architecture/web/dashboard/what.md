# What the dashboard is made of

## Structure

```mermaid
flowchart LR
  id["IdentityProvider<br/>UserPreferences.dashboardWidgets"] -->|layout| store["DashboardStore"]
  reg["DASHBOARD_WIDGET_REGISTRY<br/>type → component, queryFrom"] --> store
  store -->|merged query| gw["DashboardGateway.load"]
  gw --> host["GET /api/dashboard<br/>(DashboardService, one clock reading)"]
  store --> page["DashboardPage"]
  page --> frame["DashboardWidgetFrame<br/>small · medium · wide · full"]
  frame --> w1["TodayWidget"]
  frame --> w2["UpcomingWidget"]
  frame --> w3["ActiveProjectsWidget"]
  frame --> w4["RecentProgressWidget"]
  frame --> w5["DailyDigestWidget"]
  frame --> w6["FunFactWidget"]
  frame --> w7["RecentAgentActivityWidget → ActivityFeed"]
  live["LIVE_UPDATES"] -->|frame| store
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `DashboardPage` | `dashboard-page.ts` | Renders each visible widget in its size; honest note for an unregistered type |
| `DashboardStore` | `dashboard-store.ts` | Joins layout and content; re-reads on frames |
| `DASHBOARD_WIDGET_REGISTRY`, `DashboardWidgetDefinition`, `DashboardWidgetComponent`, `DashboardWidgetInputs` | `widgets/registry.ts`, `widgets/widget-contract.ts` | The list and the contract every widget implements |
| `DashboardWidgetFrame` | `widgets/widget-frame/` | The common chrome and size classes |
| Seven widgets | `widgets/{today,upcoming,active-projects,recent-progress,daily-digest,fun-fact,recent-agent-activity}/` | One folder each; shared `widget-content.scss` |
