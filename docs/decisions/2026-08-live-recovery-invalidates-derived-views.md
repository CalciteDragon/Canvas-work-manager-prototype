# How live reconnects recover derived project views

**Question**

When the browser's disposable SSE connection opens or reconnects, how should it recover
mutations that may have happened before the stream was ready, and how broadly should a
project event invalidate derived sections?

**Options tested**

- *Replay missed events with ids or a cursor.* Rejected: it adds durable stream state and
  recovery infrastructure that §62 and §71 explicitly avoid for the prototype.
- *Refresh every open section for every project event.* Rejected: it is correct but makes an
  unrelated child-project write re-read Activity, Reflections and Progress.
- *Re-read visible state on every successful connection, using separate current-project-data
  and workspace-project-hierarchy invalidations.* Adopted.

**What we learned**

An `EventSource` can open after the initial page reads, or reconnect after frames were missed.
Treating only mutation frames as refresh triggers therefore leaves a startup and reconnect
gap. The browser does not need to know which frames it missed: the API reads are canonical,
cheap at prototype scale, and already required after each relevant frame.

Project hierarchy is a different dependency from the current project's data. A
`project.created` frame names the child, so a parent page cannot route it by matching the
open project's id. Sub-projects and Timeline depend on workspace hierarchy; Activity,
Reflections and Progress depend on the open project's data. Keeping those invalidations
separate makes the child case correct without refreshing every section.

The recovery read must also serialize behind any read already in flight. Otherwise a failed
quiet recovery can invalidate or overwrite a successful initial load, and reconnect bursts
can issue overlapping reads whose completion order determines the screen.

**Current decision**

- `LiveUpdates.subscribe` may receive a connection-established callback. It fires on the
  first `open` and on browser-managed reconnects, but it is not a `LiveEvent` or an activity
  record.
- Subscribers recover by quietly re-reading their visible canonical state. They do not
  replay frames and do not expose connection status in the UI.
- `ProjectPageStore` owns two revision counters: current-project data and workspace project
  hierarchy. Sections observe only the counter their derived read depends on; Timeline
  observes both.
- Loud and quiet reads are single-flight per view context. One trailing request is
  coalesced while a read is active, and a failed quiet read preserves rendered data.
- `prototype.reloaded` remains a full loud page load because the host document, clock, and
  provider may all have been replaced; it is not an ordinary mutation recovery.

**Confidence**

High for prototype scale. Unit tests cover startup, reconnect, project-switch, failure, and
coalescing races, while the real-browser exercise verifies recovery without a second
mutation.

**Revisit when**

API re-reads become materially expensive, the host becomes multi-process, missed writes
must be recovered without a full read, or project hierarchy traffic is large enough to need
ancestor ids on the wire.
