# Canvas Work Manager
## Prototype Product, Design & Development Specification

**Status:** Prototype v0.1  
**Phase:** Design-first exploration  
**Primary goal:** Learn what the product should be before committing to the production architecture or MVP specification.

---

# 1. Purpose of the Prototype

The prototype exists to answer:

> What should this application actually feel like and how should its concepts behave?

It is **not** intended to prove:

- production scalability
- production database design
- cloud deployment
- Supabase configuration
- production authentication
- billing
- collaboration infrastructure
- production OAuth
- production AI infrastructure

The prototype should instead make it extremely fast to:

- create UI concepts
- change navigation
- redesign project pages
- add/remove section types
- change task semantics
- experiment with layouts
- alter data shapes
- try multiple dashboard designs
- test AI-generated features
- connect real MCP clients
- change MCP tool definitions
- observe how agents actually interact with the product
- throw away bad ideas cheaply

---

# 2. Prototype Success Criteria

The prototype is successful when it allows us to confidently answer questions such as:

### Project organization

- What exactly is a project?
- Are nested projects useful?
- Should sub-projects behave exactly like projects?
- How much hierarchy feels useful before it becomes cumbersome?

### Project pages

- Should pages feel closer to Notion?
- Should sections behave like dashboard widgets?
- Should sections have columns?
- Should sections be resizable?
- Is full freeform placement actually useful?
- Which section types deserve to exist?

### Tasks

- What task states are useful?
- Do tasks need start dates?
- Do subtasks help?
- Should tasks belong to one project or multiple?
- Should milestones and tasks be different concepts?

### Dashboard

- What information is genuinely useful each day?
- How much upcoming work should be shown?
- What should be configurable?
- Which AI-generated widgets provide value?

### MCP

- What tools do agents naturally use?
- Which tools confuse agents?
- How much context should tools return?
- Should some operations be combined?
- Which permissions are actually understandable?
- What agent changes should require confirmation?
- What information should be exposed as resources instead of tools?

The **final MVP specification should be written from what is learned here**, not treated as predetermined.

---

# 3. Prototype Philosophy

## 3.1 Behaviors should be real

These should behave approximately as they would in production:

- project creation
- task management
- section configuration
- section ordering
- dashboards
- search
- calendars
- timelines
- reflections
- progress calculations
- MCP tools
- MCP tool schemas
- MCP results
- agent permissions
- activity history

These are the things being evaluated.

---

## 3.2 Infrastructure should be fake

These should be replaced by lightweight local equivalents:

| Production Concern | Prototype Replacement |
|---|---|
| Supabase Auth | Prototype personas |
| PostgreSQL | Local JSON data store |
| Supabase Storage | Local fixture assets |
| Production Fastify API | Prototype Host |
| OAuth authorization server | Prototype token/auth adapter |
| OpenAI/other AI service | Mock AI provider |
| cron/scheduled jobs | Manual/time-simulated triggers |
| cloud deployment | localhost |
| email | mock notification log |

---

# 4. Recommended Prototype Stack

## Frontend

**Angular 22 + TypeScript**

Use:

- standalone Angular components
- Angular Signals
- Angular Router
- Angular CDK
- SCSS
- CSS custom properties
- native CSS Grid/Flexbox

Angular Signals should be the primary mechanism for UI state.

Do not place application persistence logic directly inside components.

---

## Component Development

**Storybook**

Use Storybook heavily during the prototype.

Purpose:

- design components in isolation
- create visual variants
- test states without navigating the entire application
- compare alternative designs
- demonstrate loading/error/empty states
- experiment without committing to application behavior

Examples:

```text
TaskRow
├── Normal
├── Overdue
├── Completed
├── High Priority
├── Selected
├── Compact
└── Agent Modified
```

```text
ProjectSection
├── Full Width
├── Half Width
├── Collapsed
├── Editing
├── Empty
└── Loading
```

Storybook's Angular integration supports controls, actions, interaction testing, viewport testing, and related design-development workflows.

---

# 5. Prototype Runtime Architecture

The full prototype consists of two development applications, each started in its own
terminal. They were started by one command until `concurrently`'s piped stdin was found
to hang the host's watcher silently
(`docs/decisions/2026-08-web-and-host-start-separately.md`).

```text
pnpm dev:web

pnpm dev:host
```

Conceptually:

```text
┌───────────────────────────────┐
│ Angular                       │
│ localhost:4200                │
│                               │
│ Actual application UI         │
└──────────────┬────────────────┘
               │
               │ localhost HTTP
               ▼
┌───────────────────────────────┐
│ Prototype Host                │
│ localhost:4310                │
│                               │
│ Fake API                      │
│ MCP server                    │
│ Fake auth                     │
│ Mock AI                       │
│ Domain services               │
│ Local persistence             │
└──────────────┬────────────────┘
               │
               ▼
       .prototype/data.json
```

The developer should never have to manually launch a database or external backend.

The root development command starts both processes.

---

# 6. Why a Prototype Host Exists

For normal frontend prototyping, the entire application could live inside the browser.

MCP changes that.

An external MCP client cannot directly call:

```text
localhost browser tab
```

The browser cannot expose an HTTP MCP server to another application.

Therefore a lightweight local process is required.

The Prototype Host solves two problems simultaneously:

```text
Angular
   │
   ▼
Prototype Host
   │
   ▼
Local data


MCP Client
   │
   ▼
Prototype Host
   │
   ▼
Same local data
```

This guarantees that an agent modifying a task through MCP immediately affects the same workspace being displayed in the browser.

---

# 7. Prototype Host Is Not the Production Backend

This distinction should be explicit.

The Prototype Host is allowed to:

- use insecure local authentication
- read/write one JSON file
- reset all application data
- inject artificial latency
- inject errors
- switch users instantly
- use development-only endpoints
- expose debug controls
- provide deterministic AI responses

It should **not** accumulate production infrastructure.

The goal is:

```text
real behavior
+
fake infrastructure
```

---

# 8. Core Architectural Boundary

The most important code-reuse boundary is:

```text
UI
 │
 ▼
Application Gateway Interface
 │
 ├── Prototype Adapter
 │
 └── Production HTTP Adapter
```

Angular components must not know whether data comes from:

```text
localhost JSON
```

or:

```text
Supabase/Postgres through production API
```

---

# 9. Application Gateway

Define an interface similar to:

```ts
interface WorkManagerGateway {
  projects: ProjectGateway;
  tasks: TaskGateway;
  sections: SectionGateway;
  history: OperationHistoryGateway;
  milestones: MilestoneGateway;
  reflections: ReflectionGateway;
  dashboard: DashboardGateway;
  search: SearchGateway;
  activity: ActivityGateway;
}
```

```ts
interface SectionGateway {
  remove(id: SectionId, input?: RemoveSectionInput): Promise<SectionRemovalResult>;
}

interface OperationHistoryGateway {
  summary(projectId: ProjectId): Promise<OperationHistorySummary>;
  transition(historyId: OperationHistoryId, input: OperationHistoryTransitionInput): Promise<OperationHistoryTransitionResult>;
}
```

Individual contracts:

```ts
interface TaskGateway {
  list(query: TaskQuery): Promise<Task[]>;
  get(id: TaskId): Promise<Task>;
  create(input: CreateTaskInput): Promise<TaskAddResult>;
  update(id: TaskId, input: UpdateTaskInput): Promise<TaskWriteResult>;
  complete(id: TaskId): Promise<TaskWriteResult>;
  archive(id: TaskId): Promise<TaskWriteResult>;
  restore(id: TaskId): Promise<TaskWriteResult>;
}
```

`restore` was added once the prototype showed that an archive nothing can reverse is a row a
person has lost (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md). It restores
the task and every descendant that came down with it.

*Amended in Slice 36.* Task and reflection writes return `{ task|reflection, operation }` so the
entity and the receipt describe the same committed state. A normalized no-op carries
`operation: null`; browser stores unwrap the entity and still re-read where their projection
requires it ([decision](docs/decisions/2026-09-row-operation-history.md)).

*Landed in Slice 31, amended in Slice 35.* `sections.remove` returns `{ section, operation,
archiveListed }`; `section` is an archived-shaped result snapshot even when the domain deleted the
disposable section. `history.transition` accepts only a history id, an action id, a direction and
the revision the caller read; inverse data, ordering and actor checks remain server-side. Removal
and history are interface members shared by the HTTP gateway and its fake
([decision](docs/decisions/2026-09-disposable-removal-and-immediate-undo.md),
[history scope](docs/decisions/2026-09-operation-history-scope.md)).

The frontend depends on these interfaces.

---

# 10. Prototype Adapter

During prototyping:

```text
Angular
   ↓
PrototypeWorkManagerGateway
   ↓
localhost:4310
```

Later:

```text
Angular
   ↓
HttpWorkManagerGateway
   ↓
Production API
```

Angular page and component code should not change.

---

# 11. Shared Contracts Package

Create a shared package containing application schemas.

Recommended:

```text
packages/contracts
```

Use runtime schemas as well as TypeScript types.

Recommended library:

```text
Zod
```

Example:

```ts
const CreateTaskSchema = z.object({
  projectId: ProjectIdSchema,
  title: z.string().min(1),
  dueAt: z.iso.datetime().nullable().optional(),
  priority: TaskPrioritySchema.optional()
});

type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
```

The same contract can eventually be used by:

```text
Angular forms

Prototype API

Production API

MCP tool schemas

tests

seed-data validation
```

This is one of the most valuable reuse points in the prototype.

---

# 12. Domain Package

Create:

```text
packages/domain
```

This package contains application behavior that should survive into production.

Examples:

```text
TaskService
ProjectService
SectionService
DashboardService
TimelineService
ProgressService
ReflectionService
SearchService
ActivityService
```

Example:

```text
TaskService.completeTask(...)
```

should not know:

- whether MCP called it
- whether Angular called it
- whether storage is JSON
- whether storage is PostgreSQL

---

# 13. Repository Interfaces

Domain services depend on repositories.

```ts
interface TaskRepository {
  find(id: TaskId): Promise<Task | null>;
  list(query: TaskQuery): Promise<Task[]>;
  insert(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
}
```

Prototype:

```text
JsonTaskRepository
```

Production:

```text
PostgresTaskRepository
```

The domain service remains unchanged.

---

# 14. Local Prototype Storage

Use one file:

```text
.prototype/data.json
```

Example:

```json
{
  "schemaVersion": 5,
  "users": [],
  "workspaces": [],
  "projects": [],
  "sections": [],
  "tasks": [],
  "milestones": [],
  "reflections": [],
  "activityEvents": [],
  "agentConnections": []
}
```

Do **not** introduce SQLite or Postgres initially.

JSON is preferable during this phase because:

- schemas can change instantly
- fixtures are human-readable
- state can be committed as examples
- bugs can be reproduced by copying a file
- no migrations are initially necessary
- entire workspaces can be reset easily
- AI agents can inspect test fixtures
- prototype data volume is tiny

"No migrations are initially necessary" held while a stale `schemaVersion` could simply be
reset. It stops holding the first time a real file is worth keeping. The multi-page cutover is
that first time, so it gets **one bounded converter with its own explicit CLI entry** —
validate, back up, write atomically, no-op on an already-converted file, fail loudly on
anything else. It is deliberately not a migration runner, a registry or a rollback framework;
each later cutover writes its own named converter or resets, and either is cheaper than a
framework nothing else uses. See
`docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md`.

*Amended in Slice 35:* the second cutover wrote its own converter, so the CLI now runs **two named
steps in a fixed order** — version 2 → 3, frozen at its version-3 output, then version 3 → 4 —
after sniffing the file's version. That is a chain of two explicit functions called from one place,
still not a runner or registry; the earlier wording "not … a version chain" described the single
step that existed then ([decision](docs/decisions/2026-09-schema-version-4-conversion.md)).

*Landed in Slice 25.1: `pnpm prototype:upgrade <path>` converts a version-2 file in place,
keeping a backup beside it.*

*Slice 30 added `undoRecords` inside version 3 as a defaulted collection
([why](docs/decisions/2026-09-section-removal-undo-records.md)).*

*Landed in Slice 35: `SCHEMA_VERSION` is 4.* Single-use Undo records gave way to per-actor,
per-project **operation histories**: the document holds `operationHistories` (a cursor, an order
high-water mark and a revision per exact actor and project) and `operationActions` (typed, ordered
actions), and every section carries an `archiveGeneration`. `undoRecords` is gone. `pnpm
prototype:upgrade` converts a version-2 or version-3 file, retiring any version-3 receipts with a
notice rather than translating them, and validates the version-4 result before writing a byte.
Integrity checks a history's scope and ordering and never resolves the ids an action's payload names
([conversion](docs/decisions/2026-09-schema-version-4-conversion.md),
[retention](docs/decisions/2026-09-operation-history-retention.md)).

