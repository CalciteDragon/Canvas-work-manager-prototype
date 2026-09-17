import { mkdtemp, readFile, rename as renameFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OperationActionSchema,
  OperationHistorySchema,
  PrototypeDocumentSchema,
  type PrototypeDocument,
  SCHEMA_VERSION,
} from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DataStore, type FileOperations, InMemoryDataStore, JsonDataStore, unitOfWorkFor } from './data-store';
import { DocumentIntegrityError, UnitOfWorkInProgressError } from './errors';
import { JsonProjectPageRepository, JsonProjectRepository } from './json-repositories';

const at = '2026-08-26T10:00:00.000Z';

const validDocument = () =>
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
        name: 'Project',
        status: 'active',
        projectLayoutMode: 'flow',
        createdAt: at,
        updatedAt: at,
      },
    ],
    projectPages: [{ id: 'page-1', projectId: 'project-1', kind: 'home', enabled: true, createdAt: at, updatedAt: at }],
    sectionShortcuts: [],
    sections: [
      {
        id: 'section-1',
        projectId: 'project-1',
        pageId: 'page-1',
        type: 'task-list',
        position: 0,
        columnSpan: 12,
        collapsed: false,
        config: {},
        createdAt: at,
        updatedAt: at,
      },
      // A row's section has to hold rows of the row's kind, so the reflection below needs a
      // `reflections` container rather than the task list.
      {
        id: 'section-2',
        projectId: 'project-1',
        pageId: 'page-1',
        type: 'reflections',
        position: 1,
        columnSpan: 12,
        collapsed: false,
        config: {},
        createdAt: at,
        updatedAt: at,
      },
    ],
    tasks: [
      {
        id: 'task-1',
        projectId: 'project-1',
        sectionId: 'section-1',
        title: 'Task',
        status: 'todo',
        priority: 'medium',
        createdAt: at,
        updatedAt: at,
      },
    ],
    milestones: [
      {
        id: 'milestone-1',
        projectId: 'project-1',
        title: 'Milestone',
        status: 'upcoming',
        createdAt: at,
        updatedAt: at,
      },
    ],
    reflections: [
      {
        id: 'reflection-1',
        projectId: 'project-1',
        sectionId: 'section-2',
        body: 'Reflection',
        createdAt: at,
        updatedAt: at,
      },
    ],
    activityEvents: [
      {
        id: 'activity-1',
        workspaceId: 'workspace-1',
        actor: 'agent',
        actorAgentConnectionId: 'agent-1',
        action: 'task.updated',
        entityType: 'task',
        entityId: 'task-1',
        projectId: 'project-1',
        summary: 'Updated Task',
        createdAt: at,
      },
    ],
    agentConnections: [
      {
        id: 'agent-1',
        userId: 'user-1',
        name: 'Agent',
        permissions: ['tasks.write'],
        revoked: false,
        createdAt: at,
      },
    ],
  });

const secondWorkspace = {
  user: {
    id: 'user-2',
    name: 'Other owner',
    workspaceId: 'workspace-2',
    preferences: { theme: 'light' as const, dashboardWidgets: [] },
    createdAt: at,
  },
  workspace: { id: 'workspace-2', name: 'Other', ownerUserId: 'user-2', createdAt: at },
  project: {
    id: 'project-2',
    workspaceId: 'workspace-2',
    kind: 'root' as const,
    name: 'Other project',
    status: 'active' as const,
    projectLayoutMode: 'flow' as const,
    createdAt: at,
    updatedAt: at,
  },
  page: { id: 'page-2', projectId: 'project-2', kind: 'home' as const, enabled: true, createdAt: at, updatedAt: at },
  section: {
    id: 'section-3',
    projectId: 'project-2',
    pageId: 'page-2',
    type: 'task-list',
    position: 0,
    columnSpan: 12 as const,
    collapsed: false,
    config: {},
    createdAt: at,
    updatedAt: at,
  },
  task: {
    id: 'task-2',
    projectId: 'project-2',
    // Its own project's container: a row whose section belongs to another project is now
    // an integrity failure, which would have made the cross-scope cases below vacuous.
    sectionId: 'section-3',
    title: 'Other task',
    status: 'todo' as const,
    priority: 'medium' as const,
    createdAt: at,
    updatedAt: at,
  },
  agent: {
    id: 'agent-2',
    userId: 'user-2',
    name: 'Other agent',
    permissions: ['tasks.read' as const],
    revoked: false,
    createdAt: at,
  },
};

const withSecondWorkspace = () => {
  const document = validDocument();
  document.users.push(PrototypeDocumentSchema.shape.users.element.parse(secondWorkspace.user));
  document.workspaces.push(PrototypeDocumentSchema.shape.workspaces.element.parse(secondWorkspace.workspace));
  document.projects.push(PrototypeDocumentSchema.shape.projects.element.parse(secondWorkspace.project));
  document.projectPages.push(PrototypeDocumentSchema.shape.projectPages.element.parse(secondWorkspace.page));
  document.sections.push(PrototypeDocumentSchema.shape.sections.element.parse(secondWorkspace.section));
  document.tasks.push(PrototypeDocumentSchema.shape.tasks.element.parse(secondWorkspace.task));
  document.agentConnections.push(PrototypeDocumentSchema.shape.agentConnections.element.parse(secondWorkspace.agent));
  return document;
};

