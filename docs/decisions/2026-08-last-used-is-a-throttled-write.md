# How §53's "Last used" is recorded

**Question**

§53's card shows `Last used: 4 minutes ago`, so something has to stamp a connection on every
authenticated call. In a prototype whose entire storage is one JSON file (§14), what does
that cost, and where does the stamp live?

**Options tested**

- *Stamp on every call, unthrottled.* Rejected once the cost was traced. A write runs inside
  a unit of work, which `structuredClone`s the whole document, validates it twice, and
  rewrites `.prototype/data.json` — all on a single serialized lock. That would make **every
  authenticated read** persist the file, and every agent mutation take two lock acquisitions
  and two file writes.
- *Keep last-used in host memory.* Rejected: it would vanish on restart and put a second
  source of truth beside the record the contract already has a field for.
- *Stamp on a throttle.* Adopted.

**What we learned**

§53 renders a relative label — minutes, hours, days. A minute of granularity is invisible
there, which makes the throttle free in product terms and large in cost terms.

Two details only appeared in review and testing:

- **The comparison has to be on distance, not elapsed time.** §46's Current Date control
  moves the simulated clock *backwards* as readily as forwards. Written as "more than 60
  seconds later", a backwards jump strands `lastUsedAt` in the future and suppresses every
  later touch — freezing §53's label for the rest of the session. It compares
  `Math.abs(now - previous)`, with a test for each direction.
- **A failed authentication is not a use.** Stamping before the revoked/unknown check would
  let anyone holding a revoked token keep its "Last used" ticking over, which is the opposite
  of what the field is for.

**Current decision**

- `AgentConnectionService.touch(connectionId)` writes only when `lastUsedAt` is absent or
  more than **60 seconds** away from the clock, in either direction.
- It takes a bare id, not an `ActorContext`. It is the one method on that service that is not
  user-actors-only, because the *authenticator* calls it — before there is an actor to speak
  of. It also re-reads the connection inside the unit, since the throttle check runs outside
  the lock.
- It records no activity event: a read is not a change to the workspace, and §57's feed would
  drown in them.
- The stamp comes from the injected `Clock` (§45), so moving the simulated date moves what
  gets recorded. The **UI reads it against real time**, because "is anything still using this
  connection?" is a question about the session you are sitting in.
- Consequence, worth stating: `.prototype/data.json` legitimately changes after a *denied*
  agent call. The acceptance script therefore asserts a task count, never file bytes.

**Confidence**

Medium-high. The throttle is right for this prototype's storage; the window is a guess that
happens to sit below §53's smallest unit.

**Revisit when**

Slice 15, when a real MCP client makes many calls in quick succession — that is the first
workload that will show whether one write a minute per connection is still invisible, or
whether the file churn is noticeable while a page is open.
