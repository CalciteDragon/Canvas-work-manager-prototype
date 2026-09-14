<!-- completed-record id="30" closed="2026-09-14" summary="Every section removal returns a receipt that undoes it once, for the same actor, between its old neighbours, over HTTP and MCP" -->
# Slice 30 — Atomic, placement-aware section removal Undo

## Goal

Reverse one section removal atomically, with exact affected content and historical placement where possible.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§10–13, 17–21, 25–27; main §§8, 11–15, 18, 27, 31, 45, 53, 57, 62.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 29. Add shared Zod schemas for versioned inverse operations, placement snapshots, receipts and typed outcomes; start with section removal only. Store records through a repository interface inside the caller-owned UnitOfWork, with injected Clock. Neither ActivityEvent nor live frames contain inverse snapshots.
- Capture section/config, exactly the rows changed by cascade or reassignment (including moved pre-archived rows), cascade markers and combined section/shortcut placement before mutation. Pair inverse data with sufficient postconditions to detect conflicting later writes.
- Implement a narrow Undo recorder/executor in domain. Keep the graph acyclic: SectionService may use a recorder, but Undo must not call back through public methods that start nested units or compose TaskService/ReflectionService back into SectionService. Prefer pure internal mutation helpers over a generic command bus.
- Gate before implementation: settle storage version/compatible upgrade of existing v3 files (preserve user data), retention/expiry bounds, consumption/retry result, actor-versus-agent connection ownership, current minimum grants, conflict refusal and disabled/missing-page behavior. Undo may not silently overwrite later edits or bypass an archived-ancestor freeze. Document these decisions and dependency edges before code.
- Use the combined order in `page-placements.ts`: previous surviving neighbor, else next, else clamped index. A missing original page uses a deterministic same-project, type-compatible fallback with a partial result; unavailable/forbidden recovery refuses atomically. Preserve unrelated siblings' edit timestamps.
- Wire a receipt and undo execution through host and transport-free MCP services with shared contracts. Do not promise a receipt before commit; no-op/refused operations create neither history nor undo. Keep snapshot storage separate from live-reference integrity checks so retained inverses can name later-deleted sections.
- Update contracts, domain, repositories, prototype-data, host API/live-updates and MCP architecture; upgrade/seed guidance and main spec where adopted. Include recorder failure and persistence rollback seams in the active file list.

## Done when

Tests first prove one receipt per multirow removal; rollback on recorder, validation and persistence failures; one committed activity/live publication; no publication on rollback; exact cascade/reassignment inverse; unchanged independently archived states; previous/next/fallback placement with shortcut neighbors; page fallback/refusal; stale content conflict; foreign user/workspace/connection and revoked/minimal grants; consumed/expired receipt behavior. Verify a v3 fixture upgrades without loss and reload preserves usable records. Run pnpm test, pnpm lint and host/MCP acceptance. Refactor §26 criteria 7–12 have domain evidence before deletion starts.

## Do not

- Hard-delete sections yet, add the browser Undo surface, implement Redo, event sourcing, arbitrary JSON commands, a parallel datastore, unlimited history or undo every mutation.

## Planning status

Activated for the user's plan-only request on 2026-09-14. This document specifies future
implementation; no runtime changes or implementation acceptance are claimed. Slice 29 is
complete. Stop after plan review and documentation validation; leave Slice 30 active for
implementation. Bump `CURRENT_SLICE` to 30 when runtime implementation begins, before app use.

**Implemented 2026-09-14** in a following session (`CURRENT_SLICE` bumped first); acceptance
steps 1–7 were run and are recorded in the Outcome.

## Implementation design

### Settled gates

The seven gates are settled as planning choices in
[section removal Undo records](../../decisions/2026-09-section-removal-undo-records.md), pending
implementation. In short: schema version 3 with a defaulted `undoRecords` collection and no
converter; 24-hour expiry by `Clock` and at most 50 records per workspace, pruned while
recording; a successful Undo consumes the record and a repeat is a typed `undo_consumed`
refusal; only the exact removing actor (same user, same agent connection, or system) may undo,
under a current `projects.write` grant; structural postconditions decide conflicts and
non-structural edits are preserved, and a newer record for the same section supersedes an older
one; disabled pages are restored to; a missing page (unreachable until Slice 31) falls back to the
canonical page as `partial`, or refuses as `undo_unavailable`; removal inside an archived project
still issues a receipt that is `undo_blocked` until reactivation. Decision rule 8 records the
dependency edges.

### Contracts — one new module, `packages/contracts/src/undo.ts`

All shapes are Zod schemas exported through the existing barrel; nothing is redeclared in domain,
host, MCP or web.

- `UndoRecordIdSchema` joins `ids.ts` (brand `UndoRecordId`; generated as `undo-xxxxxxxx`).
- `PlacementRefSchema`: `{ kind: 'section' | 'shortcut', id }`.
  `PlacementSnapshotSchema`: strict `{ pageId, previous?: PlacementRef, next?: PlacementRef, index }`,
  `index` a `PositionSchema` in the page's combined live order before removal.
- Row structural states: task `{ sectionId, parentTaskId?, archivedAt?, archivedWithSectionId?, archivedWithTaskId? }`;
  reflection `{ sectionId, archivedAt?, archivedWithSectionId? }`. A row change is
  `{ kind: 'task' | 'reflection', id, before, after }`, discriminated by `kind`.
- `SectionRemoveUndoOperationSchema` (strict): `version: 1`, `type: 'section.remove'`,
  `section` (the complete pre-removal `ProjectSection`, config included), `placement`,
  `appliedPolicy: 'none' | 'cascade' | 'reassign'`, `reassignToSectionId` (present exactly for
  reassign), `rows`, and `postSectionArchivedAt`. `appliedPolicy` is what `settleRows` **did**,
  not what the caller sent: `RemoveSectionInputSchema` accepts `policy: 'reassign'` without a
  target, and `settleRows` returns before inspecting it when nothing is live (and views never
  reach it), so such removals succeed today and must record `none` rather than roll back on a
  refinement. Refinements: unique row ids; every row kind matches `ownedKindOf(section.type)`;
  `rows` empty exactly when `appliedPolicy` is `none`. No disposition field: Slice 31 adds an
  optional one (or `version: 2`) when hard deletion exists, and must keep executing retained
  `version: 1` records.
