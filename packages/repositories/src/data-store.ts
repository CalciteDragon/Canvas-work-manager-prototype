import { readFile, rename, writeFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  canonicalPageKindFor,
  isCanonicalPageKind,
  ownedKindOf,
  pageAcceptsSectionType,
  pageAcceptsSections,
  PrototypeDocumentSchema,
  SCHEMA_VERSION,
  type OwnedDataKind,
  type PrototypeDocument,
} from '@cwm/contracts';
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
  /**
   * Swap the whole document, from inside an open unit of work. This is how the
   * development panel loads a seed without restarting the host (spec §46, §76).
   *
   * It must be called *through* `runUnitOfWork`, not around it. A version that merely
   * checked "no unit is open" would miss the units `unitOfWorkFor` has queued but not
   * started — those have no token yet — and swap the document under one of them.
   */
  replaceActiveDocument(document: unknown): void;
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

/**
 * A version mismatch is the one parse failure with a *remedy*, so it says so. Without this the
 * operator with a version-2 file gets "document does not match PrototypeDocumentSchema" and a
 * page of Zod paths, which names neither the problem nor `pnpm prototype:upgrade` (§14).
 */
const describeVersion = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined;
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || version === SCHEMA_VERSION) return undefined;
  return (
    `document is at schema version ${version}, but this build reads version ${SCHEMA_VERSION}. ` +
    (version < SCHEMA_VERSION
      ? 'Run "pnpm prototype:upgrade <path>" to convert it, or "pnpm prototype:reset" to discard it.'
      : 'It was written by a newer build.')
  );
};

