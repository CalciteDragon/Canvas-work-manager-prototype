import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { InMemoryDataStore, validateDocumentIntegrity } from '@cwm/repositories';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeLegacyProse, encodeLegacyProse } from './legacy-prose';
import { convertMarkdownSections, upgradeMarkdownSections } from './upgrade-markdown-sections';

/**
 * **Version 5 → version 6.** The corpus is a committed version-5 document the real domain wrote
 * (test/fixtures/README.md): live, archived and snapshot-only Rich Text, two config edits, an
 * orphaned edit, both removal dispositions, a Restore, and the malformed configs
 * (docs/decisions/2026-10-schema-version-6-markdown-conversion.md).
 *
 * Two properties matter above all: **no prose is lost**, and **nothing but prose changes**.
 */
const fixturePath = fileURLToPath(new URL('../test/fixtures/history-v5-rich-text.json', import.meta.url));

type Row = Record<string, unknown>;

let source: Row;
beforeAll(async () => {
  source = JSON.parse(await readFile(fixturePath, 'utf8')) as Row;
});

const v5 = (): Row => structuredClone(source);
const sectionsOf = (document: Row): Row[] => document['sections'] as Row[];
const actionsOf = (document: Row): Row[] => document['operationActions'] as Row[];
const operationOf = (action: Row): Row => action['operation'] as Row;
const sectionOf = (document: Row, id: string): Row => sectionsOf(document).find((section) => section['id'] === id)!;
const actionOn = (document: Row, type: string, sectionId: string): Row =>
  actionsOf(document).find((action) => {
    const operation = operationOf(action);
    return operation['type'] === type && ((operation['section'] as Row | undefined)?.['id'] ?? operation['sectionId']) === sectionId;
  })!;

/**
 * Every stored config the rule applies to, by a readable path, with the type that governs it. A
 * `section.update` names no type, so its changes take the type the document records for that id —
 * `undefined` for the orphan.
 */
const proseLocations = (document: Row): { path: string; type: unknown; config: unknown }[] => {
  const types = new Map<unknown, unknown>(sectionsOf(document).map((section) => [section['id'], section['type']]));
  for (const action of actionsOf(document)) {
    const snapshot = operationOf(action)['section'] as Row | undefined;
    if (snapshot !== undefined) types.set(snapshot['id'], snapshot['type']);
  }
  const locations: { path: string; type: unknown; config: unknown }[] = [];
  for (const section of sectionsOf(document)) {
    locations.push({ path: `sections/${String(section['id'])}`, type: section['type'], config: section['config'] });
  }
  for (const action of actionsOf(document)) {
    const operation = operationOf(action);
    const path = `operationActions/${String(action['id'])}`;
    if (operation['type'] === 'section.add' || operation['type'] === 'section.remove') {
      const snapshot = operation['section'] as Row;
      locations.push({ path: `${path}/section`, type: snapshot['type'], config: snapshot['config'] });
    }
    if (operation['type'] === 'section.update') {
      for (const [index, change] of (operation['changes'] as Row[]).entries()) {
        if (change['field'] !== 'config') continue;
        const type = types.get(operation['sectionId']);
        locations.push({ path: `${path}/changes/${index}/before`, type, config: change['before'] });
        locations.push({ path: `${path}/changes/${index}/after`, type, config: change['after'] });
      }
    }
  }
  return locations;
};

/** Acceptance item 1's method: delete `type` and `config` at the enumerated paths, then compare. */
const withoutProse = (input: Row): Row => {
  const document = structuredClone(input);
  delete document['schemaVersion'];
  for (const section of sectionsOf(document)) {
    delete section['type'];
    delete section['config'];
  }
  for (const action of actionsOf(document)) {
    const operation = operationOf(action);
    if (operation['type'] === 'section.add' || operation['type'] === 'section.remove') {
      delete (operation['section'] as Row)['type'];
      delete (operation['section'] as Row)['config'];
    }
    if (operation['type'] === 'section.update') {
      for (const change of operation['changes'] as Row[]) {
        if (change['field'] !== 'config') continue;
        delete change['before'];
        delete change['after'];
      }
    }
  }
  return document;
};

const ORPHAN = 'section-3';

