import type { PrototypeDocument } from '@cwm/contracts';
import { validateDocumentIntegrity } from '@cwm/repositories';
import { decodeLegacyProse, encodeLegacyProse } from './legacy-prose';

/**
 * The version-5 → version-6 converter (§14, §29; Slice 63).
 *
 * Version 6 retires the Rich Text section. Every Rich Text section — live, archived, and every
 * copy history keeps of one — becomes a Markdown section whose source is the old prose, escaped by
 * `encodeLegacyProse` so that it renders as the same prose and never as structure
 * (docs/decisions/2026-10-schema-version-6-markdown-conversion.md).
 *
 * **Where config lives.** Exactly four stored places, walked by name — never by a recursive string
 * replacement: `sections`, the `section.add` and `section.remove` snapshots, and the `before` and
 * `after` of a `section.update` config change. A `task.add` or `reflection.add` created container
 * is always a container type; one that claims Rich Text is refused.
 *
 * **A `section.update` names no type.** It is resolved by section id from every other source — the
 * live sections, the add and remove snapshots, the created containers — which must agree. An
 * update whose section appears nowhere is an orphan nothing can apply again (both Undo and Redo
 * report it missing), so it is left as it is and counted rather than refused.
 *
 * **What a config becomes.** Only a config Markdown takes (Slice 64): a string `text` becomes
 * `{ markdown: encoded }` and every other key is dropped; anything without a string `text` becomes
 * `{}`. Nothing legacy beside the prose was worth keeping, so no converted section is left holding
 * keys Markdown cannot edit; the drops are counted. Every encoding is proven to decode back to its
 * prose before anything is returned.
 *
 * **What it preserves.** Everything else: ids, titles, positions, archive state, history ids,
 * orders, states, labels, cursors, revisions and Activity.
 *
 * **Already at 6.** The same conversion runs, so a clean file comes back unchanged and a
 * consistently hand-edited one — the remedy the integrity error names — is converted.
 *
 * Frozen like the steps before it: it matches the literal `'rich-text'`, never the contracts'
 * retired list, and writes the literal version 6. It validates the final document, which is the
 * whole chain's guarantee — the steps before it return opaque JSON (§71).
 */

const SOURCE_VERSION = 5;
const TARGET_VERSION = 6;
const RICH_TEXT = 'rich-text';
const MARKDOWN = 'markdown';

type Row = Record<string, unknown>;

/** Seams for the conversion; production callers pass none. */
export interface ConvertMarkdownSectionsOptions {
  /** The encoder seam, so the round-trip refusal is testable. */
  encode?: (text: string) => string;
}

/** The converted collections and what the walk did, before any version logic or validation. */
export interface MarkdownSectionsConversion {
  sections: Row[];
  operationActions: Row[];
  /** Sections, live or archived, whose type was rewritten. */
  convertedSections: number;
  /** History payloads whose snapshot or config change was rewritten. */
  convertedPayloads: number;
  /**
   * Converted configs, in any location — sections and history alike — that lost something beyond
   * the rename: a key beside `text`, or a config with no string `text`, which becomes empty.
   */
  discardedConfigs: number;
  /** `section.update` actions whose section no source records, left as they are. */
  unreachableUpdates: number;
}

/** The validated version-6 document and the conversion counts the CLI reports. */
export interface UpgradeMarkdownSectionsResult extends Omit<MarkdownSectionsConversion, 'sections' | 'operationActions'> {
  document: PrototypeDocument;
  /** False when nothing was rewritten — a clean version-6 file. Orphans alone never set it. */
  changed: boolean;
}

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

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * **The conversion itself, without the version logic or validation.** Exported for the walk's
 * own tests, which need documents too partial to validate. Pure: the input is never mutated.
 */