*Amended in Slice 36: `SCHEMA_VERSION` is 5.* A third explicit converter, version 4 → 5,
preserves histories/actions and backfills Activity with captured project/root scope plus the task
title or reflection label needed if Undo Add later removes its target. The earlier converters stay
frozen at their literal output versions
([decision](docs/decisions/2026-09-schema-version-5-conversion.md)).

---

# 15. JSON Persistence Behavior

The Prototype Host should:

1. Load `data.json`.
2. Validate it.
3. Keep data in memory.
4. Execute operations against memory.
5. Persist changes atomically.
6. Broadcast relevant changes to the frontend.

Do not write the file after every individual property mutation.

Persistence should occur at operation boundaries.

Example:

```text
completeTask()
├── update task
├── create activity event
└── persist snapshot
```

---

# 16. Prototype Seeds

Store predefined datasets:

```text
prototype/seeds/
```

Examples:

```text
empty.json
personal-workspace.json
busy-week.json
large-project.json
nested-projects.json
overdue-chaos.json
completed-project.json
agent-heavy.json
```

Developer controls should allow:

```text
Load Seed
```

to immediately replace the current application state.

This is important for design work.

---

# 17. Prototype Personas

Do not build real accounts yet.

Create fake users:

```text
Demo User
Alex
Sam
```

Each uses the canonical `User` contract fields:

```text
id
name
avatar
workspaceId
preferences
```

The referenced workspace is a separate record in the prototype document (§14), not a
nested or persona-specific workspace shape.

A development menu allows:

```text
Switch Persona
```

This lets the prototype test:

- empty accounts
- busy accounts
- different preferences
- user isolation
- different AI connections

without authentication infrastructure.

---

# 18. Prototype Authentication Contract

Application code should still depend on:

```ts
interface IdentityProvider {
  getCurrentIdentity(): Promise<Identity>;
}
```

Prototype implementation:

```text
PrototypeIdentityProvider
```

Production:

```text
SupabaseIdentityProvider
```

Components should never directly depend on Supabase APIs.

---

# 19. UI Architecture

Use:

```text
Page
 ↓
Feature Facade / Store
 ↓
Gateway
 ↓
Backend
```

Example:

```text
ProjectCanvas
       ↓
ProjectPageStore
       ↓
WorkManagerGateway
```

The store should contain reactive state.

Example:

```ts
class ProjectPageStore {
  sections = signal<ProjectSection[]>([]);
  loading = signal(false);
  editMode = signal(false);
}
```

*Since Slice 25.3 this store holds the sections of **one page**, and the project record it used
to carry belongs to `ProjectWorkspaceStore` — a root has several canvases and one identity (§26).
The shape of the rule is unchanged: a feature store, provided by the component that needs it,
talking to the gateway and to nothing else.*

Angular Signals are well suited to this kind of reactive view state.

---

# 20. Do Not Create One Global Mega-Store

Avoid:

```text
AppStore
  everything
```

Prefer feature-scoped stores:

```text
DashboardStore

ProjectPageStore

CalendarStore

SearchStore

SettingsStore
```

Shared entities can still come through the common gateway.

This makes prototype features easier to delete or replace.

---

# 21. Visual Design System

Create design primitives before polished pages.

Use CSS custom properties.

Example categories:

```text
--color-background

--color-surface
--color-surface-raised

--color-text
--color-text-muted

--color-border

--color-accent

--space-1
--space-2
--space-3
--space-4

--radius-sm
--radius-md
--radius-lg

--shadow-sm
--shadow-md
```

Do not scatter literal styling values throughout components.

---

# 22. Prototype Themes

Initially implement:

```text
Dark

Light
```

Also include a development-only:

```text
Design Lab
```

where tokens can be changed live.

Potential controls:

```text
radius

spacing density

surface contrast

accent

font scale

card elevation

sidebar width
```

This allows broad visual experiments without rewriting component CSS.

---

# 23. Application Shell

Desktop-first layout:

```text
┌──────────────────────────────────────────────┐
│ Top bar                                      │
├─────────┬────────────────────────────────────┤
│         │                                    │
│ Sidebar │ Main workspace                     │
│         │                                    │
│         │                                    │
│         │                                    │
└─────────┴────────────────────────────────────┘
```

Sidebar:

```text
Home

Projects
  Project A
  Project B
  Project C

Calendar

Search

────────

Settings
```

Project hierarchy should optionally expand inline.

## The project navigation column

A root project is a workspace with pages (§26), so opening one adds a **second navigation
column** between the sidebar and the main workspace:

```text
┌─────────┬──────────┬─────────────────────────┐
│ Sidebar │ Project  │ Main workspace          │
│         │  Home    │                         │
│         │  Todos   │                         │
│         │  Archive │                         │
│         │  Reflect │                         │
│         │  ──────  │                         │
│         │  Work    │                         │
└─────────┴──────────┴─────────────────────────┘
```

The global sidebar stays where it is; the project column is additional, not a replacement. It
lists the root's **enabled** pages *that this build can render* — a kind with no renderer is not
advertised, because a tab leading to a blank screen is worse than no tab — and beneath them the
root's subprojects as the work hierarchy, a subproject being a unit of work rather than a page.

Opening a subproject keeps its root's column and adds breadcrumbs back through its parents, so
a work unit three levels deep never loses its context. At narrow widths the project column
collapses behind a labelled control rather than disappearing. Links are keyboard reachable and
carry an active state; nothing here uses a literal colour or spacing value (§21).

*Landed in Slice 25.3.* `ProjectWorkspaceShell` owns the column and its state; `AppShell` and
`ShellStore` are untouched, because loading a root's pages and walking its ancestors in the one
store every route pays for is the mega-store §20 forbids. Placement is a single CSS rule instead:
the routed component declares `data-flush-workspace` and the shell drops the workspace region's
padding, so the column sits flush against the global sidebar with no shell state at all. The
column is sticky, so a long canvas scrolls beneath it rather than taking it along; at ≤ 60rem it
collapses behind a labelled button and its links leave the tab order with it.

Today the column lists Home, any enabled optional page this build can render, and the work
hierarchy. Archive and Reflections are both registered renderers; Archive also remains reachable
through the project controls when its tab is disabled.

*Landed in Slice 27.* The column fills the available workspace height below the top bar and
keeps its own long navigation list scrollable while the canvas scrolls independently. The
column has no **Open archive** action. The project's **More** menu opens Archive from root
and nested work routes, including when the Archive tab is disabled
([why](docs/decisions/2026-09-root-archive-recovery-guidance.md)).

*Slice 25.8 exercised the column as a product surface:* a root's **Manage pages** disclosure keeps
Home fixed and lets a person toggle the three optional kinds in View Mode. The same root-owned
column remains available on a nested work route, while the work canvas is not presented as a
toggleable page. Keyboard navigation and the existing collapsed-column breakpoint were checked
against the integrated showcase.

---

# 24. Home Dashboard

Prototype the dashboard as a configurable widget surface.

Initial widgets:

### Today

Tasks relevant today.

### Upcoming

Work approaching within configurable range.

### Active Projects

Active project overview.

### Calendar

Compact upcoming calendar.

### Recent Progress

Recently completed work.

### Daily Digest

Mock AI-generated overview.

### Work Summary

Longer AI-generated progress summary.

### Fun Fact

Low-priority optional daily content.

### Recent Agent Activity

Changes made by connected AI agents.

---

# 25. Dashboard Widget Model

```ts
interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  position: number;
  size: WidgetSize;
  config: unknown;
  hidden: boolean;
}
```

Initial size choices:

```text
small
medium
wide
full
```

Avoid implementing arbitrary pixel resizing initially.

The prototype should test whether resizing is useful before building a sophisticated layout engine.

---

# 26. Project Page Design

The project page is the central product experience.

Structure:

```text
Project Header

Project Navigation / Controls

Section Canvas
```

Header:

```text
Icon

Project Name

Status

Progress

Target Date  (Due date, on a unit of work)

More
```

**Section creation belongs to the canvas, not the project header.** Contextual insertion points
open one creation dialog at the selected location; they do not use a Quick Add header or controls
row. Root Home's dialog also offers **Add shortcut**. The project **More** menu keeps the
project-level actions, including **Open archive** when the Archive page is disabled
([why](docs/decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)).

*Landed in Slice 27.* The former Quick Add and Edit Layout controls are removed; the canvas
owns section and Home shortcut creation at the point where each will appear.

The header itself is rendered **once per project** — at the top of the workspace track, beside
§23's full-height navigation column and above whichever page is showing. It describes the
project, not the page, and a header living inside Home would vanish the moment another page
rendered.

## Two kinds of project

A project is one of two things, and the difference is structural rather than cosmetic:

| | **Root project** | **Subproject** |
|---|---|---|
| Is | a configurable workspace | a unit of work |
| Parent | none, ever | required — a root or another subproject |
| Children | subprojects | subprojects, to any depth |
| Canvases | one per enabled page | exactly one work canvas |
| Pages | Home, plus optional pages | one, fixed: its work canvas |

`kind` is part of the stored model and the schemas — a discriminated union, not a label
derived from whether `parentProjectId` happens to be set. Roots and subprojects share an ID
space and a repository so references between them stay cheap, but their create and update
operations are separately named and separately capable. A root cannot acquire a parent; a
subproject cannot acquire pages; neither converts into the other.

A subproject carries the work metadata the canvas vocabulary needs: a description, an optional
**due date** (the existing date-only `targetDate`, relabelled), a status, and a `completedAt`
timestamp. Empty descriptions and undated work stay valid — most work units will have both.
Completion is explicit and does **not** complete descendants; reopening clears `completedAt`.

*Landed in Slice 39: every change to an existing project is an **undoable operation**.* Rename,
description, icon, due or target date, status, parent, layout mode and progress settings all run
through one write, and each call that changes something records exactly one action in the acting
person's or agent's history **for that project** — a sub-project's own history, not its root's, even
when the write moves it to another root. The status names the step: entering `archived` is an
**archive**, leaving it a **reactivation**, and everything else — completion and reopening included —
an **update**. One call that changes a status and a name is one step. A call that changes nothing
records nothing. Undo writes back exactly the fields that call changed and Redo writes them again, so
an unrelated edit someone made since survives both, while a later change to the same field refuses.
A completion time comes back exactly as it was recorded, never re-stamped. Reversing a move re-checks
the destination as if it were a new move: it must still exist, must not sit beneath the project, and
must not be under anything archived. Creating a project is not recorded yet
([why](docs/decisions/2026-09-project-update-operation-history.md)).

## Pages

Pages are persisted records — stable ID, owner project, kind, enabled state, and the canvas
layout where the kind has one. Four kinds are a root's, and one is a subproject's:

```text
Home        required on a root, exactly one, cannot be disabled

Todos       optional  (§34)
Archive     optional  (§31)
Reflections optional  (§36)

Work        required on a subproject, exactly one
```

A subproject's work canvas is a page record like any other — that is what keeps the ownership
chain in §27 unbranched, since every section belongs to a page. It is simply not a *tab*: it
cannot be disabled, cannot be added, and has no toggle API. Only the four root kinds are
navigation.

Home and a subproject's work canvas are full section canvases: every registered section type
(§30) may be added to either. Reflections owns its own reflections container and shows the
journal feed. **Todos and Archive are derived** — they project rows that live elsewhere and
own none of their own.

A new page kind is a deliberate addition: an entry in the capability table plus a renderer.
The prototype is not building a generic page builder, and arbitrary user-defined pages are a
non-goal (§80).

Which pages a root shows is ordinary persisted product state, defaulting to **Home only** for
a new root. Disabling a page keeps its content, its layout and every reference to it —
nothing is destroyed by a toggle. A URL pointing at a disabled page falls back to Home, says
why, and offers to re-enable it.

*The model landed in Slice 25.1 and the operations in Slice 25.2: `kind` is stored and
enforced, every project owns its canonical page, and every section names one. A root's optional
pages are listed and toggled through `ProjectPageService`, `GET`/`PATCH
/api/projects/:projectId/pages`, and `list_project_pages`/`set_project_page_enabled` over MCP.
"Defaulting to Home only" is the literal stored state: an optional page's record is created by
its first enable, and disabling one writes a single boolean and keeps everything on it
([why](docs/decisions/2026-09-optional-pages-are-created-on-first-enable.md)). Slice 25.3 added the
**navigation**: §23's second column, §68's two routes, and the renderer behind Home and a
sub-project's work canvas. Slice 25.5 added Todos (§34), Slice 25.6 added Archive (§31), and
Slice 25.7 added Reflections (§36). A page kind without a renderer is still not advertised in the
column and a URL pointing at it falls back to Home saying it is not built yet. A sub-project's
`/pages/…` URL is refused the same way, because it has no pages to name.

