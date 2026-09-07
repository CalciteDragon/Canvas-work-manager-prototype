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
  ProjectQuery,
  ProjectSection,
  ProjectArchiveResult,
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
  TaskId,
  TaskQuery,
  TimelineResult,
  UpdateReflectionInput,
  UpdateSectionInput,
  UpdateSectionShortcutInput,
  UpdateProjectInput,
  UpdateTaskInput,
  RemoveSectionInput,
} from '@cwm/contracts';

/**
 * §9's `TaskGateway`, plus `restore`. Every other member is the spec's, method for method.
 *
 * `restore` is a correction to §9, not a quiet widening: the spec declares `archive` and no
 * undo, and the prototype disproved that — an archive nothing can reverse is a row a person
 * has lost. §9 and §34 are updated in the same change
 * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md).
 *
 * `archive` still answers `Promise<void>`, so a caller that needs the updated row re-reads.
 */
export interface TaskGateway {
  list(query: TaskQuery): Promise<Task[]>;
  get(id: TaskId): Promise<Task>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Task>;
  complete(id: TaskId): Promise<Task>;
  archive(id: TaskId): Promise<void>;
  restore(id: TaskId): Promise<Task>;
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

export interface ReflectionGateway {
  /**
   * A reflections section renders what it owns, so the list narrows to one container. The
   * filters travel as the shared `ReflectionQuery` minus the project, which the first
   * argument already fixes — so a caller cannot broaden the scope from inside the object,
   * and the root Archive projection can ask for `{ includeArchived: true }` without a placeholder.
   */
  list(projectId: ProjectId, query?: Omit<ReflectionQuery, 'projectId'>): Promise<Reflection[]>;
  create(input: CreateReflectionInput): Promise<Reflection>;
  update(id: ReflectionId, input: UpdateReflectionInput): Promise<Reflection>;
  archive(id: ReflectionId): Promise<Reflection>;
  restore(id: ReflectionId): Promise<Reflection>;
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
  setEnabled(projectId: ProjectId, input: SetProjectPageEnabledInput): Promise<ProjectPage>;
}

/**
 * §31's frame affordances, as a gateway. `move` is deliberately absent: nothing in the UI
 * reorders sections until Slice 9 wires Angular CDK drag-drop, and this file's rule is that
 * a method the UI cannot exercise is a claim no test backs. The domain service and
 * `POST /api/sections/:id/move` both exist — the gateway method arrives with the drop
 * handler that calls it.
 */
export interface SectionGateway {
  /**
   * Live-only by default; the root Archive projection is the one caller that asks for the rest.
   *
   * `pageId` narrows to one canvas (§27). Absent, the read spans the project's pages, grouped
   * by page — which is what every caller wants while a project has one section-bearing page,
   * and what the canvas keeps wanting for the root Archive projection after that.
   */
  list(projectId: ProjectId, query?: Omit<SectionQuery, 'projectId'>): Promise<ProjectSection[]>;
  create(projectId: ProjectId, input: CreateSectionInput): Promise<ProjectSection>;
  update(id: SectionId, input: UpdateSectionInput): Promise<ProjectSection>;
  move(id: SectionId, input: MoveSectionInput): Promise<ProjectSection>;
  duplicate(id: SectionId): Promise<ProjectSection>;
  /**
   * Removal **archives**: the section leaves the canvas and `restore` brings it back with
   * the rows it took down. A container that still holds live rows refuses without a policy,
   * and the caller surfaces the refusal as a choice rather than swallowing it — see
   * docs/decisions/2026-09-what-undo-means-for-an-archived-row.md.
   *
   * `Promise<void>` deliberately: the host answers 204, and the canvas re-reads.
   */
  remove(id: SectionId, input?: RemoveSectionInput): Promise<void>;
  restore(id: SectionId): Promise<ProjectSection>;
}

/** §27's layout-only reference gateway. Sources identify canonical sections; they never carry rows. */
export interface SectionShortcutGateway {
  list(projectId: ProjectId, query?: SectionShortcutQuery): Promise<ResolvedSectionShortcut[]>;
  sources(projectId: ProjectId, query: ShortcutSourceQuery): Promise<ShortcutSource[]>;
  create(projectId: ProjectId, input: CreateSectionShortcutInput): Promise<ResolvedSectionShortcut>;
  update(id: SectionShortcutId, input: UpdateSectionShortcutInput): Promise<ResolvedSectionShortcut>;
  move(id: SectionShortcutId, input: MoveSectionShortcutInput): Promise<ResolvedSectionShortcut>;
  remove(id: SectionShortcutId): Promise<void>;
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
  reflections: ReflectionGateway;
  agents: AgentGateway;
  activity: ActivityGateway;
}

export const WORK_MANAGER_GATEWAY = new InjectionToken<WorkManagerGateway>('WORK_MANAGER_GATEWAY');
