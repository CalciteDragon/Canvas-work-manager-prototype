# Why the prototype runtime exists

## The problem it solves

§46 wants every prototype variable adjustable at runtime: switch persona, load
`overdue-chaos`, set the date to next Friday, dial latency to three seconds — without
restarting anything. Some of those variables live in the browser; the ones that change
what the host *computes* — the document, the clock, the AI provider — have to be changed
in the host, in the very instances the services hold. §79 adds the friction notes that
are the point of using the prototype at all.

## Forces

- **No restart.** A restart drops the browser's stream and the session's state; the
  demonstration is that the dashboard re-derives when the date moves.
- **The domain must not know.** `SimulatedClock` is a `Clock`; `SwitchableAIProvider` is
  an `AIProvider`. The services see the interfaces they were given.
- **Reseeding races writes.** A document swap that lands under an in-flight unit of work
  corrupts it.
- **Notes must be honest about time.** A note written while the clock sits on 2026-08-18
  must carry the real date it was written, or the log becomes unreadable as history.

## The shape, and the alternatives rejected

**One runtime object holding the same instances.** `main.ts` builds the clock and the
provider, hands them to `createApi` *and* to `PrototypeRuntime`; a route that changes
one changes what the services see. Rejected: re-creating the services on each change —
the browser's stream and every in-flight request would be talking to a dead graph.

**The document swap goes through the lock.** `DataStore.replaceActiveDocument` runs
*inside* `runUnitOfWork`. The first design asserted "no unit open" and was unsound:
`unitOfWorkFor` queues units that have not yet registered a token, so the swap would
have landed under a pending write. A residual window is documented — `actorFor`
snapshots outside the lock, so a write racing your own reseed 404s rather than
persisting across seeds.

**Latency and failure are not host endpoints.** §63's optimistic revert is a client
behaviour; the injection sits in the browser's gateway where it can be observed, and a
host-side copy would be a second source of truth
([decision](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)).

**`/prototype/*` beside `/prototype/health`, not under `/api`.** None of it is
application data: it changes the rig, not the workspace.

**Host-state changes reload the tab.** A seed swap, clock move or provider switch changes
every derived read on every page at once; one reload is cheaper and more legible than a
fan-out of refreshes, and other tabs get `prototype.reloaded`
([decision](../../../decisions/2026-08-development-panel-surface.md)).

**Notes are stamped with real time, never the simulated clock**, and carry the slice
they were written in (`CURRENT_SLICE` in the panel's store), so the log reads as a
history rather than a pile.

**The Agent Connection control is a read-only roster.** A second permission grid would
break "no control exists twice"; the roster shows tokens to copy and points at Settings
([decision](../../../decisions/2026-08-agent-connection-panel-control-is-a-roster.md)).

## Consequences

- Moving the date backwards on `overdue-chaos` turns five overdue tasks into one
  due-today and three upcoming, with the digest and the clock-keyed Fun Fact re-derived —
  the demonstration Slice 12 recorded.
- The AI provider can go mock → real (500) → mock without a restart, which is how §44's
  "never required" is verified.
- Reseeding a running host is safe with respect to queued writes, and unsafe only in the
  documented window.
- The routes have no auth. That is correct for a localhost rig and wrong for anything
  else; nothing here should ever be reachable off-machine.

## Decisions that shape this system

- [The development panel is an overlay and a route, sharing one control set](../../../decisions/2026-08-development-panel-surface.md)
- [Latency and failure injection live in the client, not the host](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)
- [What §46's Agent Connection control is](../../../decisions/2026-08-agent-connection-panel-control-is-a-roster.md)
- [What counts as AI in the prototype](../../../decisions/2026-08-prototype-ai-scope-and-fun-fact.md) — what the provider switch does and does not change

## Spec sections

§44 optional real AI · §45 time abstraction · §46 development panel · §76 prototype reset
· §79 feedback notes.
