import {
  PrototypeDocumentSchema,
  type ActivityEvent,
  type AgentConnection,
  type Milestone,
  type Project,
  type Subproject,
  type ProjectSection,
  type Reflection,
  type Task,
  type User, SCHEMA_VERSION, } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryDataStore, unitOfWorkFor } from './data-store';
import { RepositoryConflictError, RepositoryNotFoundError, UnitOfWorkInProgressError } from './errors';
import {
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
  JsonTaskRepository,
  JsonUserRepository,
} from './json-repositories';

const at = '2026-08-26T10:00:00.000Z';

const baseDocument = () =>
  PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: [
      {
        id: 'user-1',
        name: 'Owner',
        workspaceId: 'workspace-1',
        preferences: { theme: 'dark', dashboardWidgets: [] },
        createdAt: at,
      },
    ],
    workspaces: [{ id: 'workspace-1', name: 'Workspace', ownerUserId: 'user-1', createdAt: at }],
    projects: [
      {
        id: 'project-1',
        workspaceId: 'workspace-1',
        kind: 'root',
        name: 'Alpha Launch',
        description: 'First project',
        status: 'active',
        projectLayoutMode: 'flow',
        createdAt: at,
        updatedAt: at,
      },
    ],
    projectPages: [
      { id: 'page-1', projectId: 'project-1', kind: 'home', enabled: true, createdAt: at, updatedAt: at },
    ],
    sections: [],
    sectionShortcuts: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [],
  });

