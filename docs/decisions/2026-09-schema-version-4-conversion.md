# Schema version 4 converts explicitly, retires version-3 receipts, and chains two named steps

**Question**

Operation histories change what the §14 document holds: `undoRecords` goes, two collections and a
per-section `archiveGeneration` arrive
([Slice 35](../roadmap/completed/35-operation-history-foundation.md)). Slice 30 added `undoRecords`
*inside* version 3 as a defaulted collection with no bump. §14 also said the version-2 converter
was "deliberately not … a version chain; the next cutover writes its own or resets". Removing a
collection and reinterpreting its records is not additive, so the question was whether to bump,
how to convert, and what happens to receipts people already hold.

**Options tested**

- *Stay at version 3 with more defaulted collections*: an older build would silently strip the new
  collections, and nothing would stop a version-3 build from loading a document whose
  `undoRecords` had already been dropped. Rejected: removing a collection is exactly "a change that
  would make an existing file wrong".
- *Reset instead of converting*: a developer's real data file is worth keeping, which is why a
  converter exists at all. Rejected.
- *Translate receipts into history actions*: a version-3 record has no history, no cursor, no
  placement for an add and no generation for a removal, so any translation would invent Redo state
  nobody recorded. Rejected; receipts are retired with a notice.
- *A migration registry*: §71 and §80 still rule out a framework for two steps. Rejected.
- *Two named converters in a fixed order, behind one CLI*: kept.

**What we learned**

The version-2 converter imported `SCHEMA_VERSION` and validated its output against the current
schema, so the bump would have made it produce a version-4 number over a version-3 shape — and
reject every version-3 document it was handed. Freezing it at a literal `3` and returning opaque
JSON fixed both, at the cost of its own validation; the version-4 step validates the final
document before a byte is written, so the guarantee moved rather than disappeared.

**Current decision**

- `SCHEMA_VERSION` is 4. `PrototypeDocumentSchema` has `operationHistories` and
  `operationActions` (defaulted, so a hand-written document without them parses to empty stacks)
  and no `undoRecords`; a leftover `undoRecords` key is stripped. A version-3 file refuses to load
  with the existing remedy message naming `pnpm prototype:upgrade`.
- `upgradeProjectPages` is frozen: it reads version 2, writes version 3 (`V3_SCHEMA_VERSION`), no-ops
  on version 3, refuses anything else, and does not validate.
- `upgradeOperationHistory` reads version 3, drops `undoRecords` (counting them), writes an explicit
  `archiveGeneration: 0` on every section and empty history collections, and validates the version-4
  result; it no-ops on a valid version-4 file.
- `pnpm prototype:upgrade <path>` sniffs the version first, runs version 2 → 3 → 4 or 3 → 4,
  validates, writes the untouched original beside the file as `*.backup-*.json`, then writes the new
  file through a temp-file rename. It prints the version it converted from and, when it retired any,
  how many version-3 receipts it retired and that Undo and Redo history starts empty. A failed
  conversion writes nothing.
- §14's "not a version chain" sentence is amended: the chain is two named, explicit steps run by the
  one CLI, still not a runner or registry.

**Confidence**

High for the conversion mechanics, which the CLI subprocess test runs over committed v2 and v3
fixtures. Medium for retiring receipts: nobody is expected to hold a meaningful one across the
upgrade, but that is an assumption.

**Revisit when**

A third cutover arrives — at which point writing a third named step versus resetting is the
question again — or someone reports losing an Undo they needed across an upgrade.

**Amended, 2026-09-18 — Slice 36.** The third cutover arrived. The 3 → 4 converter remains frozen at
literal version 4 and its history output is preserved unchanged. A new named 4 → 5 step backfills
required historical Activity context from canonical targets, refuses rather than inventing a
missing or cross-workspace identity, and validates the final version-5 document. The CLI chains
2 → 3 → 4 → 5 as needed; only version-3 receipts are retired
([decision](2026-09-schema-version-5-conversion.md)).
