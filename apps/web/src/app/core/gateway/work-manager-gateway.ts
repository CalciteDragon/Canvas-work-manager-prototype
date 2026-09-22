import { InjectionToken } from '@angular/core';
import type {
  ActivityFeedEntry,
  ActivityQuery,
  AgentConnection,
  AgentConnectionId,
  AgentPermission,
  DashboardQuery,
  DashboardResult,
  CreateSectionInput,
  CreateTaskInput,
  CreateProjectInput,
  CreateReflectionInput,
  CreateSectionShortcutInput,
  ProgressResult,
  Project,
  ProjectId,
  ProjectPage,
  ProjectPageWriteResult,
  ProjectQuery,
  ProjectSection,
  ProjectArchiveResult,
  ProjectCompletedWorkResult,
  ProjectJournalResult,
  ProjectTodosResult,
  Reflection,
  ReflectionId,
  ReflectionQuery,
  MoveSectionInput,
  MoveSectionShortcutInput,
  SectionId,
  SectionQuery,
  SectionShortcutId,
  SectionShortcutQuery,
  ResolvedSectionShortcut,
  ShortcutSource,
  ShortcutSourceQuery,
  SetProjectPageEnabledInput,
  Task,
  TaskAddResult,
  TaskWriteResult,
  TaskId,
  TaskQuery,
  TimelineResult,
  UpdateReflectionInput,
  ReflectionAddResult,
  ReflectionWriteResult,
  UpdateSectionInput,
  UpdateSectionShortcutInput,
  UpdateProjectInput,
  UpdateTaskInput,
  RemoveSectionInput,
  SectionRemovalResult,
  SectionAddResult,
  SectionShortcutAddResult,
  SectionShortcutRemovalResult,
  SectionShortcutWriteResult,
  SectionWriteResult,
  OperationHistoryId,
  OperationHistorySummary,
  OperationHistoryTransitionInput,
  OperationHistoryTransitionResult,
} from '@cwm/contracts';

/**
 * §9's `TaskGateway`, plus `restore`. Every other member is the spec's, method for method.
 *
 * `restore` is a correction to §9, not a quiet widening: the spec declares `archive` and no
 * undo, and the prototype disproved that — an archive nothing can reverse is a row a person
 * has lost. §9 and §34 are updated in the same change
 * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md).
 *
 * Every committed row write carries its history receipt so a caller can keep the exact action it
 * created; a normalized no-op carries `operation: null`.
 */
export interface TaskGateway {
  list(query: TaskQuery): Promise<Task[]>;
  get(id: TaskId): Promise<Task>;
  create(input: CreateTaskInput): Promise<TaskAddResult>;
  update(id: TaskId, input: UpdateTaskInput): Promise<TaskWriteResult>;
  complete(id: TaskId): Promise<TaskWriteResult>;
  archive(id: TaskId): Promise<TaskWriteResult>;
  restore(id: TaskId): Promise<TaskWriteResult>;
}

/**
 * §9 gives `ProjectGateway` no shape, so it grows with the code that calls it: the shell
 * lists projects and creates one, and the project page reads, renames, re-statuses,
 * re-dates and archives one.
 *
 * There is deliberately **no `archive`**. `PATCH /api/projects/:id` with
 * `status: 'archived'` already runs the domain's whole archive path — the active-children
 * guard and the `project.archived` activity row included — so a second method would be a
 * second way to say the same thing.
 */
export interface ProjectGateway {
  list(query: ProjectQuery): Promise<Project[]>;
  get(id: ProjectId): Promise<Project>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: ProjectId, input: UpdateProjectInput): Promise<Project>;
}

/**
 * §24's dashboard is *content only*. The widget layout is §25's `DashboardWidget[]` on the
 * persona, which the application already has from `IdentityProvider` — asking the gateway
 * for it too would give the same list two sources of truth.
 *
 * The query is partial because both ranges have contract defaults; the store sends only
 * what a widget's config actually configures.
 */
