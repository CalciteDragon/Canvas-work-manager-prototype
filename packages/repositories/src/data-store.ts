import { readFile, rename, writeFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrototypeDocumentSchema, type PrototypeDocument } from '@cwm/contracts';
import { DocumentIntegrityError, UnitOfWorkInProgressError } from './errors';
import type { UnitOfWork } from './interfaces';

export interface FileOperations {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface DataStore {
  snapshot(): PrototypeDocument;
  persist(): Promise<void>;
  runUnitOfWork<T>(fn: () => T | Promise<T>): Promise<T>;
}

const documents = new WeakMap<DataStore, PrototypeDocument>();
type OperationContext = { token: symbol; document: PrototypeDocument; role: 'callback' | 'persist' | 'closed' };
const operationContexts = new AsyncLocalStorage<Map<DataStore, OperationContext>>();
const activeOperationTokens = new WeakMap<DataStore, symbol>();

const inheritedContext = (store: DataStore): OperationContext | undefined => operationContexts.getStore()?.get(store);

/** Package-internal repository capability; intentionally omitted from the public barrel. */
export const getActiveDocument = (store: DataStore): PrototypeDocument => {
  const context = inheritedContext(store);
  const activeToken = activeOperationTokens.get(store);
  const document =
    context !== undefined && context.token === activeToken && context.role !== 'closed'
      ? context.document
      : documents.get(store);
  if (document === undefined) throw new TypeError('repository received an unsupported data store');
  return document;
};

/** Package-internal write guard; repositories in the active async operation may proceed. */
export const assertCanMutateDataStore = (store: DataStore): void => {
  const context = inheritedContext(store);
  const activeToken = activeOperationTokens.get(store);
  if (context !== undefined) {
    if (activeToken === undefined || context.token !== activeToken || context.role !== 'callback') {
      throw new UnitOfWorkInProgressError();
    }
    return;
  }
  if (activeToken !== undefined) {
    throw new UnitOfWorkInProgressError();
  }
};

const assertCanPersistDataStore = (store: DataStore): void => {
  const context = inheritedContext(store);
  const activeToken = activeOperationTokens.get(store);
  if (context !== undefined) {
    if (activeToken === undefined || context.token !== activeToken || context.role !== 'persist') {
      throw new UnitOfWorkInProgressError();
    }
    return;
  }
  if (activeToken !== undefined) throw new UnitOfWorkInProgressError();
};

const fail = (message: string): never => {
  throw new DocumentIntegrityError(message);
};

const uniqueMap = <T extends { id: string }>(collection: string, values: T[]): Map<string, T> => {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.id)) fail(`${collection} contains duplicate id "${value.id}"`);
    result.set(value.id, value);
  }
  return result;
};

