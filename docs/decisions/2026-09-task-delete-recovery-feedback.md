# Task Delete names its existing recovery routes

**Question**

What should a Task List or root Todos say after Delete archives a task and removes its row?

**Options tested**

- *Inline Undo*: rejected because only the displayed project's header owns the history controls, and a later action may already be next.
- *Silence after removal*: rejected because the row disappears, sometimes leaving an empty list, without explaining that the task is recoverable.
- *Committed archive status with routes*: kept. The status names the task and points to root Archive and the owning project's header Undo when the step is available.

**What we learned**

The Task List already knows its owner, while Todos can show work from descendant projects. A Todos descendant therefore needs its owner's canonical history route and name; a root task can refer to the displayed header. Root Archive is durable recovery when the owner is ready. Opening a disabled Archive can itself record a newer page action, so the status cannot promise Delete is still the next Undo step.

**Current decision**

After a committed task Delete, show a polite status outside the row list: the named task was archived; root Archive can recover it when its owner is ready; the owning project's header Undo may reverse the latest step when available. Todos offers its existing guarded Archive callback and a descendant-owner `#history-controls` link. The Task List uses text guidance within its section. A new Delete, refusal, context change or fresh list showing the restored task clears old status. No second Undo action or receipt is held by the cue.

**Confidence**

Medium: focused component and browser checks cover commit timing, failed writes, final rows, owner navigation and narrow layouts. Sustained use can refine the wording.

**Revisit when**

People cannot find root Archive from a Task List, or read the header guidance as a guarantee that Delete remains the next step.
