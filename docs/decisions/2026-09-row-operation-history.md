# Task and reflection writes record one reversible row action

**Question**

Slice 36 extends §31's per-actor operation history beyond sections. Which task and reflection
writes should become actions, what should one action contain, and how should Archive Restore
relate to history?

**Options tested**

- *Record only explicit edits*: rejected. Creation, completion, archive and restore are committed
  mutations too, and excluding them would make the same row inconsistently reversible.
- *Record an implicitly created container as a separate section action*: rejected. The caller made
  one row write and cannot usefully undo a container creation while keeping the row it owns.
- *Replay public service methods during Undo and Redo*: rejected. Those methods would re-check
  present-day creation rules, emit ordinary activity and record the inverse of the inverse.
- *Capture one typed footprint and execute it through history-only helpers*: adopted.

**What we learned**

Task changes are not all scalar. A move or reparent takes its subtree, and archive and restore
change exact cascade markers. Capturing only the subject row loses those effects; capturing every
row in the project sweeps in unrelated work. Reflection edits are scalar, but restoring a captured
subject link must treat it as historical identity rather than a new assignment. Browser and MCP
acceptance also showed that callers need the receipt in the write response; a later history read is
not available to a connection holding only the family's write grant.

**Current decision**

- Task create, update, completion, archive and restore record `task.add`, `task.update`,
  `task.archive` or `task.restore`. Reflection create, update, archive and restore record the
  corresponding reflection family. A normalized no-op returns `operation: null` and records
  nothing.
- Every transport-facing write returns `{ task, operation }` or `{ reflection, operation }`.
  Creation always has a receipt; the other writes may return `null` for a no-op.
- One action captures only the fields and structural rows the write changed. Task completion keeps
  `status` and `completedAt` together; subtree moves and archive cascades carry their exact rows.
- If creation had to add a task-list or reflections container, that container and its placement
  join the row action. Undo removes both only when safe; Redo restores the same ids and values.
- Archive Restore stays durable and receipt-free to invoke, but a successful **row** restore now
  records a new `task.restore` or `reflection.restore` action and clears the caller's redo branch.
  Section Restore remains outside history until Slice 34 Stage C.
- History executors use captured payloads directly and never call `TaskService` or
  `ReflectionService`. Row conflicts are repairable in this stage, so none add a new retirement
  case.

**Confidence**

Medium-high. The footprints and no-op behavior are covered through domain, HTTP, MCP and browser
tests; the editing cadence still needs sustained use before the action granularity is final.

**Revisit when**

Stage C exposes persistent browser controls, or real editing shows that one saved text change is
too fine or too coarse for one action.
