# Why repositories exist

## The problem it solves

The domain must be liftable into an MVP that stores data in Postgres through Supabase
(§72, §74), and the prototype must store it in one JSON file so that changing a data shape
costs nothing (§14). Both are true at once only if the domain talks to *interfaces* and the
JSON store is the one thing that knows a file exists (§13). The package also has to make
"persist at operation boundaries, not per property write" (§15) something a service cannot
get wrong.

## Forces

- **The whole workspace fits in memory.** A prototype workspace is kilobytes; loading it
  once and validating it whole on every commit is affordable and catches far more than a
  per-row check would.
- **Two writers can race** — the browser and an MCP client share one host — and a
  half-applied operation must never persist.
- **A crash mid-write must not corrupt the file.** Temp-and-rename is atomic on the
  platforms this runs on.
- **Nothing may be deleted casually.** Canonical references remain strict. Missing task or
  reflection Activity targets require complete matching captured historical identity.

## The shape, and the alternatives rejected

**One `DataStore` with a queued unit of work.** `unitOfWorkFor` queues operations so
that provisional state is invisible to readers until commit, a stale or outside write is
rejected, and persistence happens once. Rejected: per-repository `save()` calls — §15
names that as the thing to avoid, and Slice 12 showed why the queue matters: a
`reload()` that merely asserted "no unit open" would have swapped the document under a
unit that had been queued but not yet started. `replaceActiveDocument` therefore runs
*through* the lock, not around it.

**Document integrity at commit, not only at load.** `validateDocumentIntegrity` re-parses
the whole document and checks references, uniqueness and workspace scope, and — since the
archive phase — the ownership invariants: every row's section exists, belongs to its
project and holds its kind; a live row is never in an archived section or under an
archived parent; a parent and child share a section; every archive marker names an
archive still in progress. Rejected: leaving invariants to the write path — the document
that produced friction note `note-2026-09-01-002` was written by a correct write path and
was still wrong.

**Query semantics are defined once, in the interface's contract.** Filters combine with
AND, an empty array matches nothing, `includeArchived` is opt-in, and archived rows are
excluded by default ([decision](../../decisions/2026-08-repository-query-semantics.md)).
The JSON implementation is the reference; a Postgres one would have to match.

**Deletion exists only for safe disposable sections, safe add Undo, the Redo of a disposable
removal, safe task/reflection Add Undo, shortcut placements and history actions.** A section's `remove` seam is used only after
`SectionService` settles owned rows, checks whether content needs recovery, and verifies no
canonical task, reflection or shortcut still refers to the section — or, for add Undo, when the
added section is unchanged and no row, cascade marker or shortcut references it; Redo of a deleted
removal re-checks the same references. Actions are deleted by pruning and by a new write discarding
a redo branch; nothing references an action, so nothing can dangle. Histories are never deleted.
Integrity remains strict, and old tombstones are not purged
([decision](../../decisions/2026-09-disposable-removal-and-immediate-undo.md),
[retention](../../decisions/2026-09-operation-history-retention.md)).

**Activity identity is historical, not a canonical reference.** Undo Add may remove its task or
reflection only after the domain checks all real dependents. Earlier events remain valid because
they carry matching captured target and project/root identity; other missing targets and missing
history owners still fail whole-document validation
([decision](../../decisions/2026-09-historical-activity-identity.md)).

**A history's integrity is checked across collections, not inside one schema.** "One history per
actor and project" and "an action's order is within its history's high-water mark" need two
collections, so they live in `validateDocumentIntegrity`; the contract keeps only what one object
can assert ([decision](../../decisions/2026-09-operation-history-scope.md)).

**An `InMemoryDataStore` beside the `JsonDataStore`.** Same base, no disk — what every
domain, tool and host test runs on.

## Consequences

- Every domain operation is atomic and validated, for free.
- A read inside a unit of work sees provisional state; a read outside sees the last
  commit. Live frames are held until commit for the same reason (the host's hub).
- A stale `data.json` fails at load with the schema-version message rather than half
  way through a session; `pnpm prototype:upgrade` or a reset is the remedy.
- The whole document is cloned and validated twice per unit of work. Fine on a JSON
  document; it is why rows keep `projectId` beside `sectionId` rather than joining.
- Two processes cannot share the file: the running host does not see a stdio process's
  writes and can overwrite them ([guide](../../guides/mcp-setup.md#important-file-store-limitation)).

## Decisions that shape this system

- [How repository queries combine and compare values](../../decisions/2026-08-repository-query-semantics.md)
- [What undo means for an archived row](../../decisions/2026-09-what-undo-means-for-an-archived-row.md) — the integrity invariants
- [Container sections own their rows; view sections own nothing](../../decisions/2026-09-sections-own-their-data.md) — `sectionId` references
- [A section removal commits one scoped, expiring Undo record](../../decisions/2026-09-section-removal-undo-records.md) — the payload-not-resolved rule (records became history actions in Slice 35)
- [Undo and Redo follow one history per exact actor, per owning project](../../decisions/2026-09-operation-history-scope.md) — one history per key, strict project reference
- [One explicit write is one history action, kept for 24 hours and at most 50 per history](../../decisions/2026-09-operation-history-retention.md) — why actions delete routinely and histories never
- [Applied-state checks and an archive generation replace supersession; unrepairable actions retire](../../decisions/2026-09-operation-history-retired-actions.md) — the captured-generation integrity rule
- [A recorded Restore is a new action, and a shortcut action owns only its placement](../../decisions/2026-09-section-restore-and-shortcut-history.md) — the same generation rule now covers `section.restore`
- [Disposable removal and immediate canvas Undo](../../decisions/2026-09-disposable-removal-and-immediate-undo.md) — the canonical-reference gate before section deletion
- [Task and reflection writes join operation history](../../decisions/2026-09-row-operation-history.md) — task/reflection removal seams used only after Add-Undo preflight
- [Activity identity survives removal of its task or reflection](../../decisions/2026-09-historical-activity-identity.md) — the bounded missing-target integrity exception
- [Schema version 5 converts Activity identity explicitly](../../decisions/2026-09-schema-version-5-conversion.md) — why older files are rejected until converted

## Spec sections

§13 repository interfaces · §14 local prototype storage · §15 JSON persistence behaviour
· §74 repository migration · §76 reset.