Slice 25.5 adds a **fragment** to both project routes — `#section-<id>` — so §34's Todos rows can
link to the container that owns them and not merely to the page. It is handled by the canvas rather
than by the router's global anchor scrolling: the application scrolls its own region, and a canvas
is loaded asynchronously, so a scroll attempted at navigation time lands before the section exists.
The canvas matches the fragment against the sections **that page actually loaded**, never
interpolating it into a selector; an unmatched one leaves the canvas usable and says so. Arriving
writes nothing — a collapsed target is opened for that visit only.*

*Slice 25.8 completed the person-facing optional-page path. The project navigation manager shows
the root's actual page records, updates navigation only after the page write and fresh context read
settle, and preserves the confirmed state on refusal. A URL for a disabled optional page falls back
to Home with an exact re-enable action for that kind; unknown, unbuilt, Home, work and subproject
page requests do not acquire an enable action.*

*Landed in Slice 38: a page toggle is an **undoable operation**.* Every toggle that changes the
stored state records exactly one action in the owning **root's** history — whatever route the
control was on — and answers `{ page, operation }`. The two writes §26 gives a page are two
operations, not one: the first enable creates the record and records `page.add`, while every later
change of the switch records `page.update`. A toggle already where it was asked to go is still not a
write: it answers a `null` receipt and changes no timestamp, event, history revision or Redo branch.

Because the first enable is what *creates* the page, undoing it **removes** that page — the same
record, and only while it is still the one that enable created and nothing on it refers to it. Any
canonical section on the page, archived ones included, and any shortcut placement on it refuses the
whole reversal and asks for that reference to be removed first; nothing is cascaded, emptied or
cleaned up on its behalf, because a page toggle must never destroy content. Redo brings the same page
id and `createdAt` back. Undoing a later toggle writes the switch back and nothing else, so sections,
their layout, their rows and every reference survive both directions.

Enabling a page is still allowed while the project is archived, so §31's Open archive stays
reachable. Reversing one through history is **not**: a page transition is blocked on an archived
root in either direction, like every other family, so history is not a way around the freeze
([why](docs/decisions/2026-09-optional-page-operation-history.md)).

---

# 27. Section Canvas

The first prototype should support two experimental layouts.

## Flow Layout

Notion-like:

```text
[ Overview                         ]

[ Tasks                            ]

[ Timeline                         ]

[ Reflections                      ]
```

Supports:

- drag reorder
- collapse
- snapped width resizing

*Landed in Slice 27.* Flow keeps one ordered column. Width handles snap to the supported
4, 6, 8 or 12 column spans, and content height remains intrinsic so sections reflow vertically
as their contents change.

---

## Grid Layout

Dashboard-like:

```text
[ Tasks             ][ Progress   ]

[ Timeline                       ]

[ Reflection ][ Milestones       ]
```

Use a 12-column CSS grid.

Sections receive:

```text
columnSpan
```

rather than absolute X/Y coordinates.

Example:

```text
12
8
6
4
```

This gives substantial flexibility without prematurely creating an infinite-canvas system.

---

## Who owns what

One chain, and it does not branch:

```text
project → page → section → row
```

A section belongs to a page; a row belongs to the section that owns it (see
`docs/decisions/2026-09-sections-own-their-data.md`). Rows keep the `projectId` and
`sectionId` they already carry — a row's *page* is derived from its section rather than stored
a second time, so the two cannot disagree. Document integrity checks that they agree anyway.

Sections reorder within their page. Reordering one page never renumbers another, and
duplicating a section leaves the copy on the page that owned the original.

Subprojects are not sections and do not live on a page: they belong to the parent's work
hierarchy. A Sub-Projects section is a *view* of that hierarchy, which is why removing one
takes no work down with it.

*Landed in Slices 25.1 and 25.2. Sections carry `pageId`, `validateDocumentIntegrity` holds a
section's page and project in agreement, and positions are dense **per page**: adding,
reordering, duplicating, removing and restoring all renumber one page and never another. A read
that names no page spans the project grouped by page, since two pages both number from zero.*

## Where a write lands when nobody said

A person creating a section and an agent's `create_task` both have to resolve a canvas or
container. With pages, "the project's task container" is no longer a single answer, so the
resolution is stated rather than inferred:

- **Nothing supplied** — a root resolves a matching container on Home; a subproject resolves
  one on its sole canvas.
- **A page supplied** — resolve there, but only if that page accepts that kind of data.
  Otherwise refuse; do not fall back somewhere the caller did not name.
- **A section supplied** — authoritative, and it must agree with any page or project also
  supplied. A mismatch is an error, not a preference order.

A write never lands on a disabled page. Silent placement somewhere invisible is worse than a
refusal, because the writer believes it worked.

*Landed in Slice 25.2, in `SectionService`. At that time, all three cases were reachable for a
person through Quick Add; Slice 27 replaced that control with contextual canvas creation. HTTP
and `create_task`/`add_reflection` over MCP retain the same resolution and stay reachable with
`tasks.write` or `reflections.write` alone — resolution runs through the unchecked doors a row
write already uses on its own behalf, and acquires no `projects.read`.*

*The disabled-page rule needed one more sentence than it has above, because §27 also says a
source on a disabled page is still a valid source. The two are about different verbs: **placing**
new content on a disabled page is refused — adding or duplicating a section there, creating or
moving a row into a container there, reassigning rows there — while everything already there
stays readable, editable, reorderable, removable and restorable. Undo is never behind a toggle
([why](docs/decisions/2026-09-a-disabled-page-hides-navigation-not-data.md)).*

*Landed in Slice 27.* Section and Home shortcut creation may include an optional `position`.
The domain inserts at that point and densely renumbers the page's combined section/shortcut
order in the same operation. The canvas remembers an insertion anchor by placement ID and
resolves its current position when the dialog is submitted; a missing anchor is reported instead
of silently appending. Grid gaps are insertion targets in the existing wrapping order, not cells.
The chosen supported width is retained if neighboring placements change while the dialog is open
([why](docs/decisions/2026-09-contextual-insertion-names-its-position.md)).

*Landed in Slice 31, amended in Slice 35.* A section removed from the current canvas yields its
server operation receipt to an accessible, page-local Undo action. The notice keeps only that receipt in memory; it clears
on leaving the canvas or reloading, and does not depend on Archive being enabled. When the
remove response is uncertain, the canvas exposes an explicit retry with the original action
after the section has disappeared from a live refresh. A live refresh never repeats a write
([decision](docs/decisions/2026-09-disposable-removal-and-immediate-undo.md)).

*Landed in Slice 32.* Explicit section creation, movement and editable settings writes use the
same page-local receipt surface. A completed contextual add records `section.add`; a completed
move records `section.move` against the page's combined section/shortcut order; and title,
config, collapse and column-span changes record `section.update` with only the changed fields.
Normalized no-ops, cancelled edits, a move clamped to its current position and implicit
row-container creation record nothing. *Since Slice 37* duplication records the `section.add` it
is, capturing the copy that was actually made: Redo replays that copy rather than duplicating a
source that may have changed or gone since. Duplication still copies configuration and layout and
**no rows**. Since Slice 35 the receipt names its history and carries
that history's `revision`, so a page keeps the newest committed operation when concurrent responses
arrive; the notice's Archive action remains removal-only, and it stays Undo-only — persistent
Undo/Redo header controls are planned for a later stage of
[Slice 34](docs/roadmap/planned/34-undo-redo-and-archive.md). Undo is field-aware for settings,
placement-aware for moves, and refuses when the recorded footprint is no longer safe to restore
([decision](docs/decisions/2026-09-section-edit-undo-boundaries.md)).

*Amended in Slice 36.* Implicit row-container creation still records no separate `section.add`.
Instead the created container is captured inside the single `task.add` or `reflection.add` action,
so Undo/Redo removes and restores the row and container together with stable ids
([decision](docs/decisions/2026-09-row-operation-history.md)).

## Shortcuts on Home

A root's Home may show a section that canonically lives somewhere else in the same root tree —
another of its pages, or any subproject at any depth. This is a **placement**: a stored
reference to a source section ID plus its own position, span and collapse state. No rows are
copied and the source's configuration is not duplicated; there is exactly one owner of the
data, and it is the source.

Home holds one combined ordering of its own sections and its shortcut placements — a shortcut
sits in the canvas like anything else.

Rules the model enforces rather than the UI suggesting:

- source and destination are in the same root tree, and the same workspace
- no shortcut to a shortcut, and no shortcut to itself
- removing a placement never archives the source
- an archived source shows an unavailable placeholder — not its content — and restoring the
  source revives the reference
- a source on a *disabled* page is still a valid source; hiding a page hides navigation, not
  data

The first pass renders source content **read-only**, identifies where it came from, and offers
**Open source** for editing. The placement's own layout stays editable. Whether embedded
editing is worth the ambiguity of two live views of one section is a question for later use,
not an assumption to build in now.

The control that creates one is labelled **Add shortcut**.

*Landed in Slice 37.* Every placement write is undoable. Adding, resizing, collapsing, moving and
removing a shortcut each return an operation receipt and record one action in the **destination**
root project's history, never the source sub-project's — a placement belongs to the canvas it sits
on. A same-value resize or collapse, and a move to the position the placement already holds, write
nothing and carry no receipt. Undo and Redo of any of them **write** the placement only: the source
section, its configuration and its rows are never written and never returned as content, so an edit
to the source is never a conflict for a placement action. Recreating a placement does *read* the
source, because §27's own rules — same root tree, same workspace, not the destination page itself —
have to hold before a reference may exist again. Recreating a placement returns the same id pointing at the
same source, including when that source has since been archived or hidden — it comes back as the
existing unavailable placeholder, which is recovery of the reference rather than a second Add
([why](docs/decisions/2026-09-section-restore-and-shortcut-history.md)).*

*Landed in Slice 25.4. Home stores sections and shortcut placements in one combined order;
the resolver returns the source section and project/page identity without rows, and the source
content is mounted read-only with an **Open source** link. Placement writes require the same-root
Home and project-write rules; archived source sections show `source_archived`, while a source
project or ancestor archived beneath it shows `source_hidden`. A disabled source page remains a
valid source because disabling hides navigation, not data.*

*The integrated 25.8 showcase put all seven registered section kinds and four shortcut placements
on root Home, used a Reflections-page source and a nested work source, and observed source updates
without copying rows. The source frame stayed read-only and identified its canonical owner; removal
changed only the placement. This is browser/MCP evidence for the ownership boundary, not a decision
that embedded shortcuts are yet an MVP requirement.*

---

# 28. Layout Experiment Flag

Include:

```text
projectLayoutMode
```

with:

```text
flow
grid
```

Switch it from the development panel.

The prototype should deliberately compare the two approaches.

Do not decide the production model until both have been used with realistic project data.

---

# 29. Section Registry

Section types must be modular.

Create:

```ts
interface SectionDefinition {
  type: string;
  displayName: string;
  icon: string;

  createDefaultConfig(): unknown;

  component: Type<unknown>;

  inspectorComponent?: Type<unknown>;
}
```

Register definitions:

```text
SECTION_REGISTRY
```

*Landed in Slice 29.* Every registered type also declares one capability in the contracts
package's `SECTION_CAPABILITIES`: which rows it owns, if any, and what removing it could leave
worth recovering — owned rows (Task List, Reflections), config prose (Rich Text) or nothing
(Sub-Projects, Progress, Timeline, Recent Activity). Ownership (`SECTION_OWNERSHIP`) is derived
from it, and the registry test fails when a registered type has no declaration, so adding a type
now touches its folder, one registry line and one capability line. A type nothing declares — a
stale or hand-edited `type` — has *unknown* recovery, never "nothing to recover"
([why](docs/decisions/2026-09-content-oriented-archive-policy.md)).

---

# 30. Initial Section Types

Prototype:

```text
Rich Text

Task List

Sub-Projects

Milestones

Timeline

Calendar

Progress

Reflections

AI Summary

Recent Activity
```

Adding a new section type should require minimal changes outside its own feature folder.

## Which pages accept sections

Seven of the types above are registered today: Rich Text, Task List, Sub-Projects, Progress,
Reflections, Timeline and Recent Activity.

| Page | Sections |
|---|---|
| Home (root) | all registered types, plus shortcut placements (§27) |
| Work canvas (subproject) | all registered types |
| Reflections | its own reflections container, and the journal feed |
| Todos | none — derived (§34) |
| Archive | none — derived (§31) |

