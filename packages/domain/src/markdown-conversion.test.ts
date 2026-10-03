import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sectionConfigRefusal, type ProjectId, type ProjectSection, type SectionId, type UserId, type WorkspaceId } from '@cwm/contracts';
import { decodeLegacyProse, upgradeMarkdownSections } from '@cwm/prototype-data';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildHarness } from '../test/test-support';
import type { ActorContext } from './actor';
import { sectionRecoveryOf } from './section-recovery-policy';

/**
 * **Converted Rich Text, in the domain** (Slice 63, acceptance items 1 and 3;
 * docs/decisions/2026-10-schema-version-6-markdown-conversion.md).
 *
 * The converter lives in `prototype-data`, which cannot depend on the domain, so the two properties
 * that need the domain are proved here, on the committed version-5 fixture: Archive judges converted
 * prose exactly as it judged Rich Text, and converted history Undoes and Redoes into Markdown with
 * the same identities and labels.
 */
const fixturePath = fileURLToPath(new URL('../../prototype-data/test/fixtures/history-v5-rich-text.json', import.meta.url));

type Row = Record<string, unknown>;

let source: Row;
beforeAll(async () => {
  source = JSON.parse(await readFile(fixturePath, 'utf8')) as Row;
});

const none = { tasks: [], reflections: [] };
const A: ActorContext = { actor: 'user', workspaceId: 'workspace-demo' as WorkspaceId, userId: 'user-demo' as UserId };

/**
 * Rich Text's retired recovery rule — `{ recovery: 'config', proseKey: 'text' }` — expressed
 * through the real policy: the rule is Markdown's with the key named `text`, so the verdict is
 * Markdown's on the same config with that one key renamed.
 */
const richTextVerdict = (config: Row) => {
  const { text, ...rest } = config;
  const renamed = Object.hasOwn(config, 'text') ? { markdown: text, ...rest } : rest;
  return sectionRecoveryOf({ id: 'section-x' as SectionId, type: 'markdown', config: renamed }, none);
};

/** Every Rich Text config the fixture stores, beside where its converted counterpart sits. */
const richTextConfigs = (document: Row, converted: Row): { path: string; before: Row; after: Row }[] => {
  const pairs: { path: string; before: Row; after: Row }[] = [];
  const sections = document['sections'] as Row[];
  const convertedSections = converted['sections'] as Row[];
  for (const [index, section] of sections.entries()) {
    if (section['type'] !== 'rich-text') continue;
    pairs.push({ path: `sections/${String(section['id'])}`, before: section['config'] as Row, after: convertedSections[index]!['config'] as Row });
  }
  const actions = document['operationActions'] as Row[];
  const convertedActions = converted['operationActions'] as Row[];
  const richTextIds = new Set<unknown>();
  for (const action of actions) {
    const snapshot = (action['operation'] as Row)['section'] as Row | undefined;
    if (snapshot?.['type'] === 'rich-text') richTextIds.add(snapshot['id']);
  }
  for (const section of sections) if (section['type'] === 'rich-text') richTextIds.add(section['id']);
  for (const [index, action] of actions.entries()) {
    const operation = action['operation'] as Row;
    const after = convertedActions[index]!['operation'] as Row;
    const path = `operationActions/${String(action['id'])}`;
    const snapshot = operation['section'] as Row | undefined;
    if ((operation['type'] === 'section.add' || operation['type'] === 'section.remove') && snapshot?.['type'] === 'rich-text') {
      pairs.push({ path, before: snapshot['config'] as Row, after: (after['section'] as Row)['config'] as Row });
    }
    if (operation['type'] === 'section.update' && richTextIds.has(operation['sectionId'])) {
      for (const [changeIndex, change] of (operation['changes'] as Row[]).entries()) {
        if (change['field'] !== 'config') continue;
        const convertedChange = (after['changes'] as Row[])[changeIndex]!;
        pairs.push({ path: `${path}/before`, before: change['before'] as Row, after: convertedChange['before'] as Row });
        pairs.push({ path: `${path}/after`, before: change['after'] as Row, after: convertedChange['after'] as Row });
      }
    }
  }
  return pairs;
};

