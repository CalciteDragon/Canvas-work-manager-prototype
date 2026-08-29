# What §46's Agent Connection control is

**Question**

§46 lists **Agent Connection** among the development panel's controls, with no further
description. Slice 12 deferred it because no connections existed. Now they do — so what is
the control?

**Options tested**

- *A second permission grid in the panel.* Rejected: Slice 12 established that no control
  exists twice (it is why `/prototype/state` renders the same `DevPanelControls` component as
  the overlay). Two grids over one record is exactly that rule broken, and they would
  disagree the moment one of them had a stale read.
- *"Act as this connection" — a switcher, like Persona.* Rejected: nothing in the web UI acts
  as an agent. Every browser request is a persona request, and a control that changed which
  agent the *browser* was would be a control over nothing observable.
- *A read-only roster with copyable tokens.* Adopted.

**What we learned**

The two surfaces answer genuinely different questions about the same records, and the split
held up in use:

- The panel answers **"what token do I paste into an MCP client?"** — the rig's question.
- §53's Settings answers **"what is this connection allowed to do?"** — the product's
  question.

Copy-token turned out to be the whole value of the control. It was the first thing reached
for when driving the feature by hand, and not to change anything.

**Current decision**

- The panel shows each connection's name, its bearer token with a copy button, a revoked
  badge, and its permissions as a one-line summary. No checkboxes, no Revoke.
- The roster rides on `PrototypeState` (`/prototype/state`), not on the work-manager gateway.
  Two reasons: the panel keeps working while the gateway is at 100 % injected failure, and
  it is the surface where §51's tokens legitimately live.
- A connection the token table does not name is **skipped**, not shown token-less: a roster
  row whose whole purpose is a copy button is worse than no row when there is nothing to copy.
- The panel's hint text says where editing lives, so the absence is explained rather than
  looking like an oversight.
- `navigator.clipboard` failures are swallowed — it is unavailable on some hosts and rejects
  when the document is unfocused, and the token is on screen to select by hand regardless.

**Confidence**

Medium-high. The read-only split is right; what is missing is a link from a roster row
straight to that connection in Settings, which was noted as friction while using it.

**Revisit when**

Slice 15, when a real MCP client is being configured for the first time — that is the moment
this control either pays for itself or turns out to want the whole `docs/mcp-setup.md`
snippet on the clipboard rather than a bare token.