describe('document validation', () => {
  it('rejects contract-invalid input before retaining it', () => {
    expect(() => new InMemoryDataStore({ schemaVersion: 1 })).toThrow();
  });

  it.each([
    'users',
    'workspaces',
    'projects',
    'sections',
    'tasks',
    'milestones',
    'reflections',
    'activityEvents',
    'agentConnections',
  ] as const)('rejects duplicate ids in %s', (collection) => {
    const document = validDocument();
    document[collection].push(structuredClone(document[collection][0]!) as never);
    expect(() => new InMemoryDataStore(document)).toThrow(DocumentIntegrityError);
  });

  it('rejects duplicate shortcut ids', () => {
    const document = validDocument();
    document.projectPages.push(
      PrototypeDocumentSchema.shape.projectPages.element.parse({
        id: 'page-reflections',
        projectId: 'project-1',
        kind: 'reflections',
        enabled: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    document.sections[1]!.pageId = 'page-reflections' as never;
    const placement = PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
      id: 'shortcut-1',
      pageId: 'page-1',
      sourceSectionId: 'section-2',
      position: 1,
      columnSpan: 12,
      collapsed: false,
      createdAt: at,
      updatedAt: at,
    });
    document.sectionShortcuts.push(placement, structuredClone(placement));

    expect(() => new InMemoryDataStore(document)).toThrow(/sectionShortcuts contains duplicate id/);
  });

  it.each([
    ['workspace owner', (document: ReturnType<typeof validDocument>) => (document.workspaces[0]!.ownerUserId = 'missing' as never)],
    ['user workspace', (document: ReturnType<typeof validDocument>) => (document.users[0]!.workspaceId = 'missing' as never)],
    ['project workspace', (document: ReturnType<typeof validDocument>) => (document.projects[0]!.workspaceId = 'missing' as never)],
    ['project parent', (document: ReturnType<typeof validDocument>) => (document.projects[0]!.parentProjectId = 'missing' as never)],
    ['section project', (document: ReturnType<typeof validDocument>) => (document.sections[0]!.projectId = 'missing' as never)],
    ['task project', (document: ReturnType<typeof validDocument>) => (document.tasks[0]!.projectId = 'missing' as never)],
    ['task parent', (document: ReturnType<typeof validDocument>) => (document.tasks[0]!.parentTaskId = 'missing' as never)],
    ['milestone project', (document: ReturnType<typeof validDocument>) => (document.milestones[0]!.projectId = 'missing' as never)],
    ['reflection project', (document: ReturnType<typeof validDocument>) => (document.reflections[0]!.projectId = 'missing' as never)],
    ['agent user', (document: ReturnType<typeof validDocument>) => (document.agentConnections[0]!.userId = 'missing' as never)],
    ['activity workspace', (document: ReturnType<typeof validDocument>) => (document.activityEvents[0]!.workspaceId = 'missing' as never)],
    ['activity agent actor', (document: ReturnType<typeof validDocument>) => (document.activityEvents[0]!.actorAgentConnectionId = 'missing' as never)],
    ['activity project', (document: ReturnType<typeof validDocument>) => (document.activityEvents[0]!.projectId = 'missing' as never)],
    ['activity target', (document: ReturnType<typeof validDocument>) => (document.activityEvents[0]!.entityId = 'missing')],
  ])('rejects a dangling %s reference', (_name, mutate) => {
    const document = validDocument();
    mutate(document);
    expect(() => new InMemoryDataStore(document)).toThrow(DocumentIntegrityError);
  });

  it.each([
    ['workspace owner', (document: ReturnType<typeof withSecondWorkspace>) => (document.workspaces[0]!.ownerUserId = secondWorkspace.user.id as never)],
    ['project parent', (document: ReturnType<typeof withSecondWorkspace>) => (document.projects[0]!.parentProjectId = secondWorkspace.project.id as never)],
    ['task parent', (document: ReturnType<typeof withSecondWorkspace>) => (document.tasks[0]!.parentTaskId = secondWorkspace.task.id as never)],
    ['activity target', (document: ReturnType<typeof withSecondWorkspace>) => (document.activityEvents[0]!.entityId = secondWorkspace.task.id)],
    ['activity project', (document: ReturnType<typeof withSecondWorkspace>) => (document.activityEvents[0]!.projectId = secondWorkspace.project.id as never)],
    ['activity agent actor', (document: ReturnType<typeof withSecondWorkspace>) => (document.activityEvents[0]!.actorAgentConnectionId = secondWorkspace.agent.id as never)],
  ])('rejects a cross-scope %s reference', (_name, mutate) => {
    const document = withSecondWorkspace();
    mutate(document);
    expect(() => new InMemoryDataStore(document)).toThrow(DocumentIntegrityError);
  });

  it('validates activity targets for every entity type', () => {
    const document = validDocument();
    const targets = [
      ['project', 'project-1'],
      ['section', 'section-1'],
      ['task', 'task-1'],
      ['milestone', 'milestone-1'],
      ['reflection', 'reflection-1'],
      ['agent_connection', 'agent-1'],
    ] as const;
    document.activityEvents = targets.map(([entityType, entityId], index) => ({
      ...document.activityEvents[0]!,
      id: `activity-${index + 1}` as (typeof document.activityEvents)[number]['id'],
      entityType,
      entityId,
      projectId: entityType === 'agent_connection' ? undefined : document.projects[0]!.id,
    }));

    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });
});

/**
 * §30's ownership invariant, made structural. The friction note the archive phase came from
 * (`note-2026-09-01-002`) recorded a task pointing at a section that no longer existed —
 * committed, persisted, and invisible until someone read the file by hand.
 */
describe('row ownership integrity', () => {
  const archivedAt = '2026-09-02T06:13:32.422Z';

  it('rejects a row whose section does not exist', () => {
    const document = validDocument();
    document.tasks[0]!.sectionId = 'section-gone' as never;
    expect(() => new InMemoryDataStore(document)).toThrow(/missing section "section-gone"/);

    const withReflection = validDocument();
    withReflection.reflections[0]!.sectionId = 'section-gone' as never;
    expect(() => new InMemoryDataStore(withReflection)).toThrow(DocumentIntegrityError);
  });

  it('rejects a row held by a section of the wrong kind', () => {
    // Without this clause the rule is a foreign-key check, not the ownership invariant: a
    // `rich-text` section renders nothing it owns, so a task it holds is a task nothing
    // renders.
    const document = validDocument();
    document.sections.push(
      PrototypeDocumentSchema.shape.sections.element.parse({
        ...document.sections[0],
        id: 'section-notes',
        type: 'rich-text',
        position: 2,
      }),
    );
    document.tasks[0]!.sectionId = 'section-notes' as never;
    expect(() => new InMemoryDataStore(document)).toThrow(/is held by a rich-text section/);

    const swapped = validDocument();
    // The reflections container does not hold tasks, and the task list does not hold
    // reflections — each direction is its own failure. Asserted by message, or a fixture
    // that happened to break a different rule would pass this.
    swapped.reflections[0]!.sectionId = 'section-1' as never;
    expect(() => new InMemoryDataStore(swapped)).toThrow(/reflection "reflection-1" is held by a task-list section/);
  });

  it('rejects a row whose section belongs to another project', () => {
    const document = withSecondWorkspace();
    document.tasks[0]!.sectionId = secondWorkspace.section.id as never;
    expect(() => new InMemoryDataStore(document)).toThrow(/section from another project/);
  });

  it('rejects a live row in an archived section, and accepts an archived one', () => {
    // The state removal-as-archive is built to prevent: a row still live inside a container
    // that has left the canvas, with nothing saying so.
    const live = validDocument();
    live.sections[0]!.archivedAt = archivedAt;
    expect(() => new InMemoryDataStore(live)).toThrow(/live in an archived section/);

    const cascaded = validDocument();
    cascaded.sections[0]!.archivedAt = archivedAt;
    cascaded.tasks[0]!.archivedAt = archivedAt;
    // The ordinary post-cascade state, and the reflection's own container is still live.
    expect(() => new InMemoryDataStore(cascaded)).not.toThrow();
  });

  it('rejects a subtask held by a different section from its parent', () => {
    // A subtask is rendered by whichever list holds its parent, so a split pair renders as
    // two half-tasks — and it would let a section cascade take down a partial subtree.
    const document = validDocument();
    document.sections.push(
      PrototypeDocumentSchema.shape.sections.element.parse({
        ...document.sections[0],
        id: 'section-other-list',
        type: 'task-list',
        position: 2,
      }),
    );
    document.tasks.push(
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...document.tasks[0],
        id: 'task-child',
        parentTaskId: 'task-1',
        sectionId: 'section-other-list',
      }),
    );
    expect(() => new InMemoryDataStore(document)).toThrow(/has a parent in another section/);

    document.tasks[1]!.archivedAt = archivedAt;
    // Archived or live, a split pair is the same defect.
    expect(() => new InMemoryDataStore(document)).toThrow(/has a parent in another section/);

    document.tasks[1]!.sectionId = 'section-1' as never;
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });

  it('rejects a section archive marker that outlives what it describes', () => {
    // The marker is the pairing `restoreSection` reads. Three ways to lie with it, each its
    // own failure: on a live row, naming another section, or naming a section still live.
    const live = validDocument();
    live.tasks[0]!.archivedWithSectionId = 'section-1' as never;
    expect(() => new InMemoryDataStore(live)).toThrow(/is marked as archived with a section/);

    const elsewhere = validDocument();
    elsewhere.sections[1]!.archivedAt = archivedAt;
    elsewhere.reflections[0]!.archivedAt = archivedAt;
    elsewhere.tasks[0]!.archivedAt = archivedAt;
    elsewhere.tasks[0]!.archivedWithSectionId = 'section-2' as never;
    expect(() => new InMemoryDataStore(elsewhere)).toThrow(/marked as archived with another section/);

    const stale = validDocument();
    stale.tasks[0]!.archivedAt = archivedAt;
    stale.tasks[0]!.archivedWithSectionId = 'section-1' as never;
    expect(() => new InMemoryDataStore(stale)).toThrow(/marked with a live section/);

    const cascaded = validDocument();
    cascaded.sections[0]!.archivedAt = archivedAt;
    cascaded.tasks[0]!.archivedAt = archivedAt;
    cascaded.tasks[0]!.archivedWithSectionId = 'section-1' as never;
    expect(() => new InMemoryDataStore(cascaded)).not.toThrow();
  });

  it('holds reflections to the same marker rules', () => {
    const document = validDocument();
    document.reflections[0]!.archivedWithSectionId = 'section-2' as never;
    expect(() => new InMemoryDataStore(document)).toThrow(
      /live reflection "reflection-1" is marked as archived with a section/,
    );

    document.reflections[0]!.archivedAt = archivedAt;
    document.sections[1]!.archivedAt = archivedAt;
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });
});

