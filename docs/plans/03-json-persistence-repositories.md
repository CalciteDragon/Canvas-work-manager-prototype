# Slice 3 — JSON persistence + repositories

**Status:** done

## Goal

Data can be loaded from the prototype document, mutated only through repository
interfaces, and persisted once per operation boundary without risking a truncated file.

## Spec sections

§13 (domain-facing repository interfaces), §14 (one `.prototype/data.json` document),
§15 (validate on load, retain in memory, persist atomically at operation boundaries),
and §74 (JSON implementations can later be replaced without changing interfaces).

## Acceptance check

Executable, in order.

1. `pnpm --filter @cwm/repositories test` exits 0 and covers all eight repository
   implementations with insert → list → update → find against `InMemoryDataStore`.
2. The repository suite proves insert rejects a duplicate id, update rejects a missing
   id, reads and writes are detached from caller-owned references, and the existing
   `ProjectQuery`/`TaskQuery` filters work without domain behavior entering the store.
3. The data-store suite proves malformed documents fail at construction/load; an async
   unit of work awaits its callback, validates the final document, and persists exactly
   once on success. Callback, validation, temp-write, and rename failures rethrow while
   restoring the prior in-memory document and leaving the live file unchanged.
   Public store snapshots are also detached: no exported API exposes the active mutable
   document.
4. An integration test creates a real temporary `data.json`, loads it through
   `JsonDataStore`, mutates it, and verifies the persisted document parses through
   `PrototypeDocumentSchema`.
5. An injected partial/temp-write failure never calls rename and leaves the original
   `data.json` byte-for-byte intact. A separate rename failure after a complete temp
   snapshot does the same. The tests observe `write temp → rename temp over target`,
   proving a mid-write failure cannot truncate the live file.
6. `pnpm test` and `pnpm lint` both exit 0.
7. The Slice 3 status in `development.md` is `done`; this plan records review changes;
   and `.prototype/notes.json` records friction found while exercising the real JSON
   store. No product decision entry is required unless implementation answers a product
   question.

## File-level change list

- `packages/repositories/package.json` — add the contracts dependency, Vitest and Node
  types, and a package test script.
- `packages/repositories/tsconfig.json` — enable Node types for the filesystem-backed
  store and its temporary-directory tests.
- `packages/repositories/src/interfaces.ts` — export the eight repository interfaces.
  `ProjectRepository` and `TaskRepository` use the contract-owned query types; the six
  repositories with no contract query type expose parameterless `list()` for now.
  Every interface exposes `find`, `list`, `insert`, and `update`, matching §13 and the
  slice acceptance sequence without guessing future service APIs.
- `packages/repositories/src/data-store.ts` — define the shared in-memory document
  access used by implementations; validate contract shape and document integrity at
  load and persist boundaries; implement `InMemoryDataStore`,
  `JsonDataStore.load(path)`, `persist()`, and async `runUnitOfWork(fn)`. A unit of work
  switches repositories to an isolated working clone, awaits the callback, validates,
  and persists it; only successful persistence retains that clone. Every failure
  restores the prior in-memory document and rethrows. JSON persistence writes a
  complete sibling temp file and then renames it over the target. A narrow, internal
  file-operations seam makes failure and ordering assertions deterministic. Exported
  store instances expose only a deep-cloned `snapshot()`; the active mutable document
  accessor is internal to this package and omitted from the public barrel.
- `packages/repositories/src/json-repositories.ts` — implement all eight named
  `Json*Repository` classes over either store. A small internal collection base handles
  clone-on-read/write, duplicate-id rejection, missing-update rejection, and common
  CRUD; named implementations own only their collection and list filtering.
- `packages/repositories/src/errors.ts` — repository conflict/not-found errors and a
  `DocumentIntegrityError`, so callers can distinguish storage failures
  without importing an implementation.
- `packages/repositories/src/index.ts` — replace the placeholder and export the public
  interfaces, stores, implementations, and errors.