"All registered types" means exactly that, including types registered after this is written; a
page kind declares a capability, and it is not a hand-maintained list of section names. A
container the page does not accept — a Task List on the Reflections page — is refused by the
domain, not merely hidden by the UI.

*Landed across Slices 25.1, 25.2, 25.4, 25.6 and 25.7. The coarse answer — does this page hold sections at all —
is `pageAcceptsSections`; the narrow one is `pageAcceptsSectionType`, which reads Reflections'
capability out of `SECTION_OWNERSHIP` (derived from `SECTION_CAPABILITIES` since Slice 29) rather than naming section types, so a type registered
later needs no entry. `SectionService` refuses on the way in and `validateDocumentIntegrity`
refuses at load, because a hand-edited `data.json` (§14) must fail then rather than at whichever
request first renders it. Slice 25.4 adds the Home-only shortcut placement beside the registered
types. Slice 25.5 registers the Todos renderer — a derived list that holds no sections, so nothing
about this table changes for it. Slice 25.6 adds the Archive renderer and Slice 25.7 adds the
Reflections renderer; both remain derived/page-owned surfaces as shown above.*

---

# 31. Project Section Frame

Every section renders inside the same frame.

Frame provides:

```text
drag handle

title with inline naming

collapse

configuration, when the type provides an inspector

horizontal resize handles

remove
```

The content component handles only its feature.

*Landed in Slice 27.* The title itself opens rename. Resize handles snap the section or
shortcut placement to 4, 6, 8 or 12 columns. The frame has no Size dropdown or Duplicate
button; settings remain available through a compact icon only when the registered type declares
an inspector. Enter or blur saves the name; Escape restores the previous value, and clearing it
restores the type's default. Clicking the title does not drag or collapse the frame. A failed
rename keeps the entered text available to correct or retry
([why](docs/decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)).

**Remove preserves what the person can lose and deletes only an unreferenced disposable.**
The domain first settles any row policy: a container with live rows asks whether to archive
them with the section or move them to a same-type container. It then retains the section when
recoverable or uncertain content remains, or when any canonical task, reflection or Home
shortcut still references it. Otherwise it deletes the section: known disposable views,
empty containers and whitespace-only Rich Text do not need permanent tombstones. Archived
rows and shortcut source ids count in the reference audit. Existing tombstones are not purged
by this operation. No row or shortcut is silently deleted.

Creation, movement and settings edits are also explicit writes. The contextual create action
returns a `section.add` receipt after the combined placement is committed. Drag and keyboard
movement returns one `section.move` receipt only after the final placement is committed. Inline
title, inspector configuration, collapse and supported width writes return a `section.update`
receipt containing only the normalized fields that changed. The page-local notice offers Undo
for all four operation families, while Archive is offered only for removal; a reload clears
the in-memory notice.

## Where archived work is found

Archived work does not appear on ordinary pages, views or read models — that is what archiving
means. It is not deleted, so it has to be reachable somewhere, and that somewhere becomes the
root's optional **Archive** page: every archived task, reflection and subproject, and every
removed section that still holds something to recover, across the whole root tree, each with its origin, what caused it to be archived, and whether it
can be restored.

The root-wide **Archive** page is canonical. It lists the rows a canvas-scoped undo surface
could miss — those an ancestor took down, which cannot be restored on their own, and those whose
container lives on another page of the same project — with guidance naming the operation or
ancestor to restore instead. It also identifies each item's owning project, page and container,
whether the cause was its own archive or a cascade marker, and the canonical restore operation.
The owning page may be disabled or not yet rendered; the Archive page remains the place to find
and restore its content.

A project whose own status is `archived` hides its live contents from ordinary reads too. The
Archive page may still show them under their archived owner, distinguishing *hidden because an
ancestor is archived* from *archived in its own right*. Reactivating is an explicit status
choice; the prototype does not guess a prior status.

None of this adds a cascade. Archiving a project with **live child subprojects is still
refused**, exactly as it is today, and archiving a project never archives anything beneath it —
an implicit cascade would archive work the caller never named. A whole-tree Archive page makes
archived work *findable*; it does not make archiving *contagious*.

Because undo must never be behind a toggle, disabling the Archive page leaves **Open archive**
in the project **More** menu, which enables and opens it. The control is available from root and
nested work routes, and it navigates only after the root page context has reconciled successfully.
If reconciliation fails after enabling, the current location is preserved and a read-only retry
is offered.

*Landed in Slice 27.* The secondary navigation column has no Open archive button; the project's
More menu is the single recovery entry point from root and nested work routes.

*Landed in Slice 29: Archive lists **recoverable content**, not every section tombstone.* A
removed or hidden section is listed only when something in it remains to recover: a Task List
or Reflections container with any rows still assigned to it (archived rows included), Rich Text
whose only config is prose that trims to something (an empty config holds nothing), or a type or config the domain cannot read as
empty (listed conservatively as unknown content). Removed Progress, Timeline, Recent Activity and
Sub-Projects views — and a container emptied by reassignment, or blank prose — are deleted
when no canonical row or shortcut references them. Historical tombstones remain unlisted;
shortcut-backed disposable sections keep an internal tombstone, leaving Home's source
unavailable placeholder intact. Archived sub-projects, tasks and reflections are
listed exactly as before. Each section entry carries the domain's recovery metadata: the total
rows still in the container, apart from the exact count that restores with it and the number of
row restores still needed afterwards (a subtask archived with its parent comes back with it). A container
holding only independently archived rows stays listed on purpose — it is the first step of their
recovery: restore the section, then restore those rows individually. Supplying `reassign` does
not change this branch: no rows move unless at least one live row makes settlement necessary.
When live rows do require reassignment, all rows assigned to the source, including independently
archived subtrees, move together. A live container beneath an
archived project needs only that project's reactivation. Restore itself is unchanged: it appends
to the page's current combined order, revives exactly its cascade, and a retry changes nothing
([why](docs/decisions/2026-09-content-oriented-archive-policy.md)).

*Landed in Slice 30, extended in Slice 31 and amended in Slices 35–36: **Undo and Redo** are distinct
from Archive Restore.* Every supported section, task and reflection write records one typed action
into the actor's **operation history** for the owning project, in the same unit of work, and returns
a receipt with its final entity. Undo puts a removed section back on its page
**between the neighbours it left** — after the surviving previous section or shortcut, else before
the next, else at its old index — with exactly the rows the removal archived or moved, keeping later
edits such as a renamed task. Redo re-removes exactly what the removal removed, replaying its
recorded state. The history is **bidirectional and per exact actor**: a person or agent connection
steps only its own stack, only the next action in either direction, for 24 hours per action and 50
actions per history. A transition requires the stored action family's one write grant —
`projects.write` for a section, a Home shortcut placement, an optional page or an existing
project's own write, `tasks.write` for a
task, `reflections.write` for a reflection; a new write discards what was waiting to be redone. A
transition refuses rather than overwrite a later change (a moved row, a new subtask under a moved
task, a new row in a section being re-removed), while the project or an ancestor is archived, or
after the action expired. An action that can never succeed again — the section restored from Archive
by **someone else**, or removed again since — is **retired** so the actions beneath it stay
reachable. Archive Restore remains the durable path for sections: no receipt is needed to invoke
it, it never expires, and it appends. *Since Slice 37* a Restore that changes something also
records an action of its own, so the same actor can take the Restore back before undoing the
removal beneath it; a repeat on a live section still writes nothing and carries no receipt. Task
and reflection Restore are ordinary row writes and therefore record new history actions
([scope](docs/decisions/2026-09-operation-history-scope.md),
[retention](docs/decisions/2026-09-operation-history-retention.md),
[retired actions](docs/decisions/2026-09-operation-history-retired-actions.md),
[removal footprint](docs/decisions/2026-09-section-removal-undo-records.md)).

*Landed in Slice 37.* Undoing a recorded Restore is **not** the removal: it re-archives the section
at the marker, generation and stored position the Restore found, and takes back down exactly the
rows that Restore revived. It never runs removal policy, never deletes the section, never advances
`archiveGeneration`, and never touches a row that was archived independently beforehand. It refuses
rather than hide a live row added since, and Redo refuses rather than absorb a row now marked as
having come down with the section. The first ordinary Restore appends; a Redo returns the section to
the placement that Restore committed. An action whose section has moved on to a later generation is
retired, because nothing can bring that generation back
([why](docs/decisions/2026-09-section-restore-and-shortcut-history.md)).

*Landed in Slice 38.* §26's optional-page toggle joins the same history as a fifth operation family.
The enable that created a page is a creation, so its inverse removes that page after proving the
record is unchanged and that no canonical section — archived ones included — and no shortcut
placement names it; a dependency refuses the whole transition and asks for the reference to be
removed, never for it to be archived, because an archived section still names its page. Every later
toggle reverses one boolean and touches nothing else, so a disabled page's content is as safe under
Undo as it is under the ordinary disable. No page conflict is permanent: an occupied id, a changed
record or a live dependency all stay repairable. The ordinary toggle keeps this section's archive
exemption; the transition does not
([why](docs/decisions/2026-09-optional-page-operation-history.md)).

*Landed in Slice 39.* An existing project's update, archive and reactivation join the same history as
a sixth operation family. Archiving still never cascades, and a history step may not acquire a
cascade: redoing an archive, or undoing a reactivation, refuses while any child is live. The freeze
keeps one narrow exception, for the project's **own** status only: an archive's Undo, a
reactivation's Redo and an edit made while the project was already archived may run while that same
project is archived, because the ordinary write allowed them and refusing would wedge the stack on
the very project it is about. An archived **ancestor** still blocks every step, and no other family
gets the exception. The history summary keeps naming the archived project as the blocker, so a later
control must know which single step is still eligible. Durable restoration is unchanged: it takes an
explicit status and needs no receipt
([why](docs/decisions/2026-09-project-update-operation-history.md)).

The browser holds the receipt in the current canvas session and offers **Undo** there; dismissal
removes the notice, successful Undo replaces it with a result, and the newest successful explicit
section operation — add, move, settings update or removal — replaces the receipt. Page/project navigation or reload clears the local state.
The server action remains independently scoped to the exact actor for 24 hours. If a removal
response is lost, repeating it remains a refusal; while that removal is still the actor's applied,
unexpired action, the exact actor receives its receipt in HTTP `details` or MCP error text, without a
second write or event. The browser also offers an explicit retry of the original removal after a
live refresh removes its frame. A deleted disposable section's `{ section, operation }` response uses an archived-shaped
snapshot for compatibility and does not claim the section remains stored. Archive is available
as a recovery destination for retained content; it does not promise to recreate a deleted view
([decision](docs/decisions/2026-09-disposable-removal-and-immediate-undo.md)).

*Landed in Slice 25.6: the per-canvas Archived region was replaced by the root-wide Archive
page, which keeps cascade members and effectively hidden live work findable, explains blockers,
and delegates every restore to the existing canonical domain operation. Disabling the page no
longer makes undo unreachable.*

*The same slice made the rest of this section's visibility promise real, and the two halves of
it are not the same rule. **Archived owners** are excluded by the `status` filter each aggregate
read already had — the dashboard, workspace search and upcoming work — and by the unscoped task
list, which had none. **Live work beneath an archived ancestor** is excluded by all of those and
by the project list too, which still returns a project archived in its own right so that
`status: ['archived']` keeps working and an archived project's own Sub-Projects section still
lists what is under it. A read that names a project or a section always answers, because an
archived project's own page keeps rendering.*

*Writes beneath an archived ancestor are refused naming the ancestor, and the two operations
that could produce that state — reparenting under an archived project, and reactivating beneath
one — are refused too, so the rule cannot strand the work it has just hidden
([why](docs/decisions/2026-09-reactivating-under-an-archived-ancestor.md)).*

*Slice 25.4 applies the same visibility distinction to Home shortcuts: an archived source
section is unavailable in place, and live content whose project or ancestor is archived is
hidden in place, even though a direct read naming that section can still answer. Reactivating
the source owner or restoring the source section revives the reference.*

*The 25.8 integrated browser/MCP journey exercised direct task and section recovery from the root
Archive page, then reactivated an archived intermediate subproject with an explicitly chosen status.
Its live descendant returned after reload, while independently archived rows stayed archived. The
manager and **Open archive** path kept recovery reachable from nested navigation.*

Example:

```text
ProjectSectionFrame
        │
        └── TaskListSection
```

---

# 32. Section Editing

Canvas organization uses contextual controls rather than a separate layout-editing mode.
Sections and Home shortcut placements share the page's ordered layout. Their drag handles,
collapse controls, rename affordance, resize handles and removal controls are reserved in the
frame but revealed on hover or keyboard focus. Controls remain visible on hoverless or coarse-
pointer devices. Revealing them does not shift content, and the overlays are inert while a drag
is in progress.