class TrackingStore extends InMemoryDataStore {
  persistCalls = 0;
  failPersistence = false;

  override async persist(): Promise<void> {
    this.persistCalls += 1;
    if (this.failPersistence) throw new Error('persist failed');
  }
}

const newProject = () =>
  PrototypeDocumentSchema.shape.projects.element.parse({
    id: 'project-2',
    workspaceId: 'workspace-1',
    kind: 'root',
    name: 'New project',
    status: 'planning',
    projectLayoutMode: 'grid',
    createdAt: at,
    updatedAt: at,
  });

const pageFor = (projectId: string) =>
  PrototypeDocumentSchema.shape.projectPages.element.parse({
    id: `page-${projectId}`,
    projectId,
    kind: 'home',
    enabled: true,
    createdAt: at,
    updatedAt: at,
  });

/**
 * A project and its canonical page are one write (§26): a project with nowhere to put a
 * section does not validate, so a unit of work that inserted only the project would fail at
 * commit for a reason none of these unit-of-work tests are about.
 */
const insertProject = async (store: DataStore, project = newProject()): Promise<void> => {
  await new JsonProjectRepository(store).insert(project);
  await new JsonProjectPageRepository(store).insert(pageFor(project.id));
};

describe('runUnitOfWork', () => {
  it('awaits async work, persists once, and returns the callback result', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);

    const result = await store.runUnitOfWork(async () => {
      await Promise.resolve();
      await insertProject(store);
      await repository.update({ ...newProject(), name: 'Updated in one operation' });
      return 'result';
    });

    expect(result).toBe('result');
    expect(store.persistCalls).toBe(1);
    expect(await repository.find(newProject().id)).toEqual(expect.objectContaining({ name: 'Updated in one operation' }));
  });

  it('rolls memory back and skips persistence when the callback fails', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);

    await expect(
      store.runUnitOfWork(async () => {
        await insertProject(store);
        throw new Error('operation failed');
      }),
    ).rejects.toThrow('operation failed');
    expect(store.persistCalls).toBe(0);
    expect(await repository.find(newProject().id)).toBeNull();
  });

  it('rolls memory back and skips persistence when final integrity validation fails', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);

    await expect(
      store.runUnitOfWork(() => repository.insert({ ...newProject(), workspaceId: 'missing' as never })),
    ).rejects.toBeInstanceOf(DocumentIntegrityError);
    expect(store.persistCalls).toBe(0);
    expect(await repository.find(newProject().id)).toBeNull();
  });

  it('reports a malformed final document as a DocumentIntegrityError', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => repository.insert({ id: 'malformed' } as never))).rejects.toBeInstanceOf(
      DocumentIntegrityError,
    );
    expect(store.persistCalls).toBe(0);
  });

  it('rolls memory back when persistence fails', async () => {
    const store = new TrackingStore(validDocument());
    store.failPersistence = true;
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => insertProject(store))).rejects.toThrow('persist failed');
    expect(store.persistCalls).toBe(1);
    expect(await repository.find(newProject().id)).toBeNull();
  });

  it('rejects nested and overlapping work while letting the first and later units complete', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);
    let release!: () => void;
    let entered!: () => void;
    const hasEntered = new Promise<void>((resolve) => (entered = resolve));
    const blocker = new Promise<void>((resolve) => (release = resolve));
    let nestedResult: Promise<unknown> | undefined;
    const first = store.runUnitOfWork(async () => {
      await insertProject(store);
      nestedResult = store.runUnitOfWork(() => Promise.resolve());
      entered();
      await blocker;
    });
    await hasEntered;

    await expect(nestedResult).rejects.toBeInstanceOf(UnitOfWorkInProgressError);
    await expect(store.runUnitOfWork(() => Promise.resolve())).rejects.toBeInstanceOf(UnitOfWorkInProgressError);
    expect(store.persistCalls).toBe(0);
    release();
    await first;
    expect(store.persistCalls).toBe(1);
    expect(await repository.find(newProject().id)).not.toBeNull();
    await store.runUnitOfWork(() => repository.update({ ...newProject(), name: 'Later' }));
    expect(store.persistCalls).toBe(2);
  });

  it('hides provisional state from outside readers and rejects outside writes', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);
    let release!: () => void;
    let entered!: () => void;
    const hasEntered = new Promise<void>((resolve) => (entered = resolve));
    const blocker = new Promise<void>((resolve) => (release = resolve));
    const operation = store.runUnitOfWork(async () => {
      await insertProject(store);
      expect(await repository.find(newProject().id)).not.toBeNull();
      entered();
      await blocker;
    });
    await hasEntered;

    expect(await repository.find(newProject().id)).toBeNull();
    await expect(repository.insert({ ...newProject(), id: 'outside' as never })).rejects.toBeInstanceOf(
      UnitOfWorkInProgressError,
    );
    release();
    await operation;
    expect(await repository.find(newProject().id)).not.toBeNull();
  });
});

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('JsonDataStore', () => {
  it('reports malformed JSON and schema-invalid files as DocumentIntegrityError', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, '{not json', 'utf8');
    await expect(JsonDataStore.load(path)).rejects.toBeInstanceOf(DocumentIntegrityError);
    await writeFile(path, JSON.stringify({ schemaVersion: 1 }), 'utf8');
    await expect(JsonDataStore.load(path)).rejects.toBeInstanceOf(DocumentIntegrityError);
  });

  it('loads and atomically round-trips a real contract-valid file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, `${JSON.stringify(validDocument(), null, 2)}\n`, 'utf8');
    const store = await JsonDataStore.load(path);

    await store.runUnitOfWork(() => insertProject(store));

    const written = JSON.parse(await readFile(path, 'utf8')) as unknown;
    expect(PrototypeDocumentSchema.parse(written).projects).toContainEqual(newProject());
  });

  it('keeps live disk and memory intact when writing the temporary snapshot fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    const original = `${JSON.stringify(validDocument())}\n`;
    await writeFile(path, original, 'utf8');
    const order: string[] = [];
    const operations: FileOperations = {
      readFile,
      writeFile: vi.fn(async (writePath, data, encoding) => {
        order.push('write');
        await writeFile(writePath, data.slice(0, 20), encoding);
        throw new Error('partial write');
      }),
      rename: vi.fn(async () => {
        order.push('rename');
      }),
    };
    const store = await JsonDataStore.load(path, operations);
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => insertProject(store))).rejects.toThrow('partial write');
    expect(order).toEqual(['write']);
    expect(operations.writeFile).toHaveBeenCalledWith(`${path}.tmp`, expect.any(String), 'utf8');
    expect(operations.rename).not.toHaveBeenCalled();
    expect(await repository.find(newProject().id)).toBeNull();
    expect(await readFile(path, 'utf8')).toBe(original);
  });

  it('writes a complete temp snapshot first and keeps live disk and memory intact when rename fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    const original = `${JSON.stringify(validDocument())}\n`;
    await writeFile(path, original, 'utf8');
    const order: string[] = [];
    const operations: FileOperations = {
      readFile,
      writeFile: vi.fn(async (writePath, data, encoding) => {
        order.push('write');
        await writeFile(writePath, data, encoding);
      }),
      rename: vi.fn(async (_from, _to) => {
        order.push('rename');
        throw new Error('rename failed');
      }),
    };
    const store = await JsonDataStore.load(path, operations);
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => insertProject(store))).rejects.toThrow('rename failed');
    expect(order).toEqual(['write', 'rename']);
    expect(operations.writeFile).toHaveBeenCalledWith(`${path}.tmp`, expect.any(String), 'utf8');
    expect(operations.rename).toHaveBeenCalledWith(`${path}.tmp`, path);
    const temp = await readFile(`${path}.tmp`, 'utf8');
    expect(PrototypeDocumentSchema.parse(JSON.parse(temp)).projects).toContainEqual(newProject());
    expect(await repository.find(newProject().id)).toBeNull();
    expect(await readFile(path, 'utf8')).toBe(original);
  });

  it('rejects a callback descendant that writes while persistence is delayed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, `${JSON.stringify(validDocument())}\n`, 'utf8');
    let releaseWrite!: () => void;
    let writeEntered!: () => void;
    const writeStarted = new Promise<void>((resolve) => (writeEntered = resolve));
    const writeBlocker = new Promise<void>((resolve) => (releaseWrite = resolve));
    let releaseLateWrite!: () => void;
    const lateWriteBlocker = new Promise<void>((resolve) => (releaseLateWrite = resolve));
    const operations: FileOperations = {
      readFile,
      writeFile: vi.fn(async (writePath, data, encoding) => {
        writeEntered();
        await writeBlocker;
        await writeFile(writePath, data, encoding);
      }),
      rename: renameFile,
    };
    const store = await JsonDataStore.load(path, operations);
    const repository = new JsonProjectRepository(store);
    let lateWrite: Promise<void> | undefined;
    let lateProbe: Promise<void> | undefined;
    let lateVisibleProject: Awaited<ReturnType<typeof repository.find>> | undefined;
    const operation = store.runUnitOfWork(async () => {
      await insertProject(store);
      lateWrite = (async () => {
        await lateWriteBlocker;
        await repository.update({ ...newProject(), name: 'Too late' });
      })();
      lateProbe = (async () => {
        await lateWriteBlocker;
        lateVisibleProject = await repository.find(newProject().id);
        await store.persist();
      })();
    });
    await writeStarted;

    releaseLateWrite();
    await expect(lateWrite).rejects.toBeInstanceOf(UnitOfWorkInProgressError);
    await expect(lateProbe).rejects.toBeInstanceOf(UnitOfWorkInProgressError);
    expect(lateVisibleProject).toBeNull();
    expect(operations.writeFile).toHaveBeenCalledTimes(1);
    releaseWrite();
    await operation;
    expect(await repository.find(newProject().id)).toEqual(newProject());
    const reloaded = await JsonDataStore.load(path);
    expect(await new JsonProjectRepository(reloaded).find(newProject().id)).toEqual(newProject());
  });

  it('rejects a stale callback descendant released after commit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, `${JSON.stringify(validDocument())}\n`, 'utf8');
    const store = await JsonDataStore.load(path);
    const repository = new JsonProjectRepository(store);
    let releaseLateWrite!: () => void;
    const lateWriteBlocker = new Promise<void>((resolve) => (releaseLateWrite = resolve));
    let lateWrite: Promise<void> | undefined;
    await store.runUnitOfWork(async () => {
      await insertProject(store);
      lateWrite = (async () => {
        await lateWriteBlocker;
        await repository.update({ ...newProject(), name: 'Stale write' });
      })();
    });

    releaseLateWrite();
    await expect(lateWrite).rejects.toBeInstanceOf(UnitOfWorkInProgressError);
    expect(await repository.find(newProject().id)).toEqual(newProject());
    const reloaded = await JsonDataStore.load(path);
    expect(await new JsonProjectRepository(reloaded).find(newProject().id)).toEqual(newProject());
  });
});

