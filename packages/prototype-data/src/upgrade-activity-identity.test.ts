import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { beforeAll, describe, expect, it } from 'vitest';
import { upgradeActivityIdentity } from './upgrade-activity-identity';

/**
 * **Version 4 → version 5.** The corpus is a committed version-4 document holding a real activity
 * feed and a history with one applied and one undone Stage A action — the file an operator actually
 * has when Slice 36 lands (docs/decisions/2026-09-schema-version-5-conversion.md).
 *
 * Two properties matter above all: **nothing of the history is lost**, and **nothing is invented**.
 */
const fixturePath = fileURLToPath(new URL('../test/fixtures/history-v4.json', import.meta.url));

type Row = Record<string, unknown>;

let source: Row;
beforeAll(async () => {
  source = JSON.parse(await readFile(fixturePath, 'utf8')) as Row;
});

const v4 = (): Row => structuredClone(source);

describe('upgradeActivityIdentity', () => {
  it('gives every event a captured identity that agrees with the event', () => {
    const input = v4();
    expect(input['schemaVersion']).toBe(4);
    expect((input['activityEvents'] as Row[]).every((event) => event['context'] === undefined)).toBe(true);

    const { document, changed, backfilledEvents } = upgradeActivityIdentity(input);

    expect(changed).toBe(true);
    expect(backfilledEvents).toBe((input['activityEvents'] as Row[]).length);
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    for (const event of document.activityEvents) {
      expect(event.context.targetKind).toBe(event.entityType);
      expect(event.context.targetId).toBe(event.entityId);
      expect(event.context.projectId).toBe(event.projectId);
      expect(event.context.targetLabel.length).toBeGreaterThan(0);
    }
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });

  it('omits project and root for an agent-connection event, which belongs to no project', () => {
    const { document } = upgradeActivityIdentity(v4());
    const connection = document.activityEvents.find((event) => event.entityType === 'agent_connection');

    expect(connection?.context.projectId).toBeUndefined();
    expect(connection?.context.rootProjectId).toBeUndefined();
  });

  it('names a sub-project’s root, not the sub-project, as the captured root', () => {
    const input = v4();
    const projects = input['projects'] as Row[];
    const root = projects.find((project) => project['kind'] === 'root')!;
    const child = projects.find((project) => project['parentProjectId'] === root['id']);
    // The corpus is flat if this is absent; nest one so the walk is genuinely exercised.
    const childId = child?.['id'] ?? 'project-nested-for-root-test';
    if (child === undefined) {
      projects.push({ ...root, id: childId, kind: 'subproject', parentProjectId: root['id'] });
      (input['projectPages'] as Row[]).push({
        id: 'page-nested-for-root-test',
        projectId: childId,
        kind: 'work',
        enabled: true,
        createdAt: '2026-09-16T10:00:00.000Z',
        updatedAt: '2026-09-16T10:00:00.000Z',
      });
      (input['activityEvents'] as Row[]).push({
        ...(input['activityEvents'] as Row[])[0],
        id: 'activity-nested-for-root-test',
        action: 'project.updated',
        entityType: 'project',
        entityId: childId,
        projectId: childId,
      });
    }

    const { document } = upgradeActivityIdentity(input);
    const nested = document.activityEvents.find((event) => event.projectId === childId);

    expect(nested?.context.rootProjectId).toBe(root['id']);
  });

  it('preserves every operation history and action — applied, undone, ids, orders and counters', () => {
    const input = v4();

    const { document } = upgradeActivityIdentity(input);

    expect(document.operationHistories).toEqual(input['operationHistories']);
    expect(document.operationActions).toEqual(input['operationActions']);
    expect(document.operationActions.map((action) => action.state).sort()).toEqual(['applied', 'undone']);
    expect(document.operationHistories[0]!.cursor).toBe(1);
    expect(document.operationHistories[0]!.orderHighWaterMark).toBe(3);
    expect(document.operationHistories[0]!.revision).toBe(5);
    expect(document.operationActions.map((action) => action.expiresAt)).toEqual(
      (input['operationActions'] as Row[]).map((action) => action['expiresAt']),
    );
  });

  it('preserves every business collection byte for byte', () => {
    const input = v4();

    const { document } = upgradeActivityIdentity(input) as unknown as { document: Row };

    for (const collection of ['users', 'workspaces', 'projects', 'projectPages', 'sections', 'sectionShortcuts', 'tasks', 'milestones', 'reflections', 'agentConnections']) {
      expect(document[collection], collection).toEqual(input[collection]);
    }
  });

  it('is a no-op on a version-5 document, and still validates it', () => {
    const once = upgradeActivityIdentity(v4()).document;

    expect(upgradeActivityIdentity(structuredClone(once))).toEqual({
      document: once,
      changed: false,
      backfilledEvents: 0,
    });
    // A corrupt version-5 file is caught rather than trusted.
    const corrupt = structuredClone(once) as unknown as Row;
    (corrupt['tasks'] as Row[])[0]!['projectId'] = 'project-gone';
    expect(() => upgradeActivityIdentity(corrupt)).toThrow();
  });

  it('refuses a version it does not read, and input that is not a document', () => {
    expect(() => upgradeActivityIdentity({ ...v4(), schemaVersion: 3 })).toThrow(/version 3/);
    expect(() => upgradeActivityIdentity([])).toThrow(TypeError);
    expect(() => upgradeActivityIdentity({})).toThrow(/schemaVersion/);
    expect(() => upgradeActivityIdentity({ ...v4(), activityEvents: { broken: true } })).toThrow(/activityEvents/);
  });

  /**
   * The refusals are the heart of this converter: an invalid legacy scope has no truthful context
   * to write, so it must fail with the original file intact rather than launder the identity.
   */
  it('refuses a legacy event whose target does not exist', () => {
    const input = v4();
    (input['activityEvents'] as Row[])[0]!['entityId'] = 'task-never-existed';
    (input['activityEvents'] as Row[])[0]!['entityType'] = 'task';

    expect(() => upgradeActivityIdentity(input)).toThrow(/does not exist/);
  });

  it('refuses a legacy event that names a project different from its target’s', () => {
    const input = v4();
    const event = (input['activityEvents'] as Row[]).find((candidate) => candidate['entityType'] === 'task')!;
    const otherProject = (input['projects'] as Row[]).find((project) => project['id'] !== event['projectId']);
    if (otherProject === undefined) return;
    event['projectId'] = otherProject['id'];

    expect(() => upgradeActivityIdentity(input)).toThrow(/different from its target/);
  });

  it('refuses a legacy event whose target is in another workspace', () => {
    const input = v4();
    const event = (input['activityEvents'] as Row[]).find((candidate) => candidate['entityType'] === 'task')!;
    const project = (input['projects'] as Row[]).find((candidate) => candidate['id'] === event['projectId'])!;
    const other = (input['workspaces'] as Row[]).find((workspace) => workspace['id'] !== event['workspaceId'])!;
    project['workspaceId'] = other['id'];

    expect(() => upgradeActivityIdentity(input)).toThrow(/another workspace/);
  });

  it('refuses an agent-connection event that claims a project', () => {
    const input = v4();
    const event = (input['activityEvents'] as Row[]).find((candidate) => candidate['entityType'] === 'agent_connection')!;
    event['projectId'] = (input['projects'] as Row[])[0]!['id'];

    expect(() => upgradeActivityIdentity(input)).toThrow(/belongs to no project/);
  });

  it('refuses an event with no target at all', () => {
    const input = v4();
    delete (input['activityEvents'] as Row[])[0]!['entityId'];

    expect(() => upgradeActivityIdentity(input)).toThrow(/has no target/);
  });

  it('gives a titleless reflection a stable readable fallback', () => {
    const input = v4();
    const reflection = (input['reflections'] as Row[])[0];
    if (reflection === undefined) return;
    delete reflection['title'];
    const event = (input['activityEvents'] as Row[]).find((candidate) => candidate['entityType'] === 'reflection')!;
    event['entityId'] = reflection['id'];
    event['projectId'] = reflection['projectId'];

    const { document } = upgradeActivityIdentity(input);
    const converted = document.activityEvents.find((candidate) => candidate.entityId === reflection['id'])!;

    expect(converted.context.targetLabel).toBe('Untitled reflection');
  });
});
