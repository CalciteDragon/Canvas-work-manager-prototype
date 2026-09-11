# What the host is made of

## Components

```mermaid
C4Component
  title prototype-host — components
  Container_Boundary(host, "prototype-host (127.0.0.1:4310)") {
    Component(main, "main.ts", "entry", "Port, data file, clock, AI provider, services, registry, server")
    Component(router, "router.ts", "route table", "'METHOD /path' → handler; raw routes for MCP and SSE")
    Component(api, "api/", "REST", "context, services, routes, errors, real-ai-provider")
    Component(mcp, "mcp/", "MCP", "handler, server, stdio; auth/ authenticator")
    Component(events, "events/", "SSE", "LiveEventHub, event stream handler")
    Component(proto, "prototype/", "rig", "runtime, routes, notes, switchable AI provider")
    Component(persist, "persistence/store.ts", "file", "loadPersistence, CWM_DATA_FILE")
  }
  System_Ext(web, "web app", "gateway, identity, live updates, dev panel")
  System_Ext(agent, "MCP client")
  ContainerDb(data, ".prototype/data.json")
  Rel(main, router, "starts with")
  Rel(router, api, "/api/*")
  Rel(router, mcp, "/mcp")
  Rel(router, events, "/prototype/events")
  Rel(router, proto, "/prototype/*")
  Rel(api, persist, "unit of work")
  Rel(persist, data, "load, atomic write")
  Rel(web, api, "JSON over HTTP")
  Rel(web, events, "EventSource")
  Rel(web, proto, "rig commands")
  Rel(agent, mcp, "Streamable HTTP")
```

`main.ts` is the composition root; everything else is a module with one job and a test
beside it. The four `Rel`s from `router` are the three route families plus the stream.

## Startup

```mermaid
sequenceDiagram
  participant M as main.ts
  participant P as loadPersistence
  participant A as createApi
  participant R as createToolRegistry
  participant S as start
  M->>M: configuredPort() — CWM_HOST_PORT or throw
  M->>P: load and validate CWM_DATA_FILE
  P-->>M: Persistence (JsonDataStore)
  M->>M: new SimulatedClock, new SwitchableAIProvider(aiProviderFor(env))
  M->>M: new PrototypeRuntime({ persistence, clock, ai })
  M->>A: createApi(persistence, { clock, ai })
  A-->>M: HostServices (services + authenticator)
  M->>R: createToolRegistry(services)
  M->>S: start(port, { health, api, prototype routes }, { /mcp, /prototype/events })
  S-->>M: listening on 127.0.0.1
```

## Inventory

| Part | Path | Role |
|---|---|---|
| Entry | `main.ts` | `configuredPort`, `start`, `stop`, and the wiring above; runs only when invoked directly |
| Route table | `router.ts` | `RouteTable`, `RawRouteTable`, `createRequestHandler`, `healthRoutes`; CORS |
| REST | `api/` | [api](api/overview.md) |
| MCP | `mcp/`, `auth/` | [mcp-transport](mcp-transport/overview.md) |
| Events | `events/` | [live-updates](live-updates/overview.md) |
| Rig | `prototype/` | [prototype-runtime](prototype-runtime/overview.md) |
| Persistence | `persistence/store.ts` | `loadPersistence`, the repo-anchored default path, `CWM_DATA_FILE` |
| Acceptance scripts | `scripts/acceptance.mjs`, `agent-acceptance.mjs`, `mcp-acceptance.mjs`, `live-acceptance.mjs` | Slices 5, 13, 15 and 16's *done when*, run against a second host on a temp file |
| Cross-cutting tests | `main.test.ts`, `router.test.ts`, `concurrency.test.ts`, `live-updates.test.ts` | Start/stop, routing, concurrent units of work, end-to-end frame delivery in-process |