/**
 * Slice 12's reseed: the development panel replaces the whole document without restarting
 * the host. It goes *through* the unit of work rather than around it, so the ordinary
 * commit path does the validating, persisting and swapping.
 */
const otherWorkspaceDocument = () =>
  PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: [
      {
        id: 'user-2',
        name: 'Replacement',
        workspaceId: 'workspace-2',
        preferences: { theme: 'light', dashboardWidgets: [] },
        createdAt: at,
      },
    ],
    workspaces: [{ id: 'workspace-2', name: 'Replacement workspace', ownerUserId: 'user-2', createdAt: at }],
    projects: [],
    projectPages: [],
    sections: [],
    sectionShortcuts: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [],
  });

describe('replaceActiveDocument', () => {
  it('commits the replacement and persists it, inside a unit of work', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, `${JSON.stringify(validDocument(), null, 2)}
`, 'utf8');
    const store = await JsonDataStore.load(path);
    const unitOfWork = unitOfWorkFor(store);

    await unitOfWork.run(() => store.replaceActiveDocument(otherWorkspaceDocument()));

    expect(store.snapshot().workspaces).toEqual(otherWorkspaceDocument().workspaces);
    const written = JSON.parse(await readFile(path, 'utf8')) as unknown;
    expect(PrototypeDocumentSchema.parse(written).users[0]?.id).toBe('user-2');
  });

  // `assertCanMutateDataStore` returns cleanly when there is neither a context nor an
  // active token, so reusing it here would let a caller outside a unit silently do nothing.
  it('refuses to run outside a unit of work', () => {
    const store = new InMemoryDataStore(validDocument());

    expect(() => store.replaceActiveDocument(otherWorkspaceDocument())).toThrow(DocumentIntegrityError);
    expect(store.snapshot().workspaces[0]?.id).toBe('workspace-1');
  });

  it('rejects a replacement that is not a valid document, leaving the unit to roll back', async () => {
    const store = new InMemoryDataStore(validDocument());

    await expect(
      unitOfWorkFor(store).run(() => store.replaceActiveDocument({ schemaVersion: 1 })),
    ).rejects.toBeInstanceOf(DocumentIntegrityError);
    expect(store.snapshot().workspaces[0]?.id).toBe('workspace-1');
  });

  /**
   * The race the first design lost. `unitOfWorkFor` queues units on a promise chain, and a
   * *queued* unit has not yet registered a token — so a replacement that merely asserted
   * "no unit is open" would swap the document under it. Going through the chain means the
   * pending write commits first and is not lost.
   */
  it('lets a write enqueued before it commit first, then replaces', async () => {
    const store = new InMemoryDataStore(validDocument());
    const unitOfWork = unitOfWorkFor(store);
    const order: string[] = [];

    const write = unitOfWork.run(async () => {
      await Promise.resolve();
      await insertProject(store);
      order.push('write');
    });
    const replace = unitOfWork.run(() => {
      order.push('replace');
      store.replaceActiveDocument(otherWorkspaceDocument());
    });

    await Promise.all([write, replace]);

    expect(order).toEqual(['write', 'replace']);
    expect(store.snapshot().projects).toEqual([]);
  });
});

