import { SCHEMA_VERSION, type PrototypeDocument } from '@cwm/contracts';
import { validateDocumentIntegrity } from '@cwm/repositories';

/**
 * The version-3 → version-4 converter (§14, §31; Slice 35).
 *
 * Version 4 replaces version 3's single-use, workspace-sequenced `undoRecords` with per-actor
 * operation histories, and gives every section an `archiveGeneration`. Legacy receipts are
 * **retired, not reinterpreted**: a version-3 record has no history, cursor or placement for an
 * add, and translating it would invent Redo state nobody recorded. Every Undo history starts
 * empty after conversion, and the CLI says so.
 *
 * Like its version-2 sibling, it reads its input as plain data — a hand-written version-3 schema
 * would duplicate a contracts shape (§11) — and validates only the output, **before** anything is
 * written. That validation is the whole chain's guarantee: the frozen version-2 step returns
 * unvalidated JSON, so a v2 file that converts to something unloadable fails here, with its
 * original untouched.
 *
 * See docs/decisions/2026-09-schema-version-4-conversion.md.
 */

/** The version this converter reads. */
const SOURCE_VERSION = 3;

export interface UpgradeOperationHistoryResult {
  document: PrototypeDocument;
  /** False when the input was already at version 4 — the no-op case. */
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

  // Already converted: validated rather than trusted, so a corrupt v4 file is still caught.
  if (source.schemaVersion === SCHEMA_VERSION) {
    return { document: validateDocumentIntegrity(source), changed: false, retiredReceipts: 0 };
  }
  if (source.schemaVersion !== SOURCE_VERSION) {
    throw new RangeError(
      `cannot convert schema version ${source.schemaVersion}: this converter reads version ${SOURCE_VERSION} and writes version ${SCHEMA_VERSION}`,
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
    schemaVersion: SCHEMA_VERSION,
    // Written explicitly rather than left to the schema default, so the file on disk says what
    // the store will read. Zero is the honest value: no version-3 removal carried a generation.
    sections: sections.map((section) => ({ ...section, archiveGeneration: section['archiveGeneration'] ?? 0 })),
    operationHistories: [],
    operationActions: [],
  };

  return { document: validateDocumentIntegrity(converted), changed: true, retiredReceipts };
};