const project = (id: string, overrides: Partial<Subproject> = {}): Project =>
  PrototypeDocumentSchema.shape.projects.element.parse({
    id,
    workspaceId: 'workspace-1',
    // A parent is what makes something a unit of work rather than a workspace (§26), so the
    // factory derives the discriminator instead of asking every call site to restate it.
    kind: overrides.parentProjectId === undefined ? 'root' : 'subproject',
    name: `Project ${id}`,
    status: 'planning',
    projectLayoutMode: 'flow',
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

const task = (id: string, overrides: Partial<Task> = {}): Task =>
  PrototypeDocumentSchema.shape.tasks.element.parse({
    id,
    projectId: 'project-1',
    sectionId: 'section-1',
    title: `Task ${id}`,
    status: 'todo',
    priority: 'medium',
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

type CrudCase<T extends { id: string }> = {
  name: string;
  create: (store: InMemoryDataStore) => {
    insert(entity: T): Promise<void>;
    list(): Promise<T[]>;
    update(entity: T): Promise<void>;
    find(id: T['id']): Promise<T | null>;
  };
  original: T;
  updated: T;
};

const section: ProjectSection = PrototypeDocumentSchema.shape.sections.element.parse({
  id: 'section-1',
  projectId: 'project-1',
  pageId: 'page-1',
  type: 'task-list',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: { filters: ['open'] },
  createdAt: at,
  updatedAt: at,
});
const milestone: Milestone = PrototypeDocumentSchema.shape.milestones.element.parse({
  id: 'milestone-1',
  projectId: 'project-1',
  title: 'Milestone',
  status: 'upcoming',
  createdAt: at,
  updatedAt: at,
});
const reflection: Reflection = PrototypeDocumentSchema.shape.reflections.element.parse({
  id: 'reflection-1',
  projectId: 'project-1',
  sectionId: 'section-1',
  body: 'Learned something',
  createdAt: at,
  updatedAt: at,
});
const agent: AgentConnection = PrototypeDocumentSchema.shape.agentConnections.element.parse({
  id: 'agent-1',
  userId: 'user-1',
  name: 'Local agent',
  permissions: ['tasks.read'],
  revoked: false,
  createdAt: at,
});
const user: User = PrototypeDocumentSchema.shape.users.element.parse({
  id: 'user-2',
  name: 'Second user',
  workspaceId: 'workspace-1',
  preferences: { theme: 'light', dashboardWidgets: [] },
  createdAt: at,
});
const activity: ActivityEvent = PrototypeDocumentSchema.shape.activityEvents.element.parse({
  id: 'activity-1',
  workspaceId: 'workspace-1',
  actor: 'user',
  actorUserId: 'user-1',
  action: 'project.updated',
  entityType: 'project',
  entityId: 'project-1',
  projectId: 'project-1',
  summary: 'Updated Alpha Launch',
  createdAt: at,
});

const crudCases: CrudCase<any>[] = [
  {
    name: 'project',
    create: (store) => new JsonProjectRepository(store),
    original: project('project-2'),
    updated: project('project-2', { name: 'Renamed' }),
  },
  {
    name: 'task',
    create: (store) => new JsonTaskRepository(store),
    original: task('task-1'),
    updated: task('task-1', { title: 'Renamed' }),
  },
  {
    name: 'section',
    create: (store) => new JsonSectionRepository(store),
    original: section,
    updated: { ...section, title: 'Renamed' },
  },
  {
    name: 'milestone',
    create: (store) => new JsonMilestoneRepository(store),
    original: milestone,
    updated: { ...milestone, title: 'Renamed' },
  },
  {
    name: 'reflection',
    create: (store) => new JsonReflectionRepository(store),
    original: reflection,
    updated: { ...reflection, body: 'Changed' },
  },
  {
    name: 'activity',
    create: (store) => new JsonActivityRepository(store),
    original: activity,
    updated: { ...activity, summary: 'Changed' },
  },
  {
    name: 'agent connection',
    create: (store) => new JsonAgentConnectionRepository(store),
    original: agent,
    updated: { ...agent, name: 'Renamed' },
  },
  {
    name: 'user',
    create: (store) => new JsonUserRepository(store),
    original: user,
    updated: { ...user, name: 'Renamed' },
  },
];

describe.each(crudCases)('Json $name repository', ({ create, original, updated }) => {
  it('supports insert, list, update, and find', async () => {
    const repository = create(new InMemoryDataStore(baseDocument()));

    await repository.insert(original);
    expect(await repository.list()).toContainEqual(original);
    await repository.update(updated);
    expect(await repository.find(original.id)).toEqual(updated);
    expect(await repository.find('missing')).toBeNull();
  });

  it('rejects duplicate inserts and missing updates', async () => {
    const repository = create(new InMemoryDataStore(baseDocument()));
    await repository.insert(original);

    await expect(repository.insert(original)).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(repository.update({ ...updated, id: 'missing' })).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });
});

describe('repository value ownership', () => {
  it('deeply detaches caller values on insert and update', async () => {
    const repository = new JsonSectionRepository(new InMemoryDataStore(baseDocument()));
    const inserted = structuredClone(section);
    await repository.insert(inserted);
    (inserted.config as { filters: string[] }).filters.push('caller-mutation');
    expect(await repository.find(section.id)).toEqual(section);

    const updated = structuredClone({ ...section, config: { filters: ['done'] } });
    await repository.update(updated);
    (updated.config as { filters: string[] }).filters.push('caller-mutation');
    expect(await repository.find(section.id)).toEqual({ ...section, config: { filters: ['done'] } });
  });

  it('deeply detaches values returned by find and list', async () => {
    const repository = new JsonAgentConnectionRepository(new InMemoryDataStore(baseDocument()));
    await repository.insert(agent);
    const found = await repository.find(agent.id);
    const listed = await repository.list();
    found?.permissions.push('tasks.write');
    listed[0]?.permissions.push('projects.read');

    expect(await repository.find(agent.id)).toEqual(agent);
  });
});

describe('JsonProjectRepository.list', () => {
  it('applies workspace, parent, status, and trimmed case-insensitive search filters with AND', async () => {
    const repository = new JsonProjectRepository(new InMemoryDataStore(baseDocument()));
    await repository.insert(
      project('project-2', {
        parentProjectId: project('project-1').id,
        name: 'Beta Roadmap',
        description: 'CUSTOMER launch',
        status: 'planning',
      }),
    );

    expect(
      await repository.list({
        workspaceId: project('project-1').workspaceId,
        parentProjectId: project('project-1').id,
        status: ['planning', 'on_hold'],
        search: ' customer ',
      }),
    ).toEqual([expect.objectContaining({ id: 'project-2' })]);
    expect(await repository.list({ status: ['active'], search: 'beta' })).toEqual([]);
    expect(await repository.list({ search: '   ' })).toHaveLength(2);
  });
});

describe('JsonTaskRepository.list', () => {
  it('applies every query field, exclusive due bounds, missing-date exclusion, and AND composition', async () => {
    const repository = new JsonTaskRepository(new InMemoryDataStore(baseDocument()));
    await repository.insert(
      task('task-parent', { title: 'Parent' }),
    );
    await repository.insert(
      task('task-match', {
        parentTaskId: task('task-parent').id,
        title: 'Prepare Release',
        description: 'CUSTOMER handoff',
        status: 'blocked',
        priority: 'high',
        dueAt: '2026-08-27T12:00:00.000Z',
      }),
    );
    await repository.insert(task('task-boundary', { dueAt: '2026-08-28T00:00:00.000Z' }));
    await repository.insert(task('task-undated'));

    expect(
      await repository.list({
        projectId: project('project-1').id,
        parentTaskId: task('task-parent').id,
        status: ['blocked', 'done'],
        priority: ['high'],
        dueAfter: '2026-08-27T00:00:00.000Z',
        dueBefore: '2026-08-28T00:00:00.000Z',
        search: ' customer ',
      }),
    ).toEqual([expect.objectContaining({ id: 'task-match' })]);
    expect(await repository.list({ dueBefore: '2026-08-28T00:00:00.000Z' })).not.toContainEqual(
      expect.objectContaining({ id: 'task-boundary' }),
    );
    expect(await repository.list({ dueAfter: '2026-08-28T00:00:00.000Z' })).not.toContainEqual(
      expect.objectContaining({ id: 'task-boundary' }),
    );
    expect(await repository.list({ dueBefore: '2026-08-30T00:00:00.000Z' })).not.toContainEqual(
      expect.objectContaining({ id: 'task-undated' }),
    );
    expect(await repository.list({ search: '   ' })).toHaveLength(4);
  });
});

describe('JsonTaskRepository archived filtering', () => {
  it('hides archived tasks unless includeArchived asks for them', async () => {
    const repository = new JsonTaskRepository(new InMemoryDataStore(baseDocument()));
    await repository.insert(task('task-live'));
    await repository.insert(task('task-filed', { archivedAt: '2026-08-26T11:00:00.000Z' }));

    expect(await repository.list()).toEqual([expect.objectContaining({ id: 'task-live' })]);
    expect(await repository.list({ includeArchived: false })).toHaveLength(1);
    expect((await repository.list({ includeArchived: true })).map((found) => found.id)).toEqual([
      'task-live',
      'task-filed',
    ]);
  });

  it('composes the archived filter with the other query fields', async () => {
    const repository = new JsonTaskRepository(new InMemoryDataStore(baseDocument()));
    await repository.insert(task('task-filed-high', { priority: 'high', archivedAt: '2026-08-26T11:00:00.000Z' }));

    expect(await repository.list({ priority: ['high'] })).toEqual([]);
    expect(await repository.list({ priority: ['high'], includeArchived: true })).toHaveLength(1);
  });
});

describe('JsonMilestoneRepository.list', () => {
  it('filters milestones by project, and answers every milestone without a query', async () => {
    const repository = new JsonMilestoneRepository(new InMemoryDataStore(baseDocument()));
    const otherProjectMilestone = PrototypeDocumentSchema.shape.milestones.element.parse({
      ...milestone,
      id: 'milestone-2',
      projectId: 'project-2',
      title: 'Other project milestone',
    });
    await repository.insert(milestone);
    await repository.insert(otherProjectMilestone);

    expect(await repository.list({ projectId: milestone.projectId })).toEqual([milestone]);
    expect(await repository.list()).toEqual([milestone, otherProjectMilestone]);
  });
});

describe('JsonReflectionRepository.list', () => {
  it('filters reflections by project, and answers every reflection without a query', async () => {
    const repository = new JsonReflectionRepository(new InMemoryDataStore(baseDocument()));
    const otherProjectReflection = PrototypeDocumentSchema.shape.reflections.element.parse({
      ...reflection,
      id: 'reflection-2',
      projectId: 'project-2',
      body: 'Other project learning',
    });
    await repository.insert(reflection);
    await repository.insert(otherProjectReflection);

    expect(await repository.list({ projectId: reflection.projectId })).toEqual([reflection]);
    expect(await repository.list()).toEqual([reflection, otherProjectReflection]);
  });
});

describe('JsonActivityRepository.list', () => {
  const event = (id: string, projectId: string) =>
    PrototypeDocumentSchema.shape.activityEvents.element.parse({
      id,
      workspaceId: 'workspace-1',
      actor: 'user',
      actorUserId: 'user-1',
      action: 'task.created',
      entityType: 'project',
      entityId: projectId,
      projectId,
      summary: `Created ${id}`,
      createdAt: at,
    });

  it('filters by project and applies limit last, after filtering', async () => {
    const store = new InMemoryDataStore(baseDocument());
    await new JsonProjectRepository(store).insert(project('project-2'));
    const repository = new JsonActivityRepository(store);
    await repository.insert(event('activity-1', 'project-1'));
    await repository.insert(event('activity-2', 'project-2'));
    await repository.insert(event('activity-3', 'project-1'));

    expect((await repository.list({ projectId: project('project-1').id })).map((found) => found.id)).toEqual([
      'activity-1',
      'activity-3',
    ]);
    expect((await repository.list({ projectId: project('project-1').id, limit: 1 })).map((found) => found.id)).toEqual([
      'activity-1',
    ]);
    expect(await repository.list()).toHaveLength(3);
  });
});

describe('InMemoryDataStore.snapshot', () => {
  it('returns a detached public snapshot', async () => {
    const store = new InMemoryDataStore(baseDocument());
    const repository = new JsonUserRepository(store);
    const snapshot = store.snapshot();
    snapshot.users[0]!.preferences.dashboardWidgets.push({
      id: 'widget-1',
      type: 'today',
      position: 0,
      size: 'small',
      config: {},
      hidden: false,
    });

    expect((await repository.find(snapshot.users[0]!.id))?.preferences.dashboardWidgets).toEqual([]);
    expect(store.snapshot().users[0]?.preferences.dashboardWidgets).toEqual([]);
  });
});

describe('JsonSectionRepository', () => {
  const otherProject: ProjectSection = PrototypeDocumentSchema.shape.sections.element.parse({
    ...section,
    id: 'section-2',
    projectId: 'project-2',
    pageId: 'page-2',
    position: 0,
  });

  const populated = async () => {
    const repository = new JsonSectionRepository(new InMemoryDataStore(baseDocument()));
    await repository.insert(section);
    await repository.insert(otherProject);
    return repository;
  };

  it('filters sections by project, and answers every section without a query', async () => {
    const repository = await populated();

    expect(await repository.list({ projectId: section.projectId })).toEqual([section]);
    expect(await repository.list()).toHaveLength(2);
  });

  /**
   * §27's ownership chain runs `project → page → section`, so a canvas read has to be able to
   * ask for one page. The predicate is here; resolving a stale or foreign page into a
   * not-found is `SectionService.list`'s, because a repository has no actor to scope against.
   */
  it('filters sections by page', async () => {
    const repository = await populated();

    expect(await repository.list({ pageId: section.pageId })).toEqual([section]);
    expect(await repository.list({ pageId: 'page-nobody-has' as typeof section.pageId })).toEqual([]);
    // Combined with the project scope rather than replacing it.
    expect(await repository.list({ projectId: otherProject.projectId, pageId: section.pageId })).toEqual([]);
  });

  it('excludes archived sections unless the caller asks for them', async () => {
    // The predicate every canvas read depends on: §31's remove now archives, so a section
    // that has left the canvas must not come back through an ordinary list.
    const repository = await populated();
    const archived: ProjectSection = PrototypeDocumentSchema.shape.sections.element.parse({
      ...section,
      id: 'section-3',
      position: 1,
      archivedAt: '2026-09-02T06:13:32.422Z',
    });
    await repository.insert(archived);

    expect(await repository.list({ projectId: section.projectId })).toEqual([section]);
    expect(await repository.list()).toEqual([section, otherProject]);
    expect(await repository.list({ projectId: section.projectId, includeArchived: true })).toEqual([
      section,
      archived,
    ]);
    // `find` is deliberately unfiltered — restore has to be able to reach an archived id.
    expect(await repository.find(archived.id)).toEqual(archived);
  });

  it('keeps the hard delete as the seam permanent deletion will use', async () => {
    const repository = await populated();

    await repository.remove(section.id);

    expect(await repository.find(section.id)).toBeNull();
    expect(await repository.list()).toEqual([otherProject]);
  });

  it('raises not-found removing a section twice', async () => {
    const repository = await populated();
    await repository.remove(section.id);

    await expect(repository.remove(section.id)).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('refuses to remove from outside the unit of work that is open', async () => {
    const store = new InMemoryDataStore(baseDocument());
    const repository = new JsonSectionRepository(store);
    await repository.insert(section);

    // The same guard `insert` and `update` carry: a caller outside the open operation must
    // not write into a document that operation is midway through committing.
    let entered!: () => void;
    let release!: () => void;
    const hasEntered = new Promise<void>((resolve) => (entered = resolve));
    const blocker = new Promise<void>((resolve) => (release = resolve));
    const operation = unitOfWorkFor(store).run(async () => {
      entered();
      await blocker;
    });
    await hasEntered;

    await expect(repository.remove(section.id)).rejects.toBeInstanceOf(UnitOfWorkInProgressError);

    release();
    await operation;
    expect(await repository.find(section.id)).not.toBeNull();
  });
});