/** A Rich Text config the old rule read as exactly prose: empty, or a lone string `text`. */
const isClean = (config: Row): boolean => {
  const keys = Object.keys(config);
  return keys.length === 0 || (keys.length === 1 && typeof config['text'] === 'string');
};

describe('converted Rich Text keeps its Archive recovery verdict', () => {
  it('for every clean config the fixture stores, and every result is a config Markdown takes (Slice 64)', () => {
    const converted = upgradeMarkdownSections(structuredClone(source)).document as unknown as Row;
    const pairs = richTextConfigs(source, converted);

    expect(pairs.length).toBeGreaterThan(15);
    expect(pairs.filter(({ before }) => !isClean(before)).length).toBeGreaterThan(0);
    for (const { path, before, after } of pairs) {
      expect(sectionConfigRefusal('markdown', after), path).toBeUndefined();
      if (!isClean(before)) continue;
      const verdict = sectionRecoveryOf({ id: 'section-x' as SectionId, type: 'markdown', config: after }, none);
      expect(verdict, path).toEqual(richTextVerdict(before));
    }
  });

  it('an archived config with no string text becomes empty, which Archive no longer lists; prose beside extras is recoverable prose (Slice 64)', () => {
    const verdictFor = (config: Row) => {
      const document = structuredClone(source);
      const archived = (document['sections'] as Row[]).find((candidate) => candidate['id'] === 'section-project-renovation-archived-notes')!;
      expect(archived).toMatchObject({ type: 'rich-text', archivedAt: expect.any(String) });
      archived['config'] = config;
      const converted = upgradeMarkdownSections(document).document.sections.find(({ id }) => id === archived['id'])!;
      return { config: converted.config, verdict: sectionRecoveryOf(converted, none) };
    };

    expect(verdictFor({ text: 5 })).toEqual({ config: {}, verdict: { include: false } });
    expect(verdictFor({ text: 'Attic', extra: 1 })).toMatchObject({ config: { markdown: 'Attic' }, verdict: { include: true, recovery: { kind: 'config' } } });
  });

  it.each([
    ['empty', ''],
    ['spaces', '  '],
    ['wide space and tab', '　\t'],
    ['NBSP', '  '],
    ['prose', 'Measure the hallway shelf.'],
  ])('for %s text', (_label, text) => {
    const document = structuredClone(source);
    const section = (document['sections'] as Row[]).find((candidate) => candidate['type'] === 'rich-text')!;
    section['config'] = { text };

    const converted = upgradeMarkdownSections(document).document.sections.find(({ id }) => id === section['id'])!;

    expect(sectionRecoveryOf(converted, none)).toEqual(richTextVerdict({ text }));
  });
});

