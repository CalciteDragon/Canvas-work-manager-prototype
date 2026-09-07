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
  milestones: MilestoneGateway;
  reflections: ReflectionGateway;
  dashboard: DashboardGateway;
  search: SearchGateway;
  activity: ActivityGateway;
}
```

Individual contracts:

```ts
interface TaskGateway {
  list(query: TaskQuery): Promise<Task[]>;
  get(id: TaskId): Promise<Task>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Task>;
  complete(id: TaskId): Promise<Task>;
  archive(id: TaskId): Promise<void>;
  restore(id: TaskId): Promise<Task>;
}
```

`restore` was added once the prototype showed that an archive nothing can reverse is a row a
person has lost (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md). It restores
the task and every descendant that came down with it. `archive` keeps its `Promise<void>`, so
a caller that needs the updated row re-reads.

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
  "schemaVersion": 4,
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
anything else. That is a single one-off, deliberately not a migration runner, a version chain
or a rollback framework; the next cutover writes its own or resets, and either is cheaper than
a framework nothing else uses. See
`docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md`.

*Landed in Slice 25.1. `SCHEMA_VERSION` is 3, and `pnpm prototype:upgrade <path>` converts a
version-2 file in place, keeping a backup beside it.*

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

Today the column lists Home, Todos where a root has enabled it, and the work hierarchy. Archive
and Reflections have records and no renderers, so Slices 25.6 and 25.7 each add one line to
`PROJECT_PAGE_REGISTRY`.

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

**Quick Add is a canvas control, not a header one.** It was in this list while a project had one
canvas; a root now has several and one header, and "add a section" acts on *a canvas*. It sits in
the Controls row beside Edit Layout, still gated by §32's Edit Layout Mode
([why](docs/decisions/2026-09-where-the-project-navigation-column-lives.md)).

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
sub-project's work canvas. What is still planned is a renderer for each optional kind
(Slices 25.5–25.7); until one exists its kind is not advertised in the column, and a URL pointing
at it falls back to Home saying it is not built yet. A sub-project's `/pages/…` URL is refused the
same way, because it has no pages to name.*

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
- size presets

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

Quick Add and an agent's `create_task` both have to resolve a container. With pages, "the
project's task container" is no longer a single answer, so the resolution is stated rather
than inferred:

- **Nothing supplied** — a root resolves a matching container on Home; a subproject resolves
  one on its sole canvas.
- **A page supplied** — resolve there, but only if that page accepts that kind of data.
  Otherwise refuse; do not fall back somewhere the caller did not name.
- **A section supplied** — authoritative, and it must agree with any page or project also
  supplied. A mismatch is an error, not a preference order.

A write never lands on a disabled page. Silent placement somewhere invisible is worse than a
refusal, because the writer believes it worked.

*Landed in Slice 25.2, in `SectionService`. All three cases hold for a person through Quick
Add, for HTTP, and for `create_task`/`add_reflection` over MCP, and they stay reachable with
`tasks.write` or `reflections.write` alone — resolution runs through the unchecked doors a row
write already uses on its own behalf, and acquires no `projects.read`.*

*The disabled-page rule needed one more sentence than it has above, because §27 also says a
source on a disabled page is still a valid source. The two are about different verbs: **placing**
new content on a disabled page is refused — adding or duplicating a section there, creating or
moving a row into a container there, reassigning rows there — while everything already there
stays readable, editable, reorderable, removable and restorable. Undo is never behind a toggle
([why](docs/decisions/2026-09-a-disabled-page-hides-navigation-not-data.md)).*

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

*Landed in Slice 25.4. Home stores sections and shortcut placements in one combined order;
the resolver returns the source section and project/page identity without rows, and the source
content is mounted read-only with an **Open source** link. Placement writes require the same-root
Home and project-write rules; archived source sections show `source_archived`, while a source
project or ancestor archived beneath it shows `source_hidden`. A disabled source page remains a
valid source because disabling hides navigation, not data.*

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

*Landed across Slices 25.1, 25.2 and 25.4. The coarse answer — does this page hold sections at all —
is `pageAcceptsSections`; the narrow one is `pageAcceptsSectionType`, which reads Reflections'
capability out of `SECTION_OWNERSHIP` rather than naming section types, so a type registered
later needs no entry. `SectionService` refuses on the way in and `validateDocumentIntegrity`
refuses at load, because a hand-edited `data.json` (§14) must fail then rather than at whichever
request first renders it. Slice 25.4 adds the Home-only shortcut placement beside the registered
types. Slice 25.5 registers the Todos renderer — a derived list that holds no sections, so nothing
about this table changes for it; the Archive and Reflections renderers arrive with Slices 25.6 and
25.7.*

---

# 31. Project Section Frame

Every section renders inside the same frame.

Frame provides:

```text
drag handle

title

collapse

configuration

size

duplicate

