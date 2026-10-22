# What the tasks feature is made of

## Structure

```mermaid
flowchart TB
  live["LIVE_UPDATES task.*"] --> store
  subgraph owners["Who provides the store"]
    tls["TaskListSection<br/>(projects/sections/tasks); committed Delete cue"]
    todos["TodosPage<br/>(own row + store; canonical writes)"]
    lab["Design Lab live panels<br/>(fixtures)"]
    shell["ProjectWorkspaceShell<br/>desktop width reservation"]
  end
  store["TaskListStore<br/>one container's rows; pendingMutations; loadGeneration; fieldRevisions"]
  row["TaskRow<br/>six variants; complete/reopen, select, Delete → archive"]
  drawer["TaskDetailDrawer<br/>desktop manual popover / phone modal / contained Lab"]
  coordinator["TaskDrawerCoordinator<br/>optional shell-scoped selection owner"]
  lifts["LiftFocus + LiftStack<br/>shared focus and lift ownership"]
  gw["TaskGateway<br/>list · get · create · update · complete · archive · restore"]
  tls --> store
  store --> gw
  tls --> row
  tls --> drawer
  shell --> coordinator
  tls --> coordinator
  tls --> lifts
  lab --> row
  lab --> drawer
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
    S->>S: revert current field claims and exact completion time, set rowErrors[id], pendingMutations--
  end
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `TaskRow` | `task-row.ts`, `.html`, `.scss`, `.stories.ts` | The Task List row and six §4 variants; the completion control is the shared `.checkbox` (still a native input) and Delete the quiet trash `.tool` (slice 72); Delete emits intent and shows the archive write pending state |
| `PendingTaskRow` | `pending-task-row.ts`, `.stories.ts` | The "Adding…" row, `aria-busy`, no controls, sharing `task-row.scss` |
| `TaskDetailDrawer` | `task-detail-drawer.ts`, `.html`, `.scss` | Native side lift or modal sheet editing, with contained Lab mode, dirty-title Escape protection, the autosave line and per-field save status |
| Write state | `task-write-state.ts`, `task-overdue.ts` | `PendingTaskCreate`, `TaskCreateOutcome`, `TaskFieldSaves`; the shared overdue rule |
| `TaskListStore` | `task-list-store.ts` | One container's rows; optimistic writes; quiet live re-reads; create preserves selection and refresh clears vanished selections |
| `TaskDrawerCoordinator` | `task-drawer-coordinator.ts` | Shell-scoped optional selection ownership and drawer-open signal; stale releases cannot clear a newer owner |
| `LiftFocus`, `LiftStack` | `shared/lifts/` | Shared opener restoration and one-open-lift registration, used by the projects Task List section |


TaskRow renders the global object-row primitive; task-meta.ts formats ordered fragments independently of stores. object-row.stories.ts and the Lab expose primitive variants before page adoption.
