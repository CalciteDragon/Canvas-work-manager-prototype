# What the dashboard is made of

## Structure

```mermaid
flowchart LR
  id["IdentityProvider<br/>UserPreferences.dashboardWidgets"] -->|layout| store["DashboardStore"]
  reg["DASHBOARD_WIDGET_REGISTRY<br/>type → component, queryFrom"] --> store
  live["LIVE_UPDATES"] -->|frame| store
  store --> page["DashboardPage"]
  page --> frame["DashboardWidgetFrame<br/>small · medium · wide · full"]
  subgraph widgets["One component per registered type"]
    w1["TodayWidget"]
    w2["UpcomingWidget"]
    w3["ActiveProjectsWidget"]
    w4["RecentProgressWidget"]
    w5["DailyDigestWidget"]
    w6["FunFactWidget"]
    w7["RecentAgentActivityWidget → ActivityFeed"]
  end
  frame --> w1
  frame --> w2
  frame --> w3
  frame --> w4
  frame --> w5
  frame --> w6
  frame --> w7
  subgraph read["One read per load"]
    gw["DashboardGateway.load"] --> host["GET /api/dashboard<br/>(DashboardService, one clock reading)"]
  end
  store -->|merged query| gw
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `DashboardPage` | `dashboard-page.ts` | Renders each visible widget in its size; honest note for an unregistered type |
| `DashboardStore` | `dashboard-store.ts` | Joins layout and content; re-reads on frames |
| `DASHBOARD_WIDGET_REGISTRY`, `DashboardWidgetDefinition`, `DashboardWidgetComponent`, `DashboardWidgetInputs` | `widgets/registry.ts`, `widgets/widget-contract.ts` | The list and the contract every widget implements |
| `DashboardWidgetFrame` | `widgets/widget-frame/` | The common chrome and size classes |
| Seven widgets | `widgets/{today,upcoming,active-projects,recent-progress,daily-digest,fun-fact,recent-agent-activity}/` | One folder each; shared `widget-content.scss` |