export interface DashboardGateway {
  get(query: Partial<DashboardQuery>): Promise<DashboardResult>;
}

export interface ProgressGateway {
  get(projectId: ProjectId): Promise<ProgressResult>;
}

export interface TimelineGateway {
  get(projectId: ProjectId): Promise<TimelineResult>;
}

/**
 * §34's Todos, as one read of one **root**.
 *
 * There is no query and no second member. The chronology is the whole answer — §34 gives the
 * page no filters and no ordering controls — and Todos owns nothing, so completing a row goes
 * through `tasks.complete` or `projects.update` like every other caller.
 */
export interface TodosGateway {
  get(projectId: ProjectId): Promise<ProjectTodosResult>;
}

/** §31's whole-tree recovery projection. It is queryable whether Archive navigation is enabled. */
export interface ArchiveGateway {
  get(projectId: ProjectId): Promise<ProjectArchiveResult>;
}

/** §36's root-wide journal and the completed-work picker used to compose into it. */
export interface JournalGateway {
  get(projectId: ProjectId): Promise<ProjectJournalResult>;
  completedWork(projectId: ProjectId): Promise<ProjectCompletedWorkResult>;
}

export interface ReflectionGateway {
  /**
   * A reflections section renders what it owns, so the list narrows to one container. The
   * filters travel as the shared `ReflectionQuery` minus the project, which the first
   * argument already fixes — so a caller cannot broaden the scope from inside the object,
   * and the root Archive projection can ask for `{ includeArchived: true }` without a placeholder.
   */
  list(projectId: ProjectId, query?: Omit<ReflectionQuery, 'projectId'>): Promise<Reflection[]>;
  create(input: CreateReflectionInput): Promise<ReflectionAddResult>;
  update(id: ReflectionId, input: UpdateReflectionInput): Promise<ReflectionWriteResult>;
  archive(id: ReflectionId): Promise<ReflectionWriteResult>;
  restore(id: ReflectionId): Promise<ReflectionWriteResult>;
}

/**
 * §26's pages: which a project owns, and which of a root's optional three are switched on.
 *
 * Separate from `ProjectGateway` for the same reason `ProjectPageService` is separate from
 * `ProjectService`: a page is a property of a **root**, and a sub-project has exactly one work
 * canvas that is not a tab and cannot be configured. Two members, because §26 gives pages two
 * operations — there is no create and no remove: enabling one for the first time is what
 * creates it, and disabling keeps everything on it.
 */
export interface ProjectPageGateway {
  /** Every page the project owns, disabled ones included — this is the toggle list. */
  list(projectId: ProjectId): Promise<ProjectPage[]>;
  /**
   * The toggle, answering the confirmed page and the receipt it recorded (§31): `page.add` for the
   * enable that created the record, `page.update` for a later change of the switch, and `null`
   * when the page was already where the call asked it to go. The page manager reads the page and
   * ignores the receipt — persistent Undo controls are a later phase — but the envelope is parsed,
   * so a host that stopped sending it would fail here rather than silently.
   */
  setEnabled(projectId: ProjectId, input: SetProjectPageEnabledInput): Promise<ProjectPageWriteResult>;
}

/** §27 and §31's canvas section reads and writes, including the typed removal receipt. */
export interface SectionGateway {
  /**
   * Live-only by default; the root Archive projection is the one caller that asks for the rest.
   *
   * `pageId` narrows to one canvas (§27). Absent, the read spans the project's pages, grouped
   * by page — which is what every caller wants while a project has one section-bearing page,
   * and what the canvas keeps wanting for the root Archive projection after that.
   */
  list(projectId: ProjectId, query?: Omit<SectionQuery, 'projectId'>): Promise<ProjectSection[]>;
  create(projectId: ProjectId, input: CreateSectionInput): Promise<SectionAddResult>;
  update(id: SectionId, input: UpdateSectionInput): Promise<SectionWriteResult>;
  move(id: SectionId, input: MoveSectionInput): Promise<SectionWriteResult>;
  /** §31's duplicate. Recorded as the add it is, so it answers the add envelope. */
  duplicate(id: SectionId): Promise<SectionAddResult>;
  /** Removes or retains the section according to content and references, and returns its operation receipt. */
  remove(id: SectionId, input?: RemoveSectionInput): Promise<SectionRemovalResult>;
  /** Archive Restore. A repeat on a live section answers the section and a `null` receipt. */
  restore(id: SectionId): Promise<SectionWriteResult>;
}

