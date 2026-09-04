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
ProjectPageComponent
       ↓
ProjectPageStore
       ↓
WorkManagerGateway
```

The store should contain reactive state.

Example:

```ts
class ProjectPageStore {
  project = signal<Project | null>(null);
  sections = signal<ProjectSection[]>([]);
  loading = signal(false);
  editMode = signal(false);
}
```

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

Target Date

Quick Add

More
```

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
is likewise a row affordance rather than a layout one.

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

---

# 83. Questions the Prototype Must Answer Before MVP

The MVP specification should not be finalized until these have answers.

## Project model

- Are nested projects worth keeping?
- What defines project progress?
- What project statuses exist?

## Project layout

- Flow or grid?
- Are resizable sections useful?
- Are columns useful?
- Does the application actually need a freeform canvas?

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
