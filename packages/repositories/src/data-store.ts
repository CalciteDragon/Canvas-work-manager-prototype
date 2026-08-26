import { readFile, rename, writeFile } from 'node:fs/promises';
import { PrototypeDocumentSchema, type PrototypeDocument } from '@cwm/contracts';
import { DocumentIntegrityError, UnitOfWorkInProgressError } from './errors';

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

/** Package-internal repository capability; intentionally omitted from the public barrel. */
export const getActiveDocument = (store: DataStore): PrototypeDocument => {
  const document = documents.get(store);
  if (document === undefined) throw new TypeError('repository received an unsupported data store');
  return document;
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
  const document = PrototypeDocumentSchema.parse(input);
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
  private unitOfWorkActive = false;

  protected constructor(document: unknown) {
    documents.set(this, structuredClone(validateDocumentIntegrity(document)));
  }

  snapshot(): PrototypeDocument {
    return structuredClone(getActiveDocument(this));
  }

  async persist(): Promise<void> {
    validateDocumentIntegrity(getActiveDocument(this));
  }

  async runUnitOfWork<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.unitOfWorkActive) throw new UnitOfWorkInProgressError();
    this.unitOfWorkActive = true;
    const previous = getActiveDocument(this);
    documents.set(this, structuredClone(previous));
    try {
      const result = await fn();
      documents.set(this, validateDocumentIntegrity(getActiveDocument(this)));
      await this.persist();
      return result;
    } catch (error) {
      documents.set(this, previous);
      throw error;
    } finally {
      this.unitOfWorkActive = false;
    }
  }
}

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
    return new JsonDataStore(JSON.parse(source) as unknown, path, fileOperations);
  }

  override async persist(): Promise<void> {
    const document = validateDocumentIntegrity(getActiveDocument(this));
    const temporaryPath = `${this.path}.tmp`;
    await this.fileOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await this.fileOperations.rename(temporaryPath, this.path);
  }
}
