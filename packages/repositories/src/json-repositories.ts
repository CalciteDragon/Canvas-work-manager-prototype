import type {
  ActivityEvent, ActivityEventId, AgentConnection, AgentConnectionId, Milestone, MilestoneId,
  Project, ProjectId, ProjectQuery, ProjectSection, PrototypeDocument, Reflection,
  ReflectionId, SectionId, Task, TaskId, TaskQuery, User, UserId,
} from '@cwm/contracts';
import { assertCanMutateDataStore, type DataStore, getActiveDocument } from './data-store';
import { RepositoryConflictError, RepositoryNotFoundError } from './errors';
import type {
  ActivityRepository, AgentConnectionRepository, MilestoneRepository, ProjectRepository,
  ReflectionRepository, SectionRepository, TaskRepository, UserRepository,
} from './interfaces';

type StoredCollection = Exclude<keyof PrototypeDocument, 'schemaVersion' | 'workspaces'>;
type StoredEntity = { id: string };

abstract class JsonCollectionRepository<T extends StoredEntity> {
  protected constructor(
    protected readonly store: DataStore,
    private readonly collection: StoredCollection,
  ) {}

  private values(): T[] {
    return getActiveDocument(this.store)[this.collection] as unknown as T[];
  }

  async find(id: T['id']): Promise<T | null> {
    const found = this.values().find((value) => value.id === id);
    return found === undefined ? null : structuredClone(found);
  }

  async list(): Promise<T[]> {
    return structuredClone(this.values());
  }

  async insert(entity: T): Promise<void> {
    assertCanMutateDataStore(this.store);
    if (this.values().some((value) => value.id === entity.id)) {
      throw new RepositoryConflictError(this.collection, entity.id);
    }
    this.values().push(structuredClone(entity));
  }

  async update(entity: T): Promise<void> {
    assertCanMutateDataStore(this.store);
    const index = this.values().findIndex((value) => value.id === entity.id);
    if (index === -1) throw new RepositoryNotFoundError(this.collection, entity.id);
    this.values()[index] = structuredClone(entity);
  }
}

const matchesSearch = (query: string | undefined, ...values: Array<string | undefined>): boolean => {
  const normalized = query?.trim().toLowerCase();
  return normalized === undefined || normalized === '' || values.some((value) => value?.toLowerCase().includes(normalized));
};

export class JsonProjectRepository extends JsonCollectionRepository<Project> implements ProjectRepository {
  constructor(store: DataStore) {
    super(store, 'projects');
  }

  override async list(query: ProjectQuery = {}): Promise<Project[]> {
    const projects = await super.list();
    return projects.filter(
      (project) =>
        (query.workspaceId === undefined || project.workspaceId === query.workspaceId) &&
        (query.parentProjectId === undefined || project.parentProjectId === query.parentProjectId) &&
        (query.status === undefined || query.status.includes(project.status)) &&
        matchesSearch(query.search, project.name, project.description),
    );
  }

  override find(id: ProjectId): Promise<Project | null> {
    return super.find(id);
  }
}

export class JsonTaskRepository extends JsonCollectionRepository<Task> implements TaskRepository {
  constructor(store: DataStore) {
    super(store, 'tasks');
  }

  override async list(query: TaskQuery = {}): Promise<Task[]> {
    const tasks = await super.list();
    const after = query.dueAfter === undefined ? undefined : Date.parse(query.dueAfter);
    const before = query.dueBefore === undefined ? undefined : Date.parse(query.dueBefore);
    return tasks.filter((task) => {
      const due = task.dueAt === undefined ? undefined : Date.parse(task.dueAt);
      return (
        (query.projectId === undefined || task.projectId === query.projectId) &&
        (query.parentTaskId === undefined || task.parentTaskId === query.parentTaskId) &&
        (query.status === undefined || query.status.includes(task.status)) &&
        (query.priority === undefined || query.priority.includes(task.priority)) &&
        (after === undefined || (due !== undefined && due > after)) &&
        (before === undefined || (due !== undefined && due < before)) &&
        matchesSearch(query.search, task.title, task.description)
      );
    });
  }

  override find(id: TaskId): Promise<Task | null> {
    return super.find(id);
  }
}

export class JsonSectionRepository extends JsonCollectionRepository<ProjectSection> implements SectionRepository {
  constructor(store: DataStore) { super(store, 'sections'); }
  override find(id: SectionId): Promise<ProjectSection | null> { return super.find(id); }
}

export class JsonMilestoneRepository extends JsonCollectionRepository<Milestone> implements MilestoneRepository {
  constructor(store: DataStore) { super(store, 'milestones'); }
  override find(id: MilestoneId): Promise<Milestone | null> { return super.find(id); }
}

export class JsonReflectionRepository extends JsonCollectionRepository<Reflection> implements ReflectionRepository {
  constructor(store: DataStore) { super(store, 'reflections'); }
  override find(id: ReflectionId): Promise<Reflection | null> { return super.find(id); }
}

export class JsonActivityRepository extends JsonCollectionRepository<ActivityEvent> implements ActivityRepository {
  constructor(store: DataStore) { super(store, 'activityEvents'); }
  override find(id: ActivityEventId): Promise<ActivityEvent | null> { return super.find(id); }
}

export class JsonAgentConnectionRepository
  extends JsonCollectionRepository<AgentConnection>
  implements AgentConnectionRepository
{
  constructor(store: DataStore) { super(store, 'agentConnections'); }
  override find(id: AgentConnectionId): Promise<AgentConnection | null> { return super.find(id); }
}

export class JsonUserRepository extends JsonCollectionRepository<User> implements UserRepository {
  constructor(store: DataStore) { super(store, 'users'); }
  override find(id: UserId): Promise<User | null> { return super.find(id); }
}
