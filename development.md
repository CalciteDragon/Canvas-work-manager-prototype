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

**Status:** done — plan: [docs/plans/16-live-updates.md](docs/plans/16-live-updates.md) — one
frame per §57 activity record, held until the unit of work commits, over
`GET /prototype/events`. An agent's `complete_task` reaches an open project page in ~14 ms
with the write already readable, and the feed names the connection.

Three things the plan did not start out knowing. Emission rides `ActivityService.record`, so
it is **at most** one event per operation rather than exactly one — no-op writes announce
nothing, and `AgentConnectionService.touch` announces nothing at all, which is why §53's
"Last used" does not live-update ([entry](docs/decisions/2026-08-live-events-ride-the-activity-record.md)).
Every live-driven read is *quiet* — no loading flag, no cleared data, no error on failure —
because an agent's write must not flicker a skeleton over a page someone is reading; and the
task list and the section canvas each defer behind an optimistic write in flight, since the
host flushes its frame at commit, which is before the tab's own response lands. Slice 12's
three parked `location.reload()` calls were decided one by one: the layout control's is gone,
persona switching and the host-state controls keep theirs (see below), and other tabs now get
`prototype.reloaded` instead.

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

**Goal:** Close out the First Prototype Milestone with the tools that make design
iteration fast.

**Spec:** §4, §22, §67, §69, §78, §81

**Build**

- **Storybook** (Angular integration) with stories for the reusable components —
  at minimum the `TaskRow` and `ProjectSection` variant sets named in §4.
- **Design Lab** at `/prototype/design` (§67): buttons, inputs, task rows, cards,
  project cards, widgets, section frames, navigation, drawers, menus, and the
  empty/loading/error states, with live token controls (§22): radius, spacing
  density, surface contrast, accent, font scale, elevation, sidebar width.
- `/prototype/state` — seed/state inspector (§68).
- The two end-to-end tests, and only these (§69):
  1. **Web:** load seed → create project → create task → dashboard shows task.
  2. **MCP:** agent calls `create_task` → task appears in the web UI → activity feed
     attributes it to the agent.
- Component tests for `TaskRow` completion, section collapse, section configuration,
  and dashboard widget states.
- Seed `docs/decisions/` with the first entry — the flow-vs-grid question from
  Slice 9, in the §78 format (Question / Options tested / What we learned / Current
  decision / Confidence / Revisit when).

**Done when** every §81 checklist item is demonstrable and both e2e tests pass.

> **Stop here and use the prototype.** Slices 18+ should be selected by what actually
> caused friction, not built in order. That is the whole point of §77 and §82.

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