- `packages/repositories/src/repositories.test.ts` — parameterized CRUD contract tests
  for all eight implementations plus query/filter, clone, duplicate, and missing-update
  tests, all using the literal-backed in-memory store.
- `packages/repositories/src/data-store.test.ts` — invalid-document, reference,
  unit-of-work, real disk round-trip, and interrupted atomic-write tests.
- `docs/decisions/2026-08-repository-query-semantics.md` — record the first concrete
  behavior for the already-defined ProjectQuery/TaskQuery fields: filters compose with
  AND; enum arrays use membership; missing due dates do not satisfy date filters;
  `dueBefore`/`dueAfter` are exclusive; search trims the query, matches name/title or
  description case-insensitively, and an empty trimmed search is a no-op. Revisit when
  Slice 5/11/21 exposes the behavior in real UI/API use.
- `pnpm-lock.yaml` — record workspace dependency/devDependency edges.
- `development.md` — mark Slice 3 in progress at phase start and done only after every
  acceptance command passes.
- `.prototype/notes.json` — append only friction observed while using the implemented
  store; no aspirational note.
- `docs/plans/03-json-persistence-repositories.md` — keep this plan current and record
  iterative subagent review revisions.

## Test plan

Tests are written and run red before their corresponding implementation.

- `rejects a document that fails PrototypeDocumentSchema` — neither store can begin
  from malformed contract data.
- `rejects dangling cross-collection references at a store boundary` — the store owns
  the document integrity deliberately excluded from the contract schema. Tests cover
  unique ids within every collection; workspace owner; user workspace; project
  workspace and parent; section/task/milestone/reflection project; task parent; agent
  user; and activity workspace, user/agent actor, optional project, plus an `entityId`
  that exists in the collection named by `entityType`. Parent projects must share the
  child's workspace and parent tasks must share the child's project. An activity's
  optional project must match the target entity's project when that entity is
  project-scoped. Workspace owners must belong to the workspace they own. Every
  activity target and optional project must resolve to the event's workspace, and a
  user or agent actor must resolve to a user in that same workspace. These are
  structural unambiguity and scope-consistency rules, not business policy.
- `persists once after a successful unit of work` — multiple repository writes inside
  one callback cause one persistence call, not one per property/entity mutation.
- `awaits an async unit of work and persists once` — mutations after an await are part
  of the same single validated snapshot and the callback result is returned.
- `rolls back a failed or invalid unit of work` — callback exceptions and invalid final
  references never reach persistence and restore the prior in-memory snapshot.
- `rejects nested and overlapping units of work` — a held-open async callback makes a
  nested call and a concurrent external call reject deterministically without an extra
  persist or snapshot change; the first unit can then finish once and the store remains
  usable for a later unit.
- `loads and atomically round-trips a real JSON document` — verifies actual Node file
  I/O and contract-valid output, not only mocks.
- `keeps disk and memory intact when the temp write fails` — a simulated partial write
  failure never calls rename, leaves the old target unchanged, and rolls the working
  snapshot back.
- `keeps disk and memory intact when rename fails` — after the complete temp snapshot
  write, a simulated interruption at rename leaves the old target unchanged, rolls the
  working snapshot back, and demonstrates write-before-rename ordering.
- `Json<Project|Task|Section|Milestone|Reflection|Activity|AgentConnection|User>Repository
  supports insert, list, update, and find` — one parameterized contract, with distinct
  valid entities and ids, proves every named implementation follows the same storage
  semantics.
- `rejects duplicate insert and update of a missing id` — collection integrity failures
  are explicit rather than silently overwriting or upserting.
- `detaches values on find, list, insert, and update` — mutating a returned entity or a
  caller-owned input after the repository call cannot bypass an update or operation
  boundary. Nested values (agent permissions, user dashboard preferences, and section
  config) prove this is a deep rather than shallow clone.
