# The initial bundle budget is set deliberately at 850 kB

**Question**

Slice 12 pushed the initial bundle to 797 kB against a 725 kB warning, and its note said
quietly raising the number each slice is how the number stops meaning anything. Slice 17 adds
a whole component catalogue. What is the number, and what is it for?

**Options tested**

- *Leave the warning at 725 kB and live with a permanent red line*: rejected. A warning that
  is always on is a warning nobody reads, which is the same failure the Slice 12 note
  described from the other direction.
- *Lazy-load `/prototype/design` and `/prototype/state`, then re-measure*: done, and it is
  worth doing — but it does **not** fix the number, and the plan said so in advance rather
  than hoping.
- *Lazy-load the development panel itself*: rejected here. It changes how §46's chord reaches
  every route, which is a Slice 12 decision this slice has no business reopening. It is the
  next lever, and it is the one that would actually move the number.

**What we learned**

**Measured, before and after.** Slice 17 with everything eager: **840.7 kB**. With the two
`prototype/*` routes lazy: **839.3 kB** initial, plus a 25.4 kB `design-lab-page` chunk and a
6.1 kB `state-inspector-page` chunk. So the whole Design Lab costs the initial graph about
1.4 kB, and the slice as a whole grew it from 797 kB to 839 kB — the §81 project-write UI,
the More menu component, and the fixtures the catalogue shares with the stories.

**Why lazy-loading moves so little, precisely.** `App` mounts `<app-dev-panel />` globally so
the chord reaches every route, and `DevPanel` imports the same `DevPanelControls` that
`StateInspectorPage` does — so the panel, its controls, its store and the layout control stay
eager whatever the routes do. Lazy-loading `/prototype/state` moves only its page and store.
The Design Lab's own page, panels and fixtures do move out, but its live panels reuse
components already eager through the feature routes, so what actually left is the panel
scaffolding and nothing else.

The open part of the question — *did the catalogue add materially?* — is answered: it did not.
The panels are thin wrappers over components that were already in the graph, which is what
"the catalogue shows real components" was supposed to buy.

**Current decision**

`maximumWarning` moves from **725 kB to 850 kB**; `maximumError` stays at **1 MB**. 850 kB is
roughly 10 kB of headroom over the measured 839 kB — enough that an ordinary slice does not
trip it, tight enough that another catalogue-sized addition does. The error ceiling is
unchanged deliberately: it is the number that says "something has gone wrong", and nothing has.

The two `prototype/*` routes stay lazy, and `app.routes.ts` says why they are the exception to
its eager-by-design rule *and* states the honest limit, so the next person does not repeat the
measurement to learn that it barely helps.

**Confidence**

High on the measurement. Medium on 850 kB as the right line — it is a number chosen to be
slightly uncomfortable, not a target derived from anything.

**Revisit when**

The warning fires again. The next lever is lazy-loading the development panel, which needs a
decision about how §46's chord reaches a route whose panel is not loaded; raising the number a
third time without pulling that lever would be the failure Slice 12's note warned about.
