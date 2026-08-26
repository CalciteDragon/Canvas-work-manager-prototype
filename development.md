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

**Status:** in progress — plan: [docs/plans/04-seeds-personas-clock-reset.md](docs/plans/04-seeds-personas-clock-reset.md)

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
  deleted or repurposed in Slice 8.

**Done when** clicking a checkbox completes the task instantly in the UI, persists to
`data.json`, and reverts visibly if the host is stopped mid-action.

**Do not** build subtasks or drag ordering yet (Slice 20).

---

## Phase 2 — The project page (Slices 8–11)

This is the central product experience (§26) and where most learning happens.

---

### Slice 8 — Project page + section registry

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

**Goal:** Every prototype variable is adjustable at runtime.

**Spec:** §22, §46, §47, §63, §79

**Build**

- Ctrl/Cmd+Shift+D panel (§46) controlling: Persona, Seed, Current Date, Theme,
  Layout Mode, AI Provider, Network Delay (none/300ms/1s/3s), Failure Rate,
  Feature Flags. Agent Connection joins in Slice 13.
- Host endpoints backing it: load seed, reset, set simulated date, set latency,
  set failure rate.
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

**Done when** contract tests cover every tool's success and permission-denied paths
and run without a listening port.

**Do not** start the HTTP endpoint yet — keeping the registry transport-free is the
point of this slice.

---

### Slice 15 — MCP HTTP endpoint (and stdio)

**Goal:** A real MCP client can connect and drive the workspace.

**Spec:** §49, §50, §59

**Build**

- Official MCP TypeScript SDK **v2**, protocol target **2026-07-28**.
- `createMcpHandler()` mounted at `http://localhost:4310/mcp` using the SDK's modern
  HTTP serving path — do not hand-implement the protocol (§50).
- `pnpm mcp:stdio` entry registering **the identical registry** (§59).
- Bearer token → `AgentContext` via Slice 13's authenticator.
- `docs/mcp-setup.md`: how to point Claude Desktop / Cursor at both transports.

**Done when** a real MCP client lists tools, creates a task, and that task is present
in `data.json` — over both HTTP and stdio.

---

### Slice 16 — Live updates

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