- `filters project and task lists using contract queries` — all fields are exercised;
  filters compose with AND, arrays use membership, missing due dates fail date filters,
  due bounds are exclusive, search is trimmed and case-insensitive over name/title plus
  description, and an empty trimmed search is a no-op.
- `returns a detached public store snapshot` — mutating nested snapshot data cannot
  change subsequent snapshots or repository-visible entities; no active-document
  accessor is exported from the package barrel.

## Boundaries touched

- **Domain services depend on repository interfaces (§8, §13, §74).** Interfaces and
  concrete JSON implementations are separate exports; no domain or transport package
  is imported.
- **Contracts exist once (§8, §11).** Entity, id, query, and document types/schemas are
  imported from `@cwm/contracts`; this package defines no parallel entity shapes.
- **Persistence stays infrastructure (§14, §15).** Repositories store/retrieve and
  filter only. They do not create ids/timestamps, compute status/progress, authorize,
  emit activity, or broadcast events.
- **Operation boundaries stay above property writes (§15).** Repository methods mutate
  an isolated in-memory working snapshot only. `runUnitOfWork` awaits the callback,
  validates and calls `persist()` once, then retains the snapshot only after persistence
  succeeds. Failure restores the prior snapshot.
- **Mutable document access stays package-internal.** Store classes are public because
  callers construct and run them, but their only document view is a deep snapshot.
  Repositories import a non-barrelled internal accessor, preventing ordinary package
  consumers from bypassing repository and unit-of-work rules.
- **No clock boundary is crossed.** This package creates no timestamps and contains no
  `new Date()`.

## Explicit non-goals

From the slice: no SQLite or Postgres (§14), and no domain logic. Also deferred:

- No seed builders or committed `data.json`; Slice 4 owns seeds and first real datasets.
- No host/API wiring, services, gateways, Angular changes, MCP, broadcasts, auth, or
  activity creation; later slices own those operation callers and transports.
- No delete API: §13 and this slice require insert/list/update/find only.
- No migrations or silent schema coercion: a stale/invalid `schemaVersion` fails load.
- No general transaction engine, locks, concurrent-writer coordination, journaling, or
  recovery of abandoned temp files. Nested or overlapping units of work are rejected;
  the prototype has one process and one JSON file.
- No repository for workspaces: the slice names exactly eight interfaces and omits it;
  workspaces enter through validated seeds and remain directly part of the document.

## Open questions

None that change the shape of this slice. The two contract-owned query types receive
fully specified behavior recorded in the decision log; the other six lists remain
parameterless until a real consumer earns a query surface. §74 permits evolving the
interfaces without coupling them to JSON.

## Revisions

- Initial plan written from the Slice 3 text, current contract schemas, and §13/§14/§15/§74.
- Round 1: made unit-of-work callbacks async and transactional in memory as well as on
  disk; added rollback coverage for callback, validation, temp-write, and rename
  failures; added deep clone-on-write coverage; specified and logged every ProjectQuery/
  TaskQuery behavior; and removed speculative filters from the other six repositories.
- Round 2: confined active-document access to an internal non-barrelled capability;
  made public snapshots detached; enumerated duplicate-id, foreign-key, parent-scope,
  and activity-target integrity; and added deterministic nested/overlapping unit tests.
- Round 3: added workspace consistency for owners and for every activity target,
  project, and user/agent actor; renamed the general validation failure to
  `DocumentIntegrityError` because it covers more than dangling references.
- Round 4: no substantive plan findings remained.
- Implementation review: isolated provisional documents with async-operation contexts;
  added per-operation lifecycle tokens so outside and stale descendant writes reject;
  replaced mocked atomicity claims with real-file temp-write and rename failure tests;
  normalized malformed JSON/schema failures to `DocumentIntegrityError`; and added the
  query-semantics decision entry. The storage-level exercise reloaded the committed
  project/task changes and confirmed no temp file remained; host/UI/MCP use is not yet
  applicable because Slices 4, 5, and 15 own those paths.