describe('converted history Undoes and Redoes into Markdown', () => {
  const loaded = () => {
    const document = upgradeMarkdownSections(structuredClone(source)).document;
    // The fixture's own ids came from a counting generator; new ids must not collide with them.
    let next = 0;
    return { document, harness: buildHarness(document, { ids: { next: (prefix) => `${prefix}-converted-${(next += 1)}` } }) };
  };
  const operationOn = (document: { operationActions: { operation: unknown }[] }, type: string, sectionId: string) =>
    document.operationActions
      .map(({ operation }) => operation as Row)
      .find((operation) => operation['type'] === type && ((operation['section'] as Row | undefined)?.['id'] ?? operation['sectionId']) === sectionId)!;
  const live = async (harness: ReturnType<typeof buildHarness>, id: string): Promise<ProjectSection | null> =>
    harness.sections.find(id as SectionId);

  it('a converted section.update restores the converted before, and Redo the converted after', async () => {
    const { document, harness } = loaded();
    const change = (operationOn(document, 'section.update', 'section-project-kitchen-brief')['changes'] as Row[])[0]!;

    await harness.step(A, 'project-kitchen' as ProjectId, 'undo');
    const undone = await live(harness, 'section-project-kitchen-brief');
    expect(undone).toMatchObject({ type: 'markdown', config: change['before'] });
    expect(decodeLegacyProse((undone!.config as Row)['markdown'] as string)).toBe('Appliances and finishes before cabinets are ordered.');

    await harness.step(A, 'project-kitchen' as ProjectId, 'redo');
    expect(await live(harness, 'section-project-kitchen-brief')).toMatchObject({ type: 'markdown', config: change['after'] });
  });

  it('an edit that only changed extras converts to equal sides, and still Undoes and Redoes (Slice 64)', async () => {
    // The fixture has no such edit, so the kitchen brief's is rewritten into one before conversion.
    const document = structuredClone(source);
    const kitchen = (document['sections'] as Row[]).find((candidate) => candidate['id'] === 'section-project-kitchen-brief')!;
    kitchen['config'] = { text: 'Same prose', x: 2 };
    const edit = (document['operationActions'] as Row[]).find((action) => {
      const operation = action['operation'] as Row;
      return operation['type'] === 'section.update' && operation['sectionId'] === 'section-project-kitchen-brief';
    })!;
    ((edit['operation'] as Row)['changes'] as Row[])[0] = { field: 'config', before: { text: 'Same prose', x: 1 }, after: { text: 'Same prose', x: 2 } };
    let next = 0;
    const harness = buildHarness(upgradeMarkdownSections(document).document, { ids: { next: (prefix) => `${prefix}-converted-${(next += 1)}` } });

    await harness.step(A, 'project-kitchen' as ProjectId, 'undo');
    expect(await live(harness, 'section-project-kitchen-brief')).toMatchObject({ config: { markdown: 'Same prose' } });
    expect((await harness.operationActions.find(edit['id'] as never))?.state).toBe('undone');

    await harness.step(A, 'project-kitchen' as ProjectId, 'redo');
    expect(await live(harness, 'section-project-kitchen-brief')).toMatchObject({ config: { markdown: 'Same prose' } });
    expect((await harness.operationActions.find(edit['id'] as never))?.state).toBe('applied');
  });

  it('a snapshot-only section.add is redone as Markdown with the same id and converted config', async () => {
    const { document, harness } = loaded();
    const snapshot = operationOn(document, 'section.add', 'section-7')['section'] as Row;
    expect(await live(harness, 'section-7')).toBeNull();

    await harness.step(A, 'project-renovation' as ProjectId, 'redo');
    expect(await live(harness, 'section-7')).toMatchObject({ id: 'section-7', type: 'markdown', config: snapshot['config'] });

    await harness.step(A, 'project-renovation' as ProjectId, 'undo');
    expect(await live(harness, 'section-7')).toBeNull();
  });

  it('a deleted section.remove is undone into Markdown from its snapshot, and redone', async () => {
    const { document, harness } = loaded();
    const snapshot = operationOn(document, 'section.remove', 'section-2')['section'] as Row;
    const renovation = 'project-renovation' as ProjectId;
    expect(await live(harness, 'section-2')).toBeNull();

    // Restore, then the retained removal, then the deleted one: the history's own order.
    await harness.step(A, renovation, 'undo');
    await harness.step(A, renovation, 'undo');
    const scratch = await live(harness, 'section-1');
    expect(scratch?.type).toBe('markdown');
    expect(scratch?.archivedAt).toBeUndefined();
    await harness.step(A, renovation, 'undo');
    expect(await live(harness, 'section-2')).toMatchObject({ id: 'section-2', type: 'markdown', config: snapshot['config'] });

    await harness.step(A, renovation, 'redo');
    expect(await live(harness, 'section-2')).toBeNull();
  });

  it('keeps every stored label byte for byte through Undo and Redo', async () => {
    const { harness } = loaded();
    const labels = (source['operationActions'] as Row[]).map((action) => [action['id'], action['label']]);

    await harness.step(A, 'project-kitchen' as ProjectId, 'undo');
    await harness.step(A, 'project-renovation' as ProjectId, 'redo');
    await harness.step(A, 'project-renovation' as ProjectId, 'undo');

    const stored = new Map(harness.store.snapshot().operationActions.map((action) => [action.id, action.label]));
    for (const [id, label] of labels) expect(stored.get(id as never), String(id)).toBe(label);
    expect([...stored.values()]).toContain('Edited prose in the Rich Text section');
  });
});