/**
 * §31's per-actor operation history. The history id, the action id and the revision the caller
 * read are the whole input to a transition; the server owns inverse data, ordering and actor checks.
 */
export interface OperationHistoryGateway {
  summary(projectId: ProjectId): Promise<OperationHistorySummary>;
  transition(historyId: OperationHistoryId, input: OperationHistoryTransitionInput): Promise<OperationHistoryTransitionResult>;
}

/** §27's layout-only reference gateway. Sources identify canonical sections; they never carry rows. */
export interface SectionShortcutGateway {
  list(projectId: ProjectId, query?: SectionShortcutQuery): Promise<ResolvedSectionShortcut[]>;
  sources(projectId: ProjectId, query: ShortcutSourceQuery): Promise<ShortcutSource[]>;
  create(projectId: ProjectId, input: CreateSectionShortcutInput): Promise<SectionShortcutAddResult>;
  /** A same-value resize or collapse answers the placement and a `null` receipt. */
  update(id: SectionShortcutId, input: UpdateSectionShortcutInput): Promise<SectionShortcutWriteResult>;
  /** A move to the position it already holds answers the placement and a `null` receipt. */
  move(id: SectionShortcutId, input: MoveSectionShortcutInput): Promise<SectionShortcutWriteResult>;
  /** No placement is left to return, so the removal names what it deleted and its receipt. */
  remove(id: SectionShortcutId): Promise<SectionShortcutRemovalResult>;
}

/**
 * §53's Settings → AI & Agents. `setPermissions` sends the whole grant rather than a
 * toggle: a permission grid states what the connection may do, and two boxes clicked in
 * quick succession would otherwise race each other into different final answers.
 *
 * There is no `create`. §51 has no connection-issuing flow and §80 rules OAuth out, so the
 * connections are the ones the seed carries — a create method would be a claim no test
 * backs, which is this file's standing rule.
 */
export interface AgentGateway {
  list(): Promise<AgentConnection[]>;
  setPermissions(id: AgentConnectionId, permissions: AgentPermission[]): Promise<AgentConnection>;
  revoke(id: AgentConnectionId): Promise<AgentConnection>;
}

/**
 * §57's feed. Entries arrive with their names already resolved, so the UI never joins
 * events against projects and connections it would have to fetch separately.
 */
export interface ActivityGateway {
  list(query: ActivityQuery): Promise<ActivityFeedEntry[]>;
}

/**
 * The boundary of §8: every component depends on this interface and never on a transport.
 *
 * §9 sketches eight members. A member is declared here only once something implements and
 * exercises it — an interface nothing implements would force every adapter to fake it and
 * would document a feature that does not exist. Still to arrive:
 *
 * - `milestones` — Slice 19
 * - `search` — no slice of its own; §40 surfaces through Slice 21's command palette and
 *   Slice 14's `search_workspace` MCP tool
 */
export interface WorkManagerGateway {
  projects: ProjectGateway;
  pages: ProjectPageGateway;
  dashboard: DashboardGateway;
  sections: SectionGateway;
  shortcuts: SectionShortcutGateway;
  tasks: TaskGateway;
  progress: ProgressGateway;
  timeline: TimelineGateway;
  todos: TodosGateway;
  archive: ArchiveGateway;
  journal: JournalGateway;
  reflections: ReflectionGateway;
  agents: AgentGateway;
  activity: ActivityGateway;
  history: OperationHistoryGateway;
}

export const WORK_MANAGER_GATEWAY = new InjectionToken<WorkManagerGateway>('WORK_MANAGER_GATEWAY');
