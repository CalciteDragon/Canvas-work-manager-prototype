import type {
  ActivityEvent, ActivityEventId, ActivityQuery, AgentConnection, AgentConnectionId, Milestone, MilestoneId,
  MilestoneQuery, Project, ProjectId, ProjectPage, ProjectPageId, ProjectPageQuery, ProjectQuery, ProjectSection,
  Reflection, ReflectionId, ReflectionQuery, SectionShortcut, SectionShortcutId, SectionShortcutQuery,
  SectionId, SectionQuery,
  OperationAction, OperationActionId, OperationActionQuery, OperationHistory, OperationHistoryId, OperationHistoryQuery,
  Task, TaskId, TaskQuery, User, UserId,
} from '@cwm/contracts';

/**
 * §15's operation boundary, named so domain services can depend on it without depending
 * on a store, a file, or JSON. `DataStore` implements it through `unitOfWorkFor`.
 */
export interface UnitOfWork {
  run<T>(fn: () => T | Promise<T>): Promise<T>;
}

export interface ProjectRepository {
  find(id: ProjectId): Promise<Project | null>;
  list(query?: ProjectQuery): Promise<Project[]>;
  insert(project: Project): Promise<void>;
  update(project: Project): Promise<void>;
}

/**
 * §26's pages. No `remove`: a page is never deleted — an optional one is disabled, which keeps
 * its sections and their layout, and a canonical one cannot go away while its project exists.
 * The seam permanent deletion would need is `SectionRepository.remove`, not this.
 */
export interface ProjectPageRepository {
  find(id: ProjectPageId): Promise<ProjectPage | null>;
  list(query?: ProjectPageQuery): Promise<ProjectPage[]>;
  insert(page: ProjectPage): Promise<void>;
  update(page: ProjectPage): Promise<void>;
}

export interface TaskRepository {
  find(id: TaskId): Promise<Task | null>;
  list(query?: TaskQuery): Promise<Task[]>;
  insert(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  /**
   * **Restricted removal, for one caller only** (Slice 36): Undo of `task.add` deletes exactly the
   * row that create made, after the executor has proved nothing came to depend on it — no child,
   * no reflection subject, no cascade marker. Ordinary archiving never reaches this, and no HTTP
   * route or MCP tool exposes it: §31's rule that content is archived rather than deleted is
   * unchanged, and reversing a creation is not deletion of content the person kept.
   *
   * The audit line survives it, because a version-5 activity event captures its target's identity
   * (docs/decisions/2026-09-historical-activity-identity.md). Commit-time integrity continues to
   * reject a dangling reference, so a removal that left one still rolls the whole unit back.
   */
  remove(id: TaskId): Promise<void>;
}

export interface SectionRepository {
  find(id: SectionId): Promise<ProjectSection | null>;
  list(query?: SectionQuery): Promise<ProjectSection[]>;
  insert(section: ProjectSection): Promise<void>;
  update(section: ProjectSection): Promise<void>;
  /**
   * Deletes only the canonical section row. `SectionService` calls this after it settles
   * owned rows, decides the recovery policy, and confirms that no row or shortcut still
   * references the section. It records the original section in the same unit of work, so
   * receipt-based Undo can recreate it. The repository does not cascade; commit-time
   * document integrity continues to reject dangling row and shortcut references.
   */
  remove(id: SectionId): Promise<void>;
}

/** §27's layout-only reference. Removing it is safe: it owns no content or activity target. */
export interface SectionShortcutRepository {
  find(id: SectionShortcutId): Promise<SectionShortcut | null>;
  list(query?: SectionShortcutQuery): Promise<SectionShortcut[]>;
  insert(shortcut: SectionShortcut): Promise<void>;
  update(shortcut: SectionShortcut): Promise<void>;
  remove(id: SectionShortcutId): Promise<void>;
}

export interface MilestoneRepository {
  find(id: MilestoneId): Promise<Milestone | null>;
  list(query?: MilestoneQuery): Promise<Milestone[]>;
  insert(milestone: Milestone): Promise<void>;
  update(milestone: Milestone): Promise<void>;
}

export interface ReflectionRepository {
  find(id: ReflectionId): Promise<Reflection | null>;
  list(query?: ReflectionQuery): Promise<Reflection[]>;
  insert(reflection: Reflection): Promise<void>;
  update(reflection: Reflection): Promise<void>;
  /** Undo of `reflection.add`, under exactly the restrictions `TaskRepository.remove` describes. */
  remove(id: ReflectionId): Promise<void>;
}

export interface ActivityRepository {
  find(id: ActivityEventId): Promise<ActivityEvent | null>;
  list(query?: ActivityQuery): Promise<ActivityEvent[]>;
  insert(event: ActivityEvent): Promise<void>;
  update(event: ActivityEvent): Promise<void>;
}

export interface AgentConnectionRepository {
  find(id: AgentConnectionId): Promise<AgentConnection | null>;
  list(): Promise<AgentConnection[]>;
  insert(connection: AgentConnection): Promise<void>;
  update(connection: AgentConnection): Promise<void>;
}

export interface UserRepository {
  find(id: UserId): Promise<User | null>;
  list(): Promise<User[]>;
  insert(user: User): Promise<void>;
  update(user: User): Promise<void>;
}

/**
 * One actor's operation history per project (docs/decisions/2026-09-operation-history-scope.md).
 *
 * There is no `remove`: a history outlives every action it held, so its order high-water mark and
 * revision never restart. Its project reference stays strict because no Stage A operation deletes
 * a project; the stage that first does decides what happens to the history.
 */
export interface OperationHistoryRepository {
  find(id: OperationHistoryId): Promise<OperationHistory | null>;
  list(query?: OperationHistoryQuery): Promise<OperationHistory[]>;
  insert(history: OperationHistory): Promise<void>;
  update(history: OperationHistory): Promise<void>;
}

/**
 * The typed actions a history steps through.
 *
 * `remove` exists because actions are **pruned** — by expiry and by the per-history cap — and
 * because recording a new action discards the redo branch, both inside the unit that records.
 * That is safe where deleting other entities is not: nothing references an action. Activity
 * events name the project, never an action, and a receipt holds only ids, which answer
 * `history_not_next` or not-found once the action is gone.
 */
export interface OperationActionRepository {
  find(id: OperationActionId): Promise<OperationAction | null>;
  list(query?: OperationActionQuery): Promise<OperationAction[]>;
  insert(action: OperationAction): Promise<void>;
  update(action: OperationAction): Promise<void>;
  remove(id: OperationActionId): Promise<void>;
}