describe('unitOfWorkFor', () => {
  const secondProject = () =>
    PrototypeDocumentSchema.shape.projects.element.parse({
      id: 'project-3',
      workspaceId: 'workspace-1',
      kind: 'root',
      name: 'Third project',
      status: 'planning',
      projectLayoutMode: 'flow',
      createdAt: at,
      updatedAt: at,
    });

  it('returns the same adapter for the same store', () => {
    const store = new TrackingStore(validDocument());

    expect(unitOfWorkFor(store)).toBe(unitOfWorkFor(store));
    expect(unitOfWorkFor(store)).not.toBe(unitOfWorkFor(new TrackingStore(validDocument())));
  });

  it('serializes overlapping units of work instead of rejecting the second', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);
    const unit = unitOfWorkFor(store);
    let release = () => {};
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];

    const first = unit.run(async () => {
      await blocker;
      await insertProject(store);
      order.push('first');
    });
    const second = unit.run(async () => {
      await insertProject(store, secondProject());
      order.push('second');
    });

    release();
    await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
    expect(store.persistCalls).toBe(2);
    expect(await repository.find(newProject().id)).not.toBeNull();
    expect(await repository.find(secondProject().id)).not.toBeNull();
  });

  it('joins a nested run to the caller unit instead of deadlocking', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);
    const unit = unitOfWorkFor(store);

    await unit.run(async () => {
      await insertProject(store);
      // The await matters: a queued nested call would wait on the unit awaiting it.
      await new Promise((resolve) => setTimeout(resolve, 1));
      await unit.run(() => insertProject(store, secondProject()));
    });

    expect(store.persistCalls).toBe(1);
    expect(await repository.find(newProject().id)).not.toBeNull();
    expect(await repository.find(secondProject().id)).not.toBeNull();
  });

  it('rejects a synchronous throw rather than letting it escape run', async () => {
    const unit = unitOfWorkFor(new TrackingStore(validDocument()));

    const result = unit.run(() => {
      throw new Error('sync boom');
    });

    await expect(result).rejects.toThrow('sync boom');
  });

  it('does not let a failed unit poison the queue', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);
    const unit = unitOfWorkFor(store);

    await expect(unit.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await unit.run(() => insertProject(store));

    expect(await repository.find(newProject().id)).not.toBeNull();
  });
});

describe('parent-chain integrity', () => {
  /** Ids are branded, and these fixtures deliberately build documents the schema allows. */
  const asProjectId = (id: string) => id as unknown as PrototypeDocument['projects'][number]['id'];
  const asTaskId = (id: string) => id as unknown as PrototypeDocument['tasks'][number]['id'];

  it('rejects a project that is its own ancestor', () => {
    const document = validDocument();
    const first = document.projects[0]!;
    // Two sub-projects parenting each other, beneath the surviving root. A cycle *between
    // roots* is not expressible any more — a root has no parent — so this is now the only
    // shape the rule has to catch, and the root stays to keep the seeded canvas valid.
    const looped = (id: string, parentProjectId: string) => ({
      ...first,
      id: asProjectId(id),
      kind: 'subproject' as const,
      parentProjectId: asProjectId(parentProjectId),
    });
    document.projects = [first, looped('project-2', 'project-3'), looped('project-3', 'project-2')];
    document.projectPages.push(
      ...['project-2', 'project-3'].map((projectId) =>
        PrototypeDocumentSchema.shape.projectPages.element.parse({
          id: `page-${projectId}`,
          projectId,
          kind: 'work',
          enabled: true,
          createdAt: at,
          updatedAt: at,
        }),
      ),
    );

    // Nothing downstream can detect a cycle, and every tree walk over one starves the
    // event loop — so it has to fail at load rather than at the first request.
    expect(() => new InMemoryDataStore(document)).toThrow(DocumentIntegrityError);
  });

  it('rejects a task that is its own ancestor', () => {
    const document = validDocument();
    const first = document.tasks[0]!;
    document.tasks = [
      { ...first, id: asTaskId('task-a'), parentTaskId: asTaskId('task-b') },
      { ...first, id: asTaskId('task-b'), parentTaskId: asTaskId('task-a') },
    ];

    expect(() => new InMemoryDataStore(document)).toThrow(DocumentIntegrityError);
  });

  it('still accepts a deep acyclic chain with a shared ancestor', () => {
    const document = validDocument();
    const first = document.projects[0]!;
    // The chain is sub-projects under the root, which is the only shape §26 allows: a root
    // has no parent, so a three-deep chain of roots is not a document to accept any more.
    const nested = (id: string, parentProjectId: string) => ({
      ...first,
      id: asProjectId(id),
      kind: 'subproject' as const,
      parentProjectId: asProjectId(parentProjectId),
    });
    document.projects = [first, nested('project-2', first.id), nested('project-3', 'project-2'), nested('project-4', 'project-2')];
    document.projectPages.push(
      ...['project-2', 'project-3', 'project-4'].map((projectId) =>
        PrototypeDocumentSchema.shape.projectPages.element.parse({
          id: `page-${projectId}`,
          projectId,
          kind: 'work',
          enabled: true,
          createdAt: at,
          updatedAt: at,
        }),
      ),
    );

    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });
});

