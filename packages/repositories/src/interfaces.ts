import type {
  ActivityEvent, ActivityEventId, ActivityQuery, AgentConnection, AgentConnectionId, Milestone, MilestoneId,
  Project, ProjectId, ProjectQuery, ProjectSection, Reflection, ReflectionId, SectionId, SectionQuery,
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

export interface TaskRepository {
  find(id: TaskId): Promise<Task | null>;
  list(query?: TaskQuery): Promise<Task[]>;
  insert(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
}

export interface SectionRepository {
  find(id: SectionId): Promise<ProjectSection | null>;
  list(query?: SectionQuery): Promise<ProjectSection[]>;
  insert(section: ProjectSection): Promise<void>;
  update(section: ProjectSection): Promise<void>;
  /**
   * The one repository that deletes. A section is view configuration with no independent
   * history, so §31's remove control is a real delete rather than a flag — which would
   * need a contracts change §30 argues against.
   */
  remove(id: SectionId): Promise<void>;
}

export interface MilestoneRepository {
  find(id: MilestoneId): Promise<Milestone | null>;
  list(): Promise<Milestone[]>;
  insert(milestone: Milestone): Promise<void>;
  update(milestone: Milestone): Promise<void>;
}

export interface ReflectionRepository {
  find(id: ReflectionId): Promise<Reflection | null>;
  list(): Promise<Reflection[]>;
  insert(reflection: Reflection): Promise<void>;
  update(reflection: Reflection): Promise<void>;
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
