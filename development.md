# Canvas Work Manager — Prototype Development Plan

A slice-by-slice build order for the prototype described in
*Canvas Work Manager — Prototype Product, Design & Development Specification.md*.

> Read [AGENTS.md](AGENTS.md) first. It carries the architectural boundaries, the
> living-documentation rules, and the five-step protocol every slice follows.
> Each slice below is one **phase** under that protocol.

## How to use this document

Each slice is:

- **independently completable** — start it, finish it, stop there if you want
- **verifiable** — it ends with something you can look at, click, or run
- **ordered** — later slices assume earlier ones exist, but nothing later is required to consider an earlier slice "done"

Slices 1–17 deliver the **First Prototype Milestone** (spec §81). Slices 18–24 are the
**Second Milestone** candidates (spec §82) — build them only when actual use justifies them.

Each slice lists:

- **Goal** — the one thing this slice adds
- **Spec** — sections of the specification it implements
- **Build** — the work
- **Done when** — the acceptance check
- **Do not** — scope guards, to stop the slice from swallowing later ones

A slice is not done until `pnpm test` passes and the app still starts.

---

## Phase 0 — Foundations (Slices 1–4)

These four slices produce no product features. They exist so every later slice is
cheap. Resist expanding them.

---

### Slice 1 — Empty monorepo that starts

**Status:** done — plan: [docs/plans/01-empty-monorepo.md](docs/plans/01-empty-monorepo.md)
Diverged from the plan in three places: the host is never compiled (`build` is a
type-check — packages are consumed as source, so an `outDir` cannot work), Angular 22
already defaults to a headless vitest test runner so no builder swap was needed, and
Node had to be upgraded to 24.19.0 because Angular 22's CLI refuses 24.13.
Acceptance 5 (one Ctrl+C stops both) is the one check not machine-verified — it needs
a real keypress in a real terminal.

**Goal:** `pnpm install && pnpm dev` starts two processes and prints two URLs.

**Spec:** §5, §64, §75

**Build**

- `pnpm` workspace at the repo root (`pnpm-workspace.yaml`, root `package.json`).
- Directory skeleton exactly as §64:
  ```
  apps/web/
  apps/prototype-host/
  packages/contracts/
  packages/domain/
  packages/repositories/
  packages/mcp-tools/
  packages/prototype-data/
  prototype/seeds/
  docs/decisions/
  .prototype/
  ```
- `apps/web`: Angular 22 app, standalone components, SCSS, no default sample content.
  Strip the generated boilerplate down to an empty shell page.
- `apps/prototype-host`: a TypeScript Node HTTP server on `:4310` with one route,
  `GET /prototype/health`, returning `{ ok: true }`.
- Root scripts: `dev` (both, concurrently), `build`, `test`, `lint`.
- TypeScript project references or path aliases so `apps/*` can import `packages/*`
  without a publish step.
- `.gitignore` covering `node_modules`, `dist`, `.angular`, and `.prototype/data.json`
  (the *seeds* are committed; the live working file is not).
- `git init`, first commit.

**Done when**

- `pnpm dev` starts Angular on `:4200` and the host on `:4310`.
- `curl localhost:4310/prototype/health` returns `{"ok":true}`.
- Both processes stop cleanly with one Ctrl+C.

**Do not** add a database, auth, MCP, or any UI beyond a blank page.

---

### Slice 2 — Contracts package