describe('task archive group integrity', () => {
  const archivedAt = '2026-09-03T09:41:07.118Z';

  /** Every case here needs a subtask, and only its archive fields differ between them. */
  const withChild = (fields: Record<string, unknown> = {}) => {
    const document = validDocument();
    document.tasks.push(
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...document.tasks[0],
        id: 'task-child',
        parentTaskId: 'task-1',
        ...fields,
      }),
    );
    return document;
  };

  it('rejects a live task under an archived parent, and accepts an archived one', () => {
    // `archive` cascades to descendants, so a live row under an archived parent is a row
    // nothing can reach — the same defect as a live row in an archived section, one level
    // down. The section itself stays live here so that rule cannot fire in its place.
    const live = withChild();
    live.tasks[0]!.archivedAt = archivedAt;
    expect(() => new InMemoryDataStore(live)).toThrow(/live under an archived parent/);

    const cascaded = withChild({ archivedAt });
    cascaded.tasks[0]!.archivedAt = archivedAt;
    expect(() => new InMemoryDataStore(cascaded)).not.toThrow();
  });

  it('rejects a live task carrying a task archive marker', () => {
    // The marker describes an archive that happened, so a live row cannot be carrying one.
    // The parent stays live, or the ancestor rule above would fail the document first.
    const document = withChild({ archivedWithTaskId: 'task-1' });
    expect(() => new InMemoryDataStore(document)).toThrow(/live task "task-child" is marked as archived with a task/);
  });

  it('rejects a task marked with itself', () => {
    // A self-marked row would be its own archive root, which restore would read as a group
    // of one that nothing can ever bring back with its parent.
    const document = withChild({ archivedAt, archivedWithTaskId: 'task-child' });
    expect(() => new InMemoryDataStore(document)).toThrow(/task "task-child" is marked with itself/);
  });

  it('rejects a missing archive root', () => {
    // Restore starts from the root, so a marker naming a row that is not in the document
    // leaves the group with no way back onto the canvas.
    const document = withChild({ archivedAt, archivedWithTaskId: 'task-gone' });
    expect(() => new InMemoryDataStore(document)).toThrow(/missing archive root "task-gone"/);
  });

  it('rejects a live archive root', () => {
    // The pairing only makes sense while the root is down: a live root has already been
    // restored, and anything still marked with it was left behind.
    const document = withChild({ archivedAt, archivedWithTaskId: 'task-1' });
    expect(() => new InMemoryDataStore(document)).toThrow(/marked with a live archive root/);
  });

  it('rejects an archive root outside the row’s project section', () => {
    // Restoring a root walks its group, so a root in another project — or in another list
    // of the same project — would pull rows onto a canvas they do not belong to.
    //
    // Both fixtures are *also* non-ancestor cases, and could not be otherwise: parent/child
    // co-location means an ancestor always shares its descendant's project and section. So
    // this pins the clause's message and its ordering ahead of the ancestry walk, not a
    // document only it can reject — see the note beside the clause itself.
    const crossProject = withSecondWorkspace();
    crossProject.tasks[1]!.archivedAt = archivedAt;
    crossProject.tasks.push(
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...crossProject.tasks[0],
        id: 'task-child',
        archivedAt,
        archivedWithTaskId: secondWorkspace.task.id,
      }),
    );
    expect(() => new InMemoryDataStore(crossProject)).toThrow(/archive root outside its project section/);

    const otherSection = validDocument();
    otherSection.sections.push(
      PrototypeDocumentSchema.shape.sections.element.parse({
        ...otherSection.sections[0],
        id: 'section-other-list',
        type: 'task-list',
        position: 2,
      }),
    );
    otherSection.tasks.push(
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...otherSection.tasks[0],
        id: 'task-root',
        sectionId: 'section-other-list',
        archivedAt,
      }),
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...otherSection.tasks[0],
        id: 'task-child',
        archivedAt,
        archivedWithTaskId: 'task-root',
      }),
    );
    expect(() => new InMemoryDataStore(otherSection)).toThrow(/archive root outside its project section/);
  });

  it('rejects an archive root that is not an ancestor', () => {
    // A marker means "came down with that", which only a descendant can have done —
    // otherwise restoring the root would revive a row that was archived on its own.
    const document = validDocument();
    document.tasks[0]!.archivedAt = archivedAt;
    document.tasks.push(
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...document.tasks[0],
        id: 'task-sibling',
        archivedAt,
        archivedWithTaskId: 'task-1',
      }),
    );
    expect(() => new InMemoryDataStore(document)).toThrow(/marked with a non-ancestor/);
  });

  it('rejects a task carrying both archive markers', () => {
    // The two markers name different archives, so a row carrying both would be restored by
    // whichever of the section and the parent came back first, and left inconsistent by the
    // other. Both halves are otherwise well formed here, so nothing else fails first.
    const document = withChild({
      archivedAt,
      archivedWithSectionId: 'section-1',
      archivedWithTaskId: 'task-1',
    });
    document.sections[0]!.archivedAt = archivedAt;
    document.tasks[0]!.archivedAt = archivedAt;
    document.tasks[0]!.archivedWithSectionId = 'section-1' as never;
    expect(() => new InMemoryDataStore(document)).toThrow(/carries two archive markers/);
  });

  it('accepts a valid archive group', () => {
    // The state a task archive leaves behind: the root carries no marker because it came
    // down on its own, and every descendant names it from the same project and section.
    const document = withChild({ archivedAt, archivedWithTaskId: 'task-1' });
    document.tasks[0]!.archivedAt = archivedAt;
    document.tasks.push(
      PrototypeDocumentSchema.shape.tasks.element.parse({
        ...document.tasks[0],
        id: 'task-grandchild',
        parentTaskId: 'task-child',
        archivedAt,
        archivedWithTaskId: 'task-1',
      }),
    );
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });
});

/**
 * §26–27's page rules, held where a hand-edited `data.json` (§14) has to pass through them
 * too. These are structural: a project with nowhere to put a section, or two Homes to choose
 * between, is not a state any operation should be able to reach.
 */
