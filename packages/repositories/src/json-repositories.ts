import type {
  ActivityEvent, ActivityEventId, ActivityQuery, AgentConnection, AgentConnectionId, Milestone, MilestoneId,
  MilestoneQuery, Project, ProjectId, ProjectPage, ProjectPageId, ProjectPageQuery, ProjectQuery, ProjectSection,
  PrototypeDocument, Reflection,
  ReflectionId, ReflectionQuery, SectionId, SectionQuery, Task, TaskId, TaskQuery, User, UserId,
} from '@cwm/contracts';
import { assertCanMutateDataStore, type DataStore, getActiveDocument } from './data-store';
import { RepositoryConflictError, RepositoryNotFoundError } from './errors';
import type {
  ActivityRepository, AgentConnectionRepository, MilestoneRepository, ProjectPageRepository, ProjectRepository,
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

  /**
   * Only sections expose this, and nothing in the domain calls it any more: §31's remove
   * archives. It is not safe in general either — `validateDocumentIntegrity` resolves every
   * activity event's target, so deleting anything the feed points at would fail the next
   * unit of work to close. See `SectionRepository.remove` for why the seam stays.
   */
  protected async delete(id: T['id']): Promise<void> {
    assertCanMutateDataStore(this.store);
    const values = this.values();
    const index = values.findIndex((value) => value.id === id);
    if (index === -1) throw new RepositoryNotFoundError(this.collection, id);
    values.splice(index, 1);
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
        (query.sectionId === undefined || task.sectionId === query.sectionId) &&
        (query.parentTaskId === undefined || task.parentTaskId === query.parentTaskId) &&
        (query.status === undefined || query.status.includes(task.status)) &&
        (query.priority === undefined || query.priority.includes(task.priority)) &&
        (after === undefined || (due !== undefined && due > after)) &&
        (before === undefined || (due !== undefined && due < before)) &&
        (query.includeArchived === true || task.archivedAt === undefined) &&
        matchesSearch(query.search, task.title, task.description)
      );
    });
  }

  override find(id: TaskId): Promise<Task | null> {
    return super.find(id);
  }
}

export class JsonProjectPageRepository extends JsonCollectionRepository<ProjectPage> implements ProjectPageRepository {
  constructor(store: DataStore) {
    super(store, 'projectPages');
  }

  override async list(query: ProjectPageQuery = {}): Promise<ProjectPage[]> {
    const pages = await super.list();
    return pages.filter(
      (page) =>
        (query.projectId === undefined || page.projectId === query.projectId) &&
        (query.kind === undefined || page.kind === query.kind) &&
        (query.enabled === undefined || page.enabled === query.enabled),
    );
  }

  override find(id: ProjectPageId): Promise<ProjectPage | null> { return super.find(id); }
}

export class JsonSectionRepository extends JsonCollectionRepository<ProjectSection> implements SectionRepository {
  constructor(store: DataStore) { super(store, 'sections'); }

  override async list(query: SectionQuery = {}): Promise<ProjectSection[]> {
    const sections = await super.list();
    return sections.filter(
      (section) =>
        (query.projectId === undefined || section.projectId === query.projectId) &&
        (query.pageId === undefined || section.pageId === query.pageId) &&
        (query.includeArchived === true || section.archivedAt === undefined),
    );
  }

  override find(id: SectionId): Promise<ProjectSection | null> { return super.find(id); }

  remove(id: SectionId): Promise<void> { return this.delete(id); }
}

export class JsonMilestoneRepository extends JsonCollectionRepository<Milestone> implements MilestoneRepository {
  constructor(store: DataStore) { super(store, 'milestones'); }

  override async list(query: MilestoneQuery = {}): Promise<Milestone[]> {
    const milestones = await super.list();
    return milestones.filter((milestone) => query.projectId === undefined || milestone.projectId === query.projectId);
  }

  override find(id: MilestoneId): Promise<Milestone | null> { return super.find(id); }
}

export class JsonReflectionRepository extends JsonCollectionRepository<Reflection> implements ReflectionRepository {
  constructor(store: DataStore) { super(store, 'reflections'); }

  override async list(query: ReflectionQuery = {}): Promise<Reflection[]> {
    const reflections = await super.list();
    return reflections.filter(
      (reflection) =>
        (query.projectId === undefined || reflection.projectId === query.projectId) &&
        (query.sectionId === undefined || reflection.sectionId === query.sectionId) &&
        (query.includeArchived === true || reflection.archivedAt === undefined),
    );
  }

  override find(id: ReflectionId): Promise<Reflection | null> { return super.find(id); }
}

export class JsonActivityRepository extends JsonCollectionRepository<ActivityEvent> implements ActivityRepository {
  constructor(store: DataStore) { super(store, 'activityEvents'); }

  /** `limit` applies last, so it truncates the filtered result rather than the collection. */
  override async list(query: ActivityQuery = {}): Promise<ActivityEvent[]> {
    const events = await super.list();
    const filtered = events.filter((event) => query.projectId === undefined || event.projectId === query.projectId);
    return query.limit === undefined ? filtered : filtered.slice(0, query.limit);
  }

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
