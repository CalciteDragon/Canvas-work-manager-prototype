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
- **Nothing may be deleted casually.** The activity feed resolves every event's target
  at commit, so a hard delete would fail the next integrity check.

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

**Deletion exists for two things only.** Sections expose `remove` as the seam for a
future permanent delete, and shortcut placements delete because they own no content and
no activity target. Everything else archives.

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

## Spec sections

§13 repository interfaces · §14 local prototype storage · §15 JSON persistence behaviour
· §74 repository migration · §76 reset.