export const validateDocumentIntegrity = (input: unknown): PrototypeDocument => {
  let document: PrototypeDocument;
  try {
    document = PrototypeDocumentSchema.parse(input);
  } catch (cause) {
    throw new DocumentIntegrityError('document does not match PrototypeDocumentSchema', cause);
  }
  const users = uniqueMap('users', document.users);
  const workspaces = uniqueMap('workspaces', document.workspaces);
  const projects = uniqueMap('projects', document.projects);
  const sections = uniqueMap('sections', document.sections);
  const tasks = uniqueMap('tasks', document.tasks);
  const milestones = uniqueMap('milestones', document.milestones);
  const reflections = uniqueMap('reflections', document.reflections);
  uniqueMap('activityEvents', document.activityEvents);
  const agents = uniqueMap('agentConnections', document.agentConnections);

  for (const workspace of document.workspaces) {
    const owner = users.get(workspace.ownerUserId) ??
      fail(`workspace "${workspace.id}" has missing owner "${workspace.ownerUserId}"`);
    if (owner.workspaceId !== workspace.id) fail(`workspace "${workspace.id}" has an owner from another workspace`);
  }

  for (const user of document.users) {
    if (!workspaces.has(user.workspaceId)) fail(`user "${user.id}" has missing workspace "${user.workspaceId}"`);
  }

  for (const project of document.projects) {
    if (!workspaces.has(project.workspaceId)) fail(`project "${project.id}" has missing workspace "${project.workspaceId}"`);
    if (project.parentProjectId !== undefined) {
      const parent = projects.get(project.parentProjectId) ??
        fail(`project "${project.id}" has missing parent "${project.parentProjectId}"`);
      if (parent.workspaceId !== project.workspaceId) fail(`project "${project.id}" has a parent from another workspace`);
    }
  }

  const projectFor = (collection: string, id: string, projectId: string) => {
    const project = projects.get(projectId);
    if (project === undefined) fail(`${collection} "${id}" has missing project "${projectId}"`);
    return project;
  };

  for (const section of document.sections) projectFor('section', section.id, section.projectId);
  for (const milestone of document.milestones) projectFor('milestone', milestone.id, milestone.projectId);
  for (const reflection of document.reflections) projectFor('reflection', reflection.id, reflection.projectId);
  for (const task of document.tasks) {
    projectFor('task', task.id, task.projectId);
    if (task.parentTaskId !== undefined) {
      const parent = tasks.get(task.parentTaskId) ??
        fail(`task "${task.id}" has missing parent "${task.parentTaskId}"`);
      if (parent.projectId !== task.projectId) fail(`task "${task.id}" has a parent from another project`);
    }
  }

  for (const agent of document.agentConnections) {
    if (!users.has(agent.userId)) fail(`agent connection "${agent.id}" has missing user "${agent.userId}"`);
  }

  type TargetScope = { workspaceId: string; projectId?: string };
  const targetScope = (entityType: (typeof document.activityEvents)[number]['entityType'], entityId: string): TargetScope => {
    if (entityType === 'project') {
      const project = projects.get(entityId) ?? fail(`activity target project "${entityId}" does not exist`);
      return { workspaceId: project.workspaceId, projectId: project.id };
    }
    if (entityType === 'agent_connection') {
      const agent = agents.get(entityId) ?? fail(`activity target agent connection "${entityId}" does not exist`);
      const user = users.get(agent.userId) ?? fail(`agent connection "${agent.id}" has missing user "${agent.userId}"`);
      return { workspaceId: user.workspaceId };
    }

    const projectId =
      entityType === 'section'
        ? sections.get(entityId)?.projectId
        : entityType === 'task'
          ? tasks.get(entityId)?.projectId
          : entityType === 'milestone'
            ? milestones.get(entityId)?.projectId
            : reflections.get(entityId)?.projectId;
    const targetProjectId = projectId ?? fail(`activity target ${entityType} "${entityId}" does not exist`);
    const project = projects.get(targetProjectId) ??
      fail(`activity target ${entityType} "${entityId}" has a missing project`);
    return { workspaceId: project.workspaceId, projectId: targetProjectId };
  };

  for (const activity of document.activityEvents) {
    if (!workspaces.has(activity.workspaceId)) fail(`activity "${activity.id}" has missing workspace "${activity.workspaceId}"`);
    const target = targetScope(activity.entityType, activity.entityId);
    if (target.workspaceId !== activity.workspaceId) fail(`activity "${activity.id}" targets another workspace`);

    if (activity.projectId !== undefined) {
      const project = projects.get(activity.projectId) ??
        fail(`activity "${activity.id}" has missing project "${activity.projectId}"`);
      if (project.workspaceId !== activity.workspaceId) fail(`activity "${activity.id}" names a project from another workspace`);
      if (target.projectId !== undefined && target.projectId !== activity.projectId) {
        fail(`activity "${activity.id}" names a project different from its target`);
      }
    }

    if (activity.actor === 'user') {
      const actorId = activity.actorUserId ?? fail(`activity "${activity.id}" has a missing user actor`);
      const actor = users.get(actorId) ?? fail(`activity "${activity.id}" has a missing user actor`);
      if (actor.workspaceId !== activity.workspaceId) fail(`activity "${activity.id}" has a user actor from another workspace`);
    } else if (activity.actor === 'agent') {
      const connectionId = activity.actorAgentConnectionId ?? fail(`activity "${activity.id}" has a missing agent actor`);
      const connection = agents.get(connectionId) ?? fail(`activity "${activity.id}" has a missing agent actor`);
      const actor = users.get(connection.userId) ?? fail(`agent connection "${connection.id}" has a missing user`);
      if (actor.workspaceId !== activity.workspaceId) fail(`activity "${activity.id}" has an agent actor from another workspace`);
    }
  }

  return document;
};

abstract class BaseDataStore implements DataStore {
  protected constructor(document: unknown) {
    documents.set(this, structuredClone(validateDocumentIntegrity(document)));
  }