describe('page ownership integrity', () => {
  const subprojectDocument = () => {
    const document = validDocument();
    document.projects.push(
      PrototypeDocumentSchema.shape.projects.element.parse({
        id: 'project-child',
        workspaceId: 'workspace-1',
        kind: 'subproject',
        parentProjectId: 'project-1',
        name: 'Work unit',
        status: 'active',
        projectLayoutMode: 'flow',
        createdAt: at,
        updatedAt: at,
      }),
    );
    document.projectPages.push(
      PrototypeDocumentSchema.shape.projectPages.element.parse({
        id: 'page-child',
        projectId: 'project-child',
        kind: 'work',
        enabled: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    return document;
  };

  const page = (overrides: Record<string, unknown>) =>
    PrototypeDocumentSchema.shape.projectPages.element.parse({
      id: 'page-extra',
      projectId: 'project-1',
      kind: 'todos',
      enabled: true,
      createdAt: at,
      updatedAt: at,
      ...overrides,
    });

  it('accepts a root with Home and a sub-project with a work canvas', () => {
    expect(() => new InMemoryDataStore(subprojectDocument())).not.toThrow();
  });

  it('rejects a page whose project does not exist', () => {
    const document = validDocument();
    document.projectPages.push(page({ projectId: 'project-gone' }));
    expect(() => new InMemoryDataStore(document)).toThrow(/missing project "project-gone"/);
  });

  it('rejects a root with two Home pages', () => {
    const document = validDocument();
    document.projectPages.push(page({ id: 'page-1b', kind: 'home' }));
    expect(() => new InMemoryDataStore(document)).toThrow(/more than one home page/);
  });

  it('rejects a root with no Home page', () => {
    const document = validDocument();
    document.projectPages = [];
    document.sections = [];
    document.tasks = [];
    document.reflections = [];
    document.activityEvents = [];
    expect(() => new InMemoryDataStore(document)).toThrow(/has no home page/);
  });

  it('rejects a sub-project with no work canvas', () => {
    const document = subprojectDocument();
    document.projectPages = document.projectPages.filter((candidate) => candidate.id !== 'page-child');
    expect(() => new InMemoryDataStore(document)).toThrow(/has no work page/);
  });

  /**
   * A sub-project is a unit of work, not a workspace: it cannot gain tabs. Enforced here and
   * not only in the service, because this is the layer a hand-edited file goes through.
   */
  it('rejects a navigable page on a sub-project', () => {
    const document = subprojectDocument();
    document.projectPages.push(page({ id: 'page-child-todos', projectId: 'project-child' }));
    expect(() => new InMemoryDataStore(document)).toThrow(/cannot own a todos page/);
  });

  it('rejects a work canvas on a root', () => {
    const document = validDocument();
    document.projectPages.push(page({ id: 'page-1-work', kind: 'work' }));
    expect(() => new InMemoryDataStore(document)).toThrow(/cannot own a work page/);
  });

  it('rejects a second page of one optional kind', () => {
    const document = validDocument();
    document.projectPages.push(page({ id: 'page-todos-a' }), page({ id: 'page-todos-b' }));
    expect(() => new InMemoryDataStore(document)).toThrow(/more than one todos page/);
  });

  /** Home is where an unnamed write lands; a disabled one leaves that write nowhere to go. */
  it('rejects a disabled canonical page', () => {
    const document = validDocument();
    document.projectPages[0]!.enabled = false;
    expect(() => new InMemoryDataStore(document)).toThrow(/cannot be disabled/);
  });

  it('rejects a section on a page of another project', () => {
    const document = subprojectDocument();
    document.sections[0]!.pageId = 'page-child' as typeof document.sections[0]['pageId'];
    expect(() => new InMemoryDataStore(document)).toThrow(/page from another project/);
  });

  it('rejects a section on a page that does not exist', () => {
    const document = validDocument();
    document.sections[0]!.pageId = 'page-gone' as typeof document.sections[0]['pageId'];
    expect(() => new InMemoryDataStore(document)).toThrow(/missing page "page-gone"/);
  });

  /** §30: Todos and Archive project rows they do not own, so a section there renders nowhere. */
  it('rejects a section on a derived page', () => {
    const document = validDocument();
    document.projectPages.push(page({ id: 'page-todos' }));
    document.sections[0]!.pageId = 'page-todos' as typeof document.sections[0]['pageId'];
    expect(() => new InMemoryDataStore(document)).toThrow(/does not hold sections/);
  });

  /**
   * §30 gives Reflections a narrower capability than a full canvas: its own reflections
   * container, and a journal feed that is not a section. A `task-list` there would be a
   * container the page never renders — the same defect a section on Todos is, one level finer.
   */
  it('rejects a task container on a Reflections page', () => {
    const document = validDocument();
    document.projectPages.push(page({ id: 'page-reflections', kind: 'reflections' }));
    document.sections[0]!.pageId = 'page-reflections' as typeof document.sections[0]['pageId'];
    expect(document.sections[0]!.type).toBe('task-list');
    expect(() => new InMemoryDataStore(document)).toThrow(/does not hold task-list sections/);
  });

  it('accepts a reflections container on a Reflections page', () => {
    const document = validDocument();
    document.projectPages.push(page({ id: 'page-reflections', kind: 'reflections' }));
    document.sections.push(
      PrototypeDocumentSchema.shape.sections.element.parse({
        ...document.sections[0],
        id: 'section-journal',
        type: 'reflections',
        pageId: 'page-reflections',
        position: 1,
      }),
    );
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });

  it('accepts a same-tree shortcut and rejects foreign, non-Home, and dangling sources', () => {
    const valid = subprojectDocument();
    valid.sections.push(
      PrototypeDocumentSchema.shape.sections.element.parse({
        ...valid.sections[0],
        id: 'section-child',
        projectId: 'project-child',
        pageId: 'page-child',
        position: 0,
      }),
    );
    valid.sectionShortcuts.push(
      PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
        id: 'shortcut-child',
        pageId: 'page-1',
        sourceSectionId: 'section-child',
        position: 2,
        columnSpan: 12,
        collapsed: false,
        createdAt: at,
        updatedAt: at,
      }),
    );
    expect(() => new InMemoryDataStore(valid)).not.toThrow();

    const dangling = structuredClone(valid);
    dangling.sectionShortcuts[0]!.sourceSectionId = 'section-gone' as never;
    expect(() => new InMemoryDataStore(dangling)).toThrow(/missing source section/);

    const foreign = withSecondWorkspace();
    foreign.sectionShortcuts.push(
      PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
        id: 'shortcut-foreign',
        pageId: 'page-1',
        sourceSectionId: 'section-3',
        position: 2,
        columnSpan: 12,
        collapsed: false,
        createdAt: at,
        updatedAt: at,
      }),
    );
    expect(() => new InMemoryDataStore(foreign)).toThrow(/crosses workspaces/);

    const nonHome = structuredClone(valid);
    nonHome.projectPages.push(
      PrototypeDocumentSchema.shape.projectPages.element.parse({
        id: 'page-reflections',
        projectId: 'project-1',
        kind: 'reflections',
        enabled: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    nonHome.sectionShortcuts[0]!.pageId = 'page-reflections' as never;
    expect(() => new InMemoryDataStore(nonHome)).toThrow(/must be placed on a Home page/);
  });
});

describe('reflection subject integrity (§36)', () => {
  const withSubproject = () => {
    const document = validDocument();
    document.projects.push(
      PrototypeDocumentSchema.shape.projects.element.parse({
        id: 'project-child',
        workspaceId: 'workspace-1',
        kind: 'subproject',
        parentProjectId: 'project-1',
        name: 'Child',
        status: 'active',
        projectLayoutMode: 'flow',
        createdAt: at,
        updatedAt: at,
      }),
    );
    document.projectPages.push(
      PrototypeDocumentSchema.shape.projectPages.element.parse({
        id: 'page-child',
        projectId: 'project-child',
        kind: 'work',
        enabled: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    return document;
  };

  it('accepts existing task and sub-project subjects without enforcing their current state', () => {
    const taskSubject = validDocument();
    taskSubject.reflections[0]!.subject = { kind: 'task', id: 'task-1' as never };
    expect(() => new InMemoryDataStore(taskSubject)).not.toThrow();

    const projectSubject = withSubproject();
    projectSubject.reflections[0]!.subject = { kind: 'subproject', id: 'project-child' as never };
    expect(() => new InMemoryDataStore(projectSubject)).not.toThrow();
  });

  it('rejects a missing subject and a root named as a sub-project subject', () => {
    const missing = validDocument();
    missing.reflections[0]!.subject = { kind: 'task', id: 'task-gone' as never };
    expect(() => new InMemoryDataStore(missing)).toThrow(/missing subject task/);

    const root = validDocument();
    root.reflections[0]!.subject = { kind: 'subproject', id: 'project-1' as never };
    expect(() => new InMemoryDataStore(root)).toThrow(/cannot be about root project/);
  });
});

describe('operation history integrity', () => {
  const history = (overrides: Record<string, unknown> = {}) =>
    OperationHistorySchema.parse({
      id: 'history-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      actor: 'user',
      actorUserId: 'user-1',
      cursor: 1,
      orderHighWaterMark: 1,
      revision: 1,
      ...overrides,
    });

  const action = (overrides: Record<string, unknown> = {}) =>
    OperationActionSchema.parse({
      id: 'operation-1',
      historyId: 'history-1',
      order: 1,
      state: 'applied',
      label: 'Removed the Backlog section',
      createdAt: at,
      expiresAt: '2026-08-27T10:00:00.000Z',
      operation: {
        version: 1,
        type: 'section.add',
        // Every id below names something the document does not hold.
        section: {
          id: 'section-gone',
          projectId: 'project-1',
          pageId: 'page-gone',
          type: 'task-list',
          position: 0,
          columnSpan: 12,
          collapsed: false,
          config: {},
          archiveGeneration: 0,
          createdAt: at,
          updatedAt: at,
        },
        placement: { pageId: 'page-gone', previous: { kind: 'shortcut', id: 'shortcut-gone' }, index: 1 },
      },
      ...overrides,
    });

  const withHistory = (histories: ReturnType<typeof history>[], actions: ReturnType<typeof action>[] = []) => {
    const document = withSecondWorkspace();
    document.operationHistories.push(...histories);
    document.operationActions.push(...actions);
    return document;
  };

  it('accepts an action whose snapshot names a missing section, page and shortcut', () => {
    // An add Undo deletes the section its action names, and the action must survive to be redone.
    expect(() => new InMemoryDataStore(withHistory([history()], [action()]))).not.toThrow();
  });

  it('a cursor no higher than the order high-water mark, with 0 valid', () => {
    expect(() => new InMemoryDataStore(withHistory([history({ cursor: 0, orderHighWaterMark: 0, revision: 0 })]))).not.toThrow();
    // Pruning removed every action; the cursor and high-water mark stay.
    expect(() => new InMemoryDataStore(withHistory([history({ cursor: 7, orderHighWaterMark: 9, revision: 12 })]))).not.toThrow();
    const document = withHistory([]);
    document.operationHistories.push({ ...history(), cursor: 2 });
    expect(() => new InMemoryDataStore(document)).toThrow();
  });

  it('one history per actor, project and workspace', () => {
    const agent = history({ id: 'history-2', actor: 'agent', actorUserId: undefined, actorAgentConnectionId: 'agent-1' });
    const system = history({ id: 'history-3', actor: 'system', actorUserId: undefined });
    const otherWorkspace = history({ id: 'history-4', workspaceId: 'workspace-2', projectId: 'project-2', actorUserId: 'user-2' });
    expect(() => new InMemoryDataStore(withHistory([history(), agent, system, otherWorkspace]))).not.toThrow();
    expect(() => new InMemoryDataStore(withHistory([history(), history({ id: 'history-5' })]))).toThrow(/duplicate history for its actor and project/);
    expect(() => new InMemoryDataStore(withHistory([system, history({ id: 'history-6', actor: 'system', actorUserId: undefined })]))).toThrow(/duplicate history/);
  });

  it('does not collide distinct scopes whose ids contain delimiters', () => {
    const document = withHistory([]);
    const project = document.projects[0]!;
    const page = document.projectPages[0]!;
    document.projects.push({ ...project, id: 'project 1' as never }, { ...project, id: 'project' as never });
    document.projectPages.push({ ...page, id: 'page-a' as never, projectId: 'project 1' as never }, { ...page, id: 'page-b' as never, projectId: 'project' as never });
    document.operationHistories.push(history({ id: 'history-a', projectId: 'project 1' }), history({ id: 'history-b', projectId: 'project' }));
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });

  it('a history must name a stored project', () => {
    expect(() => new InMemoryDataStore(withHistory([history({ projectId: 'project-gone' })]))).toThrow(/missing project/);
  });

  it.each([
    ['a duplicate id', [history(), history({ projectId: 'project-2', workspaceId: 'workspace-2', actorUserId: 'user-2' })], /operationHistories contains duplicate id/],
    ['a missing workspace', [history({ workspaceId: 'workspace-gone' })], /missing workspace/],
    ['a project from another workspace', [history({ projectId: 'project-2' })], /project from another workspace/],
    ['a missing user actor', [history({ actorUserId: 'user-gone' })], /missing user actor/],
    ['a user actor from another workspace', [history({ actorUserId: 'user-2' })], /user actor from another workspace/],
    ['a missing agent actor', [history({ actor: 'agent', actorUserId: undefined, actorAgentConnectionId: 'agent-gone' })], /missing agent actor/],
    ['an agent actor from another workspace', [history({ actor: 'agent', actorUserId: undefined, actorAgentConnectionId: 'agent-2' })], /agent actor from another workspace/],
  ])('rejects a history with %s', (_, histories, message) => {
    expect(() => new InMemoryDataStore(withHistory(histories))).toThrow(message);
  });

  it('an action names a stored history and a unique order within its high-water mark', () => {
    const twoDeep = history({ cursor: 2, orderHighWaterMark: 2 });
    expect(() => new InMemoryDataStore(withHistory([twoDeep], [action(), action({ id: 'operation-2', order: 2 })]))).not.toThrow();
    expect(() => new InMemoryDataStore(withHistory([history()], [action({ historyId: 'history-gone' })]))).toThrow(/missing history/);
    expect(() => new InMemoryDataStore(withHistory([twoDeep], [action(), action({ id: 'operation-2' })]))).toThrow(/duplicate order 1/);
    expect(() => new InMemoryDataStore(withHistory([history()], [action({ order: 2 })]))).toThrow(/above its history's high-water mark/);
    expect(() => new InMemoryDataStore(withHistory([twoDeep], [action(), action()]))).toThrow(/operationActions contains duplicate id/);
  });

  it('an action’s operation belongs to its history’s project', () => {
    const foreign = action({
      operation: { ...action().operation, section: { ...(action().operation as { section: object }).section, projectId: 'project-2' } },
    });
    expect(() => new InMemoryDataStore(withHistory([history()], [foreign]))).toThrow(/names a project outside its history/);
  });

  it('rejects a retained removal action whose captured archive generation is ahead of its section', () => {
    const document = withHistory([history()]);
    const section = document.sections[0]!;
    const removal = (archiveGeneration: number, disposition: 'retained' | 'deleted' = 'retained') =>
      action({
        operation: {
          version: 1,
          type: 'section.remove',
          section: { ...section, archiveGeneration: archiveGeneration - 1 },
          placement: { pageId: section.pageId, index: section.position },
          appliedPolicy: 'none',
          rows: [],
          disposition,
          postSectionArchivedAt: at,
          archiveGeneration,
        },
      });
    document.sections[0] = { ...section, archiveGeneration: 1 };
    document.operationActions.push(removal(1));
    expect(() => new InMemoryDataStore(structuredClone(document))).not.toThrow();

    document.operationActions[0] = removal(2);
    expect(() => new InMemoryDataStore(structuredClone(document))).toThrow(/captures archive generation 2, beyond section "section-1"/);

    // A deleted section has no row to compare against; the existence checks guard it instead.
    document.operationActions[0] = removal(2, 'deleted');
    expect(() => new InMemoryDataStore(structuredClone(document))).not.toThrow();
  });
});