The canvas provides insertion points before placements and at the end; Grid also exposes
insertion targets in available gaps, but only when a supported width fits. A gap is an
opportunity in the existing ordered layout, not a reserved cell. Selecting one opens the
creation dialog at that location. The dialog provides section types permitted on the current
page, a name field, Create and Cancel; a blank name uses the type's default. Cancel or Escape
creates nothing, and a pending submission cannot create duplicates. A failed write preserves
the entered values and displays an error. Root Home additionally offers the eligible-source
picker for **Add shortcut**; subproject work canvases do not. A shortcut's source remains
read-only and is edited through **Open source** (§27).

Widths snap to the supported 4, 6, 8 or 12 column spans in Flow and Grid. Dragging previews the
new arrangement and releasing saves it; Escape cancels. Order remains stable through resize, and
placements reflow without overlap or canvas overflow. Keyboard users can move a placement and
preview resize steps, commit a resize with Enter or blur, and cancel with Escape. Resize saves
are optimistic: a failure restores only the previous column span, preserving unrelated placement
changes. On narrow screens that render placements full-width, resize handles are hidden while
the saved desktop spans remain unchanged.

*Landed in Slice 27.* The separate Edit Layout Mode and its toggle are removed. Canvas controls
are available in place, and accessible keyboard and touch interactions cover the same movement,
resize, creation and removal operations. Rename and dialog callbacks return write results so the
visible control can preserve input and report an error rather than losing a failed action
([why](docs/decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)).

The **Archive** page is *not* canvas chrome and stays reachable: it is content. Archive Restore
remains the durable recovery path for retained content; a receipt-based Undo action is also
available in the canvas that made the removal. *Since Slice 37* a section Restore is itself one of
the actor's actions, reversible from the same history — durability and reversibility are not in
tension, because Restore still needs no receipt to invoke and still survives every expiry. The canvas's **Open Archive** action lets a
person check saved content without promising that a deleted disposable view will appear there.
Gating recovery behind Edit Layout Mode would hide it exactly when someone needs it — right
after a removal they did not mean. The per-row archive control in §34 is likewise a row
affordance rather than a layout one. The same reasoning carries to the project controls that
open the page even when its tab is disabled.

Shortcut placements (§27) are layout. Adding and removing one uses the same contextual
insertion and removal controls as sections; the source content a placement renders remains
read-only.

*Landed in Slice 25.4: **Add shortcut** and **Remove shortcut** operate on a placement, while
collapse, span and the combined CDK order belong to that placement. The embedded source stays
read-only; removing the placement does not archive its source.*

*Landed in Slice 27.* Root Home's contextual creation dialog adds eligible shortcuts at the
selected position; the shortcut frame exposes remove in place. Neither action is gated by an
editing mode, and subproject work canvases do not offer shortcut creation.

Angular CDK should be used for reorderable drag/drop interactions rather than implementing pointer sorting from scratch.

---

# 33. Task Model — Prototype

Start flexible.

```ts
interface Task {
  id: TaskId;
  projectId: ProjectId;

  parentTaskId?: TaskId;

  title: string;
  description?: string;

  status: TaskStatus;
  priority: TaskPriority;

  startAt?: string;
  dueAt?: string;
  completedAt?: string;

  createdAt: string;
  updatedAt: string;
}
```

Initial statuses:

```text
todo
in_progress
blocked
done
cancelled
```

One of the prototype's explicit goals is determining whether all five are useful.

---

# 34. Task Interactions

Support:

```text
quick create

inline completion

inline title editing

detail drawer

drag ordering

move project

priority

start date

due date

subtasks

archive

restore
```

Archiving a task takes its subtasks with it, and restoring it brings back exactly those — a
subtask archived on its own beforehand stays archived. A subtask cannot be restored on its own
while its parent or its section is archived; restore the one that took it down instead.
Archived rows are reached through §31's Archive page.

Prefer a side drawer over a modal for detailed task editing so workspace context remains visible.

## The Todos page

A root's optional **Todos** page answers one question: *what is coming up, across everything
under this project?* It is a derived chronological projection, not another owner of rows.

It contains the root's own tasks plus every descendant subproject and every descendant task.
Subprojects appear because a unit of work with a due date is a thing to do, and a list that
omitted them would be lying about the week.

```text
sort   due date ascending
then   undated last
then   deterministic tie-break by kind, then ID
```

A subproject's date-only due date and a task's due date compare under the existing calendar
convention (§45, `docs/decisions/2026-08-task-date-only-due-time.md`), which timezone tests
pin rather than assume.

Rows show their completion state and **stay on the list once finished** — completed *and*
cancelled, since a task that was dropped is part of the week's record too, and a chronology
that erases what happened is a worse record than one that shows it. Archived entities, and
anything beneath an archived ancestor, are excluded. Every row carries an origin breadcrumb
and links to its canonical owner; completing one there and completing it here are the same
operation on the same row.

There is no drag ordering on Todos. The order is the chronology.

*Landed in Slice 25.5.* `ProjectTodosService.derive` is the one query behind the page,
`GET /api/projects/:id/todos` and `get_project_todos`; it returns the canonical `Task` and
`Subproject` records rather than copies, and requires both `projects.read` and `tasks.read` (§54).
Two instants are compared as **text** — a fixed-width whole-second prefix plus right-padded
fractional digits — because §11's `IsoDateTimeSchema` admits omitted seconds and arbitrary
fractional precision that `Date.parse` would collapse; ties then use kind (a unit of work before a
task) and the ordinal id. Reading the chronology does not require the Todos tab to be switched on:
enabling a page is navigation state, not a content permission. Completion is one-way — finished
rows stay on the list with no control, and reopening uses the canonical canvas the row lives on,
which is also where a row's link lands, at its own container
([entry](docs/decisions/2026-09-todos-chronology-and-canonical-navigation.md)).

*The 25.8 showcase deliberately inserted a dated work/task tie, completed and cancelled rows, and
an undated work unit in scrambled order. The browser and MCP journeys observed the deterministic
chronology, retained finished states, and followed a nested row to its canonical work container;
the source rows remained singly owned.*

---

# 35. Milestones

Milestones remain distinct from tasks initially.

Properties:

```text
title
description
targetDate
status
```

Prototype question:

> Does a milestone actually need its own model, or should it eventually become a special task?

Do not answer this prematurely.

---

# 36. Reflections

Reflections should feel closer to a lightweight project journal than a task.

Support:

```text
write reflection

timestamp

optional title

edit

view chronology
```

Prototype possible prompts:

```text
What changed?

What went well?

What's blocked?

What should happen next?
```

Prompting should remain optional.

## Reflecting on completed work

A reflection may optionally name what it is *about*:

```text
subject?: { kind: 'task' | 'subproject'; id }
```

When it is assigned, the subject must exist as completed, visible work in the same root tree. It
is **separate from ownership**: the reflection still belongs to the reflections container it was
written into, and attaching a subject moves nothing. The stored link carries ids only; the
journal resolves current subject facts separately. If later reparenting takes the subject out of
the root tree, the historical link remains but its resolved view is omitted.

The completed-work composer requires a subject that is currently completed — the point is to
reflect on finished work while it is fresh. General journal entries with no subject remain
first-class and are not a legacy shape.

What happens afterwards matters more than what happens at creation. If the subject is later
reopened or archived, the reflection **survives**, keeps its association, and displays the
subject's current state. A journal that quietly discarded entries when their subject changed
status would be worthless as a record.

## The Reflections page

A root's optional **Reflections** page shows the journal: newest reflection first, aggregated
from Home, from the page's own container and from descendant work canvases — aggregated, not
moved. Alongside it sits a picker of completed work to reflect on. The page's composer names
the container it writes into rather than resolving one invisibly. The feed is read-only and links
back to each canonical owner; a canvas shows only a neutral linked marker, so it does not need a
whole-tree subject read.

*Landed in Slice 25.7. The page, root journal projection and completed-work picker are backed by
the same contracts and domain read rules over HTTP; the root journal is also available through
MCP.*

*The 25.8 showcase combined general, task-linked and subproject-linked entries, then reopened one
subject. The root feed retained the entry and displayed the subject's current state, while the
page composer continued writing to its one canonical container. A real HTTP MCP write appeared in
the open browser surface, confirming the aggregate is a projection rather than a second owner.*

*Amended in Slice 36:* reflection history captures the subject before and after an edit. Undo/Redo
may restore a historical task or subproject subject that is now reopened or archived, but it still
refuses a missing or foreign-workspace subject. This preserves history without weakening eligibility
for a fresh assignment
([decision](docs/decisions/2026-09-reflection-subjects-and-the-journal-feed.md)).

---

# 37. Calendar

The calendar derives content from:

```text
task start dates

task due dates

milestones

project deadlines
```

Initial views:

```text
month

agenda
```

Week view is optional during prototyping.

Do not duplicate these records into separate calendar-event rows.

---

# 38. Timeline

Timeline derives from the same underlying entities.

Display:

```text
project range

sub-projects

tasks with ranges

milestones
```

Prototype focus:

- information density
- usefulness
- interactions

Not advanced scheduling.

---

# 39. Progress

Prototype several formulas behind a feature setting.

### Count Based

```text
completed tasks / total tasks
```

### Weighted

Task estimates influence progress.

### Manual

User enters progress.

This is exactly the kind of decision the prototype should test rather than resolve in the initial specification.

*Amended in Slice 39:* the chosen formula and a manual value are an ordinary project write, so
changing them records one project action that Undo and Redo reverse exactly. A reversal that would
leave the manual formula without a value refuses rather than invent one
([why](docs/decisions/2026-09-project-update-operation-history.md)).

---

# 40. Search

Prototype global search across:

```text
projects

tasks

milestones

reflections
```

Use simple in-memory matching.

No search infrastructure.

Potential prototype ranking:

```text
exact title

title contains

description/content contains
```

No vectors.

---

# 41. Command Palette

Add:

```text
Ctrl/Cmd + K
```

early.

The command palette can become an important product interaction.

Potential actions:

```text
Open project

Create task

Create project

Search

Go to calendar

Add reflection

Toggle project editing
```

This also provides useful insight into what operations deserve MCP tools.

---

# 42. AI Feature Architecture

Define:

```ts
interface AIProvider {
  generateDailyDigest(
    context: DailyDigestContext
  ): Promise<GeneratedContent>;

  generateProjectSummary(
    context: ProjectSummaryContext
  ): Promise<GeneratedContent>;
}
```

Prototype implementation:

```text
PrototypeAIProvider
```

Future:

```text
OpenAIProvider
```

---

# 43. Prototype AI

Do not require API keys.

Generate deterministic or fixture-based responses.

Example:

```text
You have 5 tasks scheduled today.

The Portfolio project has the closest deadline.

2 tasks became overdue yesterday.

You completed 6 tasks during the last seven days.
```

The content should *feel* AI generated even though it is locally composed.

This allows UI testing without:

- cost
- latency variability
- prompt engineering
- network dependency

---

# 44. Optional Real AI Mode

Keep an optional developer-only adapter:

```text
RealAIProvider
```

behind an environment variable.

Example:

```text
PROTOTYPE_AI_PROVIDER=mock
```

or:

```text
PROTOTYPE_AI_PROVIDER=real
```

Real AI must never be required to run the prototype.

---

# 45. Time Abstraction

Do not directly call:

```ts
new Date()
```

throughout domain logic.

Define:

```ts
interface Clock {
  now(): Date;
}
```

Prototype:

```text
PrototypeClock
```

Allow the developer to simulate:

```text
Monday morning

Friday afternoon

end of month

deadline tomorrow
```

This makes dashboard and calendar testing dramatically easier.

---

# 46. Prototype Development Panel

Create a development-only panel.

Suggested shortcut:

```text
Ctrl/Cmd + Shift + D
```

Controls:

```text
Persona

Seed

Current Date

Theme

Layout Mode

AI Provider

Network Delay

Failure Rate

Agent Connection

Feature Flags
```

Example:

```text
Latency
○ none
● 300 ms
○ 1 second
○ 3 seconds
```

This allows loading states to actually be evaluated.

---

# 47. Feature Flags

Define prototype flags centrally.

Example:

```ts
interface PrototypeFlags {
  gridProjectLayout: boolean;
  nestedProjects: boolean;
  subtasks: boolean;
  manualProgress: boolean;
  aiSummarySections: boolean;
  agentConfirmations: boolean;
}
```

Never scatter:

```ts
if (prototypeMode)
```

through random components.

---

# 48. MCP Prototype Goals

The MCP prototype should be treated as a **real product experiment**.

We want to learn:

