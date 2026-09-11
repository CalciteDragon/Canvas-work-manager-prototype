# What the domain is made of

## Structure

```mermaid
flowchart TB
  subgraph support["Support"]
    actor["actor.ts<br/>ActorContext, assertPermitted"]
    clock["clock.ts<br/>Clock, PrototypeClock, SimulatedClock"]
    ids["ids.ts<br/>IdGenerator, PrototypeIdGenerator"]
    errors["errors.ts<br/>DomainRuleError, EntityNotFoundError, PermissionDeniedError"]
    live["live-events.ts<br/>LivePublication, LiveEventPublisher"]
    vis["project-visibility.ts<br/>archivedAncestry"]
    inst["instants.ts / calendar.ts / task-windows.ts / page-placements.ts"]
  end
  subgraph writers["Writing services"]
    project[ProjectService]
    page[ProjectPageService]
    section[SectionService]
    shortcut[SectionShortcutService]
    task[TaskService]
    reflection[ReflectionService]
    agent[AgentConnectionService]
    activity[ActivityService]
  end
  subgraph readers["Derived read services"]
    dashboard[DashboardService]
    progress[ProgressService]
    timeline[TimelineService]
    workspace[WorkspaceService]
    todos[ProjectTodosService]
    archive[ProjectArchiveService]
    journal[ProjectJournalService]
  end
  subgraph ai["AI seam"]
    aiport["ai-provider.ts<br/>AIProvider"]
    mock[PrototypeAIProvider]
  end
  task --> section
  reflection --> section
  project & page & section & shortcut & task & reflection & agent --> activity
  activity --> live
  dashboard --> aiport
  mock -. implements .-> aiport
  writers --> support
  readers --> support
```

Writing services own one entity each and record activity; the two arrows into
`SectionService` resolve which container a row lands in. Writing services also compose
`ActivityService` to record events; these service edges are acyclic. Derived read services
compose no other services: each reads
repositories directly, asserts every grant its result needs, and computes from canonical
records. `project-visibility.ts` is pure functions shared by both groups so that every
read agrees about what an archived ancestor hides.

## A write, and where the rules sit

```mermaid
sequenceDiagram
  participant C as Caller (route or tool)
  participant T as TaskService
  participant S as SectionService
  participant R as Repositories (unit of work)
  participant A as ActivityService
  C->>T: create(actor, input)
  T->>T: assertPermitted(actor, 'tasks.write')
  T->>R: runUnitOfWork
  T->>T: assert project visible for actor.workspaceId
  T->>S: resolveContainer(project, page?, section?, 'task')
  S-->>T: sectionId (or DomainRuleError)
  T->>R: tasks.insert({ …, createdAt: clock.now() })
  T->>A: record('task.created', actor, target)
  A->>R: activity.insert
  R-->>T: commit (integrity validated, persisted, frame released)
  T-->>C: Task
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `ActorContext`, `assertPermitted` | `src/actor.ts` | Who acts, in which workspace, with which grants |
| `Clock`, `PrototypeClock`, `SimulatedClock` | `src/clock.ts` | Frozen clock for tests; offset clock for the host (§45) |
| `IdGenerator`, `PrototypeIdGenerator` | `src/ids.ts` | Id minting, injectable for determinism |
| `DomainRuleError`, `EntityNotFoundError`, `PermissionDeniedError` | `src/errors.ts` | The three caller-caused failures; `DomainRuleError.details` carries a typed refusal |
| `LivePublication`, `LiveEventPublisher` | `src/live-events.ts` | A §62 frame addressed to a workspace, and the port that delivers it |
| `archivedAncestry` | `src/project-visibility.ts` | Archiving reaches down without cascading |
| `Instant` | `src/instants.ts` | Lossless ordering of ISO instants as text |
| `calendar.ts`, `task-windows.ts`, `page-placements.ts` | `src/` | UTC date arithmetic; the open/overdue/upcoming questions; the combined section+shortcut order |
| `ProjectService` | `src/project-service.ts` | Kinds, nesting, status, archive with children-first, reactivation guard |
| `ProjectPageService` | `src/project-page-service.ts` | A project's pages; enable/disable a root's optional three |
| `SectionService` | `src/section-service.ts` | Add, rename, move, resize, collapse, remove (cascade/reassign), restore; container resolution |
| `SectionShortcutService` | `src/section-shortcut-service.ts` | Home placements; identity and availability, never content |
| `TaskService` | `src/task-service.ts` | Create, update, complete, archive (cascading to subtasks), restore, move within a project |
| `ReflectionService` | `src/reflection-service.ts` | Write, edit, archive, restore; optional subject |
| `AgentConnectionService` | `src/agent-connection-service.ts` | Permissions and revocation — user actors only; throttled `lastUsedAt` |
| `ActivityService` | `src/activity-service.ts` | The one place events are recorded and live frames published |
| `DashboardService` | `src/dashboard-service.ts` | §24's one derived read, including the digest and Fun Fact |
| `ProgressService`, `TimelineService` | `src/progress-service.ts`, `src/timeline-service.ts` | §39 formulas; §38 derived ranges |
| `WorkspaceService` | `src/workspace-service.ts` | `search_workspace`, `get_upcoming_work` under `workspace.read` |
| `ProjectTodosService`, `ProjectArchiveService`, `ProjectJournalService` | `src/project-*-service.ts` | The three root-wide projections (§34, §31, §36) |
| `AIProvider`, `PrototypeAIProvider` | `src/ai-provider.ts`, `src/prototype-ai-provider.ts` | §42's interface; §43's deterministic implementation |
