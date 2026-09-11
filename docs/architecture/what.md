# What the prototype is made of

## Context

```mermaid
C4Context
  title Canvas Work Manager prototype — context
  Person(person, "Person", "Works in the browser as one of three personas")
  System_Ext(agent, "MCP client", "Claude, Cursor or a script acting through an agent connection")
  System(cwm, "Canvas Work Manager prototype", "Real product behaviour over fake infrastructure")
  Rel(person, cwm, "Uses", "http://localhost:4200")
  Rel(agent, cwm, "Calls tools", "Streamable HTTP /mcp, or stdio")
```

A person and an agent are both users. The agent authenticates with a fixture bearer token
that names an **agent connection** in the person's workspace; the connection's permissions
decide what the agent may do (§51–§53).

## Containers

```mermaid
C4Container
  title Canvas Work Manager prototype — containers
  Person(person, "Person")
  System_Ext(agent, "MCP client")
  Container_Boundary(proto, "Prototype") {
    Container(web, "web", "Angular 22, :4200", "Shell, dashboard, project workspaces, development tooling")
    Container(host, "prototype-host", "Node, 127.0.0.1:4310", "Fake API, MCP endpoint, event stream, rig controls")
    Container(stdio, "mcp:stdio", "Node child process", "The same tool registry over stdio, with its own store")
    ContainerDb(data, ".prototype/data.json", "JSON document, schema version 3", "The whole workspace")
  }
  Rel(person, web, "Uses")
  Rel(web, host, "JSON over HTTP; Server-Sent Events", "/api, /prototype")
  Rel(agent, host, "MCP", "/mcp")
  Rel(agent, stdio, "MCP", "stdin/stdout")
  Rel(host, data, "Loads once; writes atomically per unit of work")
  Rel(stdio, data, "Reloads per call; writes atomically")
```

The web app never touches the file. The host loads it once at start and writes it through
a temp-and-rename at the end of every unit of work (§15). A stdio process is a second
owner of the same file, which is why the two must not mutate concurrently
([guide](../guides/mcp-setup.md#important-file-store-limitation)).

## Packages and apps

```mermaid
flowchart TB
  subgraph packages["packages/ — shared, consumed as source"]
    contracts["@cwm/contracts<br/>schemas and types"]
    repositories["@cwm/repositories<br/>interfaces, unit of work, JSON store"]
    domain["@cwm/domain<br/>services, clock, actor, permissions"]
    mcp["@cwm/mcp-tools<br/>tool registry"]
    data["@cwm/prototype-data<br/>seeds, personas, tokens, converter"]
  end
  subgraph apps["apps/"]
    web["web<br/>Angular"]
    host["prototype-host<br/>Node"]
    e2e["e2e<br/>Playwright"]
  end
  repositories --> contracts
  domain --> contracts
  domain -. "interfaces only (lint-enforced)" .-> repositories
  mcp --> domain
  mcp --> contracts
  data --> contracts
  data --> repositories
  host --> domain
  host --> mcp
  host --> repositories
  host --> data
  host --> contracts
  web --> contracts
  web -- "HTTP + SSE" --> host
  e2e -- "starts and drives" --> web
  e2e -- "starts and drives" --> host
```

Arrows are `package.json` dependencies, resolved to source through `tsconfig.base.json`'s
path aliases — there is no build step between packages. The dotted edge is the one that
needs judgement: the domain imports repository **interfaces** and nothing else from
`@cwm/repositories`; `scripts/check-package-imports.mjs` enforces the allowlist.

## A write through every layer

```mermaid
sequenceDiagram
  participant B as Browser (TaskListStore)
  participant G as PrototypeWorkManagerGateway
  participant H as Host route
  participant S as TaskService
  participant U as Unit of work (DataStore)
  participant A as ActivityService
  participant E as LiveEventHub
  B->>B: paint optimistic completion
  B->>G: tasks.complete(id)
  G->>H: POST /api/tasks/:id/complete
  H->>S: complete(actor, id)
  S->>U: runUnitOfWork
  S->>A: record(task.completed)
  U-->>S: committed, persisted
  S-->>H: Task
  U->>E: publish held frame
  E-->>B: SSE task.completed (other tabs and sections re-read)
  H-->>G: 200 Task
  G-->>B: settle optimistic state
```

The same `TaskService.complete` is what an MCP `complete_task` call reaches, with an
`ActorContext` built from a bearer token instead of a persona header; the live frame is
identical.

## Inventory

| Part | Path | Role |
|---|---|---|
| `web` | `apps/web` | The Angular application — [web](web/overview.md) |
| `@cwm/prototype-host` | `apps/prototype-host` | The host process — [prototype-host](prototype-host/overview.md) |
| `@cwm/e2e` | `apps/e2e` | Playwright suite with its own servers — [testing](testing/overview.md) |
| `@cwm/contracts` | `packages/contracts` | [contracts](contracts/overview.md) |
| `@cwm/domain` | `packages/domain` | [domain](domain/overview.md) |
| `@cwm/repositories` | `packages/repositories` | [repositories](repositories/overview.md) |
| `@cwm/mcp-tools` | `packages/mcp-tools` | [mcp-tools](mcp-tools/overview.md) |
| `@cwm/prototype-data` | `packages/prototype-data` | [prototype-data](prototype-data/overview.md) |
| Seeds | `prototype/seeds/*.json` | Six committed snapshots, regenerated by the seed builders |
| Working files | `.prototype/` | `data.json` (git-ignored), `e2e-data.json`, `notes.json` (§79) |
| Scripts | `scripts/` | `dev.mjs` (prints the two commands), `check-package-imports.mjs`, `check-docs.mjs`, `roadmap.mjs` |
