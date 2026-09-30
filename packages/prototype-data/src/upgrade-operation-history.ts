/**
 * The version-3 → version-4 converter (§14, §31; Slice 35), **frozen at its version-4 output**.
 *
 * Version 4 replaces version 3's single-use, workspace-sequenced `undoRecords` with per-actor
 * operation histories, and gives every section an `archiveGeneration`. Legacy receipts are
 * **retired, not reinterpreted**: a version-3 record has no history, cursor or placement for an
 * add, and translating it would invent Redo state nobody recorded. Every Undo history starts
 * empty after conversion, and the CLI says so.
 *
 * Like its version-2 sibling it reads its input as plain data — a hand-written version-3 schema
 * would duplicate a contracts shape (§11) — and, **since Slice 36, it no longer validates its
 * output**: `validateDocumentIntegrity` checks the *current* schema, which is now version 5, and a
 * version-4 document no longer matches it. The literal `4` below is deliberate for the same
 * reason: this step's contract is "read 3, write 4" forever, and reading `SCHEMA_VERSION` would
 * silently retarget it at every future bump. `upgradeActivityIdentity` validates the final
 * document before the CLI writes a byte, which is where this step's guarantee now lives.
 *
 * See docs/decisions/2026-09-schema-version-4-conversion.md and
 * docs/decisions/2026-09-schema-version-5-conversion.md.
 */

/** The version this converter reads, and the one it writes. Both frozen literals. */
const SOURCE_VERSION = 3;
const TARGET_VERSION = 4;

export interface UpgradeOperationHistoryResult {
  /** Opaque version-4 JSON: the next step in the chain validates, this one does not. */
  document: unknown;
  /** False when the input was already at version 4 or later — the pass-through case. */
  changed: boolean;
  /** How many version-3 Undo receipts the conversion retired, consumed ones included. */
  retiredReceipts: number;
}

const asDocument = (input: unknown): Record<string, unknown> & { schemaVersion: number } => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('input is not a prototype document');
  }
  const candidate = input as { schemaVersion?: unknown };
  if (typeof candidate.schemaVersion !== 'number') {
    throw new TypeError('input is not a prototype document: it has no schemaVersion');
  }
  return candidate as Record<string, unknown> & { schemaVersion: number };
};

export const upgradeOperationHistory = (input: unknown): UpgradeOperationHistoryResult => {
  const source = asDocument(input);

  // Already at version 4 or beyond: passed straight through for the next step to judge. This
  // step cannot validate it, and refusing it would break the chain for a version-4 file.
  if (source.schemaVersion >= TARGET_VERSION) return { document: source, changed: false, retiredReceipts: 0 };
  if (source.schemaVersion !== SOURCE_VERSION) {
    throw new RangeError(
      `cannot convert schema version ${source.schemaVersion}: this converter reads version ${SOURCE_VERSION} and writes version ${TARGET_VERSION}`,
    );
  }

  // `undoRecords` was a defaulted collection, so a version-3 file may not have one at all.
  const { undoRecords, ...rest } = source;
  const retiredReceipts = Array.isArray(undoRecords) ? undoRecords.length : 0;
  const rawSections = rest['sections'] ?? [];
  if (!Array.isArray(rawSections)) {
    // Never quietly replace a malformed collection with an empty one: that would write a valid
    // version-4 file with every section gone.
    throw new TypeError('cannot convert: `sections` is not an array');
  }
  const sections = rawSections as Record<string, unknown>[];

  const converted = {
    ...rest,
    schemaVersion: TARGET_VERSION,
    // Written explicitly rather than left to the schema default, so the file on disk says what
    // the store will read. Zero is the honest value: no version-3 removal carried a generation.
    sections: sections.map((section) => ({ ...section, archiveGeneration: section['archiveGeneration'] ?? 0 })),
    operationHistories: [],
    operationActions: [],
  };

  return { document: converted, changed: true, retiredReceipts };
};