remove
```

The content component handles only its feature.

**Remove archives; it does not delete.** It sets `archivedAt` on the section, which leaves the
canvas and keeps everything it held — a Notes section's prose, a Progress section's milestone
selection, and the rows a container took down with it. A container still holding *live* rows
first asks what should happen to them: archive them with the section, or move them to another
container of the same type. A view, an empty container, and a container holding only archived
rows need no question and archive silently.

Every project canvas therefore ends with an **Archived** region: the sections that have been
removed, each with the number of rows that came down with it, above the rows archived on their
own. One **Restore** puts a section back at the end of the canvas with exactly what the removal
took — not the rows that were already archived beforehand, which stay archived. Restoring is
refused while the project itself is archived, so the region stays visible with its controls
disabled and the guidance *Reactivate this project to restore archived work.*

Removing a section that is already archived is refused rather than repeated. Permanent deletion
is a later question.

## Where archived work is found

Archived work does not appear on ordinary pages, views or read models — that is what archiving
means. It is not deleted, so it has to be reachable somewhere, and that somewhere becomes the
root's optional **Archive** page: every archived section, task, reflection and subproject
across the whole root tree, each with its origin, what caused it to be archived, and whether it
can be restored.

The per-canvas **Archived** region described above is the current form of that promise and
stays until the Archive page replaces it. The page is a superset: it also lists the rows the
region deliberately hides — those an ancestor took down, which cannot be restored on their own
— with guidance naming the ancestor to restore instead, **and those whose container lives on
another page of the same project**, which a region scoped to one canvas cannot show. Slice 25.3
page-scoped the region, because §27 makes a canvas a page: Home must not offer to restore what
was archived from Reflections, since the restore would land where nobody is looking.

A project whose own status is `archived` hides its live contents from ordinary reads too. The
Archive page may still show them under their archived owner, distinguishing *hidden because an
ancestor is archived* from *archived in its own right*. Reactivating is an explicit status
choice; the prototype does not guess a prior status.

None of this adds a cascade. Archiving a project with **live child subprojects is still
refused**, exactly as it is today, and archiving a project never archives anything beneath it —
an implicit cascade would archive work the caller never named. A whole-tree Archive page makes
archived work *findable*; it does not make archiving *contagious*.

Because undo must never be behind a toggle, disabling the Archive page leaves **Open archive**
in the project controls, which enables and opens it.

*Partly landed in Slice 25.2: enabling a page is the one write the archive freeze does not
cover, so the Archive page can always be turned back on — on an archived root included. The
**Open archive** control and the page it opens are Slice 25.6's; today's undo surface is still
the per-canvas region.*

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

Example:

```text
ProjectSectionFrame
        │
        └── TaskListSection
```

---

# 32. Section Editing

Support:

```text
View Mode
```

and:

```text
Edit Layout Mode
```

Edit Layout Mode reveals:

- drag handles
- sizing controls
- remove controls
- add-section buttons
- section configuration

This avoids permanently cluttering the normal workspace.

§31's **Archived** region is *not* layout chrome and stays visible in View Mode: it is content,
and it is the undo for removal. Gating it behind Edit Layout Mode would hide it exactly when
someone needs it — right after a removal they did not mean. The per-row archive control in §34
is likewise a row affordance rather than a layout one. The same reasoning carries to the
Archive page that replaces the region: it is a page of content, reachable in View Mode, and
reachable through project controls even when its tab is disabled.

Shortcut placements (§27) are layout. Adding and removing one belongs to Edit Layout Mode; the
source content a placement renders does not become editable there.

*Landed in Slice 25.4: **Add shortcut** and **Remove shortcut** are available only in Edit
Layout Mode, while collapse, span and the combined CDK order belong to the placement. The
embedded source stays read-only; removing the placement does not archive its source.*

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
Archived rows are reached through §31's Archived region.

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

The subject is validated to exist within the same root tree. It is **separate from ownership**:
the reflection still belongs to the reflections container it was written into, and attaching a
subject moves nothing.

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
the container it writes into rather than resolving one invisibly.

*Planned in Slice 25.7.*

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
querying the derived Todos and Archive projections:

```text
list_project_pages

set_project_page_enabled

get_project_todos

get_project_archive
```

Shortcuts (§27) are created and removed through their own tools, and archive/restore become
canonical tools on projects, sections, tasks and reflections so an agent has the same undo a
person does.

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
`get_project_archive` projects a page that has no renderer yet and arrives with it in Slice 25.6.
Slice 25.4 adds `list_section_shortcuts` under `projects.read` and
`add_section_shortcut` / `remove_section_shortcut` under `projects.write`; the list returns
placement and source identity only, never source rows. Canonical archive/restore tools remain
Slice 25.6's.*

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
load seed
→ create project
→ create task
→ dashboard shows task
```

### MCP

```text
agent calls create_task
→ task appears in web UI
→ activity feed shows agent
```

This second test is one of the most important prototype tests.

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
pnpm test:e2e
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
tested, staged as Slices 25.0–25.8 in `development.md`. The candidates above wait behind it.

It is worth being honest about which kind of input this was. It is a **user-requested
direction**, not a finding the prototype produced by being used — the distinction §77 and §79
exist to keep. Use is what will judge it.

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

## Archive

- Is a whole-tree Archive page used, or only the undo immediately after a mistake?
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
