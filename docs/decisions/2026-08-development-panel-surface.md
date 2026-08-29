# The development panel is an overlay and a route, sharing one control set

**Question**

§46 wants a panel behind Ctrl/Cmd+Shift+D. §68's route map already lists `/prototype/state`
as the "seed/state inspector", and Slice 9 built a layout experiment there. Two surfaces,
one set of controls — which one is real?

**Options tested**

- *Overlay only, delete the route*: rejected. §68 names `/prototype/state`, and a route is
  linkable, survives a reload, and has room for a per-project list the overlay does not.
- *Route only, no chord*: rejected. §46 asks for the shortcut, and the value of a
  development panel is being able to change the rig **without leaving the screen you are
  looking at** — navigating away to change a seed loses the state you were inspecting.
- *Both, each with its own controls*: rejected outright. Two copies of one control is how
  they drift.
- *Both, sharing one `DevPanelControls` component and one root-provided store*: chosen.

**What we learned**

The overlay is the one that gets used. Every verification in this slice was done from it,
on whatever page was already open — which is precisely §46's point.

`DevPanelStore` had to be **root-provided**, unlike every other store in the app. On
`/prototype/state` the overlay and the page are alive at the same time and render the same
controls; component-scoped stores would show two different ideas of the same host.
`StateInspectorStore` survives beside it as a second, component-scoped store with a
different job — the per-project layout list, which needs every project rather than the one
the route is on.

**A host-state change has to reload the app.** `PrototypeIdentityProvider` memoizes a
fulfilled identity and every store loads once; §62's live updates are Slice 16. So after a
persona switch, seed load, clock move or provider swap, the loaded UI is stale. The panel
calls `location.reload()`, and the controls say so. That in turn forced the client-owned
settings into `sessionStorage` — a delay wiped by the panel's own reload is a delay you
cannot use. Verified: switching to Alex reloaded the app, showed Alex in the top bar,
flipped the theme to light (Alex's stored preference), and left the delay/failure/flag
settings intact.

**The theme keeps two controls, and that is fine.** The top-bar toggle stays because §22
asks the shell to have one; the panel drives the same `ThemeService` signal through a new
public `set(theme)`. Two controls over one signal is not duplicated state. The theme is
deliberately **not** in `sessionStorage`: it comes from the persona on load, which is what
makes "switch persona changes the theme" demonstrable at all.

**Ctrl/Cmd+Shift+D collides with the browser.** It is Chrome's own "bookmark all tabs", so
in some contexts the page never sees it. The handler is correct — it matches `event.code`
rather than `event.key`, because with Shift held the browser reports `D` and a non-US
layout reports something else entirely — but the route is the fallback when the chord is
swallowed.

**Current decision**

Overlay mounted once at the shell, plus `/prototype/state`, both rendering
`DevPanelControls`; one root-provided `DevPanelStore`; host-state changes reload;
client-owned settings persist in `sessionStorage`; the theme does not.

Agent Connection — §46's tenth control — is absent until Slice 13, when connections exist.
A control over nothing would be the aspirational UI AGENTS.md forbids.

**Confidence**

High on the shared-control-set structure. Medium on the reload: it is the blunt answer, and
it is only acceptable because this is a development surface. Low on the chord specifically,
given the browser collision.

**Revisit when**

Slice 13 adds Agent Connection to the panel. Slice 16's live updates could replace the
reload with a real refresh, at which point `sessionStorage` may stop being necessary — that
is the moment to check whether these settings should go back to being session-only.
