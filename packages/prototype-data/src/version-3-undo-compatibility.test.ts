import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import { upgradeOperationHistory } from './upgrade-operation-history';

/**
 * **Version 3 → version 4 compatibility.** Version 3 carried single-use Undo receipts in a
 * defaulted `undoRecords` collection; version 4 replaces them with per-actor operation histories
 * and retires every old receipt (docs/decisions/2026-09-schema-version-4-conversion.md).
 *
 * The corpus is the committed `nested-projects` snapshot as it was **before** Undo records
 * existed — no `undoRecords` key — plus the two record shapes real version-3 files held, added in
 * memory as plain JSON: a pre-Slice-31 `reassign` removal with no `disposition`, and receipts
 * already consumed. None of them parses under version 4, which is the point: the converter reads
 * them as data and drops them wholesale rather than reinterpreting them.
 */
const fixturePath = fileURLToPath(new URL('../test/fixtures/nested-projects-v3.json', import.meta.url));
const v3 = async (): Promise<Record<string, unknown>> => JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, unknown>;

type Row = Record<string, unknown>;

const AT = '2026-08-24T16:00:00.000Z';

/** Version-3 Undo records, in the shapes version 3 wrote them. */
const legacyRecords = (document: Record<string, unknown>): Row[] => {
  const section = (document['sections'] as Row[])[0]!;
  const base = {
    workspaceId: 'workspace-demo',
    projectId: section['projectId'],
    actor: 'user',
    actorUserId: 'user-demo',
    label: 'Removed the section',
    createdAt: AT,
    expiresAt: '2026-08-25T16:00:00.000Z',
  };
  return [
    {
      ...base,
      id: 'undo-legacy-reassign',
      sequence: 1,
      // Slice 30: no disposition, and a reassign whose rows moved to another container.
      operation: {
        version: 1, type: 'section.remove', section, placement: { pageId: section['pageId'], index: 0 },
        appliedPolicy: 'reassign', reassignToSectionId: 'section-elsewhere',
        rows: [{ kind: 'task', id: 'task-moved', before: { sectionId: section['id'] }, after: { sectionId: 'section-elsewhere' } }],
        postSectionArchivedAt: AT,
      },
    },
    {
      ...base,
      id: 'undo-consumed',
      sequence: 2,
      consumedAt: AT,
      operation: { version: 1, type: 'section.add', section },
    },
    {
      ...base,
      id: 'undo-outstanding',
      sequence: 3,
      operation: { version: 1, type: 'section.update', sectionId: section['id'], projectId: section['projectId'], pageId: section['pageId'], changes: [{ field: 'collapsed', before: false, after: true }] },
    },
  ];
};

const BUSINESS_COLLECTIONS = [
  'users', 'workspaces', 'projects', 'projectPages', 'sectionShortcuts', 'tasks', 'milestones', 'reflections', 'activityEvents', 'agentConnections',
] as const;

describe('version 3 → version 4', () => {
  it('converts a version-3 file written before Undo records, preserving every business collection', async () => {
    const input = await v3();
    expect(input['schemaVersion']).toBe(3);
    expect(input).not.toHaveProperty('undoRecords');

    const { document, changed, retiredReceipts } = upgradeOperationHistory(structuredClone(input));

    expect(changed).toBe(true);
    expect(retiredReceipts).toBe(0);
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    for (const collection of BUSINESS_COLLECTIONS) {
      expect(document[collection], collection).toEqual(input[collection]);
    }
    // Sections gain exactly one field, explicitly written: no version-3 removal carried a generation.
    expect(document.sections).toEqual((input['sections'] as Row[]).map((section) => ({ ...section, archiveGeneration: 0 })));
    expect(document.operationHistories).toEqual([]);
    expect(document.operationActions).toEqual([]);
    expect(() => new InMemoryDataStore(document)).not.toThrow();
  });

  it('retires legacy receipts — reassign records, consumed and outstanding ones — with the reset count', async () => {
    const input = await v3();
    const records = legacyRecords(input);

    const { document, retiredReceipts } = upgradeOperationHistory({ ...input, undoRecords: records });

    expect(retiredReceipts).toBe(3);
    expect(document).not.toHaveProperty('undoRecords');
    expect(document.operationActions).toEqual([]);
    expect(JSON.stringify(document)).not.toContain('undo-legacy-reassign');
    for (const collection of BUSINESS_COLLECTIONS) expect(document[collection], collection).toEqual(input[collection]);
  });

  it('a second run on the converted document is a no-op', async () => {
    const once = upgradeOperationHistory({ ...(await v3()), undoRecords: legacyRecords(await v3()) }).document;

    expect(upgradeOperationHistory(structuredClone(once))).toEqual({ document: once, changed: false, retiredReceipts: 0 });
  });

  it('the v4 output is validated before anything is written, so a broken input throws instead of converting', async () => {
    const broken = await v3();
    (broken['sections'] as Row[])[0]!['projectId'] = 'project-gone';

    expect(() => upgradeOperationHistory(broken)).toThrow();
  });

  it('refuses a version it does not read', async () => {
    const document = await v3();
    const older = { ...document, schemaVersion: 2 };
    expect(() => upgradeOperationHistory(older)).toThrow(/version 2/);
    expect(() => upgradeOperationHistory({ schemaVersion: 5 })).toThrow(RangeError);
    expect(() => upgradeOperationHistory([])).toThrow(TypeError);
    expect(() => upgradeOperationHistory({ ...document, sections: { broken: true } })).toThrow(/sections/);
  });
});
