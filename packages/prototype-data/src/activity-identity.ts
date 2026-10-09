type Row = Record<string, unknown>;

/** A collection read as data, never quietly replaced by an empty one. */
const collection = (source: Row, key: string): Row[] => {
  const value = source[key] ?? [];
  if (!Array.isArray(value)) throw new TypeError(`cannot capture: \`${key}\` is not an array`);
  return value as Row[];
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const byId = (rows: readonly Row[]): Map<string, Row> => {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const id = text(row['id']);
    if (id !== undefined) map.set(id, row);
  }
  return map;
};

/**
 * The root of a project's tree, walking `parentProjectId`. The visited set is the guard every
 * other walk in this repository carries: a hand-edited document can hold a parent cycle, and a
 * seed builder must not hang while deriving identity.
 */
const rootOf = (projects: Map<string, Row>, projectId: string): string | undefined => {
  const seen = new Set<string>();
  let current = projects.get(projectId);
  if (current === undefined) return undefined;
  let currentId = projectId;
  while (!seen.has(currentId)) {
    seen.add(currentId);
    const parentId = text(current['parentProjectId']);
    if (parentId === undefined) return currentId;
    const parent = projects.get(parentId);
    if (parent === undefined) return currentId;
    current = parent;
    currentId = parentId;
  }
  return currentId;
};

/**
 * Derives captured Activity identities from the entities a seed builder just wrote (§16, §57).
 * Refuses invalid targets rather than inventing labels or scope.
 */
export const captureActivityIdentities = (source: Row): { activityEvents: Row[]; backfilled: number } => {
  const projects = byId(collection(source, 'projects'));
  const sections = byId(collection(source, 'sections'));
  const tasks = byId(collection(source, 'tasks'));
  const milestones = byId(collection(source, 'milestones'));
  const reflections = byId(collection(source, 'reflections'));
  const agents = byId(collection(source, 'agentConnections'));
  const users = byId(collection(source, 'users'));

  let backfilled = 0;
  const activityEvents = collection(source, 'activityEvents').map((event) => {
    if (event['context'] !== undefined) return event;
    const id = text(event['id']) ?? '(unidentified)';
    const entityType = text(event['entityType']);
    const entityId = text(event['entityId']);
    const workspaceId = text(event['workspaceId']);
    if (entityType === undefined || entityId === undefined || workspaceId === undefined) {
      throw new TypeError(`cannot capture activity "${id}": it has no target`);
    }

    // The target must still exist. Seeds capture from their current entities, so a
    // missing one is a broken document rather than a reversed creation — and inventing a label
    // for it would invent an identity.
    const target =
      entityType === 'project'
        ? projects.get(entityId)
        : entityType === 'section'
          ? sections.get(entityId)
          : entityType === 'task'
            ? tasks.get(entityId)
            : entityType === 'milestone'
              ? milestones.get(entityId)
              : entityType === 'reflection'
                ? reflections.get(entityId)
                : agents.get(entityId);
    if (target === undefined) {
      throw new TypeError(`cannot capture activity "${id}": its ${entityType} target "${entityId}" does not exist`);
    }

    const targetProjectId =
      entityType === 'project' ? entityId : entityType === 'agent_connection' ? undefined : text(target['projectId']);
    const eventProjectId = text(event['projectId']);
    if (entityType !== 'agent_connection') {
      if (targetProjectId === undefined) {
        throw new TypeError(`cannot capture activity "${id}": its target names no project`);
      }
      if (eventProjectId !== undefined && eventProjectId !== targetProjectId) {
        throw new TypeError(`cannot capture activity "${id}": it names a project different from its target`);
      }
      const project = projects.get(targetProjectId);
      if (project === undefined) throw new TypeError(`cannot capture activity "${id}": project "${targetProjectId}" does not exist`);
      if (text(project['workspaceId']) !== workspaceId) {
        throw new TypeError(`cannot capture activity "${id}": its target is in another workspace`);
      }
    } else {
      const userId = text(target['userId']);
      const owner = userId === undefined ? undefined : users.get(userId);
      if (owner === undefined || text(owner['workspaceId']) !== workspaceId) {
        throw new TypeError(`cannot capture activity "${id}": its connection is in another workspace`);
      }
      if (eventProjectId !== undefined) {
        throw new TypeError(`cannot capture activity "${id}": an agent connection belongs to no project`);
      }
    }

    // The readable name, from whichever field the kind uses, with a stable fallback for a
    // titleless reflection — the one entity whose name is genuinely optional (§36).
    const label =
      text(target['name']) ??
      text(target['title']) ??
      (entityType === 'reflection' ? 'Untitled reflection' : entityId);

    backfilled += 1;
    // The Activity contract requires the event and its context to name the same project, so an event
    // that omitted the project its target plainly belongs to gains it here. That is the backfill,
    // not a change of what happened: the project is read from the target, never guessed.
    return {
      ...event,
      ...(targetProjectId === undefined ? {} : { projectId: targetProjectId }),
      context: {
        targetKind: entityType,
        targetId: entityId,
        targetLabel: label,
        ...(targetProjectId === undefined
          ? {}
          : { projectId: targetProjectId, rootProjectId: rootOf(projects, targetProjectId) }),
      },
    };
  });

  return { activityEvents, backfilled };
};