  snapshot(): PrototypeDocument {
    return structuredClone(getActiveDocument(this));
  }

  async persist(): Promise<void> {
    assertCanPersistDataStore(this);
    validateDocumentIntegrity(getActiveDocument(this));
  }

  async runUnitOfWork<T>(fn: () => T | Promise<T>): Promise<T> {
    if (activeOperationTokens.has(this) || inheritedContext(this) !== undefined) {
      throw new UnitOfWorkInProgressError();
    }
    const token = Symbol('unit-of-work');
    activeOperationTokens.set(this, token);
    const context: OperationContext = { token, document: structuredClone(documents.get(this)!), role: 'callback' };
    const parentContexts = operationContexts.getStore();
    const contexts = new Map(parentContexts === undefined ? [] : parentContexts);
    contexts.set(this, context);
    try {
      return await operationContexts.run(contexts, async () => {
        const result = await fn();
        context.role = 'closed';
        const validated = validateDocumentIntegrity(context.document);
        const persistContext: OperationContext = { token, document: validated, role: 'persist' };
        const persistContexts = new Map(contexts);
        persistContexts.set(this, persistContext);
        await operationContexts.run(persistContexts, () => this.persist());
        documents.set(this, validated);
        return result;
      });
    } finally {
      if (activeOperationTokens.get(this) === token) activeOperationTokens.delete(this);
    }
  }
}

const unitOfWorkAdapters = new WeakMap<DataStore, UnitOfWork>();
const openUnitStores = new AsyncLocalStorage<Set<DataStore>>();

/**
 * The §15 operation boundary as a `UnitOfWork` a domain service can hold.
 *
 * Not a pass-through. `runUnitOfWork` rejects both overlap and re-entry, and this
 * adapter is what a Node HTTP server ends up calling concurrently, so it:
 *
 * - **serializes** independent callers on a promise chain — a global write lock, which
 *   is what keeps two interleaved requests from turning into `UnitOfWorkInProgressError`.
 *   Reads never queue: with no unit open, `getActiveDocument` returns the committed
 *   document.
 * - **joins** a nested call to the unit already open on this async stack. Queueing it
 *   would park the inner call behind the outer unit that is awaiting it — a permanent
 *   hang rather than an error.
 * - is **memoized per store**, because two adapters over one store are two chains that
 *   overlap, which is the bug serialization exists to prevent.
 */
export const unitOfWorkFor = (store: DataStore): UnitOfWork => {
  const existing = unitOfWorkAdapters.get(store);
  if (existing !== undefined) return existing;

  let tail: Promise<unknown> = Promise.resolve();
  const adapter: UnitOfWork = {
    // `async` so a synchronous throw from `fn` rejects rather than escaping `run`.
    async run<T>(fn: () => T | Promise<T>): Promise<T> {
      if (openUnitStores.getStore()?.has(store) === true) return fn();

      const next = tail.then(() => {
        const open = new Set(openUnitStores.getStore() ?? []);
        open.add(store);
        // An empty operation context: a queued unit must not inherit a stale one from
        // whichever caller happened to be at the head of the chain.
        return openUnitStores.run(open, () => operationContexts.run(new Map(), () => store.runUnitOfWork(fn)));
      });
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };

  unitOfWorkAdapters.set(store, adapter);
  return adapter;
};

export class InMemoryDataStore extends BaseDataStore {
  constructor(document: unknown) {
    super(document);
  }
}

const nodeFileOperations: FileOperations = { readFile, writeFile, rename };

export class JsonDataStore extends BaseDataStore {
  private constructor(
    document: unknown,
    private readonly path: string,
    private readonly fileOperations: FileOperations,
  ) {
    super(document);
  }

  static async load(path: string, fileOperations: FileOperations = nodeFileOperations): Promise<JsonDataStore> {
    const source = await fileOperations.readFile(path, 'utf8');
    let document: unknown;
    try {
      document = JSON.parse(source) as unknown;
    } catch (cause) {
      throw new DocumentIntegrityError(`data file "${path}" is not valid JSON`, cause);
    }
    return new JsonDataStore(document, path, fileOperations);
  }

  override async persist(): Promise<void> {
    assertCanPersistDataStore(this);
    const document = validateDocumentIntegrity(getActiveDocument(this));
    const temporaryPath = `${this.path}.tmp`;
    await this.fileOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await this.fileOperations.rename(temporaryPath, this.path);
  }
}