- which tools agents understand
- how many tools are too many
- appropriate tool granularity
- result size
- search behavior
- permission behavior
- confirmations
- agent activity UX
- how project context should be represented

The underlying cloud authentication system is not the experiment.

---

# 49. MCP Prototype Architecture

```text
Claude / Cursor / MCP Client
            │
            │
            ▼
localhost:4310/mcp
            │
            ▼
MCP Adapter
            │
            ▼
Agent Authorization
            │
            ▼
Domain Services
            │
            ▼
JSON Repositories
            │
            ▼
.prototype/data.json
```

The same domain layer serves the web application.

---

# 50. MCP Protocol

Prototype against the real current MCP protocol.

Target:

```text
2026-07-28
```

Use the official TypeScript SDK v2.

The v2 SDK is the stable TypeScript implementation for the current 2026-07-28 protocol.

HTTP endpoint:

```text
http://localhost:4310/mcp
```

Use the SDK's modern HTTP serving mechanism rather than inventing an MCP protocol implementation.

The SDK's `createMcpHandler()` supports the current per-request HTTP model and can also support stateless legacy clients where desired.

---

# 51. Prototype MCP Authentication

Do **not** build production OAuth during the first prototype.

Use:

```text
PrototypeAgentAuthenticator
```

with local development credentials.

Conceptually:

```text
Authorization: Bearer prototype-user-a-readwrite
```

The authenticator resolves:

```ts
{
  userId: "user-a",
  connectionId: "agent-claude",
  permissions: ["projects.read", "tasks.read", "tasks.write"]
}
```

These tokens have no production security value.

They must only function on localhost.

---

# 52. Prototype Agent Connections

Still model connections realistically.

```text
agent_connections
```

Example:

```json
{
  "id": "agent-1",
  "userId": "user-a",
  "name": "Claude",
  "permissions": [
    "projects.read",
    "tasks.read",
    "tasks.write"
  ],
  "revoked": false
}
```

This allows the actual **permission model** to be tested without implementing OAuth.

---

# 53. Prototype Permission UI

Settings:

```text
Settings
→ AI & Agents
```

Display:

```text
Claude

Read projects       ✓
Modify projects     ✗
Read tasks          ✓
Modify tasks        ✓
Write reflections   ✗

Last used: 4 minutes ago

[Revoke]
```

Changes should immediately affect subsequent MCP tool calls.

---

# 54. Initial MCP Tools

Start intentionally small.

## Projects

```text
list_projects

get_project

create_project

update_project
```

## Tasks

```text
list_tasks

get_task

create_task

update_task

complete_task
```

## Reflections

```text
list_reflections

add_reflection
```

## Workspace

```text
search_workspace

get_upcoming_work

get_dashboard_context
```

## Roots, work units and pages

Once projects split into roots and subprojects (§26), an agent must be able to say which it
means. Creating a root and creating a unit of work are **distinct, discoverable operations**,
not one call whose meaning depends on whether a parent happened to be passed. A call whose
kind and parent contradict each other is rejected rather than reinterpreted.

Pages get their own small surface — listing a root's pages, toggling an optional one, and
querying the derived Todos, Archive and Reflections projections:

```text
list_project_pages

set_project_page_enabled

get_project_todos

get_project_archive

get_project_journal
```

Shortcuts (§27) are created and removed through their own tools, and archive/restore are
canonical tools on projects, sections, tasks and reflections. An agent undoes and redoes its own
section, task and reflection operations through its own history with `get_operation_history`, `undo_operation` and
`redo_operation`; it can never reach a person's history, or another connection's.

**A page is never a permission bypass.** Resolving a shortcut's source content requires the
read permission for the *content*, not merely permission to see the layout that references it:
discovering that a placement exists is `projects.read`, and loading the tasks behind it is
`tasks.read`. A derived page that combines categories requires the grant for each category it
returns, and denies rather than returning a partial answer. Everything stays inside the
actor's own workspace and the root tree it asked about.

*`list_project_pages` and `set_project_page_enabled` landed in Slice 25.2, under
`projects.read` and `projects.write`; `create_project` and `create_section` now say in their
descriptions which kind of project takes pages and which pages take which sections.
Slice 25.5 adds `get_project_todos`, the first tool to need more than one grant: it declares
`projects.read` **and** `tasks.read`, and the domain denies outright without either rather than
answering with the half it was allowed to read. `WorkManagerTool` carries the extra grants in an
optional `additionalPermissions`, and the transports publish the complete list under
`_meta["local.canvas-work-manager/requiredPermissions"]` beside the unchanged singular key.
`get_project_archive` and the Archive page landed in Slice 25.6. The query requires
`projects.read`, `tasks.read` and `reflections.read` together, returns archived and effectively
hidden work with origin/cause/blocker guidance, and does not depend on the Archive tab being
enabled. Since Slice 29 its section entries are the recoverable-content projection of §31, each
with `recovery` metadata (`owned-content` with `contentCount` and `separateRestoreCount`, `config`, or `unknown`) beside the
exact `cascadeCount`; the tool's shape is otherwise unchanged. Slice 25.4 adds `list_section_shortcuts` under `projects.read` and
`add_section_shortcut` / `remove_section_shortcut` under `projects.write`; the list returns
placement and source identity only, never source rows. Canonical archive/restore tools remain
the same operations used by the UI: `archive_project` / `restore_project`, `remove_section` /
`restore_section`, `archive_task` / `restore_task`, and `archive_reflection` /
`restore_reflection`. Project restoration requires an explicit non-archived status. Slice 25.7
adds `get_project_journal` with the same three read grants: it aggregates live journal entries
from the root tree, resolves current linked-subject state (including an archived subject), and
does not depend on the Reflections tab being enabled.*

*Landed in Slices 30–32, amended in Slice 35: `create_section` and `remove_section` return
`{ section, operation }` (removal adds `archiveListed`), while `move_section` and `update_section`
return `{ section, operation }` with `operation: null` for a normalized no-op. The receipt names the
`historyId`, `actionId` and the history's `revision`, typed `section.add`, `section.move`,
`section.update` or `section.remove`; update actions carry only changed title/config/collapse/span
fields, move actions carry before/after placement anchors for the page's combined order, and add
actions carry the placement Redo returns to. A disposable section can be absent from storage even
though the removal response snapshot carries `archivedAt`. `get_operation_history`
(`projects.read`, input `{ projectId }`) returns the connection's own summary — the next Undo and
Redo, the revision and any archived blocker. `undo_operation` and `redo_operation`
(`projects.write`, input `{ historyId, actionId, expectedRevision }`) run exactly the next action in
their direction for the exact actor whose history it is.
MCP errors carry no structured details, so refusal text starts with its reason. Repeating a
removal recovers only that actor's applied, unexpired removal receipt in `section_already_removed:`;
it remains a refusal with no second write. Conflicts include current names and ids plus typed next
steps, capped at five; blocked refusals name the blocking project. The history refusal prefixes are
`history_not_next:`, `history_revision_stale:`, `history_expired:`, `history_blocked:`,
`history_conflict:`, `history_unavailable:` and `history_retired:`. The registry now holds
thirty-seven tools
([removal footprint](docs/decisions/2026-09-section-removal-undo-records.md),
[Slice 31 decision](docs/decisions/2026-09-disposable-removal-and-immediate-undo.md),
[Slice 32 decision](docs/decisions/2026-09-section-edit-undo-boundaries.md),
[Slice 35 scope](docs/decisions/2026-09-operation-history-scope.md),
[Slice 35 route and tool shapes](docs/decisions/2026-09-history-stage-a-deferrals.md)).*

*Amended in Slice 36:* task writes return `{ task, operation }` and reflection writes return
`{ reflection, operation }`; normalized no-ops carry `operation: null`. Add may own an implicitly
created container and reverse/replay it with the row and stable ids. `undo_operation` and
`redo_operation` publish `requiredPermissionsByOperationFamily` and require only the stored
action family's `projects.write`, `tasks.write` or `reflections.write`. A write-only agent can
chain from receipts and returned summaries without reading history
([row history](docs/decisions/2026-09-row-operation-history.md),
[permission map](docs/decisions/2026-09-operation-family-permissions.md)).*

*Amended in Slice 38:* `set_project_page_enabled` returns `{ page, operation }` — a `page.add`
receipt when the call created the record, `page.update` when it moved an existing switch, and
`operation: null` when the page was already where the call asked it to go. Both are reversed through
`undo_operation` under `projects.write` alone, and the grant map discovery publishes gains a fifth
family, `page`, for them. The tool's name, input and permission are unchanged.*

*Amended in Slice 39:* `update_project`, `archive_project` and `restore_project` return
`{ project, operation }` — a `project.archive` receipt when the status entered `archived`,
`project.reactivate` when it left it, `project.update` otherwise, and `operation: null` when nothing
changed (archiving an archived project included). All three are reversed through `undo_operation`
under `projects.write` alone, and the grant map discovery publishes gains a sixth family, `project`.
`create_project` still returns the bare project. Names, inputs and permissions are unchanged
([why](docs/decisions/2026-09-project-update-operation-history.md)).*

*Amended in Slice 37:* `restore_section` returns `{ section, operation }`, with `operation: null`
for a repeat on a live section, and `add_section_shortcut` returns `{ shortcut, operation }` while
`remove_section_shortcut` returns `{ shortcutId, projectId, pageId, operation }` in place of the
bare placement and `undefined` it answered before. A fourth operation family, `shortcut`, joins the
family map both history tools publish; it needs `projects.write`, the same grant `section` does,
and is named separately so a later split is a value change rather than a breaking one. The registry
still holds thirty-seven tools: duplication and shortcut resize, collapse and move remain
HTTP-and-domain operations with no tool of their own ([why](docs/decisions/2026-09-section-restore-and-shortcut-history.md)).*

*The 25.8 HTTP acceptance exercised the combined Todos, Archive and Journal reads with the declared
grant matrix, including no-partial-result denials and a read-only connection's write refusal. The
Settings path was also used to remove `tasks.read` from Claude; the denied call named the exact
missing grant (`connection "agent-claude" is missing permission "tasks.read"`) before the grant
was restored. Successful writes were visible in the connection/project activity with Claude
attribution.*

---

# 55. MCP Experimental Tool Registry

Each MCP tool should be registered from a reusable definition.

Conceptually:

```ts
interface WorkManagerTool {
  name: string;
  description: string;

  permission: AgentPermission;

  inputSchema: ZodSchema;

  execute(
    input: ParsedInput,
    context: ToolContext
  ): Promise<unknown>;
}
```

The MCP transport only exposes these definitions.

This allows tool semantics to change independently from MCP plumbing.

Two corrections the Slice 14 build made to this section:

- The context is `{ actor: ActorContext; services: WorkManagerServices }`. The actor half
  **is** `ActorContext` — the type the domain already defines and every service already
  takes; there is no separate `AgentContext`, because §11 allows one definition of a shape.
  The services half is what a tool calls: domain services only, closed over per registry.
- `execute` receives **parsed** input, not `unknown`. The registry validates against the
  tool's own `inputSchema` before delegating, so `unknown` would only force every tool to
  parse its input a second time.

See docs/decisions/2026-08-tool-registry-is-transport-free.md.

*Amended in Slice 36:* a third correction. `permission: AgentPermission` is no longer a single
field. A tool declares **either** a static `permission` **or** `permissionsByFamily: true`, and
the two are mutually exclusive. `undo_operation` and `redo_operation` take the second shape,
because the grant a transition needs depends on the family of the action stored in the history —
`projects.write` for a section, `tasks.write` for a task, `reflections.write` for a reflection —
and a state-dependent grant cannot be written as a static field without stating something false.
The one mapping is shared by discovery, the coverage tests and domain enforcement; enforcement
stays in `OperationHistoryService`, never in the transport
([decision](docs/decisions/2026-09-operation-family-permissions.md)).

---

# 56. MCP Tool Experiments

The prototype should make tool variants easy to test.

Example:

### Variant A

```text
complete_task(taskId)
```

### Variant B

```text
update_task(
  taskId,
  status
)
```

Measure which approach agents use more reliably.

Another example:

### Separate

```text
find_project
find_task
```

versus:

### Combined

```text
search_workspace
```

The prototype exists to answer these questions experimentally.

---

# 57. MCP Activity Events

Every MCP mutation should produce an event.

Example:

```text
Claude

Completed:
"Configure deployment"

Project:
Work Manager

11:32 AM
```

The UI should clearly distinguish:

```text
user action

agent action

system action
```

