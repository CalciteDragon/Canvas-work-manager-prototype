# What the tasks feature is made of

## Structure

```mermaid
flowchart TB
  live["LIVE_UPDATES task.*"] --> store
  subgraph owners["Who provides the store"]
    tls["TaskListSection<br/>(projects/sections/tasks)"]
    todos["TodosPage<br/>(own store; canonical completes)"]
    lab["Design Lab live panels<br/>(fixtures)"]
  end
  store["TaskListStore<br/>one container's rows; optimistic writes; pendingWrites; write epoch"]
  row["TaskRow<br/>six variants; complete, rename, archive"]
  drawer["TaskDetailDrawer<br/>status, priority, due date"]
  gw["TaskGateway<br/>list · get · create · update · complete · archive · restore"]
  tls --> store
  store --> gw
  tls --> row
  tls --> drawer
  todos --> row
  lab --> row
  row -->|intent| store
  drawer -->|intent| store
```

## Optimistic completion

```mermaid
sequenceDiagram
  participant R as TaskRow
  participant S as TaskListStore
  participant G as TaskGateway
  participant L as LIVE_UPDATES
  R->>S: complete(id)
  S->>S: paint done, pendingWrites++, epoch++
  S->>G: tasks.complete(id)
  L-->>S: task.completed frame (host flushed at commit)
  S->>S: deferred — a write is in flight
  G-->>S: Task (or GatewayError)
  alt success
    S->>S: settle, pendingWrites--, re-read
  else failure
    S->>S: revert to prior status, show error, pendingWrites--
  end
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `TaskRow` | `task-row.ts`, `.html`, `.scss`, `.stories.ts` | The row and its six §4 variants; `pending` and `archiving` are separate |
| `TaskDetailDrawer` | `task-detail-drawer.ts` | Side drawer editing |
| `TaskListStore` | `task-list-store.ts` | One container's rows; optimistic writes; quiet live re-reads |
