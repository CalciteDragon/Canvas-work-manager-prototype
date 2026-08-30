# Where a live event is emitted, and when it is delivered

**Question**

Slice 16's *Build* says "emission at domain operation boundaries, so web, MCP, and dev-panel
mutations all broadcast identically". Which boundary, exactly — and since a domain service
must not know about HTTP, what does the domain publish to?

**Options tested**

- *A `publish` call in each mutating service.* Rejected: five services, and every future one,
  each with its own chance to forget. It also invites the two announcements — §57's activity
  event and §62's frame — to drift apart about what happened.
- *Wrap the transports instead: broadcast from the HTTP route table and the MCP handler.*
  Rejected. It is two implementations of one rule, and it puts the decision "was this a
  change?" in the layer least able to answer it: an idempotent `complete_task` on an
  already-done task returns 200 and changed nothing.
- *One call inside `ActivityService.record`.* Adopted.

**What we learned**

`record` is already the choke point. Every mutating service calls it exactly where the
mutation succeeded, inside that mutation's unit of work, and the entry it is handed already
carries `entityType`, `entityId` and `projectId` — which is §62's frame almost verbatim. One
call site, and the stream cannot disagree with the feed.

It is **at most one** event per operation, not exactly one, and the gap is worth naming
rather than discovering:

- A no-op write records nothing (`TaskService.commit`, `SectionService.commit`,
  `ProjectService`), as do the idempotent early returns in `complete` and `archive`. This is
  the behaviour we want — nothing changed, so no tab should re-read.
- `AgentConnectionService.touch` stamps §53's "Last used" on **every** authenticated agent
  call and deliberately records no activity event, because §57's feed would drown in them.
  So "Last used" does not live-update. That is a real cost of this choice, and it is why the
  agent connections page has no subscription.

The harder half was *when*, not *where*. `record` runs inside an open unit of work, and
`runUnitOfWork` only makes the new document visible to other readers once it commits. A frame
broadcast from inside it would reach a browser that refetches immediately, reads the **old**
value, and — having already refreshed — never asks again. That failure is invisible in a unit
test and, in a browser, looks exactly like "live updates do not work".

So the host's `LiveEventHub` buffers publications in an `AsyncLocalStorage` for the life of
the unit and flushes after `run` resolves. A unit that rejects — including one whose
commit-time `validateDocumentIntegrity` fails, *after* the publish was buffered — drops its
buffer. The acceptance script asserts the ordering directly: on receiving the frame it
re-reads the task and requires `status: "done"`.

One subtlety cost a review round. The nesting rule has to be "**a buffer already exists in
the ALS**", not "a unit is already open": `unitOfWorkFor` joins a nested call by returning
`fn()` without opening a unit at all, so a wrapper that mirrored `openUnitStores` would start
a fresh buffer for the inner call and flush it before the outer commit — reintroducing the
exact bug the deferral exists to prevent.

**Current decision**

- `packages/domain/src/live-events.ts` declares `LiveEventPublisher`, a port in the same
  spirit as `Clock`: synchronous, fire-and-forget, no transport. A domain service must never
  wait on — or fail because of — a browser that happens to be listening, least of all while
  holding the write lock.
- The port carries `LivePublication { workspaceId, event }`. The workspace rides *beside* the
  frame because it is routing information the browser must not receive: the host filters the
  stream by persona, and `LiveEvent` is only what goes on the wire.
- `ActivityService.dependencies.events` is **optional**. The domain never requires a stream,
  and every construction site that predates this slice still compiles.
- `createApi` builds the hub-wrapped unit of work *locally* and hands it to the services.
  `Persistence.unitOfWork` is untouched, so `PrototypeRuntime`'s seed swap stays out of the
  hub and announces itself from the route table instead.
- Host-state changes (seed, reset, clock, AI provider) broadcast
  `{ type: 'prototype.reloaded', entityId: <knob> }` from `createPrototypeRoutes`, one per
  successful request. Emitting from `PrototypeRuntime` would fire three times for one
  `reset()`, which calls `loadSeed` and `setAIProvider` internally.

**Confidence**

High on the emission point: it is one line in the one place every mutation already reaches,
and `live-updates.test.ts` proves the REST and MCP paths produce the identical frame.

Medium on the coupling. §57's feed and §62's stream are two features now joined at the hip:
a future mutation that should refresh a browser but should *not* appear in the feed has
nowhere to go. Nothing wants that today, and `touch` — the one write already in that position
— is a read stamp nobody watches.

**Revisit when**

Something needs a live frame without a feed line, or the reverse. `touch` becoming visible in
§53's UI would be the first sign; so would an event volume high enough that "one frame per
feed line" is too chatty for a busy agent, at which point the hub — not the domain — is where
coalescing belongs.
