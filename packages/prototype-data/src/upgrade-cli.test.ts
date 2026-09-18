import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it, vi } from 'vitest';
import { buildSeed } from './seeds';
import { type UpgradeFileOperations, upgradeDataFile, upgradeMessage } from './upgrade-cli';

const fixture = (name: string) => fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url));
const v2FixturePath = fixture('nested-projects-v2.json');
const v3FixturePath = fixture('nested-projects-v3.json');

type Row = Record<string, unknown>;

/** In-memory files that record every write in order: "backed up first" is the property under test. */
const operations = (source: string): UpgradeFileOperations & { written: Map<string, string>; order: string[] } => {
  const written = new Map<string, string>();
  const order: string[] = [];
  return {
    written,
    order,
    readFile: vi.fn(async () => source),
    writeFile: vi.fn(async (path: string, data: string) => {
      order.push(`write ${path}`);
      written.set(path, data);
    }),
    rename: vi.fn(async (from: string, to: string) => {
      order.push(`rename ${from} -> ${to}`);
      written.set(to, written.get(from) ?? '');
      written.delete(from);
    }),
  };
};

const NOW = new Date('2026-09-16T12:00:00.000Z');
const BACKUP = 'data.json.backup-2026-09-16T12-00-00-000Z.json';

describe('upgradeDataFile — the chained conversion', () => {
  it('the v2 fixture converts through the two frozen intermediates to v5, backing the original up first', async () => {
    const source = await readFile(v2FixturePath, 'utf8');
    const fileOperations = operations(source);

    const result = await upgradeDataFile('data.json', { fileOperations, now: NOW });
    expect(result).toMatchObject({ changed: true, fromVersion: 2, retiredReceipts: 0 });
    // The committed v2 corpus predates the activity feed, so there is nothing to backfill here;
    // the v3 and v4 cases below are where the captured identity is proved.
    expect(result.backfilledEvents).toBe(0);

    expect(fileOperations.order).toEqual([`write ${BACKUP}`, 'write data.json.tmp', 'rename data.json.tmp -> data.json']);
    // The backup is the original's exact bytes; the converted file is re-serialized.
    expect(fileOperations.written.get(BACKUP)).toBe(source);
    const converted = JSON.parse(fileOperations.written.get('data.json')!) as Row;
    expect(converted).toMatchObject({ schemaVersion: SCHEMA_VERSION, operationHistories: [], operationActions: [] });
    expect(() => new InMemoryDataStore(converted)).not.toThrow();
    const input = JSON.parse(source) as Record<string, Row[]>;
    expect(converted['tasks']).toEqual(input['tasks']);
    // Activity events keep everything they said and gain exactly `context`.
    expect((converted['activityEvents'] as Row[]).map(({ context, ...rest }) => rest)).toEqual(
      (input['activityEvents'] ?? []).map((event) => ({ ...event, projectId: event['projectId'] })),
    );
  });

  it('a direct v3 file converts once through the chain, retiring its receipts; a second run is a no-op', async () => {
    const input = JSON.parse(await readFile(v3FixturePath, 'utf8')) as Row;
    const source = `${JSON.stringify({ ...input, undoRecords: [{ id: 'undo-1' }, { id: 'undo-2', consumedAt: '2026-08-24T16:00:00.000Z' }] }, null, 2)}\n`;
    const first = operations(source);

    await expect(upgradeDataFile('data.json', { fileOperations: first, now: NOW })).resolves.toMatchObject({
      changed: true,
      fromVersion: 3,
      retiredReceipts: 2,
    });

    const second = operations(first.written.get('data.json')!);
    await expect(upgradeDataFile('data.json', { fileOperations: second })).resolves.toEqual({
      changed: false,
      fromVersion: SCHEMA_VERSION,
      retiredReceipts: 0,
      backfilledEvents: 0,
    });
    expect(second.writeFile).not.toHaveBeenCalled();
    expect(second.rename).not.toHaveBeenCalled();
  });

  /**
   * Slice 36's own step, and the case Slice 35's in-place proposal could not serve: a version-4
   * file is the one an operator actually holds, and it must keep every history it recorded.
   */
  it('a v4 file gains captured identities and keeps every operation history and action', async () => {
    const v5 = buildSeed('nested-projects');
    const section = v5.sections[0]!;
    const history = {
      id: 'history-v4',
      workspaceId: v5.workspaces[0]!.id,
      projectId: section.projectId,
      actor: 'user',
      actorUserId: v5.users[0]!.id,
      cursor: 1,
      orderHighWaterMark: 3,
      revision: 7,
    };
    const actions = [
      {
        id: 'operation-applied',
        historyId: history.id,
        order: 1,
        state: 'applied',
        label: 'Updated a section',
        createdAt: '2026-09-16T10:00:00.000Z',
        expiresAt: '2026-09-17T10:00:00.000Z',
        operation: {
          version: 1,
          type: 'section.update',
          sectionId: section.id,
          projectId: section.projectId,
          pageId: section.pageId,
          changes: [{ field: 'collapsed', before: false, after: true }],
        },
      },
      {
        id: 'operation-undone',
        historyId: history.id,
        order: 3,
        state: 'undone',
        label: 'Moved a section',
        createdAt: '2026-09-16T10:05:00.000Z',
        expiresAt: '2026-09-17T10:05:00.000Z',
        operation: {
          version: 1,
          type: 'section.move',
          sectionId: section.id,
          projectId: section.projectId,
          pageId: section.pageId,
          placementBefore: { pageId: section.pageId, index: 0 },
          placementAfter: { pageId: section.pageId, index: 1 },
        },
      },
    ];
    const v4 = {
      ...v5,
      schemaVersion: 4,
      activityEvents: v5.activityEvents.map(({ context, ...event }) => event),
      operationHistories: [history],
      operationActions: actions,
    };
    const fileOperations = operations(`${JSON.stringify(v4, null, 2)}\n`);

    const result = await upgradeDataFile('data.json', { fileOperations, now: NOW });

    expect(result).toMatchObject({ changed: true, fromVersion: 4, retiredReceipts: 0 });
    expect(result.backfilledEvents).toBe(v4.activityEvents.length);
    const converted = JSON.parse(fileOperations.written.get('data.json')!) as Row;
    expect(converted['schemaVersion']).toBe(SCHEMA_VERSION);
    expect(converted['operationHistories']).toEqual(v4.operationHistories);
    expect(converted['operationActions']).toEqual(v4.operationActions);
    expect(() => new InMemoryDataStore(converted)).not.toThrow();
  });

  it('a repeat run on a v5 file writes nothing', async () => {
    const fileOperations = operations(`${JSON.stringify(buildSeed('nested-projects'), null, 2)}\n`);

    await expect(upgradeDataFile('data.json', { fileOperations })).resolves.toEqual({
      changed: false,
      fromVersion: SCHEMA_VERSION,
      retiredReceipts: 0,
      backfilledEvents: 0,
    });

    expect(fileOperations.writeFile).not.toHaveBeenCalled();
  });

  /**
   * Validate, then back up, then write. A converter that had already replaced the file when it
   * discovered the result was invalid would be worse than one that refused.
   */
  it.each([
    ['a v2 file', v2FixturePath],
    ['a v3 file', v3FixturePath],
  ])('a failed conversion of %s writes nothing at all', async (_, path) => {
    const broken = JSON.parse(await readFile(path, 'utf8')) as Record<string, Row[]>;
    broken['sections']![0]!['projectId'] = 'project-gone';
    const fileOperations = operations(JSON.stringify(broken));

    await expect(upgradeDataFile('data.json', { fileOperations })).rejects.toThrow();

    expect(fileOperations.writeFile).not.toHaveBeenCalled();
    expect(fileOperations.rename).not.toHaveBeenCalled();
  });

  it('leaves the target alone when the backup cannot be written', async () => {
    const fileOperations = operations(await readFile(v2FixturePath, 'utf8'));
    fileOperations.writeFile = vi.fn(async () => {
      throw new Error('disk full');
    });

    await expect(upgradeDataFile('data.json', { fileOperations })).rejects.toThrow('disk full');

    expect(fileOperations.rename).not.toHaveBeenCalled();
  });

  it('sniffs the version before converting, refusing what it cannot read', async () => {
    await expect(upgradeDataFile('data.json', { fileOperations: operations('{\"schemaVersion\": 1}') })).rejects.toThrow(/version 1/);
    await expect(upgradeDataFile('data.json', { fileOperations: operations('{"schemaVersion": 9}') })).rejects.toThrow(RangeError);
    await expect(upgradeDataFile('data.json', { fileOperations: operations('{}') })).rejects.toThrow(/schemaVersion/);
    await expect(upgradeDataFile('data.json', { fileOperations: operations('not json') })).rejects.toThrow(/not valid JSON/);
  });

  it('says which version it converted from, and no longer claims version-4 history starts empty', () => {
    expect(upgradeMessage('data.json', { changed: true, fromVersion: 3, retiredReceipts: 2, backfilledEvents: 4 })).toBe(
      'Converted "data.json" from schema version 3 to 5. 2 Undo receipts from version 3 were retired. 4 activity events gained the captured identity of their target. The original is beside it as a .backup-*.json file.\n',
    );
    expect(
      upgradeMessage('data.json', { changed: true, fromVersion: 2, retiredReceipts: 0, backfilledEvents: 0 }),
    ).toContain('Undo and Redo history starts empty.');
    // From version 4 the history is preserved, so the reset sentence would be a lie.
    const fromFour = upgradeMessage('data.json', { changed: true, fromVersion: 4, retiredReceipts: 0, backfilledEvents: 1 });
    expect(fromFour).toContain('Every Undo and Redo action was preserved.');
    expect(fromFour).toContain('1 activity event gained the captured identity of its target.');
    expect(fromFour).not.toContain('starts empty');
    expect(
      upgradeMessage('data.json', { changed: false, fromVersion: 5, retiredReceipts: 0, backfilledEvents: 0 }),
    ).toBe('"data.json" is already at schema version 5. Nothing was written.\n');
  });
});
