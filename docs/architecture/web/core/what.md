# What core is made of

## Structure

```mermaid
flowchart LR
  subgraph ports["Interfaces (what the app depends on)"]
    id["IdentityProvider<br/>IDENTITY_PROVIDER"]
    lu["LiveUpdates<br/>LIVE_UPDATES (inert default)"]
    gw["WorkManagerGateway + 15 sub-interfaces<br/>WORK_MANAGER_GATEWAY"]
    err["GatewayError"]
  end
  subgraph adapters["Prototype adapters (the only transport-aware files)"]
    pid["PrototypeIdentityProvider<br/>GET /api/me"]
    pgw["PrototypeWorkManagerGateway<br/>fetch, URLs, envelope → GatewayError, delay/failure injection"]
    cfg["PROTOTYPE_API_BASE_URL"]
    plu["PrototypeLiveUpdates<br/>EventSource, exponential reconnect"]
  end
  subgraph settings["Settings and theme"]
    th["ThemeService<br/>data-theme on html"]
    ps["PrototypeSettings<br/>flags, delay, failure — sessionStorage"]
  end
  subgraph shell["Shell"]
    as["AppShell"]
    ss["ShellStore<br/>project tree, createProject"]
    sb["Sidebar → ProjectTreeItem"]
    tb["TopBar"]
  end
  pgw -. implements .-> gw
  pid -. implements .-> id
  plu -. implements .-> lu
  pgw --> cfg
  pgw --> ps
  as --> ss --> gw
  ss --> lu
  as --> sb & tb
  th --> id
```

## Sub-interfaces of `WorkManagerGateway`

`tasks`, `projects`, `dashboard`, `progress`, `timeline`, `todos`, `archive`, `journal`,
`reflections`, `projectPages`, `sections`, `sectionShortcuts`, `agents`, `activity`, `history` — each
a small interface in `work-manager-gateway.ts`, each with a fake in `gateway/testing`.
A member exists only when an implementation and a caller exist.

The section gateway returns shared contracts rather than bare entities: create returns
`SectionAddResult`, update and move return `SectionWriteResult`, `history.summary` returns the
caller's `OperationHistorySummary`, and `history.transition` returns
`OperationHistoryTransitionResult`. The adapter validates those envelopes at the HTTP boundary, so
no component imports a transport type or reconstructs a receipt. The fake gateway keeps a one-history
stand-in that runs each write's Undo by action id; ordering and conflicts are the host's rules,
proved there.

## A store's three connections

```mermaid
sequenceDiagram
  participant P as Page component
  participant S as Feature store
  participant G as WORK_MANAGER_GATEWAY
  participant L as LIVE_UPDATES
  P->>S: provided at the page, load()
  S->>G: tasks.list(query)
  G-->>S: Task[] or GatewayError
  S->>L: subscribe(listener)
  L-->>S: frame { type, projectId, rootProjectId }
  S->>S: route, if pendingWrites > 0 defer, else quiet re-read
  S->>G: tasks.list(query)
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `WorkManagerGateway`, sub-interfaces, `WORK_MANAGER_GATEWAY` | `core/gateway/work-manager-gateway.ts` | §9's shape as the app sees it |
| `GatewayError` | `core/gateway/gateway-error.ts` | The one failure type; `details` preserved |
| `PrototypeWorkManagerGateway` | `core/gateway/prototype-work-manager-gateway.ts` | §10's adapter |
| Fakes | `core/gateway/testing/`, `core/live/testing/` | What every component and store spec injects |
| `IdentityProvider`, `IDENTITY_PROVIDER`, `PrototypeIdentityProvider` | `core/identity/` | §18 |
| `LiveUpdates`, `LIVE_UPDATES`, `PrototypeLiveUpdates` | `core/live/` | §62 client side |
| `PROTOTYPE_API_BASE_URL` | `core/config/prototype-config.ts` | Where the host is |
| `PrototypeSettings`, `PrototypeFlags`, `StoredSettings` | `core/config/prototype-settings.ts` | §47 flags; delay; failure rate |
| `ThemeService` | `core/theme/theme-service.ts` | §22 |
| `AppShell`, `ShellStore`, `ProjectTreeNode` | `core/shell/` | §23 layout and the project tree |
| `Sidebar`, `ProjectTreeItem`, `TopBar` | `core/shell/sidebar/`, `core/shell/top-bar/` | Presentational |
