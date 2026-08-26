import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrototypeDocumentSchema } from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FileOperations, InMemoryDataStore, JsonDataStore } from './data-store';
import { DocumentIntegrityError, UnitOfWorkInProgressError } from './errors';
import { JsonProjectRepository } from './json-repositories';

const at = '2026-08-26T10:00:00.000Z';

const validDocument = () =>
  PrototypeDocumentSchema.parse({
    schemaVersion: 1,
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
        name: 'Project',
        status: 'active',
        projectLayoutMode: 'flow',
        createdAt: at,
        updatedAt: at,
      },
    ],
    sections: [
      {
        id: 'section-1',
        projectId: 'project-1',
        type: 'task-list',
        position: 0,
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
    name: 'Other project',
    status: 'active' as const,
    projectLayoutMode: 'flow' as const,
    createdAt: at,
    updatedAt: at,
  },
  task: {
    id: 'task-2',
    projectId: 'project-2',
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
    name: 'New project',
    status: 'planning',
    projectLayoutMode: 'grid',
    createdAt: at,
    updatedAt: at,
  });

describe('runUnitOfWork', () => {
  it('awaits async work, persists once, and returns the callback result', async () => {
    const store = new TrackingStore(validDocument());
    const repository = new JsonProjectRepository(store);

    const result = await store.runUnitOfWork(async () => {
      await Promise.resolve();
      await repository.insert(newProject());
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
        await repository.insert(newProject());
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

  it('rolls memory back when persistence fails', async () => {
    const store = new TrackingStore(validDocument());
    store.failPersistence = true;
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => repository.insert(newProject()))).rejects.toThrow('persist failed');
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
      await repository.insert(newProject());
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
});

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('JsonDataStore', () => {
  it('loads and atomically round-trips a real contract-valid file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-repositories-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, `${JSON.stringify(validDocument(), null, 2)}\n`, 'utf8');
    const store = await JsonDataStore.load(path);
    const repository = new JsonProjectRepository(store);

    await store.runUnitOfWork(() => repository.insert(newProject()));

    const written = JSON.parse(await readFile(path, 'utf8')) as unknown;
    expect(PrototypeDocumentSchema.parse(written).projects).toContainEqual(newProject());
  });

  it('keeps live disk and memory intact when writing the temporary snapshot fails', async () => {
    const original = `${JSON.stringify(validDocument())}\n`;
    const order: string[] = [];
    const operations: FileOperations = {
      readFile: vi.fn(async () => original),
      writeFile: vi.fn(async () => {
        order.push('write');
        throw new Error('partial write');
      }),
      rename: vi.fn(async () => {
        order.push('rename');
      }),
    };
    const store = await JsonDataStore.load('data.json', operations);
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => repository.insert(newProject()))).rejects.toThrow('partial write');
    expect(order).toEqual(['write']);
    expect(await repository.find(newProject().id)).toBeNull();
    expect(await operations.readFile('data.json', 'utf8')).toBe(original);
  });

  it('writes a complete temp snapshot first and keeps live disk and memory intact when rename fails', async () => {
    const original = `${JSON.stringify(validDocument())}\n`;
    const order: string[] = [];
    let temp = '';
    const operations: FileOperations = {
      readFile: vi.fn(async () => original),
      writeFile: vi.fn(async (_path, data) => {
        order.push('write');
        temp = data;
      }),
      rename: vi.fn(async () => {
        order.push('rename');
        throw new Error('rename failed');
      }),
    };
    const store = await JsonDataStore.load('data.json', operations);
    const repository = new JsonProjectRepository(store);

    await expect(store.runUnitOfWork(() => repository.insert(newProject()))).rejects.toThrow('rename failed');
    expect(order).toEqual(['write', 'rename']);
    expect(PrototypeDocumentSchema.parse(JSON.parse(temp)).projects).toContainEqual(newProject());
    expect(await repository.find(newProject().id)).toBeNull();
    expect(await operations.readFile('data.json', 'utf8')).toBe(original);
  });
});
