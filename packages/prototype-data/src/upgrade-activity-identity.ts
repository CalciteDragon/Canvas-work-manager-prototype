import { SCHEMA_VERSION, type PrototypeDocument } from '@cwm/contracts';
import { validateDocumentIntegrity } from '@cwm/repositories';

/**
 * The version-4 → version-5 converter (§14, §57; Slice 36).
 *
 * Version 5 gives every activity event a `context`: the captured kind, id, label and owning
 * project of the entity it describes. Slice 36 makes Undo of a creation delete the row it created,
 * and the audit line has to survive that
 * (docs/decisions/2026-09-historical-activity-identity.md).
 *
 * **Why the version moves at all.** Slice 35 argued Stage B could make the field required in place
 * and pay no conversion tax. It cannot: once the field is required, an existing version-4 file
 * that was never backfilled fails `validateDocumentIntegrity` at load with no remedy named, which
 * is exactly the failure a version number exists to prevent. Moving the version means the operator
 * is told to run `pnpm prototype:upgrade` instead of being handed a schema mismatch
 * (docs/decisions/2026-09-schema-version-5-conversion.md).
 *
 * **What it preserves.** Everything. Operation histories, their actions in every state — applied,
 * undone and retired — their ids, orders, cursors, high-water marks, revisions and expiry times
 * all travel through untouched. Only version 3's receipts retired, and that happened one step
 * earlier and once.
 *
 * **What it refuses.** A legacy event whose scope is invalid is *not* laundered into a valid
 * captured identity. An event naming a target that does not exist, or a project in another
 * workspace, has no truthful context to backfill, so the conversion fails and leaves the original
 * file alone rather than writing a document whose audit trail asserts something false. This is
 * hand-editable JSON, not a signed audit trail; the rule is "never invent", not "prove".
 *
 * Like the two steps before it this is a converter, not a migration runner: one version to one
 * version, called explicitly by `upgrade-cli.ts`, registered nowhere (§71). It validates the final
 * document, which is the whole chain's guarantee — the two steps before it return opaque JSON.
 */

/** The version this converter reads. */
const SOURCE_VERSION = 4;

export interface UpgradeActivityIdentityResult {
  document: PrototypeDocument;
  /** False when the input was already at version 5 — the no-op case. */
  changed: boolean;
  /** How many events gained a captured identity. */
  backfilledEvents: number;
}

type Row = Record<string, unknown>;

const asDocument = (input: unknown): Row & { schemaVersion: number } => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('input is not a prototype document');
  }
  const candidate = input as { schemaVersion?: unknown };
  if (typeof candidate.schemaVersion !== 'number') {
    throw new TypeError('input is not a prototype document: it has no schemaVersion');
  }
  return candidate as Row & { schemaVersion: number };
};

/** A collection read as data, never quietly replaced by an empty one. */
const collection = (source: Row, key: string): Row[] => {
  const value = source[key] ?? [];
  if (!Array.isArray(value)) throw new TypeError(`cannot convert: \`${key}\` is not an array`);
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
 * converter that hung on one would be worse than a converter that refused it.
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
 * **The backfill itself, without the version logic.** Exported because the seed builders need
 * exactly this: they write the same events an ordinary write would and then let one function
 * derive each event's captured identity from the document it is part of. Deriving it in the
 * builders instead would be a second place for the rule to drift, and hand-writing a label per
 * event would be one more chance to seed a document the store refuses to load.
 *
 * It refuses rather than invents — see the refusals `upgradeActivityIdentity` documents.
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
      throw new TypeError(`cannot convert activity "${id}": it has no target`);
    }

    // The target must still exist. A version-4 file was written while every target did, so a
    // missing one is a broken document rather than a reversed creation — and inventing a label
    // for it would be exactly the laundering this converter refuses.
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
      throw new TypeError(`cannot convert activity "${id}": its ${entityType} target "${entityId}" does not exist`);
    }

    const targetProjectId =
      entityType === 'project' ? entityId : entityType === 'agent_connection' ? undefined : text(target['projectId']);
    const eventProjectId = text(event['projectId']);
    if (entityType !== 'agent_connection') {
      if (targetProjectId === undefined) {
        throw new TypeError(`cannot convert activity "${id}": its target names no project`);
      }
      if (eventProjectId !== undefined && eventProjectId !== targetProjectId) {
        throw new TypeError(`cannot convert activity "${id}": it names a project different from its target`);
      }
      const project = projects.get(targetProjectId);
      if (project === undefined) throw new TypeError(`cannot convert activity "${id}": project "${targetProjectId}" does not exist`);
      if (text(project['workspaceId']) !== workspaceId) {
        throw new TypeError(`cannot convert activity "${id}": its target is in another workspace`);
      }
    } else {
      const userId = text(target['userId']);
      const owner = userId === undefined ? undefined : users.get(userId);
      if (owner === undefined || text(owner['workspaceId']) !== workspaceId) {
        throw new TypeError(`cannot convert activity "${id}": its connection is in another workspace`);
      }
      if (eventProjectId !== undefined) {
        throw new TypeError(`cannot convert activity "${id}": an agent connection belongs to no project`);
      }
    }

    // The readable name, from whichever field the kind uses, with a stable fallback for a
    // titleless reflection — the one entity whose name is genuinely optional (§36).
    const label =
      text(target['name']) ??
      text(target['title']) ??
      (entityType === 'reflection' ? 'Untitled reflection' : entityId);

    backfilled += 1;
    // Version 5 requires the event and its context to name the same project, so a version-4 event
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

export const upgradeActivityIdentity = (input: unknown): UpgradeActivityIdentityResult => {
  const source = asDocument(input);

  // Already converted: validated rather than trusted, so a corrupt v5 file is still caught, and
  // nothing is written for it.
  if (source.schemaVersion === SCHEMA_VERSION) {
    return { document: validateDocumentIntegrity(source), changed: false, backfilledEvents: 0 };
  }
  if (source.schemaVersion !== SOURCE_VERSION) {
    throw new RangeError(
      `cannot convert schema version ${source.schemaVersion}: this converter reads version ${SOURCE_VERSION} and writes version ${SCHEMA_VERSION}`,
    );
  }

  const { activityEvents, backfilled } = captureActivityIdentities(source);
  const converted = { ...source, schemaVersion: SCHEMA_VERSION, activityEvents };
  return { document: validateDocumentIntegrity(converted), changed: true, backfilledEvents: backfilled };
};
