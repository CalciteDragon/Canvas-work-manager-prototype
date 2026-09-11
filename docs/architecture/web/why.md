# Why the web app is shaped this way

## The problem it solves

The prototype's product questions are mostly questions about *feel* — what a project
page should be, whether nesting helps, which sections deserve to exist (§2) — and feel is
answered in a browser. The application therefore has to be fast to change: a section
type is a folder and a registry line, a widget is a folder and a registry line, and no
change to how data is fetched should ripple through components (§19, §29, §65–§66).

## Forces

- **The UI must survive into the MVP** (§70): components depend on gateway interfaces
  and an identity interface so that swapping the prototype host for a real API is an
  adapter change (§8, §10, §72).
- **No global mega-store** (§20): two Recent Activity sections on two pages are two
  different questions; a page-scoped store answers each.
- **Optimistic writes must be observable** (§63): the injection that makes them
  testable has to sit where the revert happens — in the client.
- **Live frames must not flicker** (§62): an agent's write or a reconnect must never
  paint a skeleton over a page someone is reading.
- **Design changes must be cheap** (§21–§22): every colour, spacing and radius is a
  token; a theme is one attribute; the Design Lab's knobs move both themes.

## The shape, and the alternatives rejected

**Standalone components, Signals, zoneless, `@angular/build`.** The default Angular 22
shape; no NgModules, no zone.js. Consequence: Storybook has to run on the preview Vite
framework rather than the stable webpack one, which needs `zone.js` and
`@angular-devkit/build-angular` ([decision](../../decisions/2026-08-storybook-runs-on-the-vite-framework.md)).

**Interfaces behind injection tokens for everything that crosses to the host.**
`WORK_MANAGER_GATEWAY`, `IDENTITY_PROVIDER`, `LIVE_UPDATES` and `PROTOTYPE_CONTROL`;
`app.config.ts` is the only file naming a concrete adapter. The gateway interface grows
only with implementations — no stubbed members
([decision](../../decisions/2026-08-gateway-surface-grows-with-implementations.md)).

**Feature-scoped stores, provided at the component that owns the question.** A Task
List section provides its own `TaskListStore`; a page provides its `ProjectPageStore`;
the workspace shell provides `ProjectWorkspaceStore`. Rejected: one store per entity at
root — §20 names it as the thing to avoid, and the split between a project's record and
a page's sections is what let Todos mount without the header vanishing.

**Registries for the three open-ended lists.** `SECTION_REGISTRY`,
`DASHBOARD_WIDGET_REGISTRY` and `PROJECT_PAGE_REGISTRY`: adding a kind is its own folder
plus one line, and each registry's spec pins the list so a change is deliberate.

**Latency and failure injection in the gateway.** So the panel can prove a row paints
complete while the request has not started, and reverts when it fails
([decision](../../decisions/2026-08-latency-and-failure-live-in-the-client.md)).

**Quiet re-reads on live frames; loud reload on `prototype.reloaded`.** Ordinary
mutation and reconnect reads set no loading flag and clear no data; a host-state change
reloads the page because everything derived changed at once
([decision](../../decisions/2026-08-live-recovery-invalidates-derived-views.md)).

**Eager feature routes, lazy prototype routes.** Lazy boundaries are one more thing to
move when a feature moves; the two `prototype/*` routes are lazy because most sessions
never open them — and the honest limit is that the dev panel stays eager because `App`
mounts it globally ([decision](../../decisions/2026-08-initial-bundle-budget.md)).

**Tokens structured around the knobs.** Each theme block holds only base literals and
every derived token is expressed once under `:root`, so a Design Lab knob moves both
themes; the token lint permits literals in exactly one file
([decision](../../decisions/2026-08-design-lab-tokens-are-session-knobs.md)).

## Consequences

- A production adapter replaces `prototype-work-manager-gateway.ts` and nothing else.
- Every component test runs with a fake gateway from `core/gateway/testing`; no test
  needs the host.
- The initial bundle is over its 850 kB *warning* budget (969 kB after 25.8) and under
  the 1 MB error budget; the budget is deliberate and the number is watched.
- A store that forgets its in-flight guard will have a live frame overwrite its
  optimistic write — the defect class that closed Slice 16 and Slice 17.

## Decisions that shape this system

- [The gateway interface grows with its implementations](../../decisions/2026-08-gateway-surface-grows-with-implementations.md)
- [A theme change lasts the session, not the persona](../../decisions/2026-08-theme-selection-is-session-only.md)
- [Latency and failure injection live in the client, not the host](../../decisions/2026-08-latency-and-failure-live-in-the-client.md)
- [How live reconnects recover derived project views](../../decisions/2026-08-live-recovery-invalidates-derived-views.md)
- [The activity feed composes its line](../../decisions/2026-08-activity-feed-composes-from-parts.md)
- [The initial bundle budget is set deliberately at 850 kB](../../decisions/2026-08-initial-bundle-budget.md)
- [Storybook runs on the Vite framework, not the webpack one](../../decisions/2026-08-storybook-runs-on-the-vite-framework.md)
- [The Design Lab is a route with live knobs, not a third theme](../../decisions/2026-08-design-lab-tokens-are-session-knobs.md)

Each subsystem's `why.md` carries its own.

## Spec sections

§4 stack · §8–§10 boundary, gateway, adapter · §18 identity · §19–§23 UI architecture,
stores, tokens, themes, shell · §62–§63 live updates and optimistic UI · §65–§68 feature
structure, section structure, design lab, route map · §69 component tests.