*Landed in Slices 30–32, extended in Slices 35–36: a history transition records one
operation-specific event against the project — `project.section_removal_undone`,
`project.section_addition_undone`, `project.section_move_undone` or
`project.section_update_undone` for Undo, and the matching `project.section_removal_redone`,
`project.section_addition_redone`, `project.section_move_redone` or
`project.section_update_redone` for Redo, with equivalent `task.*` and `reflection.*` transition
events targeted at the row — attributed like any other write. A retirement executes nothing and
records no event. The action it ran is stored in its history, never on the event. Activity captures
the project/root scope and task title or reflection label it displayed, so Undo of a row Add may
remove the row without erasing the audit entry's identity
([decision](docs/decisions/2026-09-historical-activity-identity.md)).*

*Extended in Slice 37:* `project.section_restoration_undone` / `_redone` and
`project.shortcut_addition_undone` / `_redone`, `project.shortcut_update_undone` / `_redone`,
`project.shortcut_move_undone` / `_redone` and `project.shortcut_removal_undone` / `_redone`. Each
targets the **destination project**, exactly as the ordinary `project.shortcut_*` events do, so no
new missing-target case arises and the same projections refresh for a write and for its reversal.*

*Extended in Slice 38:* `project.page_addition_undone` / `_redone` and
`project.page_update_undone` / `_redone`. Each targets the owning **project**, exactly as the
ordinary `project.page_enabled` and `project.page_disabled` events do — `ActivityEntityType` gains no
`page` member, so a removed page does not take its audit history with it — and each successful step
publishes one event and one root-scoped live frame after commit.*

*Extended in Slice 39:* `project.update_undone` / `_redone`, `project.archive_undone` / `_redone`
and `project.reactivation_undone` / `_redone`. Each targets the **subject project**, exactly as the
ordinary `project.updated` and `project.archived` do, and each successful step publishes one event
and one live frame after commit. A write and its transition both record one event; a refusal records
none.*

---

# 58. Agent Confirmation Experiments

Introduce an optional confirmation layer.

Feature flag:

```text
agentConfirmations
```

Possible prototype rules:

```text
create task
→ no confirmation

complete task
→ no confirmation

archive task
→ confirmation

archive project
→ confirmation

bulk changes
→ confirmation
```

Modern MCP supports multi-round-trip/input-required patterns, so confirmation behavior can eventually be tested against real protocol behavior rather than inventing a proprietary mechanism.

---

# 59. MCP HTTP and Stdio Modes

Primary prototype mode:

```text
Streamable HTTP
```

because it most closely matches production.

Also provide an optional local stdio entry:

```text
pnpm mcp:stdio
```

Both should register the exact same MCP tools.

```text
                MCP Tool Registry
                /               \
               /                 \
       HTTP Adapter          Stdio Adapter
```

This allows testing with clients that make local stdio integrations easier.

The official SDK provides both HTTP and stdio serving paths.

---

# 60. MCP Tests Without Running a Server

MCP contract tests should call the SDK handler in-process.

```text
test
 ↓
MCP client
 ↓
in-process fetch
 ↓
MCP handler
 ↓
domain service
 ↓
in-memory repository
```

The official v2 SDK specifically documents this pattern for testing modern `2026-07-28` behavior without opening sockets.

This should make MCP tests fast and deterministic.

---

# 61. Prototype API

The Prototype Host may expose REST-style endpoints.

Examples:

```text
GET    /api/projects

POST   /api/projects

GET    /api/projects/:id

PATCH  /api/projects/:id

GET    /api/tasks

POST   /api/tasks

PATCH  /api/tasks/:id

GET    /api/dashboard

GET    /api/search
```

These do not need to be considered final production routes.

Their main purpose is to exercise the Angular gateway boundary realistically.

*Landed in Slices 30–32: `POST /api/projects/:projectId/sections` answers with a section and
creation receipt; `PATCH /api/sections/:id` answers with a field-aware update result;
`POST /api/sections/:id/move` answers with a placement-aware move result; and
`DELETE /api/sections/:id` answers 200 with the final
archived-shaped section snapshot and its operation receipt; a disposable section may already be
absent from storage. *Amended in Slices 35–36:* `GET /api/projects/:id/history` answers the caller's
own history summary under `projects.read`, and `POST /api/history/:historyId/transition` runs one
step from a strict `{ actionId, direction, expectedRevision }` body under the stored action family's
write grant. Task and reflection mutation routes answer strict `{ task|reflection, operation }`
envelopes rather than bare rows.
History refusals are 409s whose `details` carry a typed reason — `history_not_next`,
`history_revision_stale`, `history_expired`, `history_blocked`, `history_conflict`,
`history_unavailable` or `history_retired` — and the current summary; a stale revision stays a 409,
another actor's or an unknown history is 404, and a missing write grant is a 403 naming it. The same
strict inputs and semantics apply over HTTP and MCP. Repeating a removal remains 409 but returns
`section_already_removed` details with the exact actor's applied, unexpired removal receipt and no
new write or event. The API still forwards only contracts, never inverse payloads.*

*Amended in Slice 37:* `POST /api/sections/:id/duplicate` answers the same `{ section, operation }`
envelope a create does; `POST /api/sections/:id/restore` answers `{ section, operation }`, with
`operation: null` for a retry on a live section; `POST /api/projects/:projectId/shortcuts`,
`PATCH /api/shortcuts/:id` and `POST /api/shortcuts/:id/move` answer `{ shortcut, operation }`,
the last two with `operation: null` for a no-op; and `DELETE /api/shortcuts/:id` answers **200**
with `{ shortcutId, projectId, pageId, operation }` rather than 204, because a body-less status
cannot carry a receipt. Route names and inputs are unchanged, and no route in the API table answers
204 any more; the router's CORS preflight still does.*

*Amended in Slice 38:* `PATCH /api/projects/:projectId/pages/:kind` answers
`{ page, operation }` rather than the bare page, with `operation: null` for a toggle that changed
nothing. The route, its path-wins kind resolution and its statuses are unchanged, and the API still
forwards only contracts — never a captured page snapshot.*

*Amended in Slice 39:* `PATCH /api/projects/:id` answers `{ project, operation }` rather than the
bare project, with `operation: null` for a write that changed nothing. `POST /api/projects` still
answers the bare project. Statuses and inputs are unchanged, and no captured field footprint is ever
returned.*

---

# 62. Live Updates

When MCP changes something, the open browser should reflect it.

Prototype options:

```text
Server-Sent Events
```

or:

```text
simple periodic refresh
```

Recommended prototype:

**Server-Sent Events.**

Endpoint:

```text
GET /prototype/events
```

Event:

```json
{
  "type": "task.updated",
  "entityId": "task-123"
}
```

The frontend then refreshes relevant state.

Do not build full real-time synchronization infrastructure.

*Slices 30–32 and 35–36: each successful section, task or reflection write, Undo and Redo publishes
only its one activity frame after commit, and nothing on rollback or retirement. A deleted disposable removal emits `project.section_removed`;
a retained removal emits `project.section_archived`; add, move and update use the corresponding
section-added, section-moved and section-updated actions. Row transitions publish `task.*` or
`reflection.*` frames targeted at the row; compound Add frames also cause open browser surfaces to
re-resolve implicit container existence. No frame carries history payload data,
and any normalized no-op or repeated-removal refusal emits no frame.*

*Extended in Slice 37:* a duplication, an Archive Restore and each shortcut placement write publish
one frame apiece, and so does each of their transitions. Placement frames target the **destination
project**, which is what makes an open Home canvas — in this tab and in another — re-read both its
combined order and its shortcuts' source identity after a transition it did not make itself.*

*Extended in Slice 38:* each optional-page toggle that changes something, and each of its Undo
and Redo steps, publishes one frame targeted at the page's **root project**; a no-op toggle
publishes none. An open project context re-reads its pages, so a tab removed or disabled by a
transition leaves the navigation and a viewer of it falls back to Home, while a recreated or
re-enabled tab reappears without forcing navigation.*

*Extended in Slice 39:* an existing-project write and each of its Undo and Redo steps publish one
frame targeted at the subject project, whose `rootProjectId` is the root it is under **after** the
step. A cross-root move therefore names only one of the two roots it touched, so an open root's
Todos, Archive, Reflections and work tree re-read on any project-record frame in the workspace — a
project's update or archive, or the Undo or Redo of one — while content frames from other roots still
leave them alone, and the Archive list stays on screen while it re-reads. No second frame is
published.*

---

# 63. Optimistic UI

Prototype important interactions optimistically.

Example:

```text
click task complete

↓ immediately

task appears complete

↓ asynchronously

gateway mutation
```

If the mocked gateway fails:

```text
revert
+
show error
```

The development panel's failure injection should test these flows.

For section removal, the canvas reports success only after it receives the server receipt. It
stores the receipt before refreshing so a failed refresh cannot hide the committed mutation;
**Retry refresh** repeats only the read. Undo sends the held receipt's history transition — its
action id and revision — and refreshes the authoritative section list. If a remove response is uncertain, **Retry remove** is an explicit
repeat of the exact original action; it is never triggered by a live refresh. Navigation and
generation guards prevent stale receipts or responses from affecting another canvas
([decision](docs/decisions/2026-09-disposable-removal-and-immediate-undo.md)).

The same receipt-before-refresh rule applies to section add, move and update. The notice keeps
the newest committed receipt by its history's revision, blocks Undo while another section write is
in flight, and refreshes authoritative state after Undo. Update Undo restores only its recorded
fields, move Undo resolves its recorded anchors against the current combined order, and neither
offers Archive. A reload clears all local operation notices.

*Landed in Slice 37.* Placement writes carry receipts through the gateway, and the canvas unwraps
them where it already inserted, replaced or optimistically resized a placement: generation guards,
pending-write counting, the complete-combined-order guard, resize rollback and the read-only refresh
retry are all unchanged. Archive Restore still reports success when the write committed and only the
follow-up projection read failed. The Undo notice deliberately does **not** offer shortcut or
Restore receipts in this phase — persistent Undo/Redo header controls are later Stage C work — and
the notice's typed stale/not-next handling continues to refuse rather than undo a different action
when a newer placement write has made an older notice stale.

*Landed in Slice 38.* The optional-page toggle answers a receipt, and the page manager deliberately
ignores it: §26's confirmed page is still painted only after the write and a fresh context read both
settle, and the write/read separation, the project and generation guards and the read-only retry are
unchanged. A page action or transition frame is an ordinary project frame, so it reaches project
context and page resolution with no new case — undoing the enable that created the displayed page, or
disabling it, returns to Home with the existing explanation and, because there is no record left to
switch on, without the re-enable offer, while enabling or recreating one restores its tab and forces
no navigation. Page receipts are not offered through the canvas Undo notice, for the same reason
placement and Restore receipts are not.

*Landed in Slice 39.* Project writes answer a receipt, and every browser caller — the header's
rename, status, date and archive, Todos completion, the progress setting and the layout controls —
reads the confirmed `project` from it and ignores the receipt. Their optimistic paint, rollback,
write guards and error messages are unchanged, and a committed response is never re-sent. Project
receipts are not offered through the canvas Undo notice; persistent Undo/Redo controls are later work.

---

# 64. Repository Structure

Recommended:

```text
/
├── apps/
│   │
│   ├── web/
│   │   ├── src/
│   │   └── ...
│   │
│   └── prototype-host/
│       ├── api/
│       ├── mcp/
│       ├── auth/
│       ├── persistence/
│       └── main.ts
│
├── packages/
│   │
│   ├── contracts/
│   │
│   ├── domain/
│   │
│   ├── repositories/
│   │
│   ├── mcp-tools/
│   │
│   └── prototype-data/
│
├── prototype/
│   └── seeds/
│
├── docs/
│
├── .prototype/
│   └── data.json
│
└── package.json
```

---

# 65. Frontend Feature Structure

Inside Angular:

```text
src/app/
│
├── core/
│   ├── gateway/
│   ├── identity/
│   ├── config/
│   └── shell/
│
├── shared/
│   ├── components/
│   └── utilities/
│
├── features/
│   ├── dashboard/
│   ├── projects/
│   ├── tasks/
│   ├── calendar/
│   ├── search/
│   ├── reflections/
│   ├── activity/
│   └── settings/
│
└── prototype/
    ├── dev-panel/
    └── design-lab/
```

Feature code should own feature-specific components.

Avoid a giant generic:

```text
components/
```

folder.

---

# 66. Section Feature Structure

Example:

```text
features/projects/sections/
│
├── section-frame/
│
├── rich-text/
│
├── tasks/
│
├── timeline/
│
├── reflections/
│
├── progress/
│
└── registry.ts
```

A section should be removable without destabilizing unrelated project-page code.

---

# 67. Design Lab

Create route:

```text
/prototype/design
```

Development only.

Show:

```text
buttons

inputs

task rows

cards

project cards

widgets

section frames

navigation

drawers

menus

empty states

loading states

errors
```

