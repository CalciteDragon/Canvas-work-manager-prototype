# Why the prototype tooling is shaped this way

## The problem it solves

§46 wants every prototype variable adjustable at runtime, §79 wants friction captured
where it is felt, and §67 wants a place to try design values against real components
without a rebuild. All three are development-only surfaces that must attach to a
production-shaped application without leaking into it (§8: `core/` must not depend on
`prototype/`).

## Forces

- **One implementation of every control**, or the overlay and the route drift.
- **The panel must survive the failure it injects.**
- **A host-state change invalidates every derived read at once**; a persona switch is
  a new session, not a data change.
- **Design knobs must move both themes**, and a knob's default must be theme-correct
  without a literal in TypeScript.
- **Chrome swallows Ctrl/Cmd+Shift+D** on some setups ("bookmark all tabs").

## The shape, and the alternatives rejected

**An overlay and a route sharing `DevPanelControls`.** The route exists because the
chord is not always available and because the layout list needs room the overlay lacks
([decision](../../../decisions/2026-08-development-panel-surface.md)).

**A separate control port.** `PrototypeControlPort` behind `PROTOTYPE_CONTROL`, not a
member of `WorkManagerGateway`: none of it is application data, and keeping it apart is
what lets the panel turn a 100 % failure rate back off. It is an interface for the same
reason the gateway is — a panel injecting a `fetch`-holding class would be a component
depending on HTTP.

**Delay, failure and flags are client-side; seed, clock and provider are host-side.**
§63's revert is observable only in the client
([decision](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)).
The client-side settings live in `sessionStorage` so the panel's own reload cannot wipe
them; the theme is deliberately excluded so that a persona switch still repaints from
the persona's preference ([decision](../../../decisions/2026-08-theme-selection-is-session-only.md)).

**Host-state changes reload the tab that pressed the button.** Cheaper and clearer than
a fan-out of quiet refreshes when everything derived changed; other tabs get
`prototype.reloaded`. Layout mode is the one control that does *not* reload — it is a
real project field and the flag is a computed over a signal.

**Agent Connection is a read-only roster** with copyable tokens; a second permission
grid would break "no control exists twice"
([decision](../../../decisions/2026-08-agent-connection-panel-control-is-a-roster.md)).

**The Design Lab is a route with knobs, not a third theme.** Seven inline custom
properties on `documentElement` reach the whole shell, which is the experiment; Reset
*removes* the property so the stylesheet wins, theme-correct for free; two limits are
stated on the controls — surface contrast reduces only, and the accent knob moves
`--color-accent` alone ([decision](../../../decisions/2026-08-design-lab-tokens-are-session-knobs.md)).
`design-lab-tokens.ts` holds no design literals, so the token lint stays honest.

**`DesignLabStore` is a root singleton that does not hydrate**, because a page-provided
store would be destroyed on navigation while the shell still wore its knobs. §20
objects to one global store owning application data; this owns seven numbers.

**Primitive panels are evidence, not a component library.** Buttons, inputs, cards,
project cards and menus that everyone keeps re-styling are shown as representative
markup marked *not yet a shared component*; extracting them is a slice that has not
been earned.

## Consequences

- Any scenario is reachable without a restart: seed, date, persona, delay, failure,
  flags.
- Friction notes carry route, project, real timestamp and slice, so
  `.prototype/notes.json` reads as a history; `CURRENT_SLICE` must be bumped when a
  slice starts.
- The panel and its controls stay in the initial bundle whatever the routes do, because
  `App` mounts the overlay globally; lazy-loading it would reopen the surface decision.
- Ctrl+Shift+D may be Chrome's; `/prototype/state` is always there.

## Decisions that shape this system

- [The development panel is an overlay and a route, sharing one control set](../../../decisions/2026-08-development-panel-surface.md)
- [Latency and failure injection live in the client, not the host](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)
- [A theme change lasts the session, not the persona](../../../decisions/2026-08-theme-selection-is-session-only.md)
- [What §46's Agent Connection control is](../../../decisions/2026-08-agent-connection-panel-control-is-a-roster.md)
- [The Design Lab is a route with live knobs, not a third theme](../../../decisions/2026-08-design-lab-tokens-are-session-knobs.md)
- [The initial bundle budget is set deliberately at 850 kB](../../../decisions/2026-08-initial-bundle-budget.md) — why the panel stays eager

## Spec sections

§22 themes and the Design Lab knobs · §28 layout flag · §46 development panel · §47
feature flags · §63 optimistic UI · §67 Design Lab · §68 the two `prototype/*` routes ·
§79 feedback notes.