- `UndoOperationSchema`: `z.discriminatedUnion('type', [SectionRemoveUndoOperationSchema])` —
  the typed, versioned extension point Slices 31–32 grow; an unknown `type` or `version` fails
  parsing rather than executing arbitrary JSON.
- `UndoRecordSchema`: `{ id, workspaceId, projectId, actor, actorUserId?, actorAgentConnectionId?,
  sequence, label, createdAt, expiresAt, consumedAt?, operation }`, with `expiresAt > createdAt` and the
  same attribution rule as activity. `sequence` is a positive integer, one more than the highest
  sequence among the workspace's records, computed **before** pruning (1 when none exist), and is the **only**
  order the domain uses between records: `createdAt` can go backwards when the dev panel sets the
  `SimulatedClock`, ties within one instant, and production ids are random, so neither timestamp
  nor id can say which record is newer. Integrity rejects duplicate sequences within a workspace. Generalise `assertActorIsAttributable` in `activity.ts` to
  the three attribution fields so both schemas share one rule rather than copy it.
- `UndoRecordQuerySchema`: `{ workspaceId? }`, the repository's query shape.
- `UndoReceiptSchema` (strict): `{ undoId, operation: 'section.remove', label, createdAt, expiresAt }` —
  no snapshot, actor or row ids.
- `SectionRemovalResultSchema`: `{ section: ProjectSection, undo: UndoReceipt }`.
- `UndoInputSchema` (strict): `{ undoId }`.
- `UndoResultSchema`: `{ undoId, operation, outcome: 'restored' | 'partial', section,
  placement: { pageId, index, strategy: 'previous' | 'next' | 'index' | 'fallback-page', pageEnabled },
  restoredRowCount }`.
- `UndoRefusalDetailsSchema`, discriminated on `reason`, carried by `DomainRuleError.details`
  into the existing HTTP 409 envelope:
  `undo_consumed { undoId, consumedAt }`; `undo_expired { undoId, expiresAt }`;
  `undo_conflict { undoId, conflicts: [{ entityType: 'section' | 'task' | 'reflection', id, problem }] }`
  with `problem` in `missing | not-archived | archived-differently | superseded | moved |
  archive-state-changed | reparented | new-dependent`; `undo_blocked { undoId, blockingProjectId }`;
  `undo_unavailable { undoId, problem: 'no-compatible-page' | 'shortcut-on-fallback-page' }`.
  **MCP has no details mapping** (`apps/prototype-host/mcp/server.ts` lets errors propagate and the
  SDK returns message text only), so every refusal message starts with its reason token —
  `undo_consumed: …` — and MCP tests assert on that text. The format is pinned:
  `<reason>: <human sentence>` for every reason, and for conflicts the sentence lists
  `<entityType> <id> <problem>` pairs joined by `; ` — the section first, then snapshot rows in snapshot order, then dependents in
  collection order (for example
  `undo_conflict: section section-1 superseded; task task-3 moved`). Not-found stays an
  `EntityNotFoundError` with no token, so it cannot confirm a foreign record exists. Structured MCP error payloads are a non-goal.
- `document.ts`: `undoRecords: z.array(UndoRecordSchema).default(() => [])`; `SCHEMA_VERSION` stays 3,
  and its comment says why this addition needs no bump and that an older build (the document
  schema is not strict) strips the collection on its next commit — undo history lost, no user data.

### Repositories

`UndoRecordRepository` in `interfaces.ts`: `find`, `list(query?: UndoRecordQuery)`, `insert`,
`update`, `remove` (records are pruned, so this collection deletes; its doc comment says why that
is safe — nothing references a record). `JsonUndoRecordRepository` over the `undoRecords`
collection with the existing mutation guard; exported from the barrel.

`validateDocumentIntegrity` adds one pass: unique record ids; workspace exists; project exists
and belongs to that workspace; a user actor exists in the workspace; an agent actor's connection
exists and its user is in the workspace. It deliberately does **not** resolve the snapshot's
section, page, shortcut, task or reflection ids — a comment names Slice 31's hard delete as the
reason — so retained inverses can outlive what they name. Canonical-row integrity is unchanged.

`scripts/check-package-imports.mjs` adds `UndoRecordRepository` to
`ALLOWED_REPOSITORY_BINDINGS`; without it `pnpm --filter @cwm/domain lint` rejects the recorder
and service. The repositories barrel is `export *` and needs no edit.

### Domain — recorder, executor, one new service, no cycle

- **`owned-rows.ts` (new, internal):** `rowsOf` and `writeRow` extracted verbatim from
  `SectionService` (schema-parsed row writes that stamp `updatedAt`), so both removal and its
  inverse use one mutation helper without composing `TaskService`/`ReflectionService`.
- **`page-placements.ts`:** two pure additions. `snapshotPlacement(ordered, subject)` returns the
  subject's `PlacementSnapshot` from the combined live order. `resolveRestoreIndex(snapshot, current)`
  returns `{ index, strategy }`: after the previous neighbor when a placement of that kind and id
  is in `current`; otherwise before the next; otherwise `min(snapshot.index, current.length)`.
  A neighbor archived, removed, or now on another page is absent from `current` and so has not
  survived. `renumberPlacements` is reused unchanged.
- **`undo-recorder.ts` (new):** `UndoRecorder` interface — `record(actor, { projectId, label,
  operation }): Promise<UndoReceipt>` — and `RepositoryUndoRecorder` over
  `{ undoRecords, clock, ids }`. It never opens a unit of work and asserts no grant (its caller did,
  as with `ActivityService.record`). It parses the record through `UndoRecordSchema`, prunes the
  actor workspace's expired records, then removes the lowest `sequence` until at most
  49 remain — and whenever it prunes a record it also prunes every lower-sequence record naming the
  same section, so an older record can never outlive the newer one that supersedes it — inserts, and returns the receipt — so the workspace holds at most
  `UNDO_RECORD_LIMIT = 50`, consumed records included. `UNDO_RECORD_LIFETIME_MS` is 24 hours.
  `expiresAt` is computed without the banned `new Date`: take `clock.now()` (already a clone),
  `setTime(getTime() + lifetime)`, `toISOString()`; expiry is checked as
  `clock.now().getTime() >= Date.parse(expiresAt)` (the precedent in `agent-connection-service.ts`;
  both instants are written at millisecond precision by this code). The interface is the
  recorder-failure test seam.