export const convertMarkdownSections = (source: Row, options: ConvertMarkdownSectionsOptions = {}): MarkdownSectionsConversion => {
  const encode = options.encode ?? encodeLegacyProse;
  const sections = collection(source, 'sections');
  const actions = collection(source, 'operationActions');

  // Every source that records a section's type. They must agree: a type never changes.
  const types = new Map<string, { type: unknown; where: string }>();
  const record = (snapshot: unknown, where: string): void => {
    if (!isRow(snapshot) || typeof snapshot['id'] !== 'string') return;
    const id = snapshot['id'];
    const known = types.get(id);
    if (known !== undefined && known.type !== snapshot['type']) {
      throw new TypeError(
        `cannot convert section "${id}": ${known.where} says "${String(known.type)}" but ${where} says "${String(snapshot['type'])}"`,
      );
    }
    types.set(id, { type: snapshot['type'], where });
  };
  for (const section of sections) record(section, `sections/${String(section['id'])}`);
  for (const action of actions) {
    const operation = action['operation'];
    if (!isRow(operation)) continue;
    const where = `operationActions/${String(action['id'])}`;
    if (operation['type'] === 'section.add' || operation['type'] === 'section.remove') record(operation['section'], `${where}/section`);
    if (operation['type'] === 'task.add' || operation['type'] === 'reflection.add') {
      const container = isRow(operation['container']) ? operation['container']['section'] : undefined;
      if (isRow(container) && container['type'] === RICH_TEXT) {
        throw new TypeError(`cannot convert operation action "${String(action['id'])}": its created container is a ${RICH_TEXT} section`);
      }
      record(container, `${where}/container/section`);
    }
  }

  let discardedConfigs = 0;
  /**
   * One rule for every location, writing only a config Markdown takes: the encoded prose, or empty.
   * `discarded` is whether anything else was dropped — a key beside `text`, or a config with no
   * string `text` at all (Slice 64).
   */
  const convertConfig = (config: unknown, where: string): Row => {
    const keys = isRow(config) ? Object.keys(config) : [];
    const text = isRow(config) ? config['text'] : undefined;
    if (!isRow(config) || keys.length > (typeof text === 'string' ? 1 : 0)) discardedConfigs += 1;
    if (typeof text !== 'string') return {};
    const markdown = encode(text);
    let decoded: string | undefined;
    try {
      decoded = decodeLegacyProse(markdown);
    } catch {
      decoded = undefined;
    }
    if (decoded !== text) throw new TypeError(`cannot convert ${where}: its encoded prose does not preserve the original`);
    return { markdown };
  };

  const convertSnapshot = (snapshot: Row, where: string): Row =>
    ({ ...snapshot, type: MARKDOWN, config: convertConfig(snapshot['config'], where) });

  let convertedSections = 0;
  const convertedSectionRows = sections.map((section) => {
    if (section['type'] !== RICH_TEXT) return section;
    const where = `sections/${String(section['id'])}`;
    convertedSections += 1;
    return { ...section, type: MARKDOWN, config: convertConfig(section['config'], where) };
  });

  let convertedPayloads = 0;
  let unreachableUpdates = 0;
  const convertedActions = actions.map((action) => {
    const operation = action['operation'];
    if (!isRow(operation)) return action;
    const where = `operationActions/${String(action['id'])}`;

    if ((operation['type'] === 'section.add' || operation['type'] === 'section.remove') && isRow(operation['section'])) {
      if (operation['section']['type'] !== RICH_TEXT) return action;
      convertedPayloads += 1;
      return { ...action, operation: { ...operation, section: convertSnapshot(operation['section'], `${where}/section`) } };
    }

    if (operation['type'] === 'section.update' && Array.isArray(operation['changes'])) {
      const sectionId = operation['sectionId'];
      const known = typeof sectionId === 'string' ? types.get(sectionId) : undefined;
      if (known === undefined) {
        unreachableUpdates += 1;
        return action;
      }
      if (known.type !== RICH_TEXT) return action;
      const changes = operation['changes'] as unknown[];
      if (!changes.some((change) => isRow(change) && change['field'] === 'config')) return action;
      convertedPayloads += 1;
      return {
        ...action,
        operation: {
          ...operation,
          changes: changes.map((change, index) =>
            isRow(change) && change['field'] === 'config'
              ? {
                  ...change,
                  before: convertConfig(change['before'], `${where}/changes/${index}/before`),
                  after: convertConfig(change['after'], `${where}/changes/${index}/after`),
                }
              : change),
        },
      };
    }
    return action;
  });

  return {
    sections: convertedSectionRows,
    operationActions: convertedActions,
    convertedSections,
    convertedPayloads,
    discardedConfigs,
    unreachableUpdates,
  };
};

/**
 * Version 5 → 6, and the idempotent re-run on 6: converts every Rich Text section and history copy
 * to Markdown, then validates the final document. Throws `RangeError` for any other version and
 * `TypeError` for a refused conversion; see the module comment for the rules.
 */
export const upgradeMarkdownSections = (input: unknown, options: ConvertMarkdownSectionsOptions = {}): UpgradeMarkdownSectionsResult => {
  const source = asDocument(input);
  if (source.schemaVersion !== SOURCE_VERSION && source.schemaVersion !== TARGET_VERSION) {
    throw new RangeError(
      `cannot convert schema version ${source.schemaVersion}: this converter reads version ${SOURCE_VERSION} and writes version ${TARGET_VERSION}`,
    );
  }

  const { sections, operationActions, ...counts } = convertMarkdownSections(source, options);
  const changed = source.schemaVersion !== TARGET_VERSION || counts.convertedSections + counts.convertedPayloads > 0;
  const converted = { ...source, schemaVersion: TARGET_VERSION, sections, operationActions };
  return { document: validateDocumentIntegrity(converted), changed, ...counts };
};
