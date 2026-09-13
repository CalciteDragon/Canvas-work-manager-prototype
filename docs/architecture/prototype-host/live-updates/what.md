# What live updates are made of

## Structure

```mermaid
flowchart LR
  svc["Domain service<br/>inside a unit of work"] --> rec["ActivityService.record"]
  rec --> pub["LivePublication<br/>{ workspaceId, event }"]
  pub --> hub["LiveEventHub<br/>implements LiveEventPublisher"]
  hub -- "held until commit" --> store["DataStore commit"]
  store -- "release" --> hub
  hub --> sub1["subscriber user=demo"]
  hub --> sub2["subscriber user=alex"]
  hub --> sub3["subscriber (all)"]
  sse["createEventStreamHandler<br/>GET /prototype/events?user="] --> hub
  sub1 --> es["EventSource in the browser"]
```

## One frame, from write to re-read

```mermaid
sequenceDiagram
  participant T as Tool / route
  participant S as TaskService
  participant A as ActivityService
  participant H as LiveEventHub
  participant D as DataStore
  participant B as Browser (PrototypeLiveUpdates)
  T->>S: complete(actor, id)
  S->>A: record('task.completed', …)
  A->>H: publish({ workspaceId, event })
  H->>H: hold with the open unit
  S-->>D: unit returns
  D->>D: validate, write temp, rename
  D->>H: release held frames
  H-->>B: data: {"type":"task.completed","entityId":"…","projectId":"…","rootProjectId":"…"}
  B->>B: route on type + projectId, stores re-read quietly
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `LiveEventHub` | `events/hub.ts` | Subscriptions by persona (`undefined` = everything), holding and release, `prototype.reloaded` |
| `createEventStreamHandler`, `EventStreamOptions` | `events/sse.ts` | The raw route: headers, `retry` hint, framing, teardown on close |
| `LiveEventPublisher`, `LivePublication` | `packages/domain/src/live-events.ts` | The port and the addressed frame (domain side) |
| `LiveEventSchema` | `packages/contracts/src/live.ts` | The wire shape |
| In-process end-to-end | `live-updates.test.ts` (host root) | A committed write produces exactly one frame, after the write is readable |
| Acceptance | `scripts/live-acceptance.mjs` | Real MCP client → real stream, timed |