describe('upgradeMarkdownSections', () => {
  it('converts every live, archived and snapshot Rich Text section to Markdown', () => {
    const input = v5();
    const richText = sectionsOf(input).filter((section) => section['type'] === 'rich-text').length;

    const result = upgradeMarkdownSections(input);
    const document = result.document as unknown as Row;

    expect(result.changed).toBe(true);
    expect(document['schemaVersion']).toBe(6);
    expect(result.convertedSections).toBe(richText);
    expect(sectionOf(document, 'section-project-renovation-archived-notes')).toMatchObject({
      type: 'markdown', config: { markdown: 'Old attic notes' }, archivedAt: expect.any(String),
    });
    for (const { path, type } of proseLocations(document)) expect(type, path).not.toBe('rich-text');
    expect(JSON.stringify(document)).not.toContain('"rich-text"');
    expect(() => new InMemoryDataStore(result.document)).not.toThrow();
    expect(() => validateDocumentIntegrity(result.document)).not.toThrow();
  });

  it('converts section.add, both section.remove dispositions and section.update config changes', () => {
    const { document, convertedPayloads } = upgradeMarkdownSections(v5());
    const converted = document as unknown as Row;

    const undoneAdd = operationOf(actionOn(converted, 'section.add', 'section-7'));
    expect(undoneAdd['section']).toMatchObject({ type: 'markdown', config: { markdown: '\\# Looks like a heading\\\n1\\. x' } });
    expect(operationOf(actionOn(converted, 'section.remove', 'section-2'))).toMatchObject({
      disposition: 'deleted', section: { type: 'markdown', config: { markdown: '   ' } },
    });
    expect(operationOf(actionOn(converted, 'section.remove', 'section-1'))).toMatchObject({
      disposition: 'retained', section: { type: 'markdown', config: { markdown: 'Temporary&#13;\\\nnote' } },
    });
    const edit = operationOf(actionOn(converted, 'section.update', 'section-project-kitchen-brief'));
    expect(edit['changes']).toEqual([{
      field: 'config',
      before: { markdown: 'Appliances and finishes before cabinets are ordered\\.' },
      after: { markdown: encodeLegacyProse('    Appliances and finishes\n\n\n> before cabinets are ordered.  \n===\n\ttabbed\t') },
    }]);
    // Six adds, two removals and three edits; the orphaned edit is not one of them.
    expect(convertedPayloads).toBe(11);
  });

  it('changes nothing but type and config at the enumerated paths', () => {
    const input = v5();

    const { document } = upgradeMarkdownSections(input);

    expect(withoutProse(document as unknown as Row)).toEqual(withoutProse(input));
    expect(actionsOf(document as unknown as Row).map((action) => action['label'])).toEqual(
      actionsOf(input).map((action) => action['label']),
    );
  });

  it('decodes every encoded prose value back to the fixture’s original', () => {
    const input = v5();
    const { document } = upgradeMarkdownSections(input);
    const before = proseLocations(input);
    const after = proseLocations(document as unknown as Row);

    const checked: string[] = [];
    for (const [index, { path, config }] of before.entries()) {
      const text = (config as Row)['text'];
      if (before[index]!.type !== 'rich-text' || typeof text !== 'string') continue;
      expect(after[index]!.path).toBe(path);
      expect(decodeLegacyProse((after[index]!.config as Row)['markdown'] as string), path).toBe(text);
      checked.push(path);
    }
    // Sections, add/remove snapshots and both sides of the three typed config edits.
    expect(checked.length).toBeGreaterThan(15);
    expect(checked.filter((path) => path.includes('/changes/'))).toHaveLength(6);
  });

  it('leaves every location that is not Rich Text exactly as it was, the orphan included', () => {
    const input = v5();
    const { document } = upgradeMarkdownSections(input);
    const before = proseLocations(input);
    const after = proseLocations(document as unknown as Row);

    expect(after.map(({ path }) => path)).toEqual(before.map(({ path }) => path));
    const untouched = before.flatMap((location, index) => (location.type === 'rich-text' ? [] : [[location, after[index]!]]));
    expect(untouched.some(([location]) => location!.type === undefined)).toBe(true);
    expect(untouched.some(([location]) => location!.type === 'task-list')).toBe(true);
    for (const [location, converted] of untouched) {
      expect(converted, location!.path).toEqual(location);
    }
  });

  it('applies each row of the conversion table', () => {
    const { document, unreadableConfigs } = upgradeMarkdownSections(v5());
    const converted = document as unknown as Row;
    const configOf = (title: string) => sectionsOf(converted).find((section) => section['title'] === title)!['config'];

    // Whitespace-only text is stored raw; `{}` stays `{}`; a non-string `text` is left alone.
    expect(configOf('Blank')).toEqual({ markdown: '  \t' });
    expect(configOf('Empty')).toEqual({});
    expect(configOf('Numeric')).toEqual({ text: 5 });
    // `{ text, ...extras }` encodes the prose and keeps every other key.
    expect(sectionOf(converted, 'section-project-garden-brief')['config']).toEqual({
      markdown: 'Autumn planting only\\.\\\nStructural work waits for next year\\.',
      extra: 'kept',
    });
    expect(unreadableConfigs).toBe(2);
  });

  it('leaves the orphaned update unconverted and counts it', () => {
    const input = v5();
    const orphan = actionOn(input, 'section.update', ORPHAN);

    const result = upgradeMarkdownSections(input);

    expect(actionOn(result.document as unknown as Row, 'section.update', ORPHAN)).toEqual(orphan);
    expect(result.unreachableUpdates).toBe(1);
  });

  it('types an update on a section only a created container records from that container', () => {
    const document = {
      schemaVersion: 5,
      sections: [],
      operationActions: [
        { id: 'a1', operation: { type: 'task.add', container: { section: { id: 'section-container', type: 'task-list', config: {} } } } },
        { id: 'a2', operation: { type: 'section.update', sectionId: 'section-container', changes: [{ field: 'config', before: { text: 'a' }, after: { text: 'b' } }] } },
      ],
    };

    const result = convertMarkdownSections(document);

    expect(result.unreachableUpdates).toBe(0);
    expect(result.convertedPayloads).toBe(0);
    expect(result.operationActions).toEqual(document.operationActions);
  });

  describe('refuses, writing nothing', () => {
    it('when sources disagree about a section’s type', () => {
      const input = v5();
      (operationOf(actionOn(input, 'section.add', 'section-1'))['section'] as Row)['type'] = 'markdown';

      expect(() => upgradeMarkdownSections(input)).toThrow(/section "section-1".*(markdown|rich-text).*(markdown|rich-text)/);
    });

    it('when a Rich Text config already holds a markdown key', () => {
      const input = v5();
      sectionOf(input, 'section-project-kitchen-brief')['config'] = { text: 'a', markdown: 'b' };

      expect(() => upgradeMarkdownSections(input)).toThrow(/sections\/section-project-kitchen-brief.*markdown/);
    });

    it('when a created container is Rich Text', () => {
      const input = v5();
      actionsOf(input).push({
        id: 'action-container',
        operation: { type: 'reflection.add', container: { section: { id: 'section-odd', type: 'rich-text', config: {} } } },
      });

      expect(() => upgradeMarkdownSections(input)).toThrow(/action-container.*container/);
    });

    it('when an encoding does not round-trip, naming where', () => {
      const input = v5();
      const broken = (text: string): string => (text === 'Temporary\r\nnote' ? 'Temporary note' : encodeLegacyProse(text));

      expect(() => convertMarkdownSections(input, { encode: broken })).toThrow(/section-1.*preserve/);
      expect(input).toEqual(v5());
    });
  });

  describe('at version 6', () => {
    it('returns a clean file unchanged, orphan and all', () => {
      const once = upgradeMarkdownSections(v5()).document;

      const again = upgradeMarkdownSections(structuredClone(once));

      expect(again).toEqual({
        document: once, changed: false, convertedSections: 0, convertedPayloads: 0, unreadableConfigs: 0, unreachableUpdates: 1,
      });
    });

    it('converts consistent hand-edited Rich Text, the remedy the integrity error names', () => {
      const handEdited = { ...v5(), schemaVersion: 6 };

      const result = upgradeMarkdownSections(handEdited);

      expect(result.changed).toBe(true);
      expect(result.document).toEqual(upgradeMarkdownSections(v5()).document);
    });

    it('refuses Rich Text written onto a section its snapshots call Markdown', () => {
      const converted = upgradeMarkdownSections(v5()).document as unknown as Row;
      Object.assign(sectionOf(converted, 'section-1'), { type: 'rich-text', config: { text: 'x' } });

      expect(() => upgradeMarkdownSections(converted)).toThrow(/section "section-1"/);
    });
  });

  it('refuses a version it does not read, and input that is not a document', () => {
    expect(() => upgradeMarkdownSections({ ...v5(), schemaVersion: 4 })).toThrow(RangeError);
    expect(() => upgradeMarkdownSections({ ...v5(), schemaVersion: 7 })).toThrow(RangeError);
    expect(() => upgradeMarkdownSections([])).toThrow(TypeError);
    expect(() => upgradeMarkdownSections({})).toThrow(/schemaVersion/);
    expect(() => upgradeMarkdownSections({ ...v5(), sections: { broken: true } })).toThrow(/sections/);
  });
});