export const validateDocumentIntegrity = (input: unknown): PrototypeDocument => {
  let document: PrototypeDocument;
  try {
    document = PrototypeDocumentSchema.parse(input);
  } catch (cause) {
    throw new DocumentIntegrityError(describeVersion(input) ?? 'document does not match PrototypeDocumentSchema', cause);
  }
  const users = uniqueMap('users', document.users);
  const workspaces = uniqueMap('workspaces', document.workspaces);
  const projects = uniqueMap('projects', document.projects);
  const sections = uniqueMap('sections', document.sections);
  const shortcuts = uniqueMap('sectionShortcuts', document.sectionShortcuts);
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

  const pages = uniqueMap('projectPages', document.projectPages);

  /**
   * **§26–27's page rules, made structural.** A project's canonical page is what an unnamed
   * write resolves to and what every section hangs from, so "exactly one, always enabled" is
   * an invariant rather than a convention the create path happens to maintain.
   *
   * Counted per project rather than asserted per page, because the interesting failures —
   * two Homes, no Home — are absences and duplicates that no single record can see.
   */
  const pageKindCounts = new Map<string, Map<string, number>>();
  for (const page of document.projectPages) {
    const owner = projects.get(page.projectId) ??
      fail(`page "${page.id}" has missing project "${page.projectId}"`);

    // A sub-project is a unit of work, not a workspace: its one page is its canvas, and a
    // root's tabs are meaningless on it. The reverse is equally wrong — a root has no canvas
    // of its own outside Home.
    if (page.kind !== canonicalPageKindFor(owner.kind) && isCanonicalPageKind(page.kind)) {
      fail(`${owner.kind} "${owner.id}" cannot own a ${page.kind} page`);
    }
    if (owner.kind === 'subproject' && !isCanonicalPageKind(page.kind)) {
      fail(`subproject "${owner.id}" cannot own a ${page.kind} page`);
    }
    if (isCanonicalPageKind(page.kind) && !page.enabled) {
      fail(`page "${page.id}" is a ${page.kind} page and cannot be disabled`);
    }

    const counts = pageKindCounts.get(page.projectId) ?? new Map<string, number>();
    const next = (counts.get(page.kind) ?? 0) + 1;
    if (next > 1) fail(`project "${page.projectId}" has more than one ${page.kind} page`);
    counts.set(page.kind, next);
    pageKindCounts.set(page.projectId, counts);
  }

  for (const project of document.projects) {
    const canonical = canonicalPageKindFor(project.kind);
    if ((pageKindCounts.get(project.id)?.get(canonical) ?? 0) !== 1) {
      fail(`project "${project.id}" has no ${canonical} page`);
    }
  }

  for (const section of document.sections) {
    projectFor('section', section.id, section.projectId);
    const page = pages.get(section.pageId) ?? fail(`section "${section.id}" has missing page "${section.pageId}"`);
    if (page.projectId !== section.projectId) fail(`section "${section.id}" has a page from another project`);
    // §30: Todos and Archive project rows they do not own, so a section on one renders nowhere.
    if (!pageAcceptsSections(page.kind)) fail(`section "${section.id}" is on a ${page.kind} page, which does not hold sections`);
    // And a page that holds *some* sections may still not hold *this* one: §30 narrows
    // Reflections to its own container. Two messages rather than one, because "this page holds
    // no sections at all" and "this page holds no task lists" are different repairs.
    if (!pageAcceptsSectionType(page.kind, section.type)) {
      fail(`section "${section.id}" is on a ${page.kind} page, which does not hold ${section.type} sections`);
    }
  }

  /** The root-tree boundary a shortcut is allowed to cross (§27). */
  const rootProjectId = (projectId: string): string => {
    let current = projects.get(projectId) ?? fail(`project "${projectId}" does not exist`);
    const seen = new Set<string>();
    while (current.parentProjectId !== undefined) {
      if (seen.has(current.id)) fail(`project "${current.id}" is its own ancestor`);
      seen.add(current.id);
      current = projects.get(current.parentProjectId) ??
        fail(`project "${current.id}" has missing parent "${current.parentProjectId}"`);
    }
    return current.id;
  };

  for (const shortcut of shortcuts.values()) {
    const page = pages.get(shortcut.pageId) ??
      fail(`section shortcut "${shortcut.id}" has missing page "${shortcut.pageId}"`);
    const destination = projects.get(page.projectId) ??
      fail(`page "${page.id}" has missing project "${page.projectId}"`);
    if (page.kind !== 'home') {
      fail(`section shortcut "${shortcut.id}" must be placed on a Home page`);
    }
    if (destination.kind !== 'root') {
      fail(`section shortcut "${shortcut.id}" must be placed on a root project's Home`);
    }

    const source = sections.get(shortcut.sourceSectionId) ??
      fail(`section shortcut "${shortcut.id}" has missing source section "${shortcut.sourceSectionId}"`);
    const sourceProject = projects.get(source.projectId) ??
      fail(`section "${source.id}" has missing project "${source.projectId}"`);
    if (sourceProject.workspaceId !== destination.workspaceId) {
      fail(`section shortcut "${shortcut.id}" crosses workspaces`);
    }
    if (rootProjectId(sourceProject.id) !== rootProjectId(destination.id)) {
      fail(`section shortcut "${shortcut.id}" crosses root project trees`);
    }
    if (source.pageId === page.id) {
      fail(`section shortcut "${shortcut.id}" cannot reference a section on its destination page`);
    }
  }

  for (const milestone of document.milestones) projectFor('milestone', milestone.id, milestone.projectId);

  /**
   * **The ownership invariant, made structural** (§30,
   * docs/decisions/2026-09-sections-own-their-data.md): every row names a section that
   * exists, belongs to the row's project, and holds rows of the row's kind. A foreign-key
   * check alone would not be the invariant — a `progress` section renders nothing it owns,
   * so a row held by one is a row nothing renders.
   */
  const containerFor = (
    collection: string,
    row: { id: string; projectId: string; sectionId: string; archivedAt?: string; archivedWithSectionId?: string },
    expected: OwnedDataKind,
  ) => {
    const section = sections.get(row.sectionId) ??
      fail(`${collection} "${row.id}" has missing section "${row.sectionId}"`);
    if (section.projectId !== row.projectId) fail(`${collection} "${row.id}" has a section from another project`);
    if (ownedKindOf(section.type) !== expected) {
      fail(`${collection} "${row.id}" is held by a ${section.type} section`);
    }
    // A live row in an archived section is off the canvas with nothing saying so. Removing
    // a section archives its live rows with it, so this state has no legitimate producer.
    if (row.archivedAt === undefined && section.archivedAt !== undefined) {
      fail(`${collection} "${row.id}" is live in an archived section`);
    }
    // The marker describes an archive that happened, so it cannot outlive one. Redundancy
    // that can be *checked* is not duplication: because it always equals `sectionId`, a bug
    // that sets one without the other — or leaves it behind on restore — fails at the next
    // commit rather than surfacing weeks later as a section that restores the wrong rows.
    if (row.archivedWithSectionId !== undefined) {
      if (row.archivedAt === undefined) fail(`live ${collection} "${row.id}" is marked as archived with a section`);
      if (row.archivedWithSectionId !== row.sectionId) {
        fail(`${collection} "${row.id}" is marked as archived with another section`);
      }
      if (section.archivedAt === undefined) fail(`${collection} "${row.id}" is marked with a live section`);
    }
    return section;
  };

  for (const reflection of document.reflections) {
    projectFor('reflection', reflection.id, reflection.projectId);
    containerFor('reflection', reflection, 'reflections');
    const subject = reflection.subject;
    if (subject?.kind === 'task') {
      if (!tasks.has(subject.id)) {
        fail(`reflection "${reflection.id}" has missing subject task "${subject.id}"`);
      }
    } else if (subject?.kind === 'subproject') {
      const subjectProject = projects.get(subject.id);
      if (subjectProject === undefined) {
        fail(`reflection "${reflection.id}" has missing subject project "${subject.id}"`);
      }
      if (subjectProject !== undefined && subjectProject.kind !== 'subproject') {
        fail(`reflection "${reflection.id}" cannot be about root project "${subject.id}"`);
      }
    }
  }
  for (const task of document.tasks) {
    projectFor('task', task.id, task.projectId);
    containerFor('task', task, 'tasks');
    if (task.parentTaskId !== undefined) {
      const parent = tasks.get(task.parentTaskId) ??
        fail(`task "${task.id}" has missing parent "${task.parentTaskId}"`);
      if (parent.projectId !== task.projectId) fail(`task "${task.id}" has a parent from another project`);
      // A subtask is rendered by whichever list holds its parent, so a parent in another
      // section would render as two half-tasks. Every service write already maintains this;
      // stating it here makes it hold for a hand-edited document too (§14), and it is what
      // lets a section cascade treat its live rows as whole subtrees.
      if (parent.sectionId !== task.sectionId) fail(`task "${task.id}" has a parent in another section`);
      // **A live task's ancestors are live.** `archive` cascades to descendants, so a live
      // row under an archived parent is a row nothing can reach — the same defect as a live
      // row in an archived section, one level down.
      if (task.archivedAt === undefined && parent.archivedAt !== undefined) {
        fail(`task "${task.id}" is live under an archived parent`);
      }
    }
    // Each marker means "came down with *that*", and the two describe different archives, so
    // a row can only be in one group.
    if (task.archivedWithSectionId !== undefined && task.archivedWithTaskId !== undefined) {
      fail(`task "${task.id}" carries two archive markers`);
    }
    if (task.archivedWithTaskId !== undefined) {
      if (task.archivedAt === undefined) fail(`live task "${task.id}" is marked as archived with a task`);
      if (task.archivedWithTaskId === task.id) fail(`task "${task.id}" is marked with itself`);
      const root = tasks.get(task.archivedWithTaskId) ??
        fail(`task "${task.id}" has a missing archive root "${task.archivedWithTaskId}"`);
      if (root.archivedAt === undefined) fail(`task "${task.id}" is marked with a live archive root`);
      // Defensive, and deliberately kept: the ancestry walk below already implies this,
      // because every parent/child pair shares a project and a section, so an ancestor
      // shares them transitively. It fires first because its message names the actual
      // problem — a root in the wrong place — where the walk would only say "non-ancestor".
      if (root.projectId !== task.projectId || root.sectionId !== task.sectionId) {
        fail(`task "${task.id}" has an archive root outside its project section`);
      }
      // The root must be a strict *ancestor*, or restoring it would revive an unrelated row.
      // The acyclic pass below makes this walk finite; the visited set makes it finite even
      // on the document that pass is about to reject.
      const seen = new Set<string>([task.id]);
      let ancestorId = task.parentTaskId;
      let found = false;
      while (ancestorId !== undefined && !seen.has(ancestorId)) {
        if (ancestorId === root.id) { found = true; break; }
        seen.add(ancestorId);
        ancestorId = tasks.get(ancestorId)?.parentTaskId;
      }
      if (!found) fail(`task "${task.id}" is marked with a non-ancestor`);
    }
  }

  /**
   * A parent chain that loops is structurally unusable: every tree walk over it either
   * hangs or starves the event loop, and nothing further downstream can detect it. Both
   * chains are checked here so a hand-edited file fails at load rather than at whichever
   * request first tries to walk it.
   */
  const assertAcyclic = <T extends { id: string }>(
    collection: string,
    values: T[],
    parentOf: (value: T) => string | undefined,
    lookup: Map<string, T>,
  ): void => {
    const settled = new Set<string>();
    for (const value of values) {
      const path = new Set<string>();
      let current: T | undefined = value;
      while (current !== undefined && !settled.has(current.id)) {
        if (path.has(current.id)) fail(`${collection} "${current.id}" is its own ancestor`);
        path.add(current.id);
        const parentId = parentOf(current);
        current = parentId === undefined ? undefined : lookup.get(parentId);
      }
      for (const id of path) settled.add(id);
    }
  };

  assertAcyclic('project', document.projects, (project) => project.parentProjectId, projects);
  assertAcyclic('task', document.tasks, (task) => task.parentTaskId, tasks);

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

  /**
   * Deliberately **not** built on `assertCanMutateDataStore`: that helper returns cleanly
   * when there is neither a context nor an active token, which is exactly the "called
   * outside a unit" case this has to reject.
   *
   * The failure is a `DocumentIntegrityError` rather than `UnitOfWorkInProgressError`
   * because the host maps the latter to 503 `busy` — the wrong story for a caller that
   * never opened a unit at all.
   */
  replaceActiveDocument(document: unknown): void {
    const context = inheritedContext(this);
    if (context === undefined || context.token !== activeOperationTokens.get(this) || context.role !== 'callback') {
      throw new DocumentIntegrityError('replaceActiveDocument must be called inside runUnitOfWork');
    }
    // Validated here rather than only at commit, so a bad replacement names itself at the
    // call site instead of surfacing as a mystery rollback.
    //
    // This rebinds the unit's document. A repository that had captured a reference from an
    // earlier `getActiveDocument` *in the same unit* would keep writing into the discarded
    // one — so a unit should either replace the document or do repository work, not both.
    context.document = validateDocumentIntegrity(document);
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
        // Drop only *this* store's stale context — a queued unit must not inherit one
        // from whichever caller was at the head of the chain. Clearing the whole map
        // would strand another store's in-progress unit, whose reads would silently fall
        // back to the committed document while `openUnitStores` still claimed it was open.
        const contexts = new Map(operationContexts.getStore() ?? []);
        contexts.delete(store);
        return openUnitStores.run(open, () => operationContexts.run(contexts, () => store.runUnitOfWork(fn)));
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