This supplements Storybook with a full-app design environment.

---

# 68. Prototype Route Map

```text
/

→ redirect /app


/app

dashboard


/projects/:projectId

project workspace
— a root resolves to its Home,
  a subproject to its sole work canvas


/projects/:projectId/pages/:pageKind

a root's page: home | todos | archive | reflections
— rejected on a subproject, which has no pages;
  unknown or disabled kinds fall back to Home
  with an explanation (§26)


/calendar

global calendar


/search

workspace search


/settings

settings


/settings/agents

MCP / agent connections


/prototype/design

design lab


/prototype/state

seed/state inspector
```

*Both project routes landed in Slice 25.3, resolving to one `ProjectWorkspaceShell` — Angular
re-uses the instance across a parameter change, so moving between a root's pages keeps its
context loaded once. `/projects/:projectId` **stays valid** rather than redirecting: it is what
the sidebar, project creation and every Sub-Projects section link to. Resolution is a positive
rule — the project is a root, the kind is navigable, the root has it enabled, and this build can
render it — so `/pages/work` on a root falls back like any other kind that is not a tab. A
fallback replaces the URL and carries its reason in navigation state, which is what lets the
explanation survive the sub-project case, where the redirect crosses route configurations and
destroys the component.*

*The 25.8 page-manager path now makes the disabled-page re-enable promise executable: a disabled
optional route carries its exact kind to an **Enable …** action, and navigation waits for persisted
state plus fresh page context. The manager is root-scoped and remains visible from descendant work
routes; `/pages/work` and subproject page requests carry no enable action.*

---

# 69. Testing Strategy

Testing exists mainly to protect reusable behavior while designs change.

## Domain Unit Tests

Test:

```text
task transitions

project hierarchy

progress

upcoming-work calculation

section ordering

permission checks
```

---

## Component Tests

Test important reusable interactions:

```text
TaskRow completion

ProjectSection collapse

Section configuration

Dashboard widget states
```

---

## Storybook Interaction Tests

Focus on visual behavior.

---

## MCP Contract Tests

Test:

```text
tools/list

input schemas

tool results

permissions

errors

activity logging

agent revocation
```

---

## End-to-End Tests

Keep only a few.

### Web

```text
load nested-projects showcase
→ create root and manage optional pages
→ navigate nested work and canonical shortcut sources
→ verify Todos, Reflections and Archive projections
→ inject a failed task/page write and switch persona
→ reload and confirm ownership/recovery
```

### MCP

```text
open browser aggregate
→ real Streamable HTTP client mutates nested task/page/shortcut/reflection state
→ browser receives the committed event without reload
→ canonical HTTP reads and activity attribution agree
→ missing-grant, read-only and foreign-root calls are refused without partial results
```

The web and MCP journeys are kept isolated from the offline `pnpm test` suite and use their own
data file. Focused aggregate journeys remain separate so the integrated pass can prove composition
without duplicating every fixture. Slice 25.8 ran the integrated browser/MCP checks and the
workbench states against the nested showcase; the remaining product questions are about sustained
use, not whether these paths can be exercised.

*Slice 33 closed the Archive, removal and Undo refactor the same way.* Each Refactor §26
criterion is traced to a named assertion at the lowest layer that can observe it — domain
preconditions and pruning, commit-before-publish against the bytes on disk, converter and reopen
over temp copies of the committed fixtures — and then joined through the browser (nested pointer
move and resize Undo, an injected client failure with retry, an agent's overlapping edit, Archive
Restore appending where Undo returns between neighbours) and both MCP transports (exact row ids
through reassign and cascade, a foreign connection, a removed `projects.write` grant and a revoked
connection, each refused without changing the file's business data). The shared seeds and their
snapshots did not change.

---

# 70. What Should Be Reusable for the MVP

The goal is to preserve:

```text
Angular visual components

design tokens

section registry

section components

feature stores

gateway interfaces

domain models

domain services

runtime schemas

task behavior

project behavior

dashboard calculations

MCP tool definitions

MCP schemas

MCP execution logic

permission concepts

activity model

tests
```

---

# 71. What Should Be Expected to Be Replaced

Intentionally disposable:

```text
Prototype Host HTTP implementation

JSON repositories

prototype authentication

fake users

prototype tokens

mock AI provider

fixture fun facts

prototype event stream

development panel

seed loader
```

These are scaffolding.

---

# 72. MVP Migration

Prototype:

```text
Angular
    ↓
Gateway
    ↓
Prototype Host
    ↓
JSON
```

MVP:

```text
Angular
    ↓
Gateway
    ↓
Production Fastify API
    ↓
Postgres
```

Domain:

```text
Prototype MCP
      ↓
MCP Tools
      ↓
Domain Services


Production MCP
      ↓
same MCP Tools
      ↓
same Domain Services
```

---

# 73. Authentication Migration

Prototype:

```text
PrototypeIdentityProvider
```

becomes:

```text
SupabaseIdentityProvider
```

Prototype MCP:

```text
PrototypeAgentAuthenticator
```

becomes:

```text
OAuthMcpAuthenticator
```

Everything beneath:

```text
ActorContext
```

should remain largely unchanged.

---

# 74. Repository Migration

Prototype:

```text
JsonTaskRepository
JsonProjectRepository
```

MVP:

```text
PostgresTaskRepository
PostgresProjectRepository
```

The corresponding interfaces remain.

---

# 75. Prototype Development Workflow

Normal development, in two terminals:

```text
pnpm install

pnpm dev:web

pnpm dev:host
```

Starts:

```text
Angular

Prototype Host
```

Optional:

```text
pnpm storybook
```

for isolated component work.

Optional:

```text
pnpm mcp:stdio
```

for local stdio MCP integration.

Tests:

```text
pnpm test
```

End-to-end:

```text
pnpm e2e
```

---

# 76. Prototype Reset

Support:

```text
pnpm prototype:reset
```

Default:

```text
personal-workspace
```

Also:

```text
pnpm prototype:seed busy-week

pnpm prototype:seed empty

pnpm prototype:seed agent-heavy
```

This makes destructive experimentation cheap.

---

# 77. Design-First Development Loop

The intended workflow is:

```text
1. Identify product question.

2. Build smallest interactive version.

3. Add realistic seed data.

4. Use it.

5. Try it through MCP where applicable.

6. Identify friction.

7. Change design/behavior.

8. Update prototype specification.

9. Repeat.
```

Do not treat prototype code as immutable because tests exist.

Tests protect *intentional behavior*.

When intent changes:

```text
change test
+
change implementation
```

---

# 78. Decision Log

Maintain:

```text
docs/decisions/
```

Small entries.

Example:

```text
2026-09-project-layout.md
```

Contents:

```text
Question

Options tested

What we learned

Current decision

Confidence

Revisit when
```

Example:

```text
Question:
Should project pages use absolute-positioned
canvas widgets?

Tested:
- flow
- 12-column grid

Finding:
Absolute placement added complexity without
meaningfully improving project organization.

Decision:
Use grid.

Confidence:
Medium.
```

This becomes extremely valuable when writing the MVP specification.

---

# 79. Prototype Feedback Notes

Add a development-only button:

```text
Add Prototype Note
```

This should quickly record:

```text
current route

current project

timestamp

note
```

Example:

```text
"Task drawer feels too heavy for quick edits."
```

Store these in:

```text
.prototype/notes.json
```

The goal is to capture observations while actually using the prototype.

---

# 80. Explicit Non-Goals

Do not spend prototype time implementing:

```text
PostgreSQL

Supabase

production RLS

production OAuth

cloud file uploads

email verification

password resets

team invitations

billing

deployment scaling

Redis

message queues

production logging stack

production analytics

production secret management
```

unless one becomes necessary to answer a product-design question.

---

# 81. First Prototype Milestone

The first genuinely useful prototype should support:

### Workspace

- fake account/persona
- sidebar
- dashboard

### Projects

- create project
- open project
- nested project
- edit project
- archive project

### Project Canvas

- add section
- remove section
- reorder section
- collapse section
- change section size
- switch Flow/Grid mode

### Sections

- tasks
- rich text
- sub-projects
- progress
- reflections
- timeline

### Tasks

- create
- complete
- edit
- due date
- priority

### Dashboard

- today
- upcoming
- projects
- AI digest
- fun fact

### MCP

- real MCP endpoint
- tool discovery
- project search
- task search
- task creation
- task update
- task completion
- agent permissions
- agent activity history

### Prototype Tools

- seeds
- fake date
- fake latency
- persona switcher
- feature flags

### Multi-page integration

The 25.8 closure pass now exercises the user-requested multi-page direction as one coherent
milestone path: a root workspace with persisted Home/Todos/Archive/Reflections pages; nested
subproject work canvases; read-only cross-page and nested shortcuts; chronological Todos with
canonical owner links; root-wide Archive recovery; retained subject-linked reflections; page
management and disabled-route re-enable; MCP live updates, grants and activity attribution; and
the same data ownership through reload. This is an exercised prototype path, not a claim that
each optional page or shortcut has earned MVP status.

---

# 82. Second Prototype Milestone

After using the first version:

Add only features justified by observed questions.

Likely candidates:

```text
calendar

milestones

subtasks

command palette

agent confirmations

dashboard configuration

AI project summaries

additional project layouts
```

Do not automatically implement everything in the original product idea.

One direction has been raised by the user that takes priority over that list: a single canvas
per project conflates *a place to work* with *a piece of work*. The multi-page root and the
subproject work unit described in §23, §26–27, §30–32, §34, §36 and §54 are the answer being
tested, staged as Slices 25.0–25.8 in `docs/roadmap/` (see `docs/roadmap/progress.md`). The candidates above wait behind it.

It is worth being honest about which kind of input this was. It is a **user-requested
direction**, not a finding the prototype produced by being used — the distinction §77 and §79
exist to keep. Use is what will judge it.

The 25.8 closure pass is the first coherent browser/MCP use of that direction: it made the root
workspace, nested work units, optional pages, shortcuts, Todos, Archive and Reflections usable
together. It is evidence that the model is evaluable and that the ownership seams hold; it is not
yet evidence from sustained use that the full set belongs in the MVP.

---

# 83. Questions the Prototype Must Answer Before MVP

The MVP specification should not be finalized until these have answers.

## Project model

- Are nested projects worth keeping?
  *Still open, and still a question for use. A decision has been taken on what a nested
  project **is** — a unit of work, structurally distinct from a root (§26,
  `docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md`) — from code and
  user direction, not from observed use. Whether nesting earns its place, and at what depth,
  is what use still has to answer.*
- Is a root project with pages better than one long canvas?
- Do subprojects need any root capability we removed from them?
- What defines project progress?
- What project statuses exist?

## Project layout

- Flow or grid?
- Are resizable sections useful?
- Are columns useful?
- Does the application actually need a freeform canvas?
- Which optional pages do people actually enable, and do any get disabled again?
- Do shortcuts to sections elsewhere earn their ambiguity, or is read-only embedding a
  half-measure people work around?
- Should a shortcut's source be editable in place?

## Tasks

- Required statuses?
- Start dates?
- Subtasks?
- Estimates?
- Ordering behavior?

## Calendar

- How important is scheduling versus deadlines?
- Should manual events exist?

## Reflections

- Are they freeform?
- Prompted?
- Daily?
- Project-specific?
- Do reflections attached to completed work get written, or is the journal enough?

The 25.8 pass proved that completed task and subproject subjects can be reflected on, retained
through reopening, and found in the root journal. Whether that is valuable often enough to keep is
still open.

## Archive

- Is a whole-tree Archive page used, or only the undo immediately after a mistake? **Answered in
  Slice 25.6:** the root-wide Archive page is the canonical discovery and recovery surface;
  project controls can enable it and open it even when its tab is disabled.
- Is permanent deletion needed once archived work is easy to find?

## Dashboard

- Which widgets survive actual daily use?
- How configurable should it be?

## AI

- Which generated information is useful rather than decorative?
- When should summaries update?

## MCP

- Which tools should exist?
- Which writes are safe without confirmation?
- What should agents see by default?
- How should permissions work?
- Should tools return compact or rich context?
- Are MCP resources necessary?
- Which operations should produce visible notifications?

---

# 84. Final Prototype Principle

The prototype should optimize for:

```text
time to change an idea
```

not:

```text
time to production
```

But reusable boundaries should ensure that good ideas survive.

The architecture therefore deliberately separates:

```text
PRODUCT BEHAVIOR
        from
INFRASTRUCTURE IMPLEMENTATION
```

The frontend, domain behavior, schemas, and MCP semantics should evolve until they feel correct.

Only then should the production MVP infrastructure be locked down.
