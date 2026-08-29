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
  ProgressResult,
  Project,
  ProjectId,
  ProjectQuery,
  ProjectSection,
  Reflection,
  ReflectionId,
  MoveSectionInput,
  SectionId,
  Task,
  TaskId,
  TaskQuery,
  TimelineResult,
  UpdateReflectionInput,
  UpdateSectionInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from '@cwm/contracts';

/**
 * §9's `TaskGateway`, verbatim. It is the one sub-interface the spec pins method for
 * method, so it is implemented in full even though nothing renders a task until Slice 7.
 */
export interface TaskGateway {
  list(query: TaskQuery): Promise<Task[]>;
  get(id: TaskId): Promise<Task>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Task>;
  complete(id: TaskId): Promise<Task>;
  archive(id: TaskId): Promise<void>;
}

/**
 * §9 gives `ProjectGateway` no shape, so it grows with the code that calls it: the shell
 * lists projects and the project page reads one. `create`/`update`/`archive`
 * arrive with the UI that writes — a method the UI cannot exercise is a claim no test
 * backs.
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

export interface ReflectionGateway {
  list(projectId: ProjectId): Promise<Reflection[]>;
  create(input: CreateReflectionInput): Promise<Reflection>;
  update(id: ReflectionId, input: UpdateReflectionInput): Promise<Reflection>;
}

/**
 * §31's frame affordances, as a gateway. `move` is deliberately absent: nothing in the UI
 * reorders sections until Slice 9 wires Angular CDK drag-drop, and this file's rule is that
 * a method the UI cannot exercise is a claim no test backs. The domain service and
 * `POST /api/sections/:id/move` both exist — the gateway method arrives with the drop
 * handler that calls it.
 */
export interface SectionGateway {
  list(projectId: ProjectId): Promise<ProjectSection[]>;
  create(projectId: ProjectId, input: CreateSectionInput): Promise<ProjectSection>;
  update(id: SectionId, input: UpdateSectionInput): Promise<ProjectSection>;
  move(id: SectionId, input: MoveSectionInput): Promise<ProjectSection>;
  duplicate(id: SectionId): Promise<ProjectSection>;
  remove(id: SectionId): Promise<void>;
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
  dashboard: DashboardGateway;
  sections: SectionGateway;
  tasks: TaskGateway;
  progress: ProgressGateway;
  timeline: TimelineGateway;
  reflections: ReflectionGateway;
  agents: AgentGateway;
  activity: ActivityGateway;
}

export const WORK_MANAGER_GATEWAY = new InjectionToken<WorkManagerGateway>('WORK_MANAGER_GATEWAY');
