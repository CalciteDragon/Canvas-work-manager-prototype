# What the web app is made of

## Components

```mermaid
C4Component
  title web — components
  Container_Boundary(web, "web (Angular 22, :4200)") {
    Component(app, "App + app.config.ts", "composition root", "Provides the four adapters; mounts the dev panel globally")
    Component(core, "core/", "boundary and shell", "gateway, identity, live, config, shell, theme")
    Component(projects, "features/projects", "project workspace", "shell, navigation column, pages, canvas, sections, shortcuts")
    Component(dashboard, "features/dashboard", "/app", "widget registry over one read")
    Component(tasks, "features/tasks", "task UI", "TaskRow, drawer, per-section store")
    Component(activity, "features/activity", "feed", "ActivityFeed, ActivityStore")
    Component(settings, "features/settings", "agents", "permission grid, revoke")
    Component(proto, "prototype/", "tooling", "dev panel, state inspector, design lab, control port")
  }
  System_Ext(host, "prototype-host", "/api, /prototype, SSE")
  Rel(app, core, "provides adapters for")
  Rel(projects, core, "gateway, live, identity")
  Rel(dashboard, core, "gateway, identity, live")
  Rel(tasks, core, "gateway, live")
  Rel(projects, tasks, "Task List section")
  Rel(projects, activity, "Recent Activity section")
  Rel(dashboard, activity, "Recent Agent Activity widget")
  Rel(proto, core, "PrototypeSettings, ThemeService")
  Rel(core, host, "fetch + EventSource")
  Rel(proto, host, "PrototypeHttpControl → /prototype/*")
```

`core/` never depends on `prototype/`: the dev panel hangs off `App`, the view's
composition root, which is the one place a development surface may attach to a
production-shaped shell.

## The route map (§68)

| Route | Component | Notes |
|---|---|---|
| `/` | redirect → `/app` | `pathMatch: 'full'`, or it swallows every URL |
| `/app` | `DashboardPage` | |
| `/projects/:projectId/pages/:pageKind` | `ProjectWorkspaceShell` | Declared before the shorter route or it would never match |
| `/projects/:projectId` | `ProjectWorkspaceShell` | A root opens on Home; a subproject on its work canvas |
| `/calendar`, `/search` | placeholders | Slices 18 and 21 |
| `/settings`, `/settings/agents` | `SettingsPage`, `AgentConnectionsPage` | §53 |
| `/prototype/design` | `DesignLabPage` (lazy) | §67 |
| `/prototype/state` | `StateInspectorPage` (lazy) | §46, §68 |
| `**` | `NotFoundPage` | |

## Page → Store → Gateway (§19)

```mermaid
flowchart LR
  page["Page / section component"] -->|intent| store["Feature store (signals)<br/>provided at the owning component"]
  store -->|calls| gw["WorkManagerGateway<br/>(interface, injected by token)"]
  gw -.->|implemented by| adapter["PrototypeWorkManagerGateway<br/>fetch, URLs, GatewayError"]
  adapter --> host["host /api/*"]
  live["LiveUpdates (interface)"] -->|frame| store
  store -->|signals| page
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `App`, `appConfig`, `routes` | `src/app/app.ts`, `app.config.ts`, `app.routes.ts` | Bootstrap, adapters, route map |
| Core | `src/app/core/` | [core](core/overview.md) |
| Projects | `src/app/features/projects/` | [projects](projects/overview.md) |
| Dashboard | `src/app/features/dashboard/` | [dashboard](dashboard/overview.md) |
| Tasks | `src/app/features/tasks/` | [tasks](tasks/overview.md) |
| Prototype tooling | `src/app/prototype/` | [prototype-tooling](prototype-tooling/overview.md) |
| Activity | `src/app/features/activity/` | `ActivityFeed`, `ActivityStore` |
| Settings | `src/app/features/settings/` | `SettingsPage`; `agents/AgentConnectionsPage`, `AgentConnectionsStore` |
| Placeholders | `src/app/features/calendar/`, `features/search/`, `shared/components/placeholder-page/` | `CalendarPage`, `SearchPage`, `PlaceholderPage`, `NotFoundPage` |
| Tokens and base styles | `src/styles/_tokens.scss`, `_base.scss` | §21's custom properties, both themes, the knob layer |
| Storybook | `.storybook/` | `@storybook/angular-vite`; stories beside components |
| Lints | `scripts/check-design-tokens.mjs`, `scripts/expect-failure.mjs` | The token lint and its self-test |
