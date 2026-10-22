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

**The budget earned its keep within the hour.** Slice 17's fresh-resolve check —
`node_modules` and `pnpm-lock.yaml` both deleted, plain `pnpm install` — moved Angular from
22.1.3 to 22.1.4 and the initial bundle from 839 kB to **946 kB**: +107 kB in the framework
chunk, from a *patch* release, with nothing of ours changed. The committed lockfile stays on
22.1.3 and the slice does not carry that bump, but the finding is recorded here because it is
the first thing this number has caught, and it is not ours to fix.

**Confidence**

High on the measurement. Medium on 850 kB as the right line — it is a number chosen to be
slightly uncomfortable, not a target derived from anything. The Angular 22.1.4 measurement
above says it is roughly the right order of uncomfortable.

**Revisit when**

The warning fires again — including on the next Angular upgrade, which will bring the +107 kB
with it and needs a decision rather than a number bump.

Our own next lever is lazy-loading the development panel, which needs a decision about how
§46's chord reaches a route whose panel is not loaded; raising the number a third time without
pulling that lever would be the failure Slice 12's note warned about.

**Amended, 2026-09-14 — Slice 31 kept the error ceiling.** Adding the receipt notice and removal
flow first measured a 1.03 MB initial bundle, above the existing 1 MB error. The budget remains
unchanged, and project routes remain eager. `ProjectCanvas` now defers its conditional section
creation dialog, removal dialog and Undo notice until their controls are used; `ArchivePage`
defers the archive list until its read completes. The production build then measured a 993.82 kB
initial bundle, under the error ceiling, while retaining the existing 850 kB warning. The browser
suite covers the resulting interactions. This keeps the prototype route map simple while using
the existing lazy-boundary mechanism for UI that is not initially visible.

**Final Slice 31 verification, 2026-09-14.** After review-driven retry-state and documentation
corrections, the production build measured a 995.34 kB initial bundle, still under the unchanged
1 MB error ceiling. The 850 kB warning remains visible; no budget was raised.

**Amended, 2026-09-15 — Slice 32 kept the error ceiling.** The edit-Undo contracts and the
Reflections page's notice first measured 1.01 MB. Deferring that page's notice like the canvas's
brought it to 1.003 MB. The rest came from `@cwm/contracts` having no `sideEffects` declaration,
so the bundler kept every schema module the web app never uses (the stored inverse schemas among
them). The package only declares Zod schemas and pure helpers, so it now declares
`"sideEffects": false`; the final Slice 32 build measured 994.14 kB, with no budget changed.

**Amended, 2026-09-18 — Slice 36 raised only the hard ceiling.** Stage B's row-history contracts
and browser consumers measured 1.01 MB after the existing route and conditional-component splits.
The warning remains 850 kB and therefore stays visible; `maximumError` moves from 1 MB to 1050 kB,
about 43 kB above the measured bundle. This is a deliberate exception to the earlier “dev-panel
lever first” direction: lazy-loading the global panel changes §46's every-route chord and is outside
this history slice, while moving both thresholds would hide the growth. The next increase still
requires structural work and a new decision rather than another number bump.

**Amended, 2026-09-22 — Slice 41.** The header's history controls, their store and the feedback
wording load eagerly with the project header, because they are on every project page. The canvas
notice stays behind `@defer` under its new name, `SectionRecoveryNotice`, and the Reflections page no
longer loads a notice at all. The production initial bundle measured 1024.97 kB at Slice 41 — under
the 1050 kB error ceiling, with the 850 kB warning still reported ([decision](2026-09-project-header-history-controls.md)).

**Amended, 2026-09-29 — Slice 58.** The phone navigation drawer is part of the shell, so it loads
eagerly. Before the slice the initial bundle measured 1043.9 kB; the slice's first build measured
1052.5 kB and failed the 1050 kB ceiling. `AppShell` and `DevPanel` now import the standalone
`CdkTrapFocus` directive rather than all of `A11yModule`, and the build measures 1048.5 kB: under
the ceiling by about 2 kB, with the 850 kB warning still reported. No budget was raised; the
headroom is now small enough that the next eager feature needs the structural work above
([decision](2026-09-phone-navigation-drawer.md)).

**Amended, 2026-09-30 — Slice 60.** The gear, Work plus and shell creation wiring initially
measured 1054.11 kB despite deferring WorkCreateDialog. The project column now loads through
`@defer` inside the loaded-root branch, immediately triggered by its available context.
The build measures 1039.43 kB; the 1050 kB ceiling and 850 kB warning remain unchanged.
See [navigation controls](2026-09-project-navigation-gear-and-work-create.md).
Final Slice 60 verification includes a reserved Loading slot and a visible Error reload path:
1040.05 kB, still below the unchanged ceiling. The 1039.43 kB above was the first deferral build.


**Amended, 2026-10-01 — Slice 62 partial checkpoint.** The mandatory Slice 62 early build measured 1,052.60 kB and failed the unchanged 1,050 kB ceiling by 2.60 kB; the Markdown parser/body was lazy (117.80 kB). Implementation stopped as required by the active plan. A bounded DevPanelControls deferral is a candidate under review, not implemented; no budget increase is approved.


**Amended, 2026-10-02 — approved structural remedy.** The user approved deferring development-panel controls while retaining the eager modal shell. The first remedy build measures **1,032,388 bytes** (unique initial files referenced by index.html), below the unchanged 1,050,000-byte ceiling. Stats place DevPanelControls, DevPanelStore and ProjectLayoutControl outside initial outputs. Markdown parser/body/renderer are also lazy, with only its shell eager. This is an intermediate measurement before the source editor is completed.


**Amended, 2026-10-02 — final Slice 62 editor measurement.** The completed source editor
keeps unique initial files at 1,032,388 bytes. Parser, renderer, body and editor are solely
in a 125.81 kB lazy output; panel controls/store/layout remain in a 20.90 kB lazy output.
The hard ceiling is unchanged at 1,050,000 bytes; the 850,000-byte warning still applies.

**Amended, 2026-10-17 — after Slice 73, the user raised the hard ceiling.** Slice 73 closed at
**1,049,943 bytes** initial, 57 bytes under 1,050,000. That headroom came from deferring the new
project details and archive-confirm dialogs, and from shortening the More anchor CSS by hand.
Every further eager change would have needed another such deferral, and redesign slice 4 adds
feedback UI (a toast, inline Undo and a pending indicator) that is on screen at once.

The user decided to raise the number rather than start structural work first. `maximumError`
moves from **1050 kB to 1100 kB**, about 50 kB of headroom, the same size of step as Slice 36.
`maximumWarning` stays at **850 kB** and keeps reporting, so the growth stays visible. The earlier
levers remain open: more `@defer` boundaries for UI that is not initially visible, and the
eager modal shell of the development panel. This amendment records a choice, not a measurement
that the bundle is fine.


**Amended, 2026-10-21 — Slice 77, user-approved ceiling.** The user raised the initial
maximumError from 1100 kB to **1150 kB** for the object-row slice. The 850 kB warning stays.
This records the accepted ceiling; the final production build supplies its measurement.
