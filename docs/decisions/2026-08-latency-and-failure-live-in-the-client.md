# Latency and failure injection live in the client, not the host

**Question**

`development.md`'s Slice 12 build list asks for "Host endpoints backing it: load seed,
reset, set simulated date, **set latency, set failure rate**". §46 lists Network Delay and
Failure Rate among the panel's controls, and §63 says "the development panel's failure
injection should test these flows" — meaning the optimistic paint-then-revert. Where does
the injection actually go?

**Options tested**

- *Host endpoints, as the slice text says*: rejected. What failure injection exists to
  exercise is the **revert** in an Angular store — paint, fail, roll back, show the error.
  A host returning a genuine 500 tests the host's error envelope instead, and it cannot
  produce the one case §63 cares most about, an unreachable host. A latency number on the
  host would also be a second source of truth the client has to mirror, and the panel would
  have to survive a 3 s delay in order to change the 3 s delay.
- *Both — host stores the value, client applies it*: rejected as the worst of the two. Two
  copies of one number, a round trip to change a client behaviour, and nothing on the host
  reading the value it stores.
- *Client-owned, in the prototype gateway*: chosen. `PrototypeSettings` holds the delay and
  the rate; `PrototypeWorkManagerGateway.request()` waits and then throws.

**What we learned**

Measured in the running app, on `overdue-chaos` with the delay at 3 s: the task row painted
complete **immediately** while the `POST /api/tasks/:id/complete` request did not start
until **3014 ms** after the click. At 100 % failure the same click painted complete and then
reverted, and `.prototype/data.json` showed the task still `blocked` with no `completedAt`.
That is §63's whole loop, visible without a debugger.

Two things only came out of using it:

**The panel must not be behind its own injection.** At 100 % everything on the
work-manager gateway fails, including the project page's own load. If the panel's controls
went through the same gateway you could not turn the failures back off. `PrototypeControl`
is a separate port for exactly this reason, and it was verified reachable while the gateway
was failing every call. The one exception is **Layout Mode**, which writes
`projectLayoutMode` — a domain field — through the work-manager gateway, and is therefore
subject to injection like any other write. The panel says so on the control rather than
pretending otherwise.

**100 % is coarser than it looks.** With every call failing, the project page cannot load,
so the revert is unobservable unless you load the page first and raise the rate afterwards.
A "fail writes only" mode would make §63 directly testable; recorded as a note rather than
built.

**The identity provider is deliberately exempt.** `PrototypeIdentityProvider` does its own
`fetch` to `/api/me`, outside the injection. At 100 % an injected identity call would strand
the shell in an error with no route back — every store and the panel itself depend on the
identity resolving. The cost is real and worth naming: the app's *first* load is the one
loading state §46 most wants to evaluate, and it is currently never delayed.

**Current decision**

**Host owns** seed, simulated date, AI provider and note capture — the things with no
client-side existence. **Client owns** network delay, failure rate, feature flags and theme.
`development.md`'s Slice 12 *Build* bullet was edited in the same change to say so, rather
than left standing as a superseded instruction.

**Confidence**

High that the injection belongs in the gateway — the measurement above is exactly what §63
asks for and a host could not have produced it. Medium on the exemptions: the identity
provider's is a real hole, and the coarseness of a single rate is the first thing that got
in the way.

**Revisit when**

Slice 16 adds live updates and Slice 13+ puts MCP traffic through the host. Neither is
gateway traffic, so if either wants to be slowed or failed, the host-side knob this entry
rejects comes back — for *those* callers, not for this one. Also revisit if evaluating the
cold-start loading state matters enough to route the identity provider through `delay()`
while leaving `shouldFail()` off it.
