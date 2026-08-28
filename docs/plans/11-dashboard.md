# Slice 11 — Dashboard

## Goal

Make `/app` a configurable widget surface that answers "what should I do today?" from clock-driven derived data and locally composed AI-shaped text.

## Spec sections

- §24 — Home Dashboard (the widget list)
- §25 — Dashboard Widget Model (`DashboardWidget`, four preset sizes)
- §42 — AI Feature Architecture (`AIProvider`)
- §43 — Prototype AI (deterministic, fixture-backed, no API key)
- §44 — Optional Real AI Mode (`PROTOTYPE_AI_PROVIDER=mock|real`)
- §45 — Time Abstraction (`Clock`, no `new Date()` in domain)

## Acceptance check

1. `pnpm prototype:seed busy-week`, open `/app`: Today, Upcoming, Active Projects, Recent Progress, Daily Digest and Fun Fact all render real seed content, in `position` order, at their `size` preset, with `hidden` widgets absent.
2. `pnpm prototype:seed overdue-chaos`, reload `/app`: the same widgets show materially different content — overdue tasks appear, the active-project rows change, the digest sentences change.
3. `pnpm prototype:seed empty`, reload `/app`: every widget renders its own empty state rather than a blank tile or an error.
4. `GET /api/dashboard?upcomingDays=14` widens the Upcoming range, and the `upcoming` widget's `config: { days: 14 }` proves widget config reaches the query.
5. `PROTOTYPE_AI_PROVIDER=real` starts the host and serves everything except the digest, which fails loudly; unset/`mock` is the default and needs no key (§44).
6. Domain tests prove the dashboard is clock-driven: the same document at two different `Clock` instants produces different today/upcoming/recent buckets.
7. `pnpm test`, `pnpm lint`, `pnpm build` all pass.

## File-level change list

- `packages/contracts/src/dashboard.ts` / `.test.ts` — add `DashboardQuery`, `DashboardTask`, `DashboardProject`, `GeneratedContent`, `DashboardResult`. The §25 widget model itself already exists from Slice 2.
- `packages/contracts/src/index.test.ts` — pin the new exports.
- `packages/domain/src/ai-provider.ts` — §42's `AIProvider` interface and its two context types. Interface and types only.
- `packages/domain/src/prototype-ai-provider.ts` / `.test.ts` — §43's deterministic composer for both methods. No network, no key, no clock (the context carries the instant).
- `packages/domain/src/dashboard-service.ts` / `.test.ts` — derives today / upcoming / active projects / recent progress / fun fact from projects + tasks + `Clock`, and asks the `AIProvider` for the digest.
- `packages/domain/src/index.ts` — export the new modules.
- `packages/domain/test/test-support.ts` — wire `dashboardService` into the harness.
- `apps/prototype-host/api/real-ai-provider.ts` — §44's stub adapter. It lives in the host because a real provider is network, and the domain may not know about network.
- `apps/prototype-host/api/services.ts` — read `PROTOTYPE_AI_PROVIDER` in one place, default `mock`, construct `DashboardService`.
- `apps/prototype-host/api/routes.ts` / `routes.test.ts` — `GET /api/dashboard`.
- `apps/web/src/app/core/gateway/work-manager-gateway.ts` — add `DashboardGateway`.
- `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts` / `.spec.ts` — implement it over `GET /api/dashboard`.
- `apps/web/src/app/core/gateway/testing/fake-gateway.ts` — answer `dashboard.get`.
- `apps/web/src/app/features/dashboard/dashboard-store.ts` / `.spec.ts` — reads the persona's widgets from `IdentityProvider`, derives the query from widget config, loads the result, exposes visible widgets in `position` order.
- `apps/web/src/app/features/dashboard/dashboard-page.ts` / `.html` / `.scss` / `.spec.ts` — the widget host: renders each visible widget through the registry at its size preset, plus loading / error / no-widgets states.
- `apps/web/src/app/features/dashboard/widgets/widget-contract.ts` — the inputs every widget receives, mirroring `sections/section-contract.ts`.
- `apps/web/src/app/features/dashboard/widgets/registry.ts` / `.spec.ts` — type → component + display name. Adding a widget is this file plus its own folder.
- `apps/web/src/app/features/dashboard/widgets/widget-content.scss` — the one stylesheet the six widget bodies share.
- `.../widgets/today/today-widget.ts` + `.html`
- `.../widgets/upcoming/upcoming-widget.ts` + `.html`
- `.../widgets/active-projects/active-projects-widget.ts` + `.html`
- `.../widgets/recent-progress/recent-progress-widget.ts` + `.html`
- `.../widgets/daily-digest/daily-digest-widget.ts` + `.html`
- `.../widgets/fun-fact/fun-fact-widget.ts` + `.html`
- `packages/prototype-data/src/personas.ts` — give the demo persona the six widgets this slice builds, so `/app` is worth looking at without configuring anything.
- `development.md` — mark Slice 11 in progress, then done with concrete evidence.
- `docs/decisions/` — a new entry for the layout/content split and the Fun Fact ruling; a revisit note on `2026-08-dashboard-widget-ownership.md`.