- **`section-removal-undo.ts` (new, internal):** the capture and inverse for one operation type.
  `captureSectionRemoval` assembles the operation from the pre-removal section, placement snapshot,
  the policy `settleRows` applied and the row changes it reports, plus the post-removal `archivedAt`.
  `resolveUndoDestination` is a **pure** function: given the snapshot's page, whether it exists, the
  project's canonical page, and the shortcuts on that page, it returns the original page, or the
  canonical page (strategy `fallback-page`, appended, outcome `partial`) when it accepts the type and
  no shortcut there names the section, or `undo_unavailable`. In a valid document a retained section's
  page always exists (integrity rejects a section on a missing page; pages have no `remove`; archived
  sections cannot be edited), so the fallback is reachable only once Slice 31 recreates deleted
  sections; this slice proves the fallback and its refusals **at the resolver level only**: the
  executor calls the resolver, but step 2 refuses a missing section first, so the fallback branch is
  unreachable through it. Slice 31 must relax that missing-section conflict for sections it
  deliberately deleted before the fallback runs end to end (recorded in the decision's Revisit when).
  `executeSectionRemovalUndo(repositories, clock, record)` runs inside the caller's unit and:
  1. loads the project; not found → `EntityNotFoundError`; archived self/ancestor →
     `undo_blocked` naming the highest blocker (reuse `project-visibility.ts`; add a non-throwing
     blocker finder there if the existing API only throws);
  2. collects every conflict before writing (decision rule 6): the section missing, live,
     `archivedAt` different, or `pageId` different from the snapshot (`moved`); **any newer undo record
     (higher `sequence`, of any actor, consumed or not) naming the same section id** (`superseded` — an Archive Restore and
     re-removal within one clock instant would otherwise reproduce identical timestamps and states);
     snapshot rows missing or structurally different; dependent scans of the project's
     tasks/reflections — an unrecorded row whose `archivedWithSectionId` names the section, or an
     unrecorded task whose `parentTaskId` or `archivedWithTaskId` names a moved task. Any conflict →
     one `undo_conflict` listing all of them;
  3. resolves the destination through `resolveUndoDestination` (the current page in every valid
     document);
  4. reads `listPlacements(destination)` **before** writing the section live (so the subject is not
     in the list at its stale position), resolves the index against that list, splices in the
     un-archived section (`archivedAt` removed, `updatedAt` now), writes the section record
     explicitly (so it becomes live even when its stale position equals the target index, which
     `renumberPlacements` would skip), then calls `renumberPlacements` with it as subject so siblings
     keep their `updatedAt`;
  5. writes each snapshot row back to its `before` structural state with `writeRow`, keeping every
     other field as it is now; returns the `UndoResult`.
- **`undo-service.ts` (new):** `UndoService.undo(actor, undoId)`. `assertValidActor`, then
  `assertPermitted(actor, 'projects.write')` before any read; then one unit of work: find the
  record; not found when absent, in another workspace, or created by a different actor identity
  (checked before any state is revealed); `undo_consumed`; `undo_expired` when `now >= expiresAt`;
  dispatch on `operation.type` (a `switch` with an exhaustive `never` default, not a registry);
  every refusal is a `DomainRuleError` whose message starts with its reason token and whose details
  parse as `UndoRefusalDetails`;
  stamp `consumedAt`; record exactly one `project.section_removal_undone` event against the project
  (`Undid removing the <name> section`); return the result. Dependencies: `undoRecords`, `sections`,
  `shortcuts`, `pages`, `projects`, `tasks`, `reflections`, `activity`, `clock`, `unitOfWork`.
  **No** `SectionService`, `TaskService`, `ReflectionService` or recorder dependency.
- **`SectionService`:** gains `undo: UndoRecorder`. `remove` keeps every existing refusal first, then
  reads the combined order and snapshots the subject before any write; `settleRows` returns the
  policy it applied and the row changes it wrote (`none`/`[]` for no live rows or a view, cascade:
  live rows only, reassign: every moved row including pre-archived ones); archiving, renumbering and
  the `project.section_archived` event are unchanged; finally it calls `undo.record` and returns
  `SectionRemovalResult`. The receipt is the resolved value of `unitOfWork.run`, which resolves only
  after commit **for a top-level call** — `unitOfWorkFor` joins a nested call, so `remove`'s doc
  comment says a composer that nests it inside another unit must not hand the receipt on before its
  own commit (nothing nests `remove` today). Removal stays allowed inside an archived project and
  still returns a receipt; Undo answers `undo_blocked` until the project is reactivated, then works
  if the record has not expired. `restoreSection` (Archive Restore) and every other method are
  unchanged.
- **Dependency edges after the slice** (recorded as decision rule 8, not only here):
  `TaskService`/`ReflectionService` → `SectionService` → `{ActivityService, UndoRecorder}`;
  `UndoService` → `ActivityService`. The only new *kind* of edge is `SectionService → UndoRecorder`,
  an interface over one repository, used the way `ActivityService.record` is. `UndoService →
  ActivityService` is the existing "writing services compose `ActivityService`" edge. Modules
  `owned-rows.ts`, `section-removal-undo.ts`, `page-placements.ts` and `project-visibility.ts` are
  shared functions, not services. AGENTS.md's boundary sentence and domain `how.md` name the
  recorder edge and that `UndoService` composes no section, task or reflection service.

### Host, MCP and live updates

- `persistence/store.ts` adds `undoRecords`; `api/services.ts` builds `RepositoryUndoRecorder`,
  passes it to `SectionService`, and builds `UndoService` over the hub-wrapped unit of work.
  `main.ts` and `mcp/stdio.ts` build `WorkManagerServices` by hand and add `undo: api.undo`, or
  host `tsc` fails and the real MCP server has no service for `undo_operation`.
- `api/routes.ts`: `DELETE /api/sections/:id` answers **200** with `SectionRemovalResult` instead
  of 204; refusals are unchanged. New `POST /api/undo/:id` answers `UndoResult`; refusals use the
  existing 409 envelope with `UndoRefusalDetails`, not-found 404, grant 403. The `noContent`
  comment in `routes.ts` is updated. The web gateway's `sections.remove` already discards the
  response; its stale "204" comments (adapter and `work-manager-gateway.ts`) change, and the
  adapter spec that mocks an empty 204 is retitled to mock the 200 JSON body it now ignores.
  Receipt consumption in the web app is Slice 31's.
- MCP: `WorkManagerServices` gains `undo`; `remove_section` returns `SectionRemovalResult` and says
  so; new `tools/undo.ts` defines `undo_operation` (`{ undoId }`, permission `projects.write`),
  whose description explains exact-actor scope, consumed/expired/conflict/blocked/unavailable
  refusals and that Archive Restore remains the durable path. `SPEC_TOOL_NAMES` places it after
  `restore_section`; the registry grows to thirty-four tools.
- Live updates need no new code: both writes publish only the one `ActivityService.record` frame,
  buffered by `LiveEventHub` until commit and dropped on rollback. `project.*` frames already
  refresh project and root views.

## Acceptance check

The original **Done when** above is the completion contract.

1. **Tests first.** Write the named tests below; watch the new behaviour assertions fail for the
   missing behaviour (missing export, 204 instead of receipt, no record), then implement minimally.
   Regression tests of unchanged behaviour may pass on first run; keep them.
2. Run as increments land: `pnpm --filter @cwm/contracts test`, `pnpm --filter @cwm/repositories test`,
   `pnpm --filter @cwm/domain test`, `pnpm --filter @cwm/prototype-data test`,
   `pnpm --filter @cwm/mcp-tools test`, `pnpm --filter @cwm/prototype-host test` and
   `pnpm --filter web test`. Finish with `pnpm test`, `pnpm docs:api`, `pnpm lint` (includes
   `pnpm docs:check` and the domain import/date lints). Record results and skips honestly.
3. **Compatibility.** `packages/prototype-data/test/fixtures/nested-projects-v3.json` is the
   committed `nested-projects` snapshot as it is before this slice (no `undoRecords`). Its test
   loads it into a `JsonDataStore` over in-memory file operations (no seed builder change is needed:
   `seeds.ts` already parses through the schema, so only the six snapshots are regenerated), asserts every existing
   collection deep-equals the fixture and `undoRecords` is `[]`, commits an empty unit, reloads the
   written bytes and asserts equality again. The domain reload test removes a section in that store,
   reloads the bytes into a new store and services, and undoes successfully.
4. **Host/MCP acceptance.** With dev servers stopped: `pnpm --filter @cwm/prototype-host acceptance`
   (on `personal-workspace`, remove the **first** placement of its page so Undo's original index
   differs from Archive Restore's append; HTTP removal receipt, `POST /api/undo/:id`, section back
   first with neighbor order asserted, repeat refused
   as `undo_consumed`) and `pnpm --filter @cwm/prototype-host mcp-acceptance` (both transports list
   the exact thirty-four-tool registry; on `agent-heavy`. Its `prototype-user-a-readwrite` token maps to
   `agent-claude`, which lacks `projects.write`, so the script adds that grant to the connection in
   its **copied temp data file** before starting the servers — the seed itself is not changed. Then
   `remove_section` of `section-project-work-manager-tasks` (the middle of a three-placement page, 4
   live tasks) with `policy: 'cascade'` returns a receipt; `undo_operation` restores it between the
   same neighbors with those tasks live again; repeat returns `isError` whose text starts `undo_consumed:`; persisted file after
   restart shows the section live and the record consumed). `live-acceptance` and
   `agent-acceptance` still pass. `pnpm e2e` is not required (no browser surface changes) but
   `archive.spec.ts` still passes if run, since its DELETE helper accepts a JSON body.
5. **Refactor §26 evidence (criteria 7–12)**, each by named domain tests: 7 separation
   (activity/frame carry no inverse); 8 atomic promise (recorder/validation/persistence rollback,
   receipt only after commit); 9 one operation (one receipt per multirow removal, cascade/reassign
   undo); 10 fidelity split (placement suite versus the unchanged Archive Restore append test);
   11 integrity (undo commits a valid document, conflict refusal, records survive references they
   name); 12 Redo path (operation union is typed and versioned, and the executor's per-type
   dispatch — design evidence, no Redo behaviour).
6. **Real use.** Start `pnpm dev:host`, load `nested-projects` from the dev panel, and with a real MCP
   client (per `docs/guides/mcp-setup.md`) remove a Progress view between Home neighbors, a cascaded
   task list and a reassigned one, then undo each; interpose a shortcut move before one Undo and try
   one conflicting edit. Check the browser canvas refreshes live. Record observed friction through the
   dev panel into `.prototype/notes.json` with slice 30. Do not invent observations from tests.
7. Review the implementation diff with subagents (correctness/spec; boundaries/docs), fix verified
   findings, re-run affected checks, write Outcome, complete via `roadmap.mjs`, update goals. This
   plan-only session does not execute steps 1–7.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/ids.ts` | modify | `UndoRecordIdSchema` |
| `packages/contracts/src/undo.ts` | create | Operation, snapshot, record, receipt, result, refusal and input schemas |
| `packages/contracts/src/undo.test.ts` | create | Schema acceptance/rejection cases below |
| `packages/contracts/src/activity.ts` | modify | Attribution refinement generalised for records; behaviour unchanged |
| `packages/contracts/src/document.ts`, `document.test.ts` | modify | Defaulted `undoRecords`; version stays 3; missing key parses |
| `packages/contracts/src/index.ts`, `index.test.ts` | modify | Barrel exports |
| `packages/repositories/src/interfaces.ts` | modify | `UndoRecordRepository` |
| `packages/repositories/src/json-repositories.ts` | modify | `JsonUndoRecordRepository` |
| `packages/repositories/src/data-store.ts` | modify | Owner-scope integrity pass; no snapshot reference checks |
| `packages/repositories/src/repositories.test.ts`, `data-store.test.ts` | modify | Repository and integrity cases |
| `scripts/check-package-imports.mjs`, `packages/domain/src/import-lint.test.ts` | modify | Allow `UndoRecordRepository` in domain; lint still rejects `JsonUndoRecordRepository` |
| `packages/domain/src/owned-rows.ts` | create | Extracted row read/write helpers |
| `packages/domain/src/page-placements.ts` | modify | `snapshotPlacement`, `resolveRestoreIndex` |
| `packages/domain/src/page-placements.test.ts` | create | Pure placement cases |
| `packages/domain/src/project-visibility.ts`, `project-visibility.test.ts` | modify if needed | Non-throwing highest-blocker lookup for `undo_blocked` |
| `packages/domain/src/undo-recorder.ts`, `undo-recorder.test.ts` | create | Recorder, lifetime/limit constants, pruning |
| `packages/domain/src/section-removal-undo.ts`, `section-removal-undo.test.ts` | create | Capture, pure `resolveUndoDestination`, inverse execution for `section.remove` |
| `packages/domain/src/undo-service.ts`, `undo-service.test.ts` | create | Scoped, permissioned, consuming execution |
| `packages/domain/src/section-service.ts` | modify | Capture, recorder call, `SectionRemovalResult`; comments distinguish Undo from Archive Restore |
| `packages/domain/src/section-service.test.ts`, `section-ownership.test.ts`, `page-ownership.test.ts` | modify | Receipt, capture, rollback and refusal cases; adapt callers of `remove`'s return value |
| `packages/domain/src/index.ts` | modify | Export `UndoService`, `UndoRecorder`, `RepositoryUndoRecorder` (helpers stay internal) |
| `packages/domain/test/test-support.ts` | modify | Harness builds recorder, `UndoService`, `undoRecords`; failing-persist store, failing and integrity-breaking stub recorders |
| `prototype/seeds/*.json` (six) | regenerate | Snapshots gain `"undoRecords": []` only |
| `packages/prototype-data/test/fixtures/nested-projects-v3.json` | create | Pre-slice version-3 fixture |
| `packages/prototype-data/src/version-3-undo-compatibility.test.ts` | create | Lossless load/persist/reload |
| `packages/prototype-data/src/upgrade-project-pages.test.ts` | modify | v2 output includes empty `undoRecords`; v3 input remains unchanged |
| `apps/prototype-host/persistence/store.ts` | modify | `undoRecords` repository |
| `apps/prototype-host/api/services.ts`, `services.test.ts` | modify | Wiring through the hub-wrapped unit of work |
| `apps/prototype-host/main.ts`, `mcp/stdio.ts` | modify | Hand-built `WorkManagerServices` gain `undo` |
| `apps/prototype-host/api/routes.ts`, `routes.test.ts` | modify | 200 removal receipt; `POST /api/undo/:id`; `noContent` comment |
| `apps/prototype-host/live-updates.test.ts` | modify | Hand-built services gain `undo`; one frame per committed remove/undo; none on rollback; no inverse fields |
| `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify | Host/MCP acceptance above |
| `packages/mcp-tools/src/tool.ts` | modify | `undo` service |
| `packages/mcp-tools/src/tools/sections.ts` | modify | `remove_section` receipt description/return |
| `packages/mcp-tools/src/tools/undo.ts` | create | `undo_operation` |
| `packages/mcp-tools/src/registry.ts`, `registry.test.ts`, `index.ts` | modify | Register and count thirty-four tools |
| `packages/mcp-tools/src/contract.test.ts`, `packages/mcp-tools/test/harness.ts` | modify | Receipt, minimal grant, denial and refusal payloads |
| `apps/prototype-host/mcp/handler.test.ts` | modify | Hand-built services gain `undo`; revoked-after-receipt and `undo_consumed:` text cases (`stdio.test.ts` compares against `SPEC_TOOL_NAMES` and needs no edit) |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `work-manager-gateway.ts` | modify | Comments only: host now returns a receipt the adapter does not yet consume |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | modify | Retitle the "empty 204" case; mock the 200 JSON body the adapter ignores |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 30` at implementation start |
| `.prototype/notes.json` | modify | Real-use friction (acceptance 6) |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | §14 (defaulted collection, no bump), §31 (removal receipt, Undo versus Archive Restore), §54 (tool list/`remove_section` result), §57 (`project.section_removal_undone`), §61 (routes), §62 (no inverse in frames) — when implemented |
| `AGENTS.md`, `README.md`, `docs/architecture/overview.md` | modify | Tool count; new domain edges; storage note |
| `docs/architecture/contracts/{overview,why,what,how}.md` | modify | Undo module, versioned union, refusal details |
| `docs/architecture/domain/{overview,why,what,how}.md` | modify | Recorder/executor/service, edges, invariants, key symbols |
| `docs/architecture/repositories/{overview,why,what,how}.md` | modify | Collection, repository, owner-only integrity |
| `docs/architecture/prototype-data/{how,what}.md` | modify | Seed snapshots and version-3 compatibility; review the other two |
| `docs/architecture/prototype-host/api/{how,what}.md`, `live-updates/how.md` | modify | Routes/receipts; frame content unchanged; review remaining files |
| `docs/architecture/mcp-tools/{overview,why,what,how}.md` | modify | Thirty-four tools, `undo_operation` |
| `docs/architecture/testing/how.md` | modify | Extended acceptance scripts |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | modify | Receipt and `undo_operation` usage; tool count |
| `docs/decisions/2026-09-section-removal-undo-records.md` | create | Planning choices now; implementation evidence appended at landing |
| `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md`, `2026-09-home-orders-sections-and-shortcuts-together.md`, `2026-08-live-events-ride-the-activity-record.md` | modify | Dated amendments: Archive Restore is no longer "the canonical undo"; Undo inserts by combined-order neighbors; Undo publishes through the same single activity frame |
| `docs/decisions/README.md` | modify | Index the new entry and amendments |
| `docs/roadmap/active/30-atomic-section-removal-undo.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | modify | Plan, status and generated board |

During this planning session only the active plan, the pending decision and its index entry,
the domain `why.md` pending link, goals and the generated board change.

## Test plan — tests first

| Test | Proves |
|---|---|
| `undo.test.ts`: operation v1 round-trips for none/cascade/reassign | Snapshot carries full section config, placement, row before/after and post `archivedAt` |
| `undo.test.ts`: rejects unknown `type`, `version: 2`, extra keys, reassign `appliedPolicy` without target, rows with `none`, duplicate or wrong-kind rows | The union is typed and versioned, never arbitrary JSON (criterion 12) |
| `undo.test.ts`: receipt is strict and has no operation/actor/row data; refusal details parse per reason and reject empty conflicts | Private inverse state cannot leak through a receipt |
| `undo.test.ts` + `activity.test.ts`: attribution rule shared | User/agent/system records follow activity's rules; activity tests unchanged |
| `document.test.ts`: version-3 document without `undoRecords` parses to `[]`; `SCHEMA_VERSION` is 3 | Compatible storage gate |
| `repositories.test.ts`: undo repository insert/find/list by workspace/update/remove; write outside a unit refused | Collection behaves like the others and prunes |
| `data-store.test.ts`: record naming missing section/page/shortcut/task accepted; duplicate sequence in a workspace, missing workspace, foreign project, foreign or missing actor, duplicate id rejected | Snapshot storage is separate from live-reference integrity |
| `page-placements.test.ts`: snapshot first/middle/last/sole placement with section and shortcut neighbors | Neighbors and index come from the combined order |
| `page-placements.test.ts`: previous survives; previous gone → next; both gone → clamped index; neighbor moved to another page or archived counts as gone; empty page | Refactor §13 algorithm, pure |
| `undo-recorder.test.ts`: receipt fields and 24-hour expiry from `PrototypeClock`; `sequence` increments per workspace, computed before pruning; pruning a record also prunes every lower-sequence record naming the same section; prunes expired, then lowest sequence so the workspace ends at exactly 50 including consumed records; other workspaces untouched; opens no unit | Retention gate |
| `section-service.test.ts`: one receipt, one record and one activity event for a cascade over a parent, two subtasks and a pre-archived row | One receipt per multirow removal (criterion 9) |
| `section-ownership.test.ts`: capture for view/none, cascade (live rows only, markers in `after`) and reassign (live and pre-archived rows moved, subtree markers intact) | Exactly the changed rows are recorded |
| `section-service.test.ts`: `policy: 'reassign'` with no target on an empty container and on a view | Succeeds as today, records `appliedPolicy: 'none'`, no rollback |
| `section-service.test.ts`: removal inside an archived project | Succeeds with a receipt; Undo answers `undo_blocked` until reactivation |
| `section-service.test.ts`: already archived, missing policy, invalid target, archived target and foreign section create no record, event or receipt | Refusals create neither history nor undo |
| `section-service.test.ts`: failing stub recorder; stub recorder inserting a schema-valid record that fails commit-time integrity (foreign project, missing actor); store whose `persist` throws | Each rejects, leaves section/rows/positions/records/events unchanged and `persistCalls` unmoved (criterion 8) |
| `section-service.test.ts`: publisher sees one frame whose keys are exactly `LiveEvent`'s; stored event has no snapshot keys | Activity/live separation (criterion 7) |
| `undo-service.test.ts`: disposable Progress view between a section and a shortcut | Exact config/title/span/collapsed; original index via previous neighbor; outcome `restored` |
| `undo-service.test.ts`: placement after interposed insert, previous removed, both removed, shortcut neighbor moved, stale archived position equal to the resolved index | Previous/next/index strategies; only the restored section's `updatedAt` changes (criterion 10) |
| `undo-service.test.ts`: cascade Undo | Section live; exactly recorded rows unarchived and unmarked; independently archived rows and `archivedWithTaskId` children unchanged |
| `undo-service.test.ts`: reassign Undo after a later title and status edit | All moved rows (live and pre-archived) return to the source; target keeps its own rows; edits preserved |
| `undo-service.test.ts`: original page disabled | Restored there, `pageEnabled: false`, outcome `restored` |
| `section-removal-undo.test.ts`: `resolveUndoDestination` with hand-built inputs — original present; original missing and canonical accepts; canonical holds a shortcut to the section; canonical rejects the type | Original; `fallback-page`/`partial` appended; `undo_unavailable` twice. Pure, because a valid document cannot lose a retained section's page before Slice 31 |
| `undo-service.test.ts`: conflicts — Archive Restore first; restore then remove again as three cases — clock advanced (reports both `archived-differently` and `superseded`), same frozen instant (`superseded` only), and clock set backwards (`superseded` and `archived-differently`) — each with a stub id generator whose ids sort against insertion order, so `sequence` alone decides and the newer record still undoes; reassigned row moved; reassigned row archived; subtask created under a moved parent; row reparented | `undo_conflict` lists every problem; no write, event or consumption; document still valid (criterion 11) |
| `undo-service.test.ts`: project archived and ancestor archived after removal; then reactivated | `undo_blocked` naming the blocker, then success |
| `undo-service.test.ts`: foreign workspace; another user hand-added to the same workspace (personas each own a workspace, so over HTTP this collapses to the foreign case); the user's own agent; a different connection of the same user; unknown id | Identical not-found for all |
| `undo-service.test.ts`: agent with exactly `projects.write`; agent lacking it, with `vi.spyOn(harness.undoRecords, 'find')` | Minimal grant succeeds; denial happens before the record is read (spy not called) or changed |
| `undo-service.test.ts`: repeat Undo; clock at and after `expiresAt` | `undo_consumed` (message starts with the token) with no second event; `undo_expired` with nothing written |
| `undo-service.test.ts`: activity or persistence failure during Undo | Record unconsumed, section still archived, rows unchanged |
| `undo-service.test.ts`: one `project.section_removal_undone` event naming the project | One attributable event, no inverse data |
| `undo-service.test.ts`: remove, serialize, reload `JsonDataStore`, undo | Records persist and stay usable after reload |
| `version-3-undo-compatibility.test.ts` + `upgrade-project-pages.test.ts` | Pre-slice v3 fixture loads, persists and reloads without loss; v2 conversion still loads |
| `seeds.test.ts` (existing) | Regenerated snapshots differ only by `undoRecords: []` |
| `routes.test.ts`: DELETE 200 result; refused DELETE 409 with no receipt; undo 200; consumed/expired/conflict 409 details parse; foreign persona 404; bearer revoked or grant removed **after** the receipt was issued → 401 / 403 with the record unconsumed | HTTP contract; revocation is re-read per call by the authenticator, so it is tested at the transport |
| `live-updates.test.ts`: remove then undo deliver one frame each after commit; failing persistence delivers none and writes no record | Commit-only publication through the real hub |
| `contract.test.ts` + `registry.test.ts` + `handler.test.ts`: `remove_section` receipt; `undo_operation` minimal grant success, missing-grant denial, error text starting `undo_consumed:` over the real handler; thirty-four names | MCP contract without structured error details |
| `import-lint.test.ts` + `pnpm --filter @cwm/domain lint` | Domain may import `UndoRecordRepository`, not `JsonUndoRecordRepository` |
| `acceptance.mjs`, `mcp-acceptance.mjs` | Real transports and persisted state (acceptance 4) |

## Boundaries touched

- **Contracts once:** every undo shape lives in `undo.ts`; domain, host, MCP and the web comment
  import or name it. The attribution rule is shared, not copied.
- **Domain graph:** one new kind of edge, `SectionService → UndoRecorder` (an interface over one
  repository); `UndoService → ActivityService` is the existing writing-service edge. Both are
  acyclic and stated in decision rule 8, AGENTS.md and domain `how.md`. `UndoService`
  depends on no row or section service and never calls a public method that opens a unit;
  shared behaviour is in function modules.
- **Domain imports and time:** repository interfaces and contracts only; every timestamp and
  expiry comes from `Clock`; ids from `IdGenerator`.
- **UnitOfWork:** the recorder and executor run in the caller's unit; the service opens exactly
  one. Nothing is persisted outside it, and the hub still publishes only after commit.
- **MCP → domain only:** `undo_operation` calls `UndoService`; no repository reaches a tool.
- **Components/gateways:** no Angular code path changes; two gateway comment files and the retitled adapter spec. No design
  literals, `prototypeMode` branches or core→prototype edges.
- **Never build:** no event sourcing, command bus, second datastore, queue or production storage.
  Records live in the one JSON document.

## Explicit non-goals

- Hard deletion, a `deleted` section disposition, shortcut cleanup (Slice 31).
- Any browser Undo surface, gateway receipt member or fake-gateway change (Slice 31).
- Undo for add, move, settings, duplicate, rows, projects, pages or shortcuts (Slice 32).
- Structured MCP error payloads; MCP refusals carry their reason token in the message text only.
- Redo, a history list or read route/tool for records, an ArchiveItem aggregate, a configurable
  retention product, or changes to Archive Restore's append semantics.
- A schema-version bump, a new converter, or seed content changes beyond the empty collection.

## Open questions

None block implementation. The user confirmed on 2026-09-14 the two product choices review left
for them: the 24-hour / 50-record bounds, and exact-actor ownership (a person cannot undo their
agent's removal through Undo; Archive Restore still recovers it). Real use in acceptance step 6
should still note whether either feels wrong.

## Revisions

- **Initial draft (2026-09-14):** Grounded in both specifications, `SectionService.remove`,
  `settleRows` and `restoreSection`, `page-placements.ts`, the data store's integrity pass and
  unit-of-work adapter, `ActivityService`, `LiveEventHub`, the host routes and wiring, the MCP
  registry and acceptance script, seeds and the v2 converter. Settled the seven gates in a pending
  decision. Review pending.
- **Round 1 (2026-09-14, two reviewers: correctness/spec; boundaries/tests/docs):** Fixed three
  blockers — record the policy `settleRows` *applied* (`appliedPolicy`), since `reassign` without a
  target succeeds today on views and empty containers and would otherwise roll back on the record's
  refinement; read placements before making the section live and write it explicitly, so it is not
  listed twice or skipped by `renumberPlacements`; take the destination from the section's current
  page (a mismatch is a `moved` conflict) and move the unreachable missing-page fallback into a pure,
  hand-tested `resolveUndoDestination`; and allow `UndoRecordRepository` in
  `check-package-imports.mjs`. Substantive: `superseded` conflict when a newer record names the same
  section (identical timestamps under a frozen clock); refusal reason tokens in messages because MCP
  carries no details (structured MCP errors are a non-goal); commit-time integrity rollback via a
  stub recorder; receipt-then-blocked behaviour for removal inside an archived project; the
  dependency edges as decision rule 8; missing files (`main.ts`, `mcp/stdio.ts`, `handler.test.ts`,
  `page-ownership.test.ts`, gateway spec and comments, walkthrough guide). Minor: exact cap of 50
  including consumed records, older-build stripping, `version: 1` retention for Slice 31, `default(() => [])`,
  date-lint-safe expiry arithmetic, a spy for denial-before-read, revocation-after-receipt tested at
  the transport, a hand-added same-workspace user, nested-unit receipt caveat. Dropped as
  over-engineering: `sectionDisposition`, the host concurrency undo test and the `seeds.ts` edit.
- **Round 2 (2026-09-14, same two reviewers):** Both confirmed every round-1 finding resolved and
  independently found one new substantive issue: "newer record" ordered by `createdAt` then random
  id is wrong when the dev panel moves the clock backwards or two removals share an instant. Added a
  per-workspace `sequence` (computed before pruning, unique per workspace in integrity) as the only
  order for `superseded` and pruning, and pruning now takes lower-sequence records for the same
  section with it; the conflict test uses a backwards clock and ids that sort against insertion order.
  Minor: pinned the refusal message format; stated the fallback is proven at the resolver level only
  and that Slice 31 must relax the missing-section conflict (added to the decision's Revisit when);
  corrected "Boundaries touched" (one new kind of edge; two comment files and a spec); acceptance
  now removes the first `personal-workspace` placement and the middle `agent-heavy` placement so Undo
  is distinguishable from Archive Restore's append; `live-updates.test.ts` hand-built services gain `undo`.
- **Implementation diff review (2026-09-14, two reviewers: correctness/spec; boundaries/docs):**
  No blockers. Fixed: a literal NUL byte committed in `data-store.ts`'s sequence key, which made
  git treat the file as binary; `subjectSectionOf` leaking through a `*` re-export; missing doc
  comments on new public symbols; stale Undo wording in spec §32 and §54, the domain overview,
  a repositories Key symbols link and the mcp-transport acceptance note; added tests for a
  reflections-container cascade Undo, a neighbour moved to another page and the unknown-id
  message; the placement snapshot now runs after `settleRows`'s refusals, as the plan states.
  Rejected after checking: "agent-actor integrity rejections are untested" — both cases exist.
- **Round 3 (2026-09-14, closure check):** Sequence/pruning fix verified correct (sequences only
  increase; pruning same-section lower records loses nothing that could still pass). Two substantive
  acceptance gaps fixed: the MCP acceptance token's connection lacks `projects.write` (the script now
  grants it in its copied temp file, seed unchanged), and the middle `agent-heavy` placement is a
  task list needing `policy: 'cascade'`, now named with its tasks asserted. Minor: split the conflict
  test row into three cases, pinned conflict-list order, and aligned decision rule 3 with the plan's
  "computed before pruning". No other substantive findings remained.

## Outcome

**Deliverables.** Every successful section removal now records one versioned inverse and returns
a receipt. [`undo.ts`](../../../packages/contracts/src/undo.ts) defines the `section.remove` v1
operation, record, receipt, result and refusal details once; `undoRecords` is a defaulted
collection inside schema version 3 with owner-only integrity in
[`data-store.ts`](../../../packages/repositories/src/data-store.ts).
[`SectionService.remove`](../../../packages/domain/src/section-service.ts) snapshots the combined
section/shortcut placement and the rows `settleRows` applied, and records through
[`RepositoryUndoRecorder`](../../../packages/domain/src/undo-recorder.ts) in the same unit
(24-hour expiry, 50 per workspace, per-workspace `sequence`).
[`UndoService`](../../../packages/domain/src/undo-service.ts) executes a receipt once for the exact
actor under `projects.write`, through
[`section-removal-undo.ts`](../../../packages/domain/src/section-removal-undo.ts): typed
`undo_consumed` / `undo_expired` / `undo_blocked` / `undo_conflict` / `undo_unavailable`
refusals that write nothing, neighbour-aware placement, exact row inverse, one
`project.section_removal_undone` event. `DELETE /api/sections/:id` answers 200 with
`SectionRemovalResult`, `POST /api/undo/:id` executes, `remove_section` returns the receipt and
`undo_operation` makes thirty-four MCP tools. Archive Restore is unchanged.

**Evidence.** Tests first where the red was real (contracts, repositories, placement, receipt and
capture tests failed on the missing behaviour); the Undo service suite was written beside the
executor and mutation-checked (removing supersession, the explicit section write or the
moved-dependent scan each fails tests). Final: `pnpm test` (contracts 235, repositories 140,
domain 522, prototype-data 100, mcp-tools 145, host 187, web 662) and `pnpm lint` green;
`acceptance`, `mcp-acceptance` (both transports), `live-acceptance` and `agent-acceptance`
pass. Refactor §26 criteria 7–12 are covered by the named domain tests (frame/event key checks;
recorder, integrity and persistence rollback; one receipt per multirow cascade; placement suite
beside the unchanged Archive Restore append test; conflict suite and reload; the typed, versioned
union with per-type dispatch). `pnpm e2e` was not run (no browser surface changed).

**Real use.** Host and web on `nested-projects`, driven by an MCP SDK client over Streamable
HTTP (the session's configured MCP server could not be reconnected from here): removed Home
Progress, moved a shortcut to the top of Home as the person, undid — Progress returned between
Sub-Projects and Reflections; cascaded the 6-task Home list and reassigned the Garden list, both
undone exactly; a subtask added under a reassigned task made Undo refuse with
`undo_conflict: task … new-dependent`. The open canvas refreshed live on every remove and undo.
Notes `note-2026-09-14-004`–`006`. The user's `.prototype/data.json` was backed up before and
restored after; the real-use result is kept beside it as a `.backup-*` file.

**Deliberate choices.** `undo_blocked` names the highest archived project on the chain; records
omit absent optional keys so memory matches disk; receipt labels read `Removed the <name> section`;
the missing-page fallback is proven only through the pure resolver, as planned. See
[section removal Undo records](../../decisions/2026-09-section-removal-undo-records.md).

**Deviations from the plan.** `acceptance.mjs` had been failing since schema version 3 (its
project create lacked `kind`); it was repaired to run this slice's check. MCP acceptance asserts
the task list has neighbours on both sides rather than "middle of three", because the script's own
`add_reflection` appends a container first. The placement snapshot moved after `settleRows` during
review. Friction notes were recorded through the host's `/prototype/notes` endpoint the dev panel
uses, not by clicking the panel.

**Deferred.** Hard deletion, the browser Undo surface and receipt consumption in the gateway
(Slice 31); Undo for other section operations (Slice 32). Real use surfaced two questions for
Slice 31: a receipt lost with its response cannot be recovered (a repeated `remove_section` is
refused without the existing receipt, and nothing lists one's own records), and conflict text
names ids without titles or a next step.

**Open questions.** Whether a refused repeat removal should return the outstanding receipt, or a
caller should be able to find its own receipts; whether conflict messages should carry titles.
Exact-actor scope and the 24-hour / 50-record bounds did not feel wrong in this pass.

**Documentation updated.** Main spec §§14, 31, 32, 54, 57, 61, 62; AGENTS.md; README; architecture
overview and the contracts, domain, repositories, prototype-data, prototype-host/api,
live-updates, mcp-transport, mcp-tools and testing folders; the MCP setup guide and milestone
walkthrough; the landed Undo records decision, amendments to the archived-row, combined-order and
live-events decisions, and the decision index.
