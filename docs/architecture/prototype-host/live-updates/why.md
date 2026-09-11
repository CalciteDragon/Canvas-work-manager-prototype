# Why live updates exist

## The problem it solves

The prototype's headline demonstration is an agent completing a task and the open project
page ticking it off within a second, with the feed naming the agent (§62, Slice 16's
*done when*). Without a push channel the browser would poll or the person would refresh,
and neither answers the question §48 asks — what it feels like to share a workspace with
an agent.

## Forces

- **Every mutation path must broadcast identically** — UI, MCP, dev panel — or the
  demonstration only works for the path someone remembered.
- **A frame must never arrive before its write is readable.** A browser that re-reads
  on a frame and gets the old value looks exactly like "live updates do not work".
- **Persona isolation.** A tab must never receive another workspace's ids.
- **No sync infrastructure** (§62). One-way announcements only; the browser re-reads.

## The shape, and the alternatives rejected

**Emission rides the activity record.** `ActivityService.record` is the one place every
state change already passes through, so the frame is created there and the hub is the
domain's `LiveEventPublisher` port. Consequence: *at most* one frame per operation — a
no-op write records nothing and announces nothing, and `AgentConnectionService.touch`
announces nothing at all, which is why "Last used" does not live-update
([decision](../../../decisions/2026-08-live-events-ride-the-activity-record.md)).
Rejected: emitting from routes and tools — two places to forget.

**Frames are held until commit.** The store releases a unit's frames after the atomic
write, so the announced value is already on disk. `live-acceptance.mjs` insists on
exactly this: the frame arrives within a second *and* the write is readable when it
does. A hub that broadcast from inside the unit would pass the first and fail the second.

**Server-Sent Events over the existing HTTP server.** Rejected: WebSockets — bidirectional
for a channel that only announces, and a second protocol to secure on localhost. The
browser's `EventSource` reconnects on its own; the host sends a `retry` hint once.

**Workspace beside the frame, not inside it.** `LivePublication` carries the workspace
for routing; `LiveEvent` on the wire does not, so a persona-scoped stream never leaks
another workspace's ids. `rootProjectId` was added in 25.2 because a root's Todos and
Archive project rows from anywhere beneath it, and `projectId` alone cannot say which root
a deep change concerns.

**Host-state changes reload the tab that made them, and announce `prototype.reloaded` to
the rest.** A seed swap, clock move or provider switch changes what every derived read
means at once; one loud reload is cheaper and clearer than a fan-out of quiet refreshes
([decision](../../../decisions/2026-08-development-panel-surface.md)).

**HTTP only.** A stdio child owns its own store and cannot reach the running host's hub;
the fix would be the sync infrastructure §62 forbids
([decision](../../../decisions/2026-08-live-updates-are-http-only.md)).

## Consequences

- An agent's `complete_task` over HTTP reaches an open page in tens of milliseconds
  with the write readable; Progress, Timeline, Reflections, Sub-projects and the sidebar
  all follow because the browser re-reads derived views on a frame.
- Reads triggered by frames must be *quiet* on the browser side (no skeletons, no error
  flash), which shaped the [web / core](../../web/core/why.md) design.
- The stream is only as scoped as the persona query; a `curl` without `?user=` sees
  everything, on purpose, for debugging.

## Decisions that shape this system

- [Where a live event is emitted, and when it is delivered](../../../decisions/2026-08-live-events-ride-the-activity-record.md)
- [Live updates reach the browser over HTTP, and not over stdio](../../../decisions/2026-08-live-updates-are-http-only.md)
- [How live reconnects recover derived project views](../../../decisions/2026-08-live-recovery-invalidates-derived-views.md)
- [The development panel is an overlay and a route, sharing one control set](../../../decisions/2026-08-development-panel-surface.md) — `prototype.reloaded`

## Spec sections

§62 live updates · §57 activity events (the record a frame announces) · §46 development
panel (the reload rule) · §6 why the host exists.
