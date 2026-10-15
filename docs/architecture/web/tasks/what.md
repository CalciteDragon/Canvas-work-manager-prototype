# What the tasks feature is made of

## Structure

```mermaid
flowchart TB
  live["LIVE_UPDATES task.*"] --> store
  subgraph owners["Who provides the store"]
    tls["TaskListSection<br/>(projects/sections/tasks); committed Delete cue"]
    todos["TodosPage<br/>(own row + store; canonical writes)"]
    lab["Design Lab live panels<br/>(fixtures)"]
  end
  store["TaskListStore<br/>one container's rows; pendingMutations; loadGeneration; fieldRevisions"]
  row["TaskRow<br/>six variants; complete/reopen, select, Delete → archive"]
  drawer["TaskDetailDrawer<br/>title draft, priority, due date, estimate"]
  gw["TaskGateway<br/>list · get · create · update · complete · archive · restore"]
  tls --> store
  store --> gw
  tls --> row
  tls --> drawer
  lab --> row
  row -->|intent| store
  drawer -->|intent| store
```

## Optimistic completion toggles

```mermaid
sequenceDiagram
  participant R as TaskRow
  participant S as TaskListStore
  participant G as TaskGateway
  participant L as LIVE_UPDATES
  R->>S: complete(id) or reopen(id), reset native checkbox
  S->>S: claim field revisions, paint done or todo, clear reopen time, pendingMutations++
  S->>G: tasks.complete(id) or tasks.update(id, status todo)
  L-->>S: task.completed or task.updated frame (host flushed at commit)
  S->>S: deferred — a write is in flight
  G-->>S: { task, operation } (or GatewayError)
  alt success
    S->>S: reconcile current field claims and load generation, pendingMutations--, re-read
  else failure
    S->>S: revert current field claims and exact completion time, show error, pendingMutations--
  end
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `TaskRow` | `task-row.ts`, `.html`, `.scss`, `.stories.ts` | The Task List row and six §4 variants; the completion control is the shared `.checkbox` (still a native input) and Delete the quiet trash `.tool` (slice 72); Delete emits intent and shows the archive write pending state |
| `TaskDetailDrawer` | `task-detail-drawer.ts` | Side drawer editing |
| `TaskListStore` | `task-list-store.ts` | One container's rows; optimistic writes; quiet live re-reads |