## Test plan

Domain (`packages/domain`):

- `dashboard-service.test.ts`
  - buckets a task due before now as overdue, one due later today as due-today, and an `in_progress` task that is neither into in-progress — with no task in two buckets.
  - excludes `done`, `cancelled` and archived tasks from today and upcoming.
  - honours `upcomingDays`, defaults to 7, and rejects an out-of-range value.
  - recent progress lists only tasks completed within `recentDays`, newest first.
  - active projects carry per-project open/completed counts and a percentage.
  - scopes everything to the actor's workspace — another persona's project never leaks.
  - the same document at two clock instants produces different buckets (§45).
  - the fun fact changes with the simulated day and is stable within a day.
- `prototype-ai-provider.test.ts`
  - digest text names the real counts and the nearest deadline (§43's example shape).
  - is deterministic: the same context twice gives identical output.
  - degrades to a sensible sentence on an empty workspace.
  - `generateProjectSummary` composes from its context (§42 pins both methods).

Host:

- `routes.test.ts` — `GET /api/dashboard` answers the contract; `upcomingDays` reaches the service; an unparseable range is a 400.

Web:

- `prototype-work-manager-gateway.spec.ts` — the request URL carries the range params, and a body that is not the contract raises `invalid_response`.
- `dashboard-store.spec.ts` — hidden widgets excluded; ordering by `position`; the `upcoming` widget's `config.days` becomes `upcomingDays`; a gateway failure sets an error and clears content; a superseded load's late answer is ignored.
- `dashboard-page.spec.ts` — one element per visible widget carrying its size; an unregistered widget type falls back to a note; an empty widget list shows the no-widgets state; the error state shows the message.
- `widgets/registry.spec.ts` — every registered type is a `DashboardWidgetType`, and every type this slice builds is registered.

## Boundaries touched

- **Components → gateway interfaces only.** Widgets take plain contract data as inputs and never inject a gateway; only `DashboardStore` touches `WORK_MANAGER_GATEWAY` and `IDENTITY_PROVIDER`.
- **Domain → repositories + `Clock` only.** `DashboardService` takes `ProjectRepository`, `TaskRepository`, `Clock` and `AIProvider`. `AIProvider` is a domain interface, exactly like `Clock`; the network-shaped implementation lives in the host, and `check-domain-imports.mjs` still passes because nothing new is imported.
- **No `new Date()` in domain.** Every instant comes from the injected `Clock`; the AI provider receives `generatedAt` in its context so it needs no clock at all.
- **Contracts defined once.** Every dashboard read-model shape lives in `packages/contracts/src/dashboard.ts`; host, gateway and specs import them.
- **One flag surface.** `PROTOTYPE_AI_PROVIDER` is read in exactly one place, `api/services.ts`.
- **Design tokens.** All widget styling goes through the existing custom properties.

## Explicit non-goals

- Drag configuration of the dashboard (Slice 23). Position, size and hidden come from persona data only, and nothing in this slice writes a widget.
- The Calendar widget (Slice 18), Recent Agent Activity (Slice 13), and Work Summary. §24 lists them; this slice's build list does not. Their `DashboardWidgetType` values already exist, the registry simply has no entry, and the host renders the documented fallback.
- The development panel's simulated-date and seed controls (Slice 12). Acceptance uses the seed CLI, and clock sensitivity is proved by domain tests.
- A real AI implementation. §44's adapter is a stub that fails loudly when selected.

## Open questions

1. **Does Fun Fact belong behind `AIProvider`?** Decided no. §24 calls Daily Digest "Mock AI-generated" and Fun Fact merely "low-priority optional daily content", and §42 pins `AIProvider` to two methods. Fun Fact is a clock-keyed fixture rotation in `DashboardService`. Recorded as a decision entry.
2. **One dashboard request, or one per widget?** One. The widgets overlap heavily — the digest counts what Today and Recent Progress list — and a single derivation over a single clock reading is the only way they can agree.
3. **Where does the widget layout come from?** `IdentityProvider`. The persona already carries `preferences.dashboardWidgets` (Slice 2's decision), so the gateway returns content only and switching persona changes the layout for free.

## Revisions

What changed between the plan above and the code, and why.

- **`packages/domain/src/calendar.ts` was added, unplanned.** The plan assumed the service
  could format "the day seven days after the clock's day" directly. It cannot:
  `check-no-direct-date.mjs` bans every `new Date(...)` in domain source, and converting
  epoch milliseconds to `YYYY-MM-DD` is exactly the operation that tempts one through. The
  arithmetic (Hinnant's `civil_from_days`) now lives in its own pure module with its own
  test, rather than a bypass helper smuggled into the exempt `clock.ts`.
- **`personName` on `DailyDigestContext` became optional.** `DashboardService` has an
  `ActorContext`, not a `User`, and the domain has no `UserRepository` wired here; giving
  the service one just to greet someone by name would have widened its dependencies for a
  salutation. The digest titles itself "Daily digest" instead.
- **"Closest deadline" is nearest in *either direction*.** The first version took the
  earliest target date, which on `overdue-chaos` named a project three weeks gone in
  preference to one due on Monday. It now minimizes `|daysToTarget|`.
- **`DashboardWidgetFrame` was added.** The plan had the page loop `NgComponentOutlet`
  directly. That would rebuild the inputs record on every change-detection pass — the
  self-feeding loop `section-contract.ts` documents — so the frame exists to give each
  widget's record a stable identity through its own `computed()`.
- **Two existing specs and `app.routes.spec.ts` needed edits.** Adding `dashboard` to
  `WorkManagerGateway` broke two hand-rolled gateway objects, and `/app` now injects
  `IDENTITY_PROVIDER`, which the route map's harness did not provide.
- **Seed snapshots were regenerated.** `prototype/seeds/*.json` are committed fixtures, so
  changing the demo persona's widget list is a snapshot change too.
- **Found in the browser, not in the tests:** overdue rows in Today printed only the due
  time, so five days-old tasks all read as tonight. Fixed, with a test that pins the
  overdue row to a date and the still-due row to a time.

The plan's acceptance check was run in full. Item 6 is proved by
`dashboard-service.test.ts` rather than in the app, because the simulated-date control is
Slice 12's; the seed-switching half of the *Done when* was exercised in the browser across
`busy-week`, `overdue-chaos` and `empty`.

Two things this slice did **not** answer, both recorded in `.prototype/notes.json`: whether
§25's four preset sizes are useful (nothing in the UI changes a size, so they exist only as
seeded examples), and how the dashboard reads on a day that is not "everything is overdue"
(no clock control yet).