**Status:** done — plan: [docs/plans/02-contracts-package.md](docs/plans/02-contracts-package.md)
Where the schemas had to decide something the spec leaves open, the choice is flagged
rather than settled — the ones that matter, with the rest in the plan: `schemaVersion`
starts at `1` (§14's `4` is illustrative);
§17's `userId`/`workspace` are spelled `id`/`workspaceId` like every other entity;
`ActivityAction` is an open `entity.verb` string, not an enum, because §57 names no action
list and every later slice adds verbs; `ProjectStatus`, `MilestoneStatus` and `TaskPriority`
values are starting guesses (§83 leaves the first open, §35 and §33 name the fields without
values); dashboard widgets live on `UserPreferences`, since §14 gives them no collection.
The last two are logged in `docs/decisions/`.
Consuming packages as source (Slice 1's deviation) also has a cost this slice paid: `zod`
must be a direct dependency of `apps/web` for the Angular builder to resolve it through the
path alias, and the initial-bundle warning budget moved 500kB → 700kB.

**Goal:** One place that defines every entity, with runtime validation.

**Spec:** §11, §14, §25, §33, §35, §52

**Build**

In `packages/contracts`, Zod schemas plus inferred types for:

- Branded id types: `UserId`, `WorkspaceId`, `ProjectId`, `SectionId`, `TaskId`,
  `MilestoneId`, `ReflectionId`.
- `User`, `Workspace`
- `Project` (incl. `parentProjectId`, status, target date, `projectLayoutMode`)
- `ProjectSection` (`type`, `position`, `columnSpan`, `collapsed`, `config`)
- `Task` — exactly the §33 shape; `TaskStatus` = `todo | in_progress | blocked | done | cancelled`; `TaskPriority`
- `Milestone` (§35), `Reflection` (§36)
- `ActivityEvent` with `actor: user | agent | system` (§57)
- `AgentConnection` + `AgentPermission` union (§52)
- `DashboardWidget` + `WidgetSize` (§25)
- Input schemas: `CreateTaskInput`, `UpdateTaskInput`, `CreateProjectInput`,
  `UpdateProjectInput`, `TaskQuery`, etc.
- The `data.json` document schema with `schemaVersion` (§14).

Unit tests: each schema accepts a valid fixture and rejects a malformed one.

**Done when** `pnpm test` runs contract tests green, and the package exports both
schemas and types from one entrypoint.

**Do not** write gateway interfaces, services, or repositories here. Contracts only.

---

### Slice 3 — JSON persistence + repositories

**Status:** done — plan: [docs/plans/03-json-persistence-repositories.md](docs/plans/03-json-persistence-repositories.md) — async units of work isolate provisional state and reject outside/stale writes; document integrity includes duplicate, reference, and workspace-scope checks.

**Goal:** Data can be loaded, mutated in memory, and persisted atomically.

**Spec:** §13, §14, §15, §74

**Build**

- `packages/repositories`:
  - Repository *interfaces*: `ProjectRepository`, `TaskRepository`,
    `SectionRepository`, `MilestoneRepository`, `ReflectionRepository`,
    `ActivityRepository`, `AgentConnectionRepository`, `UserRepository`.
  - A `JsonDataStore`: loads `.prototype/data.json`, validates it against the
    contracts document schema, holds it in memory, and exposes an atomic
    `persist()` (write temp file → rename).
  - `Json*Repository` implementations reading/writing the in-memory document.
  - An `InMemoryDataStore` variant seeded from a literal — used by tests, no disk.
- Persistence happens at **operation boundaries**, not per property write (§15).
  Expose a `runUnitOfWork(fn)` helper that persists once at the end.

Unit tests against the in-memory store: insert → list → update → find.

**Done when** repository tests pass, and a crash mid-write cannot leave a truncated
`data.json` (temp-and-rename verified by test or by inspection).

**Do not** add SQLite or Postgres (§14). Do not add domain logic — repositories
store and retrieve, nothing more.

---

### Slice 4 — Seeds, personas, clock, reset

**Status:** done — plan: [docs/plans/04-seeds-personas-clock-reset.md](docs/plans/04-seeds-personas-clock-reset.md) — five deterministic seeds include isolated personas; atomic CLI reset/seed commands and a settable, lint-enforced domain clock are verified.

**Goal:** Any workspace state is one command away.

**Spec:** §16, §17, §45, §76

**Build**

- `packages/prototype-data`: seed builders producing valid documents.
  Write these seeds now (§16):
  `empty`, `personal-workspace`, `busy-week`, `nested-projects`, `overdue-chaos`.
  (`large-project`, `completed-project`, `agent-heavy` can land with the slices that
  need them — `agent-heavy` with Slice 13.)
- Personas `Demo User`, `Alex`, `Sam` (§17), each with `userId`, name, avatar,
  workspace, preferences.
- `Clock` interface + `PrototypeClock` with a settable "now" (§45). **From this slice
  onward, no `new Date()` outside the clock implementation** — add a lint rule
  banning it in `packages/domain`.
- Scripts: `pnpm prototype:reset` (defaults to `personal-workspace`) and
  `pnpm prototype:seed <name>` (§76).
- Every seed is validated against the contracts schema in a test — a broken seed
  should fail CI, not surprise you at runtime.

**Done when** `pnpm prototype:seed busy-week` rewrites `.prototype/data.json` with a
realistic multi-project workspace, and the seed-validation test passes for all seeds.

**Do not** build seed-loading UI yet — that arrives in Slice 12.

---

## Phase 1 — First vertical slice through every layer (Slices 5–7)

The point of these three slices is to prove the whole stack end-to-end on one
small feature before broadening.

---

### Slice 5 — Domain services + first HTTP API

**Status:** done — plan: [docs/plans/05-domain-services-http-api.md](docs/plans/05-domain-services-http-api.md) — `curl` creates a project and a task, completes it, and reads the resulting activity, with the work surviving a host restart; verified by `pnpm --filter @cwm/prototype-host acceptance`. Two additions beyond the slice text: task archive is an `archivedAt` field rather than a reused status, and `GET /api/tasks/:id` + `POST /api/tasks/:id/archive` ship now because §9's `TaskGateway` pins them. Move-to-project is refused until Slice 20. Using the API surfaced a frozen host clock, fixed with `SimulatedClock`; diff review then found and fixed parent-chain cycles, an archive guard missing on PATCH, and a §12 lint that enforced less than it claimed.

**Goal:** Projects and tasks are real behavior, reachable over HTTP.

**Spec:** §8, §9, §12, §33, §57, §61

**Build**

- `packages/domain`:
  - `ProjectService`: create, get, list, update, archive, nesting rules.
  - `TaskService`: create, get, list (with `TaskQuery` filters), update, complete,
    archive — with proper status transition rules and `completedAt` handling.
  - `ActivityService`: every mutation records an `ActivityEvent` with an actor.
  - Services depend on repository interfaces + `Clock` only. No HTTP, no MCP,
    no JSON awareness (§12).
- `apps/prototype-host/api`: REST routes per §61 —
  `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`,
  `GET/POST /api/tasks`, `PATCH /api/tasks/:id`, `POST /api/tasks/:id/complete`.
  Routes validate request bodies with contract schemas and return contract shapes.
- Domain unit tests for task transitions and project hierarchy (§69).

**Done when** `curl` can create a project, create a task in it, complete the task,
and see the resulting `ActivityEvent` — with changes surviving a host restart.

**Do not** touch Angular. Do not add MCP. Do not add sections yet.

---

### Slice 6 — Gateway boundary + Angular shell

**Status:** done — plan: [docs/plans/06-gateway-boundary-angular-shell.md](docs/plans/06-gateway-boundary-angular-shell.md) — the sidebar lists the seeded projects over HTTP, three levels deep on `nested-projects`, and the theme toggle changes exactly two things in the DOM: `data-theme` on `<html>` and its own label. Verified in a real browser across the `personal-workspace`, `nested-projects` and `empty` seeds.
Diverged from the build list in one place, deliberately: `WorkManagerGateway` declares only `projects` and `tasks` rather than stubbing §9's other six as empty interfaces — six members nothing implements would force every adapter to fake them, and each now arrives with its own slice (`docs/decisions/2026-08-gateway-surface-grows-with-implementations.md`). Three additions the slice text does not name but §18 cannot be honored without: an `Identity` contract, `GET /api/me`, and CORS on the host — the preflight turned out to be load-bearing, since `x-prototype-user` is non-simple and the router matches on method, so every gateway call would have 404’d in a browser while every unit test passed. Running it with the host stopped then found the boundary hole the suite missed: `PrototypeIdentityProvider` was leaking a raw `TypeError` where §8 says the UI sees `GatewayError`. Diff review found four more the suite could not: a token lint that passed eleven deliberate literals (two of them already live in shipped code), a gateway that turned `status: []` from "match nothing" into "match everything", an unguarded `localStorage` read that throws on access in private browsing, and the same one-rule-two-entry-points divergence Slice 5 hit — the identity provider flattening every status to `internal_error` while the gateway read the host envelope properly.

**Goal:** The app renders a real navigation shell fed by real data.

**Spec:** §8, §9, §10, §18, §19, §20, §21, §23, §65, §68

**Build**

- `apps/web/src/app/core/gateway`: the `WorkManagerGateway` interface and its
  sub-interfaces (§9). Only `projects` and `tasks` need real methods this slice;
  stub the rest as interfaces without implementations.
- `PrototypeWorkManagerGateway` calling `localhost:4310`, provided through an
  Angular injection token. **Components inject the interface, never the
  implementation** (§8).
- `IdentityProvider` interface + `PrototypeIdentityProvider` (§18).
- Design tokens as CSS custom properties (§21) — colors, spacing, radius, shadow —
  in one global SCSS file. Dark + light themes (§22). No literal color or spacing
  values in component styles from here on.
- App shell (§23): top bar, sidebar (Home / Projects / Calendar / Search / Settings),
  main outlet.
- Routes per §68, with placeholder components for the not-yet-built ones.
- Feature folder structure per §65.

**Done when** the sidebar lists projects loaded over HTTP from the seeded
`data.json`, and theme switching works via tokens alone.

**Do not** create a global mega-store (§20). Do not build the project page yet.

---

### Slice 7 — Tasks: the first real feature

**Status:** done — plan: [docs/plans/07-tasks-first-real-feature.md](docs/plans/07-tasks-first-real-feature.md) — *(the `/tasks` route described below was deleted in Slice 8, as this slice allowed; its store and components now back the project page's Task List section)* — `/tasks` loaded the `busy-week` seed over HTTP and creates, inline-renames, reprioritizes, dates, and completes persisted tasks. A delayed localhost response proved the row becomes completed while the write is still pending; stopping the host proved the same optimistic paint reverts to the prior blocked state with a visible error and no `completedAt` in `data.json`. The real-browser pass also caught and fixed a drawer select that displayed `low` for a newly created `medium` task. Verified by `pnpm test`, `pnpm lint`, and the plan's recorded browser/data acceptance sequence.

**Goal:** Tasks can be created, completed, and edited in the UI.

**Spec:** §19, §34, §63, §69

**Build**

- `TaskListStore` (feature-scoped, Angular Signals) over the gateway.
- `TaskRow` component with the states the spec names (§4): normal, overdue,
  completed, high priority, selected, compact.
- Interactions (§34): quick create, inline completion, inline title editing,
  a task **detail drawer** (side drawer, not a modal), priority, due date.
- Optimistic completion with revert-on-failure (§63).
- A temporary `/tasks` route to exercise this before project pages exist — it can be
  deleted or repurposed in Slice 8. *(Slice 8 deleted it: §68 has no `/tasks`, and
  `TaskListStore` is now project-scoped behind the Task List section.)*

**Done when** clicking a checkbox completes the task instantly in the UI, persists to
`data.json`, and reverts visibly if the host is stopped mid-action.

**Do not** build subtasks or drag ordering yet (Slice 20).

---

## Phase 2 — The project page (Slices 8–11)

This is the central product experience (§26) and where most learning happens.

---

### Slice 8 — Project page + section registry

**Status:** done — plan: [docs/plans/08-project-page-and-section-registry.md](docs/plans/08-project-page-and-section-registry.md) — `/projects/:projectId` renders §26's header over a section canvas built from `SECTION_REGISTRY`, with Rich Text and Task List each inside the same `ProjectSectionFrame`. Diverged from the plan in three places. **Section activity events name the project, not the section** (`project.section_*`): `validateDocumentIntegrity` resolves every event's target at the close of every unit of work and on load, so a section-targeted event would have made a hard delete roll back its own unit of work and fail every later boot — the plan review caught it, and a domain test now fails against the naive version. **`SectionGateway.move` was deferred to Slice 9**, since nothing in the UI reorders until CDK drag-drop exists and that file's own rule is that an unexercised method is a claim no test backs; the domain service and the `move` route still ship. **`ProjectSection.config` was tightened from `unknown` to an object**, so storage and the write inputs describe the same thing. §26's middle "Project Navigation / Controls" row is deferred to Slice 9, where §32's mode toggle gives it something to hold. The frame's Size control writes `columnSpan` but has no visual effect until Slice 9 renders columns. The browser pass found one real defect the unit tests missed: a project with nothing done rendered "Not available" instead of "0%", because `@if (progress; as …)` treats a real zero as no value. Two diff reviewers then found seven more, all fixed with tests — most notably `duplicate` indexing an array by `position` (wrong on the sparse data a hand-edited `data.json` can hold), progress blanking on any task error rather than a failed load, and neither store guarding against out-of-order loads when projects are switched quickly.

**Goal:** Sections are modular and render inside a common frame.

**Spec:** §26, §29, §30, §31, §66

**Build**

- Project page: header (icon, name, status, progress, target date, quick add, more)
  and an empty section canvas (§26).
- `SectionService` in domain: add, remove, reorder, resize, collapse sections.
- `SectionDefinition` interface + `SECTION_REGISTRY` (§29).
- `ProjectSectionFrame` (§31) providing drag handle, title, collapse, config, size,
  duplicate, remove — content components handle only their own feature.
- The first two section types: **Rich Text** and **Task List** (reusing Slice 7's
  components).
- Folder layout per §66 — each section type in its own folder, registered in one
  `registry.ts`.

**Done when** a project page renders a Task List section and a Rich Text section from
seeded data, and a new section type can be added by touching only its own folder
plus one registry line.

**Do not** implement layout modes yet — one plain vertical stack is enough here.

---

### Slice 9 — Layout modes: flow vs grid

**Status:** done — plan: [docs/plans/09-layout-modes-flow-vs-grid.md](docs/plans/09-layout-modes-flow-vs-grid.md) — `/prototype/state` now persists each project's flow/grid experiment flag, and the project canvas renders the same 12/8/6/4 presets as either a vertical flow or wrapping 12-column grid. Real pointer drags in both modes survived reload; every width was exercised in both modes after reload, and `.prototype/data.json` ended with `project-launch` in grid mode, its brief at position 0/span 8 and Task List at position 1/span 4. View Mode retains collapse and content interactions while Edit Layout Mode owns drag, size, settings, Duplicate, Remove, and Quick Add. Review fixes keep domain-owned sibling positions out of UI previews, reject stale writes after project navigation, and remount canonical DOM order after a failed mixed-grid move. Verified by `pnpm test`, `pnpm lint`, `pnpm build`, and the plan's real-browser/data acceptance sequence.

**Goal:** Both candidate layouts exist and can be compared with real data.

**Spec:** §27, §28, §32

**Build**

- `projectLayoutMode` on the project: `flow | grid` (§28).
- **Flow layout**: Notion-like vertical stack, drag reorder, collapse, size presets.
- **Grid layout**: 12-column CSS grid, sections carry `columnSpan` (12/8/6/4) —
  no absolute X/Y (§27).
- **Edit Layout Mode** vs **View Mode** (§32). Edit mode reveals drag handles, sizing
  controls, remove controls, add-section buttons, section config. View mode stays clean.
- Angular CDK drag-drop for reordering — do not hand-roll pointer sorting (§32).

**Done when** you can switch one project between flow and grid, reorder sections by
dragging in both, and the layout persists.

**Do not** build a freeform/absolute canvas. Deciding against it is a finding the
prototype should produce, not an assumption to implement.

---

### Slice 10 — The remaining first-milestone sections

**Status:** done — Sub-Projects, all three canonical progress formulas, Reflections,
and derived Timeline are implemented and exercised against `nested-projects` and
`busy-week`; plan: [docs/plans/10-remaining-first-milestone-sections.md](docs/plans/10-remaining-first-milestone-sections.md)

**Goal:** Enough section variety to evaluate the project page seriously.

**Spec:** §30, §36, §38, §39, §81

**Build**

- **Sub-Projects** section — nested project list + create-child (§23 hierarchy).
- **Progress** section, with all three formulas behind a feature setting (§39):
  count-based, weighted, manual. Selectable per project.
- **Reflections** section (§36): write, timestamp, optional title, edit, chronology.
  Optional prompts ("What changed?", "What went well?", "What's blocked?",
  "What should happen next?"). `ReflectionService` in domain.
- **Timeline** section (§38): derived from project range, sub-projects, task ranges,
  milestones. Density and readability matter; scheduling logic does not.

`ProgressService` and `TimelineService` live in `packages/domain` and derive from
existing entities — no duplicated records (§37, §38).

**Done when** the `nested-projects` and `busy-week` seeds produce project pages that
are genuinely worth looking at, with all three progress formulas switchable.

**Do not** build the Calendar, Milestones, AI Summary, or Recent Activity sections
yet — Calendar is Slice 18, the others attach in Slices 11 and 13.

---

### Slice 11 — Dashboard

**Status:** done — plan: [docs/plans/11-dashboard.md](docs/plans/11-dashboard.md) — `/app`
renders §25's widget model from the persona's own widget list, over one derived
`GET /api/dashboard`. **Layout and content were split** (its own [decision
entry](docs/decisions/2026-08-dashboard-layout-and-content-split.md)): widgets come from
`IdentityProvider`, content from one call, because the widgets overlap — the digest counts
exactly what Today lists — and separate derivations over separate clock readings could
contradict each other on screen. Each registry definition exposes an optional `queryFrom`,
so §25's opaque `config` is read only inside the widget that owns it. **Fun Fact was kept
out of `AIProvider`** ([entry](docs/decisions/2026-08-prototype-ai-scope-and-fun-fact.md)):
§42 pins the interface to two methods and §24 does not call Fun Fact AI-generated, so it is
a clock-keyed fixture rotation in `DashboardService`. A new `packages/domain/src/calendar.ts`
holds the UTC date arithmetic, because deriving "seven days after the clock's day" is what
would otherwise smuggle a `new Date(ms)` past §45's lint. `generateProjectSummary` ships
implemented and tested with no caller, the way §9's `TaskGateway` did. Verified in the
browser against `busy-week`, `overdue-chaos` and `empty` — every widget has a real empty
state, an unregistered type renders an honest note, and switching persona changed both the
layout and the request (`?upcomingDays=14`). `PROTOTYPE_AI_PROVIDER=real` was run: the host
starts and `/api/projects` still answers 200, but `GET /api/dashboard` fails as a whole
rather than degrading — the digest is part of that one read, so `/app` shows an error and
no widgets, and the message naming the fix reaches the host's console while the response is
an opaque `internal_error`. That is §44 satisfied (`mock` is the default, so real AI is
never *required*) and is the price of the single-read design. One defect the unit tests missed showed up only in the browser — overdue rows printed
the due *time*, so five days-old tasks all read as "23:00" tonight; they now print the
date, with a test. **Deferred to Slice 12:** the simulated-date control, which the
dashboard needs more than any other surface — against the real date every seed is a wall of
overdue work and the due-today group is permanently empty.

**Goal:** A configurable widget surface answering "what should I do today?"

**Spec:** §24, §25, §42, §43, §44

**Build**

- `DashboardService` in domain: today, upcoming (configurable range), active
  projects, recent progress — all clock-driven (§45).
- `DashboardStore` + widget host honoring the §25 widget model with sizes
  `small | medium | wide | full`. Preset sizes only — no pixel resizing (§25).
- Widgets: **Today**, **Upcoming**, **Active Projects**, **Recent Progress**,
  **Daily Digest**, **Fun Fact**.
- `AIProvider` interface (§42) + `PrototypeAIProvider` composing deterministic,
  fixture-backed text that reads as AI-generated (§43) — no API key required.
- `PROTOTYPE_AI_PROVIDER=mock|real` env switch with the real adapter stubbed but
  never required (§44).

**Done when** `/app` shows a dashboard whose content changes meaningfully when you
change the simulated date or load a different seed.

**Do not** build dashboard drag-configuration yet (Slice 23). Hidden/reorder via
config values is enough.

---

### Slice 12 — Development panel

**Status:** done — plan: [docs/plans/12-development-panel.md](docs/plans/12-development-panel.md)
— Ctrl/Cmd+Shift+D opens §46's panel over any route, and `/prototype/state` renders the same
`DevPanelControls` so no control exists twice. **Latency and failure rate did not become host
endpoints** ([decision](docs/decisions/2026-08-latency-and-failure-live-in-the-client.md)):
§63's revert is a client behaviour, so the injection sits in the gateway, and the measurement
that matters came from the running app — the task row painted complete immediately while the
`POST /complete` request did not start for **3014 ms**, and at 100 % failure the same click
reverted with `.prototype/data.json` still holding no `completedAt`. The panel keeps its own
`PrototypeControlPort`, verified reachable while the work-manager gateway was failing every
call; **Layout Mode is the one control that is not**, because `projectLayoutMode` is a domain
field, and the panel says so rather than hiding it.

Reseeding without a restart went **through** the unit-of-work lock rather than around it. The
first design added a `reload()` that asserted no unit was open, which the plan review showed
was unsound: `unitOfWorkFor` queues units that have not yet registered a token, so the swap
would have landed under a pending write. `DataStore.replaceActiveDocument` runs inside the
unit instead, and a test pins the ordering. A residual window remains and is documented —
`actorFor` snapshots outside the lock, so a write racing your own reseed 404s rather than
persisting across seeds.

Host-state changes **reload the app** — still true after Slice 16, and now on purpose rather
than for want of a stream: a seed swap, a clock move and an AI-provider switch change what
every derived read on every page means at once, and one reload is cheaper and more legible
than a fan-out of quiet refreshes. Slice 16 broadcasts `prototype.reloaded` so the *other*
tabs refresh, and removed the layout control's reload entirely. This forced
delay/failure/flags into `sessionStorage` so the panel's own reload cannot wipe them; the
theme is deliberately excluded, which is what keeps "switch persona changes the theme"
demonstrable ([entry](docs/decisions/2026-08-development-panel-surface.md), which also closes
the theme entry's open question). §79 notes are stamped with **real time, never the simulated
clock** — verified by writing a note while the clock sat on 2026-08-18 and getting a
2026-08-29 timestamp, with all 39 prior entries preserved including their `slice` field.

Verified in the browser: setting the date *backwards* to 2026-08-18 moved `overdue-chaos`
from five overdue tasks to one due-today and three upcoming, with the digest, the header date
and the clock-keyed Fun Fact all re-derived; `nestedProjects` flattened a three-deep tree and
restored it with **no reload** (a computed over a signal); `gridProjectLayout` rendered a
`grid` project as flow while leaving `grid` stored, so turning it back on restores the
project's own choice; and the AI provider went mock → real (500) → mock without a restart.
**Agent Connection was deferred to Slice 13**, which landed it as a read-only roster. Using the panel surfaced five
notes, the sharpest being that the host read the generic `PORT` — so any tooling that set
`PORT=4200` made `pnpm dev` start the host *on the web port*, and every page load returned
`{"error":"not_found"}` while both processes reported success. (Fixed after Slice 13, once it
had cost time a fourth time: the host reads `CWM_HOST_PORT` and ignores `PORT` —
[entry](docs/decisions/2026-08-host-port-is-not-the-generic-port.md).)

**Goal:** Every prototype variable is adjustable at runtime.

**Spec:** §22, §46, §47, §63, §79

**Build**

- Ctrl/Cmd+Shift+D panel (§46) controlling: Persona, Seed, Current Date, Theme,
  Layout Mode, AI Provider, Network Delay (none/300ms/1s/3s), Failure Rate,
  Feature Flags. Agent Connection joined in Slice 13.
- Host endpoints backing it: load seed, reset, set simulated date, set AI provider,
  capture a note. **Latency and failure rate are not host endpoints** — they live in the
  Angular gateway, where §63's optimistic revert can actually be observed
  ([decision](docs/decisions/2026-08-latency-and-failure-live-in-the-client.md)).
- Central `PrototypeFlags` (§47): `gridProjectLayout`, `nestedProjects`, `subtasks`,
  `manualProgress`, `aiSummarySections`, `agentConfirmations`. One flag service —
  never scattered `if (prototypeMode)` checks.
- Latency and failure injection in the prototype gateway, so Slice 7's optimistic
  paths are actually testable (§63).
- **Add Prototype Note** button (§79) capturing route, project, timestamp, and note
  into `.prototype/notes.json`.

**Done when** you can switch persona, load `overdue-chaos`, set the date to next
Friday, and dial latency to 3s without restarting anything.

---

## Phase 3 — MCP (Slices 13–16)

MCP is treated as a real product experiment (§48), not an integration chore.

---

### Slice 13 — Agent connections, permissions, activity

**Status:** done — plan:
[docs/plans/13-agent-connections-permissions-activity.md](docs/plans/13-agent-connections-permissions-activity.md)
— §51's tokens resolve to `ActorContext`s, the domain enforces §53's grants, and §57's feed
tells the three actors apart on both the project canvas and the dashboard.

**Permissions live on the actor, and connection management is not a permission**
([decision](docs/decisions/2026-08-permissions-live-on-the-actor.md)). The caller asserts
identity, the domain asserts capability: `ActorContext`'s agent variant carries the grant and
every public service method calls `assertPermitted`. Both plan reviewers independently found
the same hole in the first draft — an agent able to edit connections could grant itself the
permission it had just been denied — so `AgentConnectionService` is **user-actors-only** and
`AgentPermissionSchema` deliberately has no `agents.*` member. A second thing only the build
showed: write paths look their own targets up, so with the check on `get` a grant of
`tasks.write` alone was silently unusable. Each service now has a private unchecked `require`
for its own lookups, pinned by a test.

**Tokens are fixtures, not records**
([entry](docs/decisions/2026-08-agent-tokens-are-fixtures-not-records.md)): §52's shape has no
token field, so `prototype-user-a-readwrite` lives beside the seeds and is only a *pointer* —
the live connection is re-read on every request, which is what makes §53's "immediately"
true. It rides on `/prototype/state` and is asserted absent from `GET /api/agent-connections`.
§53's "Last used" is a **throttled** write
([entry](docs/decisions/2026-08-last-used-is-a-throttled-write.md)): unthrottled it would make
every agent *read* clone, twice-validate and rewrite the whole data file on one lock. The
comparison is on distance rather than elapsed time, or §46's backwards date control strands
the stamp in the future and freezes the label for the session.

The feed **composes** from structured parts with a live `entityTitle`
([entry](docs/decisions/2026-08-activity-feed-composes-from-parts.md)), which answers the open
question Slice 5's summary-ownership entry left for this slice: `summary` is kept as the
human-readable line in `data.json`, and nothing in `apps/web` reads it. §46's Agent Connection
control is a **read-only roster** with copyable tokens
([entry](docs/decisions/2026-08-agent-connection-panel-control-is-a-roster.md)) — a second
permission grid would break Slice 12's "no control exists twice".

Verified in the browser against `agent-heavy`: unticking **Modify tasks** in Settings → AI &
Agents made the agent's very next `POST /api/tasks` answer
`403 {"error":"permission_denied","message":"connection \"agent-claude\" is missing permission \"tasks.write\""}`
with nothing restarted, and revoking the connection turned the same token into a 401.
`scripts/agent-acceptance.mjs` walks that path against a real host. Completing a task in the
Task List put a new row at the top of Recent Activity beside it with no refresh (the section
reloads on `projectDataRevision` — one line, and easy to have missed). Two defects the new
component specs caught: a refused permission toggle left the checkbox visually moved, because
the browser owns that state and `[checked]` will not put it back; and a failed load rendered
"no agent has been connected" over the error. §53's grid renders **all seven** permissions
rather than the mock's five, with `workspace.read` labelled as the superset grant it is.

**Deferred:** §53's page has no link from a roster row to its connection, and the panel's
timestamps and the dashboard tile's row height both drew friction notes (§79, six entries).
Slice 12's `PORT` finding **bit again** during this slice's own browser verification, which
was the fourth time it had cost someone time — so it was fixed rather than noted again: the
host reads `CWM_HOST_PORT` and ignores `PORT` entirely
([entry](docs/decisions/2026-08-host-port-is-not-the-generic-port.md)).

**Goal:** The permission model exists and is visible, before any MCP wiring.

**Spec:** §51, §52, §53, §57

**Build**

- `AgentConnection` records in the store; the `agent-heavy` seed (§16).
- `PrototypeAgentAuthenticator` (§51): resolves
  `Authorization: Bearer prototype-user-a-readwrite` to
  `{ userId, connectionId, permissions }`. **Bind the listener to localhost only** —
  these tokens have no security value and must not be reachable off-machine.
- Permission checks enforced in the domain/tool layer, not at the transport.
- Settings → AI & Agents UI (§53): per-connection permission grid, last-used
  timestamp, Revoke. Changes take effect on the next call, immediately.
- Activity feed distinguishing user / agent / system actions visually (§57), plus a
  **Recent Agent Activity** dashboard widget and a **Recent Activity** section type.

**Done when** revoking `tasks.write` in the UI causes the next write attempt to fail
with a clear permission error.

**Do not** implement OAuth (§51, §80).

---

### Slice 14 — Tool registry + in-process contract tests

**Status:** done — plan:
[docs/plans/14-tool-registry-contract-tests.md](docs/plans/14-tool-registry-contract-tests.md)
— §54's fourteen tools exist as §55 definitions over the domain services, and a 70-test
suite proves every one of them on both its success and its permission-denied path with no
socket open.

**No MCP SDK in this slice**
([decision](docs/decisions/2026-08-tool-registry-is-transport-free.md)). The *Build* bullet
below says "calling the SDK handler in-process"; what settled it was Slice 15's own *Build*,
which owns the SDK version, the protocol target and `createMcpHandler()` — the *Do not*
forbids only **starting an endpoint**, and an in-process handler starts nothing, so it does
not decide the question. Three obligations move to Slice 15 as a result and are listed
there: `tools/list` as a protocol response, agent revocation, and §60's handler path itself.
`SPEC_TOOL_NAMES` is exported so both slices assert one list.

**The registry declares permissions; the domain enforces them.** A second check in the
registry would be a second source of truth, and the first to drift would be the one no test
covered. `contract.test.ts` pins the two together from both sides — and the load-bearing
half is that **success is asserted under `[tool.permission]` alone**. A "sufficient" grant
would prove each permission *necessary* and never *sufficient*, and would have passed a
design that was unusable in practice: composing the checked services inside
`search_workspace` makes it demand three grants where §53's grid offers one. Hence
**`WorkspaceService`** ([entry](docs/decisions/2026-08-workspace-tools-need-their-own-service.md)),
which asserts `workspace.read` alone and reads the repositories as `DashboardService`
already did. All fourteen tools pass under their minimal grant.

That entry closes the "revisit when" Slice 13 left open, and the answer is uncomfortable:
`workspace.read` got **wider**. `search_workspace` covers reflections (§40 lists them), so
the grant is now a partial superset of three read permissions — and it produces a **dead
end**, handing an agent reflection hits it cannot open — no tool takes a reflection id at all, and `list_reflections` on the hit's project needs `reflections.read`. What leaks
is a substring oracle and a title rather than the text, which is a smaller and stranger leak
than expected. Recorded rather than designed around; Slice 15 is where a real client shows
whether it matters.

`task-windows.ts` ended a duplication rather than adding a third copy: `DashboardService`
defined the open-status set once and spelled the overdue condition out again a few lines
below its own helper. Both now share one definition, plus the dashboard row projection
`get_upcoming_work` reuses whole. Two things the build showed that the plan had not:
`complete_task` pointed at the seed's already-done task would have passed a "the entity is
there afterwards" assertion **having done nothing**, because completion is idempotent — so
the contract table pins inputs that genuinely change; and the `agent-heavy` seed has no
foreign-workspace project at all, so the harness injects one, or "a foreign id is not found,
not forbidden" would have silently tested the missing-id branch instead.

The **diff** review then found three things the tests as written did not: a reflection with
an empty-string title would have made `search_workspace` throw *permanently* — the hit
schema was stricter than the record it projects, so one blank title poisons every later
search matching that row; `limit` applied to a kind-ordered list could starve a whole kind,
which is the opposite of why §40 wants one combined search; and two tests were weaker than
their names — "orders deterministically" passed against no sort at all, and the archived
case archived the project, so it could not tell the two exclusion rules apart. All fixed and
pinned. The regex import lint was also replaced: review showed three bypasses, so
`packages/domain`'s AST allowlist walker moved to `scripts/check-package-imports.mjs`, took
`--allow`/`--label`, and now guards both packages from `lint`.

**Deferred:** no milestone search — §40 lists milestones and Slice 19 owns them; and
reflection text matching sits in the service rather than the repository, because
`ReflectionQuery` has no `search` member and adding one would change three files for one
caller (Slice 21's to resolve).

**Goal:** Tool semantics exist independently of MCP plumbing, and are tested without
opening a socket.

**Spec:** §54, §55, §60, §69

**Build**

- `packages/mcp-tools`: the `WorkManagerTool` interface (§55) — name, description,
  required permission, Zod input schema, `execute(input, context)`.
- The §54 tool set:
  - Projects: `list_projects`, `get_project`, `create_project`, `update_project`
  - Tasks: `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`
  - Reflections: `list_reflections`, `add_reflection`
  - Workspace: `search_workspace`, `get_upcoming_work`, `get_dashboard_context`
- Every tool calls domain services — never repositories directly.
- Contract tests calling the SDK handler in-process (§60): `tools/list`, input
  schemas, results, permission denials, errors, activity logging, revocation.
  **Built without the SDK** — input schemas, results, permission denials, errors and
  activity logging are covered against the registry directly; `tools/list`, revocation and
  §60's handler path are Slice 15's, and are listed there.

**Done when** contract tests cover every tool's success and permission-denied paths
and run without a listening port.

**Do not** start the HTTP endpoint yet — keeping the registry transport-free is the
point of this slice.

---

### Slice 15 — MCP HTTP endpoint (and stdio)

**Status:** done — plan: [docs/plans/15-mcp-http-and-stdio.md](docs/plans/15-mcp-http-and-stdio.md) — official SDK v2 serves the identical fourteen-tool registry over modern `2026-07-28` Streamable HTTP and stdio; real clients list tools, create tasks, and find them in separate file-backed stores. HTTP authenticates every request, stdio reloads/authenticates every call, and the documented safe workflow avoids cross-process lost updates.

**Goal:** A real MCP client can connect and drive the workspace.

**Spec:** §49, §50, §59

**Build**

- Official MCP TypeScript SDK **v2**, protocol target **2026-07-28**.
- `createMcpHandler()` mounted at `http://localhost:4310/mcp` using the SDK's modern
  HTTP serving path — do not hand-implement the protocol (§50).
- `pnpm mcp:stdio` entry registering **the identical registry** (§59).
- Bearer token → `ActorContext` via Slice 13's authenticator. (§55 said `AgentContext`;
  the spec was corrected in Slice 14 — there is one actor type, and it is the domain's.)
- `docs/mcp-setup.md`: how to point Claude Desktop / Cursor at both transports.
- **Three contract obligations inherited from Slice 14**
  ([why](docs/decisions/2026-08-tool-registry-is-transport-free.md)), all of §69's list:
  `tools/list` as a real protocol response asserted against `SPEC_TOOL_NAMES`; **agent
  revocation** end to end, which needs a token and a handler in the same test because
  revocation is an authenticate-time refusal with nothing for a registry-level test to
  observe; and §60's in-process SDK-handler path itself.

**Done when** a real MCP client lists tools, creates a task, and that task is present
in `data.json` — over both HTTP and stdio.

---

### Slice 16 — Live updates

**Status:** done — original plan: [docs/plans/16-live-updates.md](docs/plans/16-live-updates.md), correctness follow-up: [docs/plans/16-live-updates-correctness-follow-up.md](docs/plans/16-live-updates-correctness-follow-up.md) — the follow-up closed derived-section propagation, first-connect/reconnect recovery, shared-store duplication, failed-first-load recovery, and quiet-read races found in the post-slice audit. One
frame per §57 activity record, held until the unit of work commits, over
`GET /prototype/events`. An agent's `complete_task` reaches an open project page in ~14 ms
with the write already readable, and the feed names the connection. Watched in a real
browser, not only asserted: `pnpm dev`, project page open, `complete_task` through a real MCP
client — the row ticked and struck through, the header went 25% → 50%, its Overdue tag
dropped, and Recent Activity's newest line became *Claude — Completed "Document the tool
input schemas"*, with no refresh. A project created by `curl` appeared in the sidebar the
same way. Four §79 notes recorded.

Three things the plan did not start out knowing. Emission rides `ActivityService.record`, so
it is **at most** one event per operation rather than exactly one — no-op writes announce
nothing, and `AgentConnectionService.touch` announces nothing at all, which is why §53's
"Last used" does not live-update ([entry](docs/decisions/2026-08-live-events-ride-the-activity-record.md)).
Ordinary mutation and reconnect reads are *quiet* — no loading flag, no cleared data, no
error on failure — because an agent's write or a transport recovery must not flicker a
skeleton over a page someone is reading. A `prototype.reloaded` frame is the deliberate
exception: it performs a loud page load because the host document, clock and provider may
all have been replaced. The task list and the section canvas each defer behind an optimistic
write in flight, since the host flushes its frame at commit, which is before the tab's own
response lands. Slice 12's
three parked `location.reload()` calls were decided one by one: the layout control's is gone,
persona switching and the host-state controls keep theirs (see below), and other tabs now get
`prototype.reloaded` instead.

The post-slice exercise covered the sections the original acceptance missed. One HTTP-MCP
batch completed a task, added a reflection and created a child project; Progress, Timeline,
Reflections, Sub-projects and the sidebar all changed in the open page. Then a second task
completion was committed while the browser's stream endpoint was offline: the tab stayed at
50%, reconnect alone moved it to 75% and updated Timeline, and no second mutation was needed.
The follow-up also pins one shared Progress read for duplicate sections and recovery from a
failed first project-page load. The observation is in `.prototype/notes.json`.

Not delivered, deliberately: stdio MCP writes do not reach the browser — separate process,
separate store, and the fix is the sync infrastructure §62 forbids
([entry](docs/decisions/2026-08-live-updates-are-http-only.md)).

**Goal:** Agent changes appear in the open browser without a refresh.

**Spec:** §6, §62

**Build**

- `GET /prototype/events` — Server-Sent Events emitting
  `{ type: "task.updated", entityId: "task-123" }` (§62).
- Emission at domain operation boundaries, so web, MCP, and dev-panel mutations all
  broadcast identically.
- Angular subscribes and refreshes the affected feature stores. Targeted refresh,
  not full-app reload.
- Reconnect on drop.

**Done when** an agent completing a task via MCP visibly checks it off in an open
project page within a second, and the activity feed shows the agent as actor.

**Do not** build real-time sync infrastructure — CRDTs, presence, and conflict
resolution are all out of scope (§62).

---

## Phase 4 — Milestone completion (Slice 17)

---

### Slice 17 — Design Lab, Storybook, and the end-to-end tests

**Status:** done — plan: [docs/plans/17-design-lab-storybook-and-e2e.md](docs/plans/17-design-lab-storybook-and-e2e.md).
The First Prototype Milestone is closed: [docs/first-milestone-walkthrough.md](docs/first-milestone-walkthrough.md)
carries a numbered click-path for every §81 bullet across all eight groups, naming the seed
each one needs. Both e2e tests pass, twice in a row, from a clean checkout.

**The slice's own *Build* list was written in Phase 0 and four of its items had since been
delivered elsewhere** — the state inspector by Slice 12, all four named component tests, and
`docs/decisions/`'s first entry. The list below is corrected rather than quietly satisfied.
What it was missing is the opposite: three §81 bullets — create, edit and archive project —
had no UI at all, and the web e2e test could not have been written without the first of them.

**The token file is now structured around the knobs.** Each theme block holds only base
literals; every derived token is expressed once under bare `:root`, so a knob moves both
themes. The first structure would have made surface contrast and elevation **silent no-ops in
light**, where `:root[data-theme='light']` re-declared the same tokens as literals at higher
specificity. Appearance is unchanged at the defaults, and that was measured in a browser
rather than asserted: the three surfaces paint exactly `#1b1e24`/`#23272f`/`#101216` in dark
and `#ffffff`/`#ffffff`/`#eceef2` in light, `--space-4` is 16px, `--radius-md` is 8px, and
each shadow keeps its own per-theme alpha. Two limits are stated on the controls themselves
rather than left to be discovered — surface contrast reduces only, and the accent knob moves
`--color-accent` alone ([entry](docs/decisions/2026-08-design-lab-tokens-are-session-knobs.md)).

**Storybook works on the preview Vite framework**, so decision 1's fallback was not taken.
The spike found two things planning could not: Compodoc is on by default and is a CLI this
repo does not install, and `@analogjs/vite-plugin-angular` looks for a tsconfig at exactly
`.storybook/tsconfig.json` — without it every component renders as *"Component 'TaskRow' is
not resolved"* ([entry](docs/decisions/2026-08-storybook-runs-on-the-vite-framework.md)).
`TaskRow` ships **six** of §4's seven variants; *Agent Modified* has no data behind it and
inventing task-level attribution is a §58 question
([entry](docs/decisions/2026-08-agent-modified-has-no-data-behind-it.md)).

**The defect that mattered most** was the same class as the four commits that closed Slice 16:
optimistic project writes had no in-flight guard, so `onLiveEvent` would route a `project.*`
frame into `refreshProject()` and overwrite an optimistic rename with the frame its own write
produced. `pendingSectionWrites` is now `pendingWrites`, incremented by both `writingSections`
and a new `writingProject`; three check sites unchanged. Mutation-checked.

**The e2e suite found one thing reasoning did not:** the host binds `127.0.0.1` only while
`ng serve` listens on `[::1]`, so a single tidy probe address times out one of them after
three minutes with no explanation. Each `webServer` entry now names the address its server
actually binds ([entry](docs/decisions/2026-08-e2e-owns-its-servers-and-its-data.md)).

**The fresh-resolve install check found something that was not ours.** Deleting
`node_modules` *and* `pnpm-lock.yaml` and running plain `pnpm install` — the only check that
exercises resolution, and so the only one that proves the `minimumReleaseAgeExclude` entries
are complete — resolved every Storybook package cleanly and moved Angular 22.1.3 → 22.1.4,
which cost **+107 kB** in the framework chunk on its own. The committed lockfile stays on
22.1.3; the finding is in the budget entry.

**The bundle budget moved from 725 kB to 850 kB, deliberately and with the measurement.**
Lazy-loading the two `prototype/*` routes moved 1.4 kB, exactly as the plan predicted: `App`
mounts the development panel globally, so the panel and its controls stay eager whatever the
routes do. The catalogue did **not** add materially, which is what "the catalogue shows real
components" was supposed to buy ([entry](docs/decisions/2026-08-initial-bundle-budget.md)).

Not delivered, deliberately: no component library extraction (the primitive panels are the
evidence for it, not the doing of it), no `@storybook/addon-vitest`, no third e2e test, no
project delete, no `/projects` index route, and no lazy-loading of the development panel —
that last one would reopen a Slice 12 decision about how §46's chord reaches every route.

**Goal:** Close out the First Prototype Milestone with the tools that make design
iteration fast.

**Spec:** §4, §19, §20, §21, §22, §26, §62, §63, §65, §67, §68, §69, §78, §81

**Build**

- **Storybook** (Angular integration) with stories for the reusable components —
  at minimum the `TaskRow` and `ProjectSection` variant sets named in §4.
- **Design Lab** at `/prototype/design` (§67): buttons, inputs, task rows, cards,
  project cards, widgets, section frames, navigation, drawers, menus, and the
  empty/loading/error states, with live token controls (§22): radius, spacing
  density, surface contrast, accent, font scale, elevation, sidebar width.
- **Project create, edit and archive** — added to this list by Slice 17 because *Done
  when* required it. Three §81 bullets had no UI at all: nothing created a *top-level*
  project, the header rendered name/status/target date read-only with §26's More control
  disabled, and archive was reachable only from the domain. The web e2e test below could
  not have been written without the first of them.
- The two end-to-end tests, and only these (§69):
  1. **Web:** load seed → create project → create task → dashboard shows task.
  2. **MCP:** agent calls `create_task` → task appears in the web UI → activity feed
     attributes it to the agent.
- ~~`/prototype/state` — seed/state inspector (§68)~~ — **delivered by Slice 12.**
  Verified here, built there.
- ~~Component tests for `TaskRow` completion, section collapse, section configuration,
  and dashboard widget states~~ — **all four already existed** (`task-row.spec.ts`,
  `project-section-frame.spec.ts` ×2, `dashboard-page.spec.ts`). §69 was already
  satisfied; this slice added only the tests its own new code earned.
- ~~Seed `docs/decisions/` with the first entry — flow-vs-grid~~ — **done long ago.**
  Forty entries existed before this slice, including the flow-vs-grid one.

**Done when** every §81 checklist item is demonstrable and both e2e tests pass.

> **Stop here and use the prototype.** Slices 18+ should be selected by what actually
> caused friction, not built in order. That is the whole point of §77 and §82.

---

## Unnumbered phase — Container sections own their rows

The first phase chosen the way §82 asks for: by friction, not by slice order. Using the
prototype after Slice 17 showed the defect the whole build order had walked past — an agent
could `create_project` and fill it with tasks over MCP and get a canvas that reads as empty,
because nothing made sections and the MCP surface had no section tools. Sections were views
over the project's rows, so two Task Lists on one project rendered the same query twice.

**Status:** done — decision: [docs/decisions/2026-09-sections-own-their-data.md](docs/decisions/2026-09-sections-own-their-data.md),
plan: [docs/plans/2026-09-section-ownership-implementation.md](docs/plans/2026-09-section-ownership-implementation.md).
Rows carry `sectionId`; containers (`task-list`, `reflections`) own theirs and views
(`progress`, `sub-projects`, `timeline`, `recent-activity`) own nothing. Creating a row with
no section named resolves to the project's first matching container and otherwise calls
`SectionService.add` — a default layout is the existing operation reached by a different
door, not a second code path. Removing a container takes a policy: `cascade` archives its
rows, `reassign` moves them. (Removal no longer *deletes* anything — the archive phase below
made it archive the section too, so the "removing a view touches no data" this phase shipped
is now "removing a view archives it with its config".) The MCP registry grew from
fourteen tools to eighteen (`list_sections`, `create_section`, `update_section`,
`remove_section`).

`SCHEMA_VERSION` went 1 → 2 with **no migration**, deliberately — `PrototypeDocumentSchema`
pins the literal so a stale `.prototype/data.json` fails at load rather than halfway through
a session, and `pnpm prototype:reset` rebuilds it. Three deviations from the plan, all
recorded in it: `Reflection` gained `archivedAt` (the plan's "it already exists" was true only
of `Task`, and without it a `reflections` cascade would have had to hard delete);
`TaskQuery`/`ReflectionQuery` gained `sectionId`, without which a section-scoped list cannot
read what its container owns; and two seeds changed shape rather than only ids, because under
ownership an empty canvas and an unrendered row are the same defect.

Verified in the running app on the `personal-workspace` seed, not only by the 1122-test suite:
`POST /api/tasks` with no `sectionId` created the container that renders it; a second Task
List took a dragged task across and the two lists then differed across a reload; removing a
Progress section moved no data and asked nothing; and cascading a non-empty Task List left its
task in `data.json` with `archivedAt` set. That pass produced two friction notes — the removal
dialog prints the raw domain error (section id, "1 tasks") and its reassign select names the
section *type*, because nothing in the app sets the `title` §31 already allows; and cascade leaves the archived
row's `sectionId` pointing at a removed section, which nothing validates and nothing unarchives.

**Deferred:** scoping a view to a single container (the decision's "revisit when"), a
container type for milestones, and any UI for the `reassign` policy beyond the dialog's select.

---

## Unnumbered phase — A section has a name

The second friction-chosen phase, from the first of the two notes the ownership phase's
browser pass left (`note-2026-09-01-001`). The removal dialog printed the domain's own
sentence — a section id, "1 tasks", and the policy vocabulary — and its reassign select named
the section *type*, so three Task Lists on one canvas offered three identical options.

**Status:** done — decision: [docs/decisions/2026-09-a-section-has-a-name.md](docs/decisions/2026-09-a-section-has-a-name.md),
plan: [docs/plans/2026-09-section-names-implementation.md](docs/plans/2026-09-section-names-implementation.md).
`nameOf` in `packages/contracts` is now the single expression every naming surface uses — the
frame header, the removal dialog, Rich Text's aria-label, `SectionService`'s activity summaries
and, since the archive phase below, the Archived region — over a derivation from the `type`
string plus a one-entry `SECTION_DISPLAY_NAMES`
table that `sub-projects` earns. `title` stays an optional override, defaulted at read time,
with a placeholder-driven Name field at the top of the frame's inspector; that made
`This section has no settings.` unreachable and it is gone. No `SCHEMA_VERSION` change, no
new route and no new MCP tool — the write path already shipped end to end and only the
control was missing.

The one structural change is the refusal: `DomainRuleError` gained an optional `details`
record, the non-empty removal fills it with a discriminated
`{ reason: 'section_not_empty', liveRowCount }`, `api/errors.ts` forwards it, `GatewayError`
preserves it untrusted, and `ProjectPageStore` opens the dialog **only** when that payload
parses. `ProjectPageStore` holds no rows by design, so a count it could not be told was the
thing standing between the domain's agent-facing sentence and a person's question.

Verified in the running app on `personal-workspace`, not only by the 1354-test suite: the
Name field renamed a Task List to `Backlog` and cleared back to `Task List` with `title`
**absent** from `data.json` rather than stored as the literal default; committing whitespace
left the field empty rather than showing the spaces; a Sub-Projects frame read `Sub-Projects`;
under 100% failure injection a rejected rename left header, field and a visible error exactly
right; the dialog read `Remove “Backlog”?` / `It still holds 3 tasks.` and offered `Shipped`
by name beside two untitled lists distinguished by canvas position, with no id anywhere;
removing a Progress view asked nothing; and `data.json` carried
`summary: "Removed the Backlog section"`. Over a real MCP client, `update_section` trimmed a
padded title, refused a whitespace-only one, and `null` cleared the override.

**Deferred:** a resolved `name` in `list_sections` output, a `rename_section` tool shape
experiment (§56, Slice 24), and renaming from the frame header in View Mode — recorded as
`note-2026-09-04-001`, which is the same "the thing you look at is not the thing you change"
shape as the Slice 17 project-header notes.

---

## Unnumbered phase — Archive keeps its promise

The third friction-chosen phase, from the second of the two notes the ownership phase's browser
pass left (`note-2026-09-01-002`). Cascading a container archived its rows and hard-deleted the
container, so every archived row pointed at a section that no longer existed — and nothing in
the repository had ever cleared `archivedAt`, so the "this is undoable" the ownership decision
rested on was a claim with no operation behind it.

**Status:** done — decision: [docs/decisions/2026-09-what-undo-means-for-an-archived-row.md](docs/decisions/2026-09-what-undo-means-for-an-archived-row.md),
plan: [docs/plans/2026-09-archive-restore-implementation.md](docs/plans/2026-09-archive-restore-implementation.md).
Removing **any** section now archives it; nothing hard-deletes. A cascade takes the container
down with its live rows, each stamped `archivedWithSectionId`; a reassign moves the rows out
and archives the emptied section, marking nothing. `restoreSection` is the canonical undo and
restores exactly what the removal took — a row archived beforehand stays archived.
`TaskService.archive` now cascades to live descendants under `archivedWithTaskId`, with
`restore` as its mirror, and `ReflectionService` finally has the archive/restore pair it never
had. An **Archived** region at the foot of the canvas is the undo surface, visible in View Mode
because it is content rather than layout chrome (§32), and `TaskRow` gained the per-row Archive
control §34 describes and the domain had carried since the ownership phase with no caller.

No `SCHEMA_VERSION` change: every new field is optional, and the current `.prototype/data.json`
was booted unedited to prove it. The structural change is in `validateDocumentIntegrity`, which
learned the ownership invariant the previous phase left to the write path — every row's section
must exist, belong to its project and hold its kind; a live row is never in an archived section
or under an archived parent; a parent and child share a section; and each archive marker names
an archive still in progress. The document that produced the friction note now fails to load.

Corrections this phase owed rather than made quietly: §9's `TaskGateway` gained `restore`, the
ownership decision was amended on two counts it got wrong, the activity decision's rejected
soft-delete was taken, and AGENTS.md's "repositories + `Clock` only" was widened to the acyclic
domain composition the code has enforced since the ownership phase.

**Deferred:** permanent deletion — wanted, and deliberately not built here, with
`SectionRepository.remove` kept as its seam and `archivedWithSectionId` reducing it to a query
on one column. Also: archive/restore MCP tools and `includeArchived` on the list tools (§54
lists none, and an agent has no undo surface to build), project restore, and any workspace-wide
archive browser or bulk restore.

---

## Planned overhaul — Multi-page projects (Slices 25.0–25.8)

**Status:** in progress — dependency-aware roadmap:
[docs/plans/25-multi-page-projects-overhaul.md](docs/plans/25-multi-page-projects-overhaul.md),
decision:
[docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md](docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md).
Requested direction: root projects become workspaces with required Home and optional
Todos, Archive and Reflections pages; subprojects become distinct, nestable single-page
work units. Home can render shortcuts to canonical sections elsewhere in the root tree.
The roadmap records proposed semantics; it does not describe features as already
implemented or supersede the completed phases above.

The three clarifications the roadmap left open were answered by the user on 2026-09-04 and
are now settled in the decision entry: a **bounded v2→v3 converter** carries live data over
rather than a disposable reset; **Archive** means hidden from ordinary surfaces plus a real
whole-tree Archive page, with **Open archive** remaining in project controls when the tab is
disabled; **Todos** carries root tasks plus every descendant subproject and task, due date
ascending with undated last, retaining completed and cancelled rows.

| Slice | Scope | Depends on | Status |
|---|---|---|---|
| 25.0 | Resolve product rules and amend spec | — | done — §23, §26–27, §30–32, §34, §36, §54, §68, §82–83 amended; decision entry written |
| 25.1 | Root/subproject model and persistent pages | 25.0 | done — plan: [docs/plans/25.1-owner-kinds-and-persistent-pages.md](docs/plans/25.1-owner-kinds-and-persistent-pages.md) |
| 25.2 | Page ownership through domain, API and MCP | 25.1 | done — plan: [docs/plans/25.2-page-aware-ownership.md](docs/plans/25.2-page-aware-ownership.md) |
| 25.3 | Secondary sidebar, Home and subproject canvas | 25.2 | done — plan: [docs/plans/25.3-workspace-shell-and-subproject-canvas.md](docs/plans/25.3-workspace-shell-and-subproject-canvas.md) |
| 25.4 | Home shortcuts | 25.3 | not started |
| 25.5 | Chronological Todos | 25.3 | not started |
| 25.6 | Root Archive and reachable undo | 25.3 | not started |
| 25.7 | Completed-work reflections | 25.3 | not started |
| 25.8 | Integrated acceptance and documentation closure | 25.4–25.7 | not started |

**25.1, done.** `Project` is a Zod discriminated union on `kind`, so a workspace and a unit of
work differ by what the parser enforces rather than by what each call site remembers. Every
project owns exactly one canonical `ProjectPage` — `home` for a root, `work` for a
sub-project — created in the same unit of work as its owner, and every section carries a
required `pageId` that `validateDocumentIntegrity` holds in agreement with its project.
`completedAt` is derived from the status on both kinds, from the injected `Clock`.

`SCHEMA_VERSION` went 2 → 3 **with a converter**, the first time this prototype has had one:
`pnpm prototype:upgrade <path>` validates, backs the original up, then writes through a temp
file, and is a no-op on an already-converted file. It is one file for one cutover, not a
migration runner (§14). The v2 corpus it is tested against is committed at
`packages/prototype-data/test/fixtures/nested-projects-v2.json`, because this same change
regenerated the seeds it would otherwise have read.

Three things the phase found rather than planned. Two existing domain tests were passing for
the wrong reason once the new root guard landed — both staged their case by reparenting a
root, so they proved the kind guard rather than the self-parent and cycle rules they named.
Writing the create input as a union caught that a plain `z.object` *strips* unknown keys, so a
root branch that merely omitted `parentProjectId` would have accepted a parent and silently
dropped it; both the storage schema and the input now declare its absence, the input as a
`z.strictObject` because `z.undefined()` has no JSON Schema representation and the MCP
registry publishes it. And `pnpm prototype:upgrade` failed with no message at the repository
root until it resolved paths from `INIT_CWD` — `pnpm --filter` runs a script with the package
as its cwd, a trap every path-taking passthrough shares.

No navigation changed: the app looks exactly as it did, on a converted file. Verified in the
browser on the real `.prototype/data.json` after conversion, and over HTTP for both kinds,
both refusals and a default write landing on a sub-project's work canvas.

**25.2, done.** The page is now the unit of section ownership everywhere a write or a read can
reach it. `ProjectPageService` lists a project's pages and toggles a root's optional three;
`SectionService` resolves §27's three write cases — nothing supplied, a page supplied, a section
supplied — and refuses rather than falling back when a page does not hold that kind of section.
Positions are dense **per page**, so reordering Home never renumbers Reflections, and the one
project-wide read groups by page because two pages both number from zero.

Four product questions were answered rather than assumed, each with a decision entry. An
optional page's record is created by its **first enable**, which is the only reading under which
a document written by 25.1 still loads — and enabling one is the single write the archive freeze
does not cover, because §31 says undo must never be behind a toggle. A disabled page refuses
**placement** and keeps everything already on it, which is how §27's two sentences about disabled
pages stop contradicting each other. And reassigning a container's rows may cross pages within a
project, because §31 constrains the type and not the page.

The shared archived-ancestor rule landed here so Archive can ship before Todos, and closing it
turned out to need both ends. Hiding live work beneath an archived ancestor without also refusing
the two operations that produce it — reparenting under an archived project, reactivating beneath
one — would have manufactured a project that is live, invisible to every list and refused by
every write. The reactivation check is a *transition*, not a state, or it would refuse the rename
that is part of the way out.

Two things the phase found by **using** it rather than by testing it, which is the argument for
§77's step. Enabling the Reflections page and putting a container on it drew that container on
*Home*, because the canvas read was project-wide while a canvas is a page — every domain test
asserted the page filter directly, so none of them looked at what a caller passing nothing got.
`SectionService.list` now answers one page and the Archived region follows it. And the
archived-ancestor memoisation shared one walk's answer along its path, which is sound on a tree
and wrong on a cycle, where the answer is relative to where the walk began; it made the ancestry
disagree with itself depending on call order, and with the write freeze. Each query now walks its
own chain.

Three more the phase found rather than planned, all caught in plan review across five rounds
and worth recording because each would have been a silently wrong answer rather than a failure.
`SectionService.list`'s archived branch is a direct repository read that never passes through
`ordered`, so page-scoping the sort alone would have answered a page query with the whole
project. `resolveContainer` searching one page while `addWithin` created on another are two
independent resolutions of exactly the thing this slice makes ambiguous. And `TaskService.update`'s
subtask branch re-derives `sectionId` from the parent on *every* update of a task that has one, so
a disabled-page refusal placed on the branch would have refused renaming a subtask.

`LiveEvent` gained `rootProjectId`, resolved by walking the parent chain inside
`ActivityService.record` — a departure from that method reading nothing, stated in its own comment
rather than left as a surprise. A root's Todos and Archive project rows from anywhere beneath it,
so `projectId` alone cannot say which root a deep change concerns. Nothing routes on it yet; 25.3
does.

No navigation changed, and no component changed: the two new gateway methods are exercised by the
gateway spec and the fake. Verified in the browser on a converted `.prototype/data.json`, and over
HTTP and MCP for the create-a-root, nest-a-unit-of-work, enable-a-page journey and its refusals.

**25.3, done.** Opening a project is now §23's picture: the global sidebar, a second navigation
column, and the workspace. `ProjectWorkspaceShell` serves both of §68's project routes — Angular
re-uses the instance across a parameter change, so moving between a root's pages keeps the context
loaded once — and renders §26's header **once per project** above the column and whichever page is
showing. A root opens on Home; a sub-project opens on its sole work canvas, keeps its root's
column, and gets breadcrumbs back through its parents. Verified in the browser on
`nested-projects` at depth three, including creating a nested work unit from a Sub-Projects
section and watching the column gain it without a reload.

Four decisions the phase made rather than inherited. **The column lives in the projects feature**,
not in `AppShell` — placement and state are separable, and putting a root's pages and an ancestor
walk in the one store every route pays for is the mega-store §20 forbids. Placement is one
`:has()` rule in `app-shell.scss`, keyed on a declared attribute so a rename cannot silently stop
matching ([entry](docs/decisions/2026-09-where-the-project-navigation-column-lives.md)). **The
header moved to the shell**, because it describes the project and would otherwise vanish the
moment 25.5's Todos page mounted. **Quick Add moved to the canvas**, because a root has several
canvases and one header, and §26 is amended to say so. And **resolution is a positive rule** —
root, navigable kind, enabled, renderable — so `/pages/work` on a root falls back like any other
non-tab instead of rendering a sub-project canvas on a workspace.

`ProjectPageStore` became the canvas store: the sections of one page, guarded on page identity as
well as project and generation. Its project record, §39's progress and §26's writes moved to
`ProjectWorkspaceStore`. `refreshProject()` was **narrowed to `refreshSections()` rather than
deleted** — plan review caught that it was the only path re-reading the canvas on a live frame —
and its deferral counter stayed with it, because the hazard it guards is an optimistic reorder.
The three live rules are now stated separately: progress on any frame naming this project, the
record on `project.*` naming it, the tree on `rootProjectId`. Conflating them either stops an
agent's completed task from moving the header or puts a request behind every sibling's frame.

Three things found by building rather than by planning. `NgComponentOutlet` binds **inputs only**,
so the canvas reports upward through callback inputs — the plan had called them outputs, citing as
precedent the very component that uses callbacks for this reason. The Archived region was
project-scoped while the canvas became page-scoped, so Home would have listed sections archived
from another page and restoring one would have painted nothing. And a sticky column needs
`min-height` rather than `height` on its container: fixed to the scrollport's height, sticky has
nowhere to travel and the column scrolls away with the canvas — which is §23's "disappearing" by
another route.

Five review rounds on the plan before a line was written, and each round found something the
previous one had introduced: the sub-project's `work` page had no source, `routerLinkActive` would
not have marked Home current at the URL the app actually links to, the fallback notice could not
survive the redirect that produces it, and twice a spec split assigned the same test to two files.
The plan's Revisions section carries all of it.

Known: the initial bundle is 883 kB against an 850 kB **warning** budget (the error budget is
1 MB, so the build passes). §68's feature routes are eager by an existing decision, and this slice
adds a shell, a header, a column and a work item. Whether to move the budget again is a §78
question for 25.8 rather than a silent edit here.

**Done when:** the roadmap's integrated browser/MCP journey passes: a multi-page root
and nested work units retain canonical data ownership, shortcuts reflect source content,
Todos follows the agreed chronology, archived work remains recoverable, completed work
can receive reflections, and navigation/toggles persist across reloads. Each phase also
has its own executable acceptance gate; implementation follows AGENTS.md per phase.

**Do not** pull in the candidate features below, arbitrary custom pages, cross-root
shortcuts, permanent deletion or production infrastructure as part of this overhaul.

---

## Phase 5 — Second milestone candidates (Slices 18–24)

Build these **only when observed use justifies them** (§82). Listed in the order most
likely to be justified.

---

### Slice 18 — Calendar
**Spec:** §37, §30, §68

Month and agenda views derived from task start dates, task due dates, milestones, and
project deadlines — **no duplicated event rows**. Adds the Calendar section type,
the Calendar dashboard widget, and the `/calendar` route. Week view optional.

---

### Slice 19 — Milestones
**Spec:** §35, §30

`Milestone` as a distinct model (title, description, targetDate, status),
`MilestoneService`, a Milestones section type, and timeline/calendar integration.
Log the finding: does it deserve its own model, or should it become a special task?
Do not answer that in advance.

---

### Slice 20 — Subtasks and task ordering
**Spec:** §33, §34, §47

`parentTaskId` rendering, subtask progress rollup, drag ordering within a list, and
move-to-project. Behind the `subtasks` flag so it can be turned off mid-evaluation.

---

### Slice 21 — Command palette
**Spec:** §41

Ctrl/Cmd+K: open project, create task, create project, search, go to calendar, add
reflection, toggle project editing. Which actions you actually reach for here is
direct evidence for which MCP tools should exist (§41) — record it in `docs/decisions/`.

---

### Slice 22 — Agent confirmations
**Spec:** §58, §47

Behind the `agentConfirmations` flag. Starting rules: create/complete task → no
confirmation; archive task, archive project, bulk changes → confirmation. Use MCP's
multi-round-trip / input-required pattern rather than inventing a mechanism (§58).

---

### Slice 23 — Dashboard configuration
**Spec:** §24, §25

Add/remove/reorder/hide/resize widgets in the UI, persisted per persona. Still preset
sizes only, unless daily use proves otherwise.

---

### Slice 24 — AI project summaries and tool experiments
**Spec:** §42, §43, §56

`generateProjectSummary` + the AI Summary section type behind `aiSummarySections`.
Alongside it, the §56 tool experiments: `complete_task(id)` vs
`update_task(id, status)`; separate `find_project`/`find_task` vs combined
`search_workspace`. Run both variants against real clients and write up which one
agents use more reliably.

---

## Standing rules across all slices

**Boundaries that must hold** (§8, §12, §70)

- Angular components depend on gateway *interfaces*, never on the prototype
  implementation.
- Domain services depend on repository interfaces and `Clock` — never on HTTP, MCP,
  or JSON.
- MCP tools call domain services, never repositories.
- Contracts are defined once in `packages/contracts` and reused by Angular forms, the
  prototype API, MCP tool schemas, tests, and seed validation.

**Deliberately disposable** (§71) — do not over-engineer these: the host's HTTP
implementation, JSON repositories, prototype authentication, fake users and tokens,
the mock AI provider, the event stream, the development panel, the seed loader.

**Never build** (§80): Postgres, Supabase, RLS, production OAuth, cloud uploads, email,
invitations, billing, Redis, queues, production logging or analytics.

**After every slice** (§77, §78)

1. Load a realistic seed and actually use what you built.
2. Try it through MCP if applicable.
3. Write down the friction.
4. If a product question got answered, add a `docs/decisions/` entry.
5. When intent changes, change the test *and* the implementation — tests protect
   intentional behavior, not old decisions (§77).

The prototype optimizes for **time to change an idea**, not time to production (§84).
