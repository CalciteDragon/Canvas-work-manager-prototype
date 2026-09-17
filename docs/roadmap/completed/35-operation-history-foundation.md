<!-- completed-record id="35" closed="2026-09-16" summary="Section add, move, update and removal undo and redo through a per-actor, per-project operation history over domain, HTTP and both MCP transports; schema version 4 with an explicit v3 to v4 conversion" -->
# Slice 35 — Operation history foundation (Slice 34 Stage A)

This is **Stage A** of the direction planned in
[Slice 34 — Project Undo/Redo and simpler Archive](../planned/34-undo-redo-and-archive.md).
Stage A builds the history machinery and proves it on the four section operations that are
already undoable today. Task, reflection, project, page and shortcut coverage (Stages B–C),
the always-present header controls (Stage C), cascade-only removal and the Archive/Settings
changes (Stage D) are **not** in this slice.

## Goal

Replace the single-use, section-scoped Undo receipt with a versioned, per-actor, per-project
operation history that undoes **and redoes** the existing section add, move, update and remove
operations atomically, through domain, HTTP and both MCP transports.

## Spec sections

- **§14** — one JSON document, explicit conversion. Schema version 3 → 4 with a chained,
  explicit converter and the existing upgrade CLI; no migration registry. §14 must be
  **amended**: its landed paragraphs say `SCHEMA_VERSION` is 3, that `undoRecords` joined
  version 3 with no bump, and that the converter is "deliberately not … a version chain" —
  which the v2 → v3 → v4 chain contradicts. The amendment and its decision entry ship with
  this slice.
- **§11** — every new shape (history, action, summary, transition input/result, receipt,
  refusal details) is a Zod contract in `packages/contracts`, defined once.
- **§15** — history transition, content write, activity event and live publication share one
  caller-owned `UnitOfWork`.
- **§31** — amend: Undo stops being page-local and single-use, and becomes a bidirectional
  per-actor history.
- **§27** — amend the *receipt* wording only: "yields its server receipt to an accessible,
  page-local Undo action" and "the receipt carries a public sequence" both stop being true when
  `sequence` gives way to a history id and revision. §27's persistent header controls remain
  Stage C and stay planned.
- **§54** — amend: `undo_operation`'s `{ undoId }` input and `projects.write` line, the five
  `undo_*` refusal prefixes, the two new tools and the tool count.
- **§57** — its landed note enumerates the four `project.section_*_undone` actions; the four
  matching `*_redone` actions join them. **Durable historical target identity is *not* in this
  stage** — see the scope note below.
- **§61** — amend: `POST /api/undo/:id` and the five typed 409 reasons are replaced by the
  summary and transition routes and the history refusal taxonomy, with the same semantics and
  strict inputs over HTTP and MCP alike.
- **§53–54** — a summary read needs `projects.read`; a transition needs the write grant of the
  action's family, which for every Stage A family is `projects.write`. Today's blanket
  `projects.write` guard on *reading* an Undo record goes away. The grant stays a static field
  per tool in this stage: nothing here can distinguish "the family's grant" from
  "`projects.write`", so the dynamic per-action permission metadata waits for Stage B, where
  `tasks.write` first differs.
- **§45, §70** — injected `Clock`, and the domain/repository/MCP boundaries below.

## Build

- Contracts: `OperationHistory`, `OperationAction`, summary, transition input/result,
  `OperationReceipt`, refusal details. The four existing operation payloads move across at
  `version: 1`, with one addition: `section.add` gains a `placement`, which it needs for Redo
  and does not have today.
- Repositories: `operationHistories` and `operationActions` collections, and the integrity
  rules the cursor depends on.
- Domain: a pure `operation-history.ts` state machine (cursor, order counter, branch clearing,
  pruning), `RepositoryOperationRecorder` replacing `RepositoryUndoRecorder`, and
  `OperationHistoryService` replacing `UndoService` with `summary` and `transition`.
- Executors: the four section inverses become direction-aware apply/revert pairs with
  applied-state conflict checks instead of section supersession.
- Persistence: `SCHEMA_VERSION` 4, a v3 → v4 converter, a frozen v3 intermediate for the
  existing v2 converter, chained CLI, regenerated seeds and fixtures.
- Activity verbs: the four existing `project.section_*_undone` actions gain four
  `project.section_*_redone` twins, so a live frame and a feed row say which direction ran.
  `contracts/src/live.ts` needs no change — `LiveEventSchema.type` reuses
  `ActivityActionSchema`, which is a pattern, not an enum. Checked, and recorded here so a
  later reviewer does not re-raise it.
- Transport: history summary and transition routes and MCP tools; `undo_operation` respecified;
  `redo_operation` and `get_operation_history` added.
- Web: gateway interface, prototype adapter, fake gateway and the existing receipt consumers
  updated to the new shapes. No new UI surface.
- **The coverage-matrix audit** Slice 34 assigns to Stage A: a table mapping every exposed
  gateway and domain mutation to the stage that gives it history, or to the reason it is
  transient or tooling-only. It is the inventory Stages B and C are scoped from, so it is a
  deliverable of this slice, not a side effect.

## Two deliberate departures from Slice 34's Stage A

Slice 34 assigns both of these to Stage A. Reviewing the plan against the source showed both are
better done later, so they are flagged here rather than dropped quietly.

**Historical activity identity moves to Stage B.** Slice 34 put it here on the grounds that it
"rides this conversion". It does not need to: `section-service.ts` already records section events
with `entityType: 'project'` — deliberately, because "an event whose `entityType` is `'section'`
keeps its section alive forever" — so no Stage A operation can produce an absent activity target.
Undo of a section add deletes a section today and integrity is undisturbed. Meanwhile the
relaxation permanently weakens a check that exists to catch hand-edited files, in exchange for a
capability only Stage B's creation Undo uses. The step-6 pattern in the implementation order
below — add the field optional, backfill, then make it required — works just as well inside
version 4, so Stage B pays no conversion tax for the delay. Stage B also then chooses between
captured identity and tombstones with the real creation-Undo requirements in hand, which is the
decision Slice 34 itself flags as a gate. For the same reason, the "a history may outlive its
project" integrity relaxation moves to the stage that first deletes a project: Stage A deletes
none, so the relaxed rule would permit a dangling history nothing can create, reach or prune.

**The persisted retry cache moves to Stage C.** Slice 34 wants an uncertain Undo/Redo retry to
return its original result from a bounded request-id cache. `expectedRevision` already makes a
blind retry *safe* — the second attempt refuses as stale and nothing executes twice — so the
cache buys a better message, not correctness, and it costs a contract field, an integrity rule
and a reopen test. Slice 34's own answer for uncertain ordinary writes is reconciliation rather
than replay; the transition route applies the same answer by returning the current summary with
a stale-revision refusal, from which a client sees the revision advanced and concludes its call
landed. Stage C revisits it if the header control genuinely cannot tell the two cases apart, and
the envelope-only form is the shape to build then. Acceptance item 8 is written against this
choice: it proves the race and the safe retry, not a cached result.

## Done when

Stage A's gate from Slice 34 passes, demonstrated rather than reasoned about:

`A → B → Undo B → Undo A → Redo A → Redo B` over the same section and the same field
returns the exact intermediate states, through the domain service, through HTTP, and through
both MCP transports; plus branch invalidation, expiry and pruning, a concurrent-revision race,
a repeated transition request, and a reload that preserves the correct actor's history.

## Do not

- No task, reflection, project, page, shortcut, layout or progress history — Stages B and C.
- No header Undo/Redo controls, no history store at the shell, no removal of
  `SectionUndoNotice` — Stage C.
- No cascade-only removal input, no task Delete icon, no Archive/Settings change — Stage D.
- No restricted repository deletion for tasks/reflections/projects/pages — Stage B/C needs it;
  Stage A only relaxes what the v4 document permits, and deletes nothing new.
- No event sourcing, JSON patch executor, migration registry, generic HTTP idempotency layer,
  history browser, global keyboard shortcuts, or cross-actor Undo (§80 and Slice 34's non-goals).

<!-- ───────────── Written when the slice starts ───────────── -->

## History model — the rules an implementer needs

Written out because "applied-state, conflict-aware checks" is doing more work than that phrase
can carry, and because two implementers would otherwise build different state machines.

**Cursor and revision.** The cursor is an **order value**, not a reference to an action: `0`
means nothing is applied. Undo targets the applied action with the highest order at or below the
cursor and moves the cursor below it; Redo targets the **undone** action with the lowest order
above the cursor and moves the cursor to it. Both directions skip `retired` actions: retirement
moves the cursor below the action, so without this Redo would immediately select the thing that
was just retired and wedge the direction that retirement exists to unwedge. The integrity rule is therefore "cursor ≤ the history's
order high-water mark", not "the cursor names a stored action" — undoing to the bottom of the
stack leaves a valid cursor of `0`, and pruning cannot break the invariant. `revision` increments
on **every committed history mutation** — recording a new action, completing a transition, and
retiring an action — and never on expiry or pruning, so a background prune cannot refuse an innocent client holding a
revision.

**Pruning is contiguous from the ends.** The clock is settable, so expiry order is not order
order; the existing contract says so ("`createdAt` can go backwards when the dev panel sets the
clock"). Expiring or capping an action on the applied side therefore discards everything below
it, and an expiry anywhere in the undone branch discards that whole branch. Without this, "only
the next action is executable" has no meaning across a hole in the stack. Expiry itself is
**lazy**: an expired action stays until the next record prunes it, so it refuses with
`history_expired` while it is there and answers 404 once pruned. Acceptance item 9 accepts both.

**A permanently unsatisfiable action does not wedge the stack.** Archive Restore is deliberately
not a history action, so an actor can edit a section (A), remove it (B), and have someone restore
it out of band — after which B's Undo refuses `not-archived` forever and, under a strict cursor,
A is unreachable for good. An action whose refusal is structurally unrepairable therefore moves to
a third state, `retired`. The mechanism, exactly: because the summary does not pre-validate,
retirement is only ever discovered inside a transition the caller addressed to that action. That
transition **commits the retirement** — state `retired`, the cursor steps past it, `revision`
increments — executes nothing, and refuses with `history_retired` carrying the refreshed summary.
The caller re-reads and its next call names the action below. Retirement is therefore the one
refusal that moves the cursor, and one call never both retires and executes: two round trips, so
a client is never surprised by a step it did not ask for. It bends only for refusals no user
action could repair — never for an ordinary conflict, which still blocks with the cursor
unchanged. Which refusals qualify is a decision entry, not a heuristic (see Open questions).

**Where the archive generation lives.** The removal check above needs a monotonic counter that a
per-actor history cannot supply — the case it catches spans two actors' histories, which is
precisely why today's check scans the whole workspace's records. It goes on the section itself:
`archiveGeneration` joins `ProjectSectionSchema`, increments on every removal, and never
decreases. Archive Restore does **not** bump it — restoring is not removing, and bumping there
would refuse innocent Undos. The verbatim-reapply rule below replays the captured generation, or
Redo would bump it and the next Undo of that same action would refuse on its own check. The removal payload captures it, beside
`postSectionArchivedAt`, so the inverse has something to compare against.

The guard covers **retained** removals, which is the whole of the case it exists for: a
cross-reversal needs the section to still be there for a second removal to archive. A removal
recorded with `disposition: 'deleted'` is already guarded by the existence and recreation checks
the current executor applies, because there is no row for a second removal to find. The tests say
which disposition they assert rather than leaving it to be inferred.

It is a document field, so it lands in step 1 with the seed and fixture regeneration, **non-required** —
`archivedAt` is `.optional()` for the same reason, and a `.default(0)` serves here. A required field on
`ProjectSectionSchema` before the bump would reject every version-3 document on disk, including
the developer data file this plan is otherwise careful about.

**The move check that replaces supersession.** Today only `section.update` has a field-value
check; `section.move` relies on supersession alone, which this slice removes. Its replacement:
the section's current neighbours in the live combined order must still match the recorded
`placementAfter.previous`/`.next`, otherwise `moved`. Index equality is not the test — the
placement snapshot's own contract says an index means nothing once the page changes around it.

**The removal check that replaces supersession.** `section-removal-undo.ts` documents a case
applied state cannot see: two removals of one section can land in a single clock instant, so
actor 1's Undo would pass every state check and reverse *actor 2's* removal. A monotonic
per-section archive generation, captured with the removal and compared before the inverse runs,
keeps that refusal. This is what supersession was really protecting; it is written down here so a
later reader does not delete it a second time.

**Reapply replays captured values verbatim.** A Redo writes the recorded `after` state exactly —
`archivedAt`, `postSectionArchivedAt`, the captured `archiveGeneration`, row markers and business
dates — and stamps only `updatedAt` from `Clock`. Stamping a fresh `archivedAt` would make the *next* Undo of that action
refuse `archived-differently` and break the gate on the remove family. A removal recorded with
`disposition: 'deleted'` deletes the section again on Redo.

**`section.add` needs a placement it does not have.** Its payload carries only the section
snapshot, and Undo renumbers the page, so Redo has nowhere to put the section back. A
`placement: PlacementSnapshot` joins the payload. Every v3 record is retired by the conversion,
so there is no compatibility cost.

**The summary does not pre-validate.** It names the next action in each direction, its label and
its revision; it does not run each executor's conflict pass on a read. The one exception is the
archived-ancestor block, which is a single visibility call and which Stage C's disabled reasons
need. Every other disabled reason comes from an actual refusal.

## Acceptance check

Run in isolated test data, never against personal runtime data. Create records through the API
and assert the **returned ids**, not "some row exists".

1. **Sequential chain, domain.** In `operation-history-service.test.ts`, over
   `buildHarness(twoPersonaDocument())` from `packages/domain/test/test-support.ts`: update a
   section title (A), update the same title again (B), Undo, Undo, Redo, Redo. Assert the title
   after each of the six steps, that every transition returns an incremented `revision`, and
   that the cursor ends where it started.
2. **Sequential chain, HTTP.** Extend `apps/prototype-host/scripts/acceptance.mjs`: same chain
   over `PATCH /api/sections/:id` writes and
   `POST /api/history/:historyId/transition`, asserting `GET /api/projects/:projectId/history`
   reports the expected `undo`/`redo` entry ids and `null` at each end of the stack.
3. **Sequential chain, MCP.** Extend `apps/prototype-host/scripts/mcp-acceptance.mjs` to run the
   chain over Streamable HTTP **and** stdio with `update_section`, `undo_operation`,
   `redo_operation` and `get_operation_history`, and to confirm a fresh stdio connection sees
   its own connection's history only.
4. **Branch invalidation, domain and HTTP.** Undo B, then make a new section write C. `redo` is
   `null` afterwards, the discarded action is gone from storage, and Undo C → Undo A still works.
   A no-op update (`undo: null`), a refused transition and a failed write each leave `redo`
   untouched. Proved in `operation-history.test.ts` and again over the wire in
   `acceptance.mjs`, where the summary route is the observer.
5. **All four families both directions.** Add, move, update and remove each Undo and Redo to the
   exact prior/next state: the added section reappears with the same id, the move returns to
   `placementAfter`, the update reapplies the recorded `after` fields, and the removal re-archives
   exactly the rows and markers it archived the first time — with an independently archived row
   left untouched in both directions.
6. **Conflict and refusal.** Another actor's overlapping edit refuses with a typed conflict and
   writes nothing; an unrelated later edit to a different field survives Undo; an archived
   ancestor blocks a transition; the cursor and revision are unchanged after every refusal
   **except a retirement**, which commits exactly the retirement and executes nothing.
7. **Atomicity, three seams.** Inject a failure at the recorder (the existing recorder seam in
   `packages/domain/test/test-support.ts`), at the action insert
   (`apps/prototype-host/live-updates.test.ts` already swaps a repository insert for a throwing
   one), and at persist. In each case content, history, cursor and the activity event all roll
   back and **no live frame is published**.
8. **Concurrency and safe retry, against a real file store.** In
   `apps/prototype-host/concurrency.test.ts`, which already runs a real `JsonDataStore`: two
   transitions submitted at the same `expectedRevision` — exactly one advances, the other
   refuses with a stale-revision 409 **carrying the current summary**. Replaying a transition
   whose response was lost executes nothing a second time and records no second activity event,
   and the caller can tell from the returned summary that its first call landed.
9. **Expiry, pruning and reload.** An action past 24 h is not offered and refuses
   `history_expired` while retained, or answers 404 once a later record has pruned it — both are
   acceptable and the test says which it asserts. The 51st action in one history prunes the
   oldest, contiguously; a pruned or expired action never resurrects a redo branch. An expired
   or pruned action refuses over HTTP as well, in `apps/prototype-host/api`, not only in the
   domain. Reload is proved end to end in
   `apps/prototype-host/recovery-undo-acceptance.test.ts`, which already reopens a real data
   file: after a restart the cursor, revision and both entries return for the owning actor and
   nothing for another actor.
10. **Conversion.** Copy `packages/prototype-data/test/fixtures/nested-projects-v2.json` to a
    temporary path and run `pnpm prototype:upgrade <that path>` — the CLI takes exactly one
    path. It produces v4 through the frozen v3 intermediate; a direct v3 file converts once and
    a second run is a no-op; a v3 file without `undoRecords`, one with legacy `reassign` records
    and one with consumed receipts all convert; old receipts are retired with the reset notice;
    every business collection — `activityEvents` included, since this stage changes nothing in
    it — **deep-equals** its input (the document is re-serialized, so no collection's bytes
    survive) and the backup file is byte-identical to the original input; a conversion failure
    leaves the original file untouched with its backup beside it.
11. **Existing conflict guards survive the rewrite.** A move whose section has since been moved
    by someone else refuses `moved` on the neighbour comparison, not on an index; two removals of
    one section within a single clock instant cannot cross-reverse; a `retired` action is skipped
    so the actions below it stay reachable.
12. **Grants, with the right status for each case.** A `projects.read`-only connection reads the
    summary and is refused a transition with **403 naming `projects.write`** — §53's rule is that
    a missing grant is a checkbox the owner can tick, so it is never disguised as a 404. A
    history belonging to another actor, or an unknown id, is **404** and discloses nothing. A
    connection whose grant is revoked mid-session fails on its next call
    (`apps/prototype-host/mcp/handler.test.ts` is where revocation is already pinned).
13. **The coverage-matrix audit exists and is complete.** Every mutation reachable through the
    web gateway or a domain service appears in the audit table with a stage or a
    transient/tooling-only reason. A reviewer can check it against
    `work-manager-gateway.ts` and the domain `index.ts` exports without finding an unlisted write.

Commands, all green before the closing commit (`pnpm lint` already runs the docs check):

```bash
pnpm test
```

```bash
pnpm lint && pnpm build
```

```bash
pnpm e2e
```

```bash
pnpm --filter @cwm/prototype-host acceptance && pnpm --filter @cwm/prototype-host mcp-acceptance
```

`pnpm e2e` runs whole rather than filtered: `archive.spec.ts` drives `/api/undo/:id` and
`undo_operation` directly and changes with this slice, so filtering to the two obvious specs
would hide it. Stop `dev:web` and `dev:host` first.

**Before the first run after the version bump**, delete `.prototype/e2e-data.json` — it is a
version-3 file on disk that the host will refuse to load, and it reseeds itself on the next run.
A developer's own `.prototype/data.json` takes `pnpm prototype:upgrade` instead, which is the
path this slice exists to make work. Both are called out here because the bump otherwise fails
before the first test executes, in a way that reads like a broken test rather than stale data.

Then run it by hand (§77): `pnpm dev:host` and `pnpm dev:web` in two terminals, `nested-projects`
seed, edit a section twice, undo twice and redo twice, reload between steps, and connect an MCP
client to repeat it. Record friction in `.prototype/notes.json`; bump `CURRENT_SLICE` to 35 in
the dev panel store when implementation starts.

## Implementation order — green in increments

Thirty-eight files across five packages reference the current Undo internals, and
`seeds.test.ts` compares every builder's output to a committed snapshot. Done in one pass, the
first commit would delete two services, drop a document collection, bump the schema and
regenerate six snapshots together, and the suite would stay red for days — against AGENTS.md
step 3. The new work is therefore built **alongside** the old and the removal is one short
commit at the end.

1. **Additive collections, still version 3.** `operationHistories` and `operationActions` join
   the document as *defaulted* collections — the precedent Slice 30 set for `undoRecords`, which
   joined inside version 3 with no bump. `undoRecords` and the v1 receipt schemas stay. The
   `data-store.ts` integrity rows go green here. The defaulted `archiveGeneration` field joins
   `ProjectSectionSchema` here too, for the same reason. **This commit also regenerates the six
   seed snapshots and the v3 fixture corpus** (still `"schemaVersion": 3`, plus two empty arrays):
   `seeds.test.ts` compares each builder's serialized output byte-for-byte to
   `prototype/seeds/*.json`, so a defaulted collection shows up there immediately. The snapshots
   are therefore regenerated twice across the slice, once here and once at the bump.
2. **The pure state machine.** `operation-history.ts` and its test. A new file with no
   consumers: fully test-first, no fixture churn.
3. **One recorder, decorated.** `RepositoryOperationRecorder` **wraps** `RepositoryUndoRecorder`
   rather than being injected beside it: `SectionService` keeps its single `undo: UndoRecorder`
   dependency, the decorator writes both shapes, and `outstandingFor` keeps answering from the
   legacy path. A second injected recorder would look equivalent and quietly disarm the
   harness's recorder-failure seam — two existing tests replace that recorder to prove a
   recording failure rolls the write back, and with a second recorder still succeeding they
   would pass while proving nothing. One seam, one wiring change, one deletion later.
4. **The service alongside.** `OperationHistoryService.summary`/`transition` next to
   `UndoService`; the revert/reapply pairs are extracted from `section-edit-undo.ts` and
   `section-removal-undo.ts` while their existing revert entry points keep working.
5. **Transport alongside.** New routes and the two new tools while `POST /api/undo/:id` and the
   `undoId` form of `undo_operation` still answer. The registry goes 35 → 37 in this commit,
   with every documented count updated in the same one.
6. **The receipt field, added not swapped.** This is the one change that crosses every package,
   so it does not happen in a single commit. Section write results gain an **optional
   `operation: OperationReceipt`** beside the existing `undo: UndoReceipt`; both are populated.
   Contracts, domain, host, MCP and the web gateway can then move independently.
7. **Consumers, one at a time**, each onto `operation`: gateway interface → adapter → fake →
   stores → notice and canvas → e2e specs → acceptance scripts.
8. **Retire the old service, still version 3.** Delete `undo-service.ts`, `undo-recorder.ts`,
   their tests (cases migrated, not discarded), `POST /api/undo/:id`, the `undoId` tool input and
   the `undo` result field, while `undoRecords` remains a defaulted, now-empty collection. Fully
   green, and no fixture churn beyond emptied arrays.
9. **The bump, last.** `SCHEMA_VERSION` to 4, `undoRecords` and the v1 schemas deleted, the
   v3 → v4 converter and the frozen v3 intermediate written and tested, seeds and fixtures
   regenerated, the import allowlist and the documentation updated. Splitting this from step 8
   keeps the conversion commit about the conversion.

While steps 1–7 are in flight the document is a version-3 file carrying both shapes. That is
fine for a prototype's own runtime data, and `pnpm prototype:reset` is the answer if a mid-slice
file confuses anything; it is called out here so it is a choice rather than a surprise.

## File-level change list

Every path is repository-relative. Paired `.test.ts` files are listed only where the change is
substantial; the rule is that no file in this list ships without its paired test updated.

### Contracts

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/ids.ts` | modify | Add `OperationHistoryIdSchema` and `OperationActionIdSchema`; **delete** `UndoRecordIdSchema` — the converter reads legacy JSON as plain data in the established style and drops `undoRecords` wholesale, so nothing needs to parse an old id. |
| `packages/contracts/src/operation-history.ts` | create | `OperationHistory`, `OperationAction`, `OperationActionState`, summary, transition input/result, `OperationReceipt`, refusal details, query shapes. |
| `packages/contracts/src/undo.ts` | modify | Keep the four operation payloads and the placement/row/field footprints, with two additions: `section.add` gains a `placement`, and `section.remove` gains the `archiveGeneration` it captured. Reshape, do not merely "keep", every shape that embeds a receipt or record id: `UndoInputSchema` (today `{ undoId }`), `SectionAlreadyRemovedDetailsSchema`, `SectionRemovalResultSchema`, `SectionAddResultSchema`, `SectionWriteResultSchema`, all four result members of `UndoResultSchema`, `UndoRefusalDetailsSchema`, and `UndoConflictProblemSchema`/`UndoConflictNextStepSchema` — whose `superseded` problem and `use-later-receipt` step exist only to explain the sequential refusal this slice removes. Delete `UndoRecordSchema`, `UndoReceiptSchema` and `UndoRecordQuerySchema`. |
| `packages/contracts/src/index.test.ts` | modify | Pins the package's export surface, including the schemas above. |
| `packages/contracts/src/section.ts` | modify | `archiveGeneration` joins `ProjectSectionSchema` — monotonic, bumped by removal only — because the guard that replaces removal supersession spans two actors' histories and cannot live in either. |
| `packages/contracts/src/section.ts`, `inputs.ts` | modify | Section write results gain an optional `operation: OperationReceipt` in step 6 and lose `undo: UndoReceipt` in step 8; no input change in this stage. |
| `packages/contracts/src/document.ts` | modify | `SCHEMA_VERSION = 4`; `operationHistories` and `operationActions` collections (each history carrying its cursor and order high-water mark); `undoRecords` removed. |
| `packages/contracts/src/index.ts` | modify | Exports. |
| `packages/contracts/src/operation-history.test.ts`, `undo.test.ts`, `document.test.ts` | create/modify | Valid and malformed shapes, version rejection, cursor bounds. |

### Repositories

| File | Change | Responsibility |
|---|---|---|
| `packages/repositories/src/interfaces.ts` | modify | `OperationHistoryRepository` and `OperationActionRepository` replace `UndoRecordRepository`; document why actions are pruned — nothing references one — and why the history's project reference stays strict in this stage. |
| `packages/repositories/src/json-repositories.ts` | modify | Both collections over the same document. |
| `packages/repositories/src/data-store.ts` | modify | Integrity: unique ids, one history per (workspace, actor, project), unique positive `order` per history **within that history's `orderHighWaterMark`**, cursor no higher than that high-water mark, action → history reference, actor/workspace attribution, and `archiveGeneration` being a non-negative integer that no stored action's captured value exceeds — a snapshot can assert that, where "never decreases" would need the previous document. Also the **version remedy message** — `describeVersion` lives here, already parameterised on `SCHEMA_VERSION`, so the bump carries it. |
| `packages/repositories/src/data-store.test.ts`, `repositories.test.ts` | modify | Each new integrity rule. |
| `scripts/check-package-imports.mjs` | modify | The domain-import allowlist names `UndoRecordRepository` literally; the two new interfaces replace it or `pnpm lint` fails on the first domain import. |
| `packages/domain/src/import-lint.test.ts` | modify | Its fixtures pin `UndoRecordRepository`/`JsonUndoRecordRepository` by name. |

### Persistence and conversion

| File | Change | Responsibility |
|---|---|---|
| `packages/prototype-data/src/upgrade-project-pages.ts` | modify | Freeze the v2 → v3 output at a local `V3_SCHEMA_VERSION = 3` and stop importing `SCHEMA_VERSION`. **Both** `validateDocumentIntegrity` calls go — the no-op branch as well as the converted output — because each parses `schemaVersion: z.literal(SCHEMA_VERSION)` and would reject a v3 document after the bump. The intermediate is returned as **opaque JSON**, not a typed document: a hand-written v3 type in this package would be a second definition of a contracts shape, which §1 forbids. The safety that removal gives up is restored by the v4 converter, which validates before any byte is written. |
| `packages/prototype-data/src/upgrade-operation-history.ts` | create | v3 → v4: drop `undoRecords` with the reset notice, add the empty history collections, and validate the v4 output **before any byte is written** — the guarantee the frozen v3 step gives up. |
| `packages/prototype-data/src/upgrade-cli.ts` | modify | **Version-sniff first**, then chain: with the v3 converter frozen, it throws `RangeError` on a v4 input, so the no-op branch cannot be delegated to it. Accept v2 or v3, write v4 once, back up the original, no-op on v4, update the messages. |
| `packages/prototype-data/src/index.ts` | modify | Export the new converter for the CLI and the host. |
| `packages/prototype-data/src/seeds.ts`, `seeds.test.ts` | modify | Seed builders emit v4; regenerate versioned snapshots from the builders. |
| `packages/prototype-data/src/version-3-undo-compatibility.test.ts` | modify | Becomes the v3 → v4 compatibility suite: legacy reassign records, consumed receipts, and v3 files with no `undoRecords`. |
| `packages/prototype-data/src/upgrade-project-pages.test.ts`, new `upgrade-operation-history.test.ts` | modify/create | The frozen intermediate, the full v2 → v3 → v4 path, repeat safety, and failure preserving the original bytes. |
| `packages/prototype-data/test/fixtures/`, `prototype/seeds/*.json` | modify | Regenerated v4 corpora; keep the v2 and v3 inputs as conversion fixtures. |
| `apps/prototype-host/persistence/store.ts` | modify | Swap `JsonUndoRecordRepository` in the `Persistence` interface and its construction for the two history repositories. It holds no version logic. |

### Domain

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/operation-history.ts` | create | Pure state machine: order allocation, cursor movement, redo-branch clearing, expiry and per-history cap pruning, summary projection. No repository, no clock reads. |
| `packages/domain/test/test-support.ts` | modify | The harness twenty domain suites build through: it constructs `JsonUndoRecordRepository`, `RepositoryUndoRecorder`, `UndoService` and a `legacyUndoService` shim, and exposes the recorder-failure seam this plan's atomicity tests use. Rewire to the new repositories, recorder and service, and **delete the shim** — its `SectionRemovalUndoResult` cast exists only for pre-Slice-32 tests. |
| `packages/mcp-tools/test/harness.ts` | modify | The same wiring for the tool suites. |
| `packages/domain/src/section-ownership.test.ts` | modify | Asserts `store.snapshot().undoRecords` directly. |
| `packages/domain/src/operation-recorder.ts` | create | `OperationRecorder` interface and `RepositoryOperationRecorder`, replacing `undo-recorder.ts`: finds or creates the actor's history, allocates the next order, clears the redo branch, prunes, returns an `OperationReceipt`. Still called inside the caller's unit, still asserts no grant. |
| `packages/domain/src/undo-recorder.ts` | delete | Superseded; `subjectSectionOf` supersession pruning goes with it. |
| `packages/domain/src/operation-history-service.ts` | create | `summary(actor, projectId)` and `transition(actor, input)`, replacing `UndoService`. Composes repository interfaces, `ActivityService` and `Clock` only. |
| `packages/domain/src/undo-service.ts` | delete | Replaced by the service above. |
| `packages/domain/src/section-removal-undo.ts`, `section-edit-undo.ts` | modify | Direction-aware: each becomes a revert/reapply pair over the same captured footprint, with applied-state conflict checks replacing "a newer record exists for this section". |
| `packages/domain/src/section-service.ts` | modify | Depend on `OperationRecorder`; return the new receipt. It is also the write side of `archiveGeneration`: removal increments it where it stamps `archivedAt`, and restore — which clears `archivedAt` a few lines away — deliberately does **not**. `outstandingFor` keeps its **current, narrower** meaning — the newest `section.remove` action for that section, owned by the exact actor and not yet undone — because §31 and §54 promise that a repeated `remove_section` recovers a *removal* receipt. "Newest applied action" would hand back an update receipt for a section whose last action was an edit. |
| `packages/domain/src/activity-service.ts` | modify | Add the four `project.section_*_redone` actions beside the `*_undone` four. Nothing else: no Stage A project is deleted, so `rootOf` always resolves and the explicit-publication-root change waits for the stage that deletes one. |
| `packages/domain/src/errors.ts` | modify | `historyRefusal` reasons: `history_not_next` (the named action is no longer the next step in that direction — the commonest refusal under a cursor, and the one `undo_consumed` used to cover), `history_conflict` (an applied-state conflict), `history_revision_stale`, `history_expired`, `history_blocked`, `history_unavailable` and `history_retired`. There is no `history_empty`: an empty direction is `null` in the summary, an unknown history is 404, and a wrongly named action is `history_not_next`. Each message keeps the reason-token prefix MCP clients parse. |
| `packages/domain/src/index.ts` | modify | Exports. |
| `packages/domain/src/*.test.ts` (`operation-history`, `operation-recorder`, `operation-history-service`, `section-edit-undo`, `section-removal-undo`, `section-service`, `activity-service`) | create/modify | The test plan below. |

### API, MCP and host

| File | Change | Responsibility |
|---|---|---|
| `apps/prototype-host/api/services.ts` | modify | Wire the recorder and history service; remove the `UndoService` wiring. |
| `apps/prototype-host/api/routes.ts` | modify | `GET /api/projects/:projectId/history`, `POST /api/history/:historyId/transition`; retire `POST /api/undo/:id`. |
| `apps/prototype-host/api/errors.ts` | unchanged | It already maps any `DomainRuleError` to 409 with spread `details`, so the new reasons ride it. Listed so the next reader does not go looking. The one decision to record: a stale revision stays a 409 rather than becoming a 412. |
| `apps/prototype-host/api/*.test.ts`, `apps/prototype-host/mcp/handler.test.ts` | modify | Route semantics, strict input rejection, grants, revocation. |
| `apps/prototype-host/recovery-undo-acceptance.test.ts` | modify | The Slice 33 integrated recovery suite: runs the real upgrade CLI as a subprocess over committed fixtures and asserts Undo state across a reopen. It becomes this slice's v3 → v4 and reload evidence. |
| `apps/prototype-host/live-updates.test.ts` | modify | Pins one frame per Undo, the `project.section_*_undone` event types and the forward/Undo persistence-failure cases; it gains the Redo frames and is the seam for the action-insert atomicity test. |
| `apps/prototype-host/concurrency.test.ts` | modify | Runs a real `JsonDataStore`; home for the two-transitions-at-one-revision race and the safe-replay reconciliation case. |
| `packages/mcp-tools/src/tools/undo.ts` | modify | `undo_operation` takes `actionId` and `expectedRevision`; add `redo_operation` and `get_operation_history` (`projects.read`). |
| `packages/mcp-tools/src/tools/sections.ts` | modify | Four tool descriptions tell an agent to hold the `undoId` and pass it to `undo_operation`; they now describe the action id, the history and the revision. |
| `packages/mcp-tools/src/registry.ts`, `tool.ts`, `contract.test.ts`, `registry.test.ts` | modify | Registration and the count: thirty-five → thirty-seven. Permissions stay static per tool in this stage. |
| `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify | Replace the consumed-receipt assertions with the sequential chain, both transports. |

### Web

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/core/gateway/work-manager-gateway.ts` | modify | `history` gateway interface: `summary(projectId)` and `transition(input)`, replacing `undo`. |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `.spec.ts` | modify | HTTP adapter for both calls. |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | modify | Fake implementation and the new receipt shape. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `.spec.ts` | modify | More than a field rename. It orders receipts by the server's workspace `sequence` — the field §27 loses — so the high-water mark becomes the per-history `revision`. Its `undoFailureNotice` branches on `undo_consumed`/`undo_expired`/`undo_conflict` and treats *consumed* as terminal, clearing the receipt; the replacement, `history_not_next`, is **not** terminal — undoing the newer action first repairs it — so the seven new reasons need an explicit mapping to notice kinds. |
| `apps/web/src/app/features/projects/pages/reflections-page-store.ts` and paired spec | modify | Same receipt-shape migration. `todos-page-store.ts` handles no receipts and is deliberately not listed. |
| `apps/web/src/app/features/projects/section-undo-notice.ts`, `.html`, `.spec.ts`, `.stories.ts` | modify | Call the history transition instead of `undo.execute`; wording unchanged. |
| `apps/web/src/app/features/projects/project-canvas.ts`, `.spec.ts` | modify | Dereferences `receipt.undoId` in five places for its post-Undo focus handling; it moves to the action id. |
| `apps/web/src/app/features/projects/pages/reflections-page.ts`, `.html`, `.spec.ts` | modify | Calls `store.undoOperation()`; same migration. |
| `apps/e2e/section-edit-undo.spec.ts`, `removal-undo.spec.ts`, `archive.spec.ts` | modify | All three drive `POST /api/undo/:id`, `undo_operation` with `{ undoId }` and the `undo_consumed`/`undo_conflict` tokens directly. They move to the transition route and the new reasons, and the two Undo specs each gain a Redo step — otherwise Stage A's new direction has no browser-level evidence at all. |
| `packages/domain/src/project-archive-service.test.ts` | modify | Calls `harness.sectionService.remove` and `harness.undoService.undo` directly. |
| `packages/domain/src/undo-service.test.ts`, `undo-recorder.test.ts` | delete | Their cases migrate into `operation-history-service.test.ts` and `operation-recorder.test.ts` rather than vanishing; the migration is part of step 8, not a cleanup afterwards. |

### Documentation

| File | Change | Responsibility |
|---|---|---|
| `Canvas Work Manager — …Specification.md` §§14, 27, 31, 54, 57, 61 | modify | §14: version 4, the chained converter, and the "not a version chain" sentence the chain contradicts. §27: the receipt's `sequence` wording only — header controls stay planned. §31: the bidirectional per-actor lifecycle. §54: `undo_operation`'s input and grant, the refusal prefixes, two new tools, the count. §57: the four `*_redone` actions. §61: the summary and transition routes and the typed 409 reasons. |
| `AGENTS.md` | modify | Schema version 3 → 4, the tool count, and the dependency graph sentence naming `OperationRecorder`/`OperationHistoryService`. |
| `README.md`, `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | modify | Upgrade command, new tools, the tool count, current walkthrough. |
| `docs/architecture/{overview,what,how,why}.md` | modify | The top-level tree states "schema version 3", the v2 → v3 converter and the thirty-five tools; the folder glob below does not reach it. |
| `docs/architecture/{contracts,repositories,prototype-data,domain,mcp-tools,prototype-host/api,prototype-host/live-updates,prototype-host/mcp-transport,web/core,web/projects,testing}/*.md` | modify | Four-file updates per touched system, with Compodoc symbol links — `live-updates/how.md` pins the Undo frame rules and `mcp-transport/why.md` names the Slice 30 round trip. `pnpm docs:check` fails on the deleted `UndoService`/`RepositoryUndoRecorder` symbols these files link, so this row is not optional polish. |
| `docs/decisions/` | create/modify | New: history scope and ownership; bidirectional granularity and retention; the v4 conversion, its two-step chain against §14's "not a version chain", and receipt retirement; the `retired` action state and what replaces supersession; deferring historical activity identity and the retry cache. Dated amendments to `2026-09-section-removal-undo-records.md`, `2026-09-section-edit-undo-boundaries.md`, `2026-09-disposable-removal-and-immediate-undo.md`, `2026-09-what-undo-means-for-an-archived-row.md` and the three activity decisions. Index in `README.md`, link from each `why.md`. |
| `docs/roadmap/planned/34-undo-redo-and-archive.md`, `docs/roadmap/goals.md` | modify | Note Stage A's activation and its slice number; the direction stays planned until every stage closes. |
| This plan's **Coverage audit** section, or a `docs/decisions/` entry if it outgrows the plan | create | Slice 34 assigns the gateway/domain write audit to Stage A. Every exposed mutation gets a stage or a transient/tooling-only reason; Stages B and C are scoped from it. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `contracts/operation-history.test.ts: rejects an unknown operation version` | An unrecognised `version` or `type` fails parsing rather than executing. |
| `contracts/operation-history.test.ts: a cursor is a non-negative integer no higher than the order high-water mark` | The invariants a single object *can* assert. Whether the cursor names a stored action is a cross-collection rule and belongs to `data-store.test.ts` below. |
| `contracts/operation-history.test.ts: a summary carries no snapshot` | Ids, labels, revision and availability only — no inverse data ever leaves the domain. |
| `domain/operation-history.test.ts: A → B → undo → undo → redo → redo` | The state machine returns the exact four intermediate states and a monotonic revision. |
| `domain/operation-history.test.ts: a new action clears only the redo branch` | Branch invalidation drops undone actions and keeps applied ones. |
| `domain/operation-history.test.ts: a no-op, a refusal and a failure preserve redo` | Only a successful new write clears the branch. |
| `domain/operation-history.test.ts: only the next action is executable` | A conflicted top action is never skipped to reach an older one. |
| `domain/operation-history.test.ts: expiry and the 50-action cap prune oldest-first` | Retention is per history, and pruning cannot resurrect a discarded branch. |
| `domain/operation-history.test.ts: order counter survives pruning` | A new order is never reused after its record is pruned. |
| `domain/operation-recorder.test.ts: records into the acting actor's own project history` | Actor + workspace + owning project scope; an agent never enters a person's stack. |
| `domain/operation-recorder.test.ts: a rolled-back unit records nothing` | The record commits with the write it reverses or not at all. |
| `domain/operation-history-service.test.ts: same-field A/B chain undoes in order` | The old section-supersession refusal is gone and applied-state checks replace it. |
| `domain/operation-history-service.test.ts: each family reverts and reapplies exactly` | Add, move, update and remove in both directions over their recorded footprint. |
| `domain/operation-history-service.test.ts: redo of a removal refuses when new rows appeared` | Redo never absorbs content created after the Undo. |
| `domain/operation-history-service.test.ts: another actor's overlapping edit refuses` | A typed conflict, nothing written, cursor and revision unchanged. |
| `domain/operation-history-service.test.ts: an unrelated later edit survives` | The inverse writes only its recorded fields. |
| `domain/operation-history-service.test.ts: a stale expectedRevision refuses` | Two tabs cannot both advance one cursor. |
| `domain/operation-history-service.test.ts: a stale-revision refusal returns the current summary` | A caller whose response was lost reconciles instead of replaying. |
| `domain/operation-history.test.ts: revision increments on record, transition and retirement, never on pruning` | A background prune cannot refuse an innocent client. |
| `domain/operation-history-service.test.ts: an archived ancestor blocks a transition` | The existing blocked rule survives the rewrite in both directions. |
| `domain/operation-history-service.test.ts: summary needs read, transition needs write` | Operation-dependent grants; the blanket `projects.write` read guard is gone. |
| `domain/operation-history-service.test.ts: a foreign or unknown history answers not found` | No disclosure through the summary or a transition. |
| `domain/operation-history-service.test.ts: an injected persist failure rolls everything back` | Content, history, cursor and activity are one unit. |
| `domain/operation-history-service.test.ts: an injected recorder failure rolls everything back` | The recorder seam the harness already exposes; a failure to record must not leave the content write standing. |
| `domain/operation-history-service.test.ts: each direction records its own activity verb` | `*_undone` and `*_redone` are distinguishable in the feed and the live frame. |
| `domain/operation-history-service.test.ts: an action that is not the cursor's next step refuses as history_not_next` | The refusal that replaces `undo_consumed`, with its own message. |
| `domain/operation-history-service.test.ts: a move whose section has since been moved refuses on neighbours, not on index` | The concrete check that replaces supersession for the move family. |
| `domain/operation-history-service.test.ts: two removals of one retained section in one clock instant cannot cross-reverse` | The case `section-removal-undo.ts` documents as invisible to applied state; the captured `archiveGeneration` keeps it refused. A `disposition: 'deleted'` removal is covered by the existing existence check instead, and has its own row. |
| `domain/operation-history-service.test.ts: Redo of an add restores the section to its recorded placement` | The placement the add payload gains, and the reason it gains it. |
| `domain/operation-history-service.test.ts: a reapply replays captured markers and the captured generation verbatim` | A fresh `archivedAt` would make the next Undo refuse `archived-differently` and break the gate. |
| `domain/operation-history.test.ts: a retired action is skipped in both directions` | The pure state machine's half: the cursor steps past a retired action, and Redo does not then select it. |
| `domain/operation-history-service.test.ts: a not-archived removal after an out-of-band restore retires and refuses with a refreshed summary` | The service half, where the refusal is classified: the retirement commits and the next call reaches the action below. |
| `domain/operation-history-service.test.ts: move Undo reports partial placement when the exact original location is gone` | Slice 34's deterministic-fallback rule, for the one family Stage A owns that has placements. |
| `domain/section-service.test.ts: a later update does not make a repeated removal recover an update receipt` | `outstandingFor` keeps its narrow removal-only meaning. |
| `prototype-host/live-updates.test.ts: an injected action-insert failure publishes no frame` | The third atomicity seam, at the layer that actually publishes. |
| `prototype-host/live-updates.test.ts: one frame per transition, per direction` | Redo joins Undo in the existing frame rules. |
| `prototype-host/concurrency.test.ts: two transitions at one revision — exactly one advances` | The race, against a real file store rather than an in-memory one. |
| `prototype-host/concurrency.test.ts: a replayed transition refuses as stale and returns the current summary` | A lost response reconciles; nothing executes twice, and no cached result is needed to know it landed. |
| `prototype-host/recovery-undo-acceptance.test.ts: cursor, revision and both entries survive a restart` | The gate's reload clause, end to end over a real data file and the real upgrade CLI. |
| `prototype-host/mcp/handler.test.ts: a revoked grant fails the next transition` | Grant revocation takes effect immediately (§53). |
| `prototype-host/api tests: an expired or pruned action refuses over HTTP` | The gate's expiry clause reaches the API layer, not only the domain. |
| `domain/section-service.test.ts: writes return an OperationReceipt` | The receipt names its action, history and revision; no `sequence`. |
| `prototype-data/upgrade-project-pages.test.ts: the v3 intermediate is frozen at 3` | A future schema bump cannot silently change the v2 conversion's output. |
| `prototype-data/upgrade-operation-history.test.ts: v3 → v4 preserves every business collection` | Only `undoRecords` and the two new collections change. |
| `prototype-data/upgrade-operation-history.test.ts: retires legacy receipts with the reset notice` | Consumed, unconsumed and legacy `reassign` records are dropped, not reinterpreted. |
| `prototype-data/upgrade-operation-history.test.ts: the v4 output is validated before anything is written` | The safety the frozen v3 step gives up is restored at the end of the chain. |
| `prototype-data/upgrade-cli.test.ts: the v2 fixture converts through to v4` | The chained path and the CLI's version sniffing, in the split suite Slice 34 anticipated. `upgrade-project-pages.test.ts` keeps only the frozen-v3 converter's own cases. |
| `prototype-data/upgrade-cli.test.ts: a repeat run on a v4 file writes nothing` | Idempotence, at the layer that now owns the no-op branch. |
| `prototype-data/upgrade-project-pages.test.ts: a failed conversion writes nothing` | **Extend the existing case** (it already covers this for v2 → v3) to the chained path, rather than adding a second one. |
| `repositories/data-store.test.ts: one history per actor, project and workspace` | The uniqueness rule the cursor depends on. |
| `repositories/data-store.test.ts: an action names a stored history and a unique order within its high-water mark` | Ordering integrity at commit: every action order is positive and no greater than its history's order high-water mark. |
| `repositories/data-store.test.ts: a history must name a stored project` | The reference stays strict until the stage that first deletes a project — see the departures section. |
| `repositories/data-store.test.ts: a cursor no higher than the order high-water mark` | The cross-collection half of the cursor invariant, with `0` valid. |
| `mcp-tools/contract.test.ts: undo/redo/summary tools declare their own grants` | `get_operation_history` reads, the transitions write. |
| `mcp-tools/registry.test.ts: the registry lists the new tools once` | Registration and the documented tool count agree. |
| `prototype-host/api tests: transition rejects unknown fields and stale revisions` | Strict input parsing and a 409 for a stale revision. |
| `web/prototype-work-manager-gateway.spec.ts: summary and transition hit their routes` | The adapter matches the contract. |
| `web/section-undo-notice.spec.ts: the notice executes a history transition` | The one existing surface keeps working on the new API. |
| `web/project-page-store.spec.ts: history_not_next leaves the recovery offer standing` | The store's terminal-refusal branch was written for `undo_consumed`, which was terminal; its replacement is repairable by undoing the newer action first. |
| `prototype-host/mcp/handler.test.ts: a stale expectedRevision refuses through undo_operation` | An agent is the likeliest holder of a stale revision, so the race is proved through MCP too. |
| `apps/e2e/section-edit-undo.spec.ts`, `removal-undo.spec.ts`: each migrates its direct transition-route assertions and verifies an undo-then-redo round trip | Browser-host evidence for the new route, not a new visible Redo control. The notice remains Undo-only in Stage A; Stage C owns the persistent controls. |
| `apps/e2e/archive.spec.ts`: migrated to the transition route and the new reason tokens | The third spec that drives Undo directly keeps passing. |

## Boundaries touched

- **Domain depends on abstractions only.** `OperationHistoryService` composes repository
  interfaces, `ActivityService` and `Clock` — the same deliberate edge `UndoService` has today.
  It must never call `SectionService`, `TaskService` or `ReflectionService`, or it would record
  the inverse of its own inverse. `operation-history.ts` is pure: no repository, no clock reads.
- **The recorder is an interface.** `SectionService` depends on `OperationRecorder`, never on
  the history service. AGENTS.md's named dependency graph is updated in the same change.
- **Contracts once.** Every shape lives in `packages/contracts`; the host, MCP tools, domain,
  web gateway and fixtures import it. No parallel type in the adapter or the fake gateway.
- **MCP calls domain.** The new tools call `OperationHistoryService`, never a repository, and
  the registry stays transport-free.
- **Web depends on gateway interfaces.** Components and stores use the `history` gateway
  interface; only `app.config.ts` names the prototype adapter. No new `core/` → feature or
  `core/` → `prototype/` edge; the shell-scoped history store is Stage C's work, not this one.
- **No `new Date()` in domain.** Order, timestamps and expiry come from `Clock`.
- **Deliberately disposable (§71).** JSON repositories, the host's HTTP layer and the upgrade
  CLI stay thin; the state machine is the part that earns real tests.

## Explicit non-goals

- Anything in Stages B, C, D or E of Slice 34, as listed under **Do not** above.
- A generic command or migration framework, a JSON patch executor, or an HTTP idempotency
  platform. There is no persisted retry cache in this stage: `expectedRevision` already makes a blind retry safe, and Stage C revisits the message quality.
- Keyboard shortcuts, a history browser, cross-actor or selective Undo.
- Retaining v1 receipts across the conversion. They are retired with a notice; if continuity is
  ever required it becomes a legacy executor stage, not a silent reinterpretation.
- Touching Archive Restore semantics, which stay separate from history in every stage.

## Open questions

These are the Slice 34 activation gates that Stage A cannot start without. The first three must
be answered before the first test is written; each becomes a §78 decision entry in this slice.

- **History scope.** Proposed: exact actor + workspace + owning project, shared across that
  project's pages, with a descendant action recording in the descendant's history. A root-tree
  history would change cursor ownership and the summary route's shape, so it cannot be deferred.
  *Assumption if unanswered:* the proposed per-project scope, recorded as a decision with a
  `Revisit when` of "a root Todos action's history feels lost".
- **Retention and conversion.** Proposed: 24 h, 50 actions per history (applied and undone
  combined), and a v4 reset of legacy receipts. *Assumption if unanswered:* as proposed.
- **Two departures from Slice 34's Stage A** — historical activity identity and the persisted
  retry cache, both moved to a later stage. The reasoning is in the section above; it is listed
  here because Slice 34 assigned both to this stage, so it is the user's call to overrule.
  *Assumption if unanswered:* both deferred, with a decision entry recording why.
- **The `retired` action state.** A permanently unsatisfiable action must not wedge the stack
  (see the history model above), but "permanently unsatisfiable" has to be decided per refusal:
  `not-archived` after an out-of-band Archive Restore qualifies; an ordinary conflict does not.
  *Assumption if unanswered:* only the refusals listed in the history model retire an action, and
  the list is a decision entry, not a heuristic.
- **Route shape.** `POST /api/history/:historyId/transition` with a direction, or separate
  `/undo` and `/redo` routes? One route keeps the revision check in one place; two read better
  from a client. Decide in review; it is a naming decision with no behavioural consequence.
- **Editor commit boundaries.** Not load-bearing in Stage A (sections commit on blur or submit),
  but confirm before Stage B, where autosaving text would otherwise become one action per
  keystroke.

## Revisions

- **Round 1 (2026-09-16):** two independent reviewers read the plan against the spec, the
  architecture folders and the source. Every finding below was checked against the code before
  it was accepted; none were rejected.
  - **The change list was missing the files that actually block the change.** Both reviewers
    found the same hole from different directions: `packages/domain/test/test-support.ts` and
    `packages/mcp-tools/test/harness.ts` construct `UndoService`/`RepositoryUndoRecorder` for
    twenty-plus suites; `recovery-undo-acceptance.test.ts`, `live-updates.test.ts`,
    `concurrency.test.ts`, `section-ownership.test.ts` and `contracts/index.test.ts` assert the
    current shapes; `apps/e2e/archive.spec.ts`, `project-canvas.ts`, `pages/reflections-page.ts`
    and `mcp-tools/src/tools/sections.ts` consume `undoId` directly; and
    `scripts/check-package-imports.mjs` allowlists `UndoRecordRepository` by name, so `pnpm lint`
    would fail on the first domain import. All are now listed with their responsibilities, and
    the three host suites became the homes for the atomicity, concurrency and reload evidence.
  - **The plan was a big bang.** Thirty-eight files reference the Undo internals and
    `seeds.test.ts` compares every builder to a committed snapshot, so the original sequencing
    left the suite red for days. Added an **Implementation order** section that builds the new
    machinery alongside the old — using the Slice 30 precedent of defaulted collections inside
    version 3 — and does the deletion, the version bump and the converter in one short final
    commit.
  - **Three factual errors.** The version remedy message is in `packages/repositories/src/data-store.ts`,
    not `persistence/store.ts` (which needs a repository swap instead); `apps/prototype-host/api/errors.ts`
    already maps any `DomainRuleError` to 409, so its row described work that does not exist; and
    the section update route is `PATCH /api/sections/:id`, not `POST`.
  - **Spec amendments were under-counted.** §14 (version 3, "not … a version chain",
    `undoRecords` joined inside v3), §27 (the receipt's public `sequence`), §54
    (`undo_operation`'s `{ undoId }`, the refusal prefixes, the tool count) and §61 (the Undo
    route and its 409 reasons) all state things this slice falsifies. Added alongside §31 and
    §57. The tool count and schema version are spelled out in eight further files, including
    `docs/architecture/{overview,what,how,why}.md`, which the folder glob did not reach; the
    `prototype-host/live-updates` and `mcp-transport` four-file sets were also missing.
  - **The refusal taxonomy had a hole.** Under a cursor the commonest refusal is "that is not
    the next step in this direction", which `undo_consumed` used to cover and none of the six
    proposed reasons named. Added `history_not_next`.
  - **Two contract tests were unimplementable.** A Zod schema over one collection cannot check a
    cursor against another collection's rows, nor resolve a captured activity identity. Those
    rows moved to `data-store.test.ts`; contracts keep only what one object can assert.
  - **`outstandingFor` was quietly widened.** "The newest applied action" would hand a repeated
    `remove_section` an *update* receipt; §31 and §54 promise a removal receipt. Restated
    narrowly, with a test.
  - **A grant refusal was given the wrong status.** Acceptance said a missing grant returns
    not-found; §53 and the existing 403 convention say it names the missing permission, and 404
    is reserved for a foreign or unknown id. Split into the two cases.
  - **Slice 34's Stage A coverage audit had been dropped**, and Redo's activity verbs were never
    named. Both are now deliverables. The dynamic per-action permission metadata moved out to
    Stage B, where `tasks.write` first makes it testable — nothing in Stage A can tell it from a
    static `projects.write`.
  - **Smaller corrections:** `pnpm prototype:upgrade` takes exactly one path, so the acceptance
    step names the fixture and a temp copy; "byte-for-byte" became deep equality, because the
    converter re-serializes the document (only the backup is byte-identical); the stale
    `.prototype/e2e-data.json` and a developer's own data file must be handled before the first
    post-bump run; `pnpm e2e` runs whole rather than filtered; the CLI must version-sniff before
    chaining; `prototype-data/src/index.ts` must export the converter; `UndoRecordIdSchema` can
    simply go; the redundant `docs:check` left the command block; the retry cache became an open
    question with a stated default, since caching a whole result snapshot contradicts this
    slice's own no-snapshot rule.
- **Round 2 (2026-09-16):** two fresh reviewers, one checking every round-1 fix against source
  and one reading for design soundness. Every round-1 fix was verified correct; nothing had to be
  reverted. The remaining findings were concentrated in exactly the two places a file list cannot
  reach — the sequencing, and the rules the state machine was assumed to have rather than stated.
  - **Two things left the stage.** Historical activity identity was in Stage A only because
    Slice 34 said it "rides this conversion" — but section events already record with
    `entityType: 'project'`, deliberately, so nothing in Stage A can produce an absent activity
    target, and the relaxation would weaken a hand-edit check for a capability only Stage B uses.
    The persisted retry cache buys a better message rather than correctness, because
    `expectedRevision` already makes a blind retry safe. Both moved out, with the reasoning
    written down as a departure from Slice 34 rather than a quiet omission, and the
    "history outlives its project" relaxation followed the first one.
  - **The state machine was under-specified in five load-bearing ways**, each now written out
    under **History model**: the cursor is an order value, not an action reference, so pruning
    and undoing to the bottom cannot break its invariant; `revision` increments on record and
    transition only, never on pruning; pruning is contiguous from the ends, because a settable
    clock means expiry order is not order order and "the next action" has no meaning across a
    hole; expiry is lazy, so an expired action refuses while retained and 404s once pruned; and a
    permanently unsatisfiable action retires rather than wedging every older action behind it —
    the Archive-Restore-then-Undo-removal dead end, which single-use receipts never had.
  - **"Applied-state, conflict-aware checks" was hiding two missing guards.** Only
    `section.update` has a field-value check today; `section.move` relies on supersession alone,
    so removing supersession would have let a cross-actor move reversal overwrite silently. Its
    replacement is a neighbour comparison against `placementAfter`. And `section-removal-undo.ts`
    documents a case applied state cannot see — two removals of one section in a single clock
    instant — which needs a per-section archive generation. Both are now specified and tested.
  - **Redo needed two rules nobody had written.** `section.add`'s payload carries no placement,
    so Redo had nowhere to put the section back; it gains one. And a reapply must replay captured
    markers verbatim, stamping only `updatedAt` from `Clock` — a fresh `archivedAt` would make the
    *next* Undo refuse `archived-differently` and fail the gate on the remove family.
  - **The implementation order did not sequence the one field that crosses every package.**
    Section write results now gain an optional `operation: OperationReceipt` beside `undo`, so
    contracts, domain, host, MCP and web move independently; the recorder became a decorator
    rather than a second injected dependency, which keeps the harness's recorder-failure seam
    honest; step 1 regenerates the seed snapshots, because a defaulted collection changes them
    immediately; and the final commit split into "retire the old service" and "bump the version".
  - **Smaller corrections:** freezing the v2 converter removes *both* its `validateDocumentIntegrity`
    calls and its intermediate is opaque JSON, since a hand-written v3 type would duplicate a
    contracts shape; `project-page-store.ts` needs a real refusal-mapping change, not a field
    rename, and its `sequence` high-water mark becomes `revision`; `todos-page-store.ts` handles
    no receipts and was listed by mistake; `project-archive-service.test.ts` calls the old service
    directly; the two deleted test files migrate their cases rather than vanishing; `history_empty`
    was unreachable and went; expiry and the revision race gained HTTP and MCP evidence, since the
    gate says "through domain/API/MCP"; and `live.ts` was checked and needs no change, recorded so
    Stage B does not re-raise it.
- **Round 3 (2026-09-16):** a closure review confirmed every round-1 and round-2 fix against
  source and found five remaining findings, four of which were my own incomplete sweep: the
  retry cache and the "history outlives its project" relaxation had been argued out of the stage
  in prose while the file list and test plan still told an implementer to build them, and
  `history_empty` survived in the refusal list after the Revisions said it had gone. All are now
  consistent. The fifth was real: the per-section **archive generation** that replaces removal
  supersession was specified as a rule and tested, but owned by no file — and it cannot live in
  the history, because the case it catches spans two actors' histories, which is exactly why
  today's check scans the whole workspace. It is now a monotonic `archiveGeneration` field on the
  section, with the two rules that keep it honest: Archive Restore does not bump it, and a Redo
  replays the captured value. The **`retired` transition** was also under-specified — it mutates
  the cursor, which contradicted "the cursor is unchanged after every refusal", and its only test
  lived in the pure state machine, which cannot see the executor's refusal classification. The
  mechanism is now stated: the transition commits the retirement, executes nothing, and refuses
  with `history_retired` and a refreshed summary, so a client never gets a step it did not ask
  for. The reviewer raised no other substantive findings.
- **Round 4 (2026-09-16):** a verification pass over round 3's five fixes confirmed four applied
  cleanly and found that the fifth — the new `archiveGeneration` guard — had been given a home in
  contracts and integrity but no write side, no captured field in the removal payload, and no
  place in the implementation order. It also found three contradictions the round-3 edits
  introduced: the Redo rule selected the very action retirement had just stepped past, wedging
  the direction retirement exists to unwedge; the `revision` gloss enumerated recording and
  transitions but not retirement, which also commits; and the guard could not cover a
  `disposition: 'deleted'` removal, because a deleted section has no row to read the generation
  from. All are closed — Redo skips retired actions, retirement is named in the revision rule,
  the guard is scoped to retained removals with the deleted case left to the existence check that
  already covers it, and the field is defaulted rather than required so it can land before the
  version bump without rejecting every version-3 file on disk. One integrity rule was also
  restated so a single document snapshot can actually assert it: "no stored action's captured
  generation exceeds the section's", rather than "never decreases", which would need the previous
  document.
- **Round 5 (2026-09-16):** closure check confirmed all six round-4 items closed consistently
  across the file and returned **no substantive findings**: a competent implementer can start
  from step 1 or step 2, write the first failing test from the test plan, and read "done" from
  the acceptance items and the gate chain, with every remaining undecided item flagged as a
  decision with a stated default or as non-behavioural. Two imprecisions were corrected in
  passing — a test row that omitted retirement from the revision rule, and the `archivedAt`
  precedent, which is `.optional()` rather than defaulted.
- **Round 6 (2026-09-16):** a fresh source-grounded plan review found two P1 gaps. The
  high-water mark was named as authoritative for allocation and cursor movement, but the
  cross-collection integrity row did not require each stored action's positive order to be at
  most that history's high-water mark; that rule and its test are now explicit. It also caught a
  scope contradiction: a promised browser Undo/Redo journey implied a visible Redo affordance,
  while this stage deliberately adds no UI and keeps `SectionUndoNotice` Undo-only. The e2e work
  is now explicitly direct transition-route evidence from the browser harness, not a UI journey;
  Stage C remains the owner of visible controls.

## Coverage-matrix audit

Every mutation reachable through the web gateway (`apps/web/src/app/core/gateway/work-manager-gateway.ts`),
a domain service exported from `packages/domain/src/index.ts`, an MCP tool or a host write route,
mapped to the stage that gives it history or the reason it stays outside project history. Checked on
2026-09-16 against those four inventories; Stages B and C are scoped from this table.

| Mutation | Gateway / HTTP / MCP | Domain | History |
|---|---|---|---|
| Section add | `sections.create` / `POST /api/projects/:projectId/sections` / `create_section` | `SectionService.add` | **Stage A** — `section.add`, with placement |
| Section settings update (title, config, collapse, span) | `sections.update` / `PATCH /api/sections/:id` / `update_section` | `SectionService.update` | **Stage A** — `section.update`; a normalized no-op records nothing |
| Section move | `sections.move` / `POST /api/sections/:id/move` / `move_section` | `SectionService.move` | **Stage A** — `section.move` |
| Section remove | `sections.remove` / `DELETE /api/sections/:id` / `remove_section` | `SectionService.remove` | **Stage A** — `section.remove`; cascade-only input is Stage D |
| Implicit Tasks/Reflections container creation | inside task/reflection writes | `SectionService.resolveContainer` | Stage B, as part of the task/reflection add that created it; receipt-free today |
| Section duplicate | `sections.duplicate` / `POST /api/sections/:id/duplicate` | `SectionService.duplicate` | Stage C |
| Section Archive Restore | `sections.restore` / `POST /api/sections/:id/restore` / `restore_section` | `SectionService.restoreSection` | Stage C (Undo Restore); the restore itself stays the durable, history-free recovery path and is what retires a removal action |
| Task create / update / complete / archive / restore | `tasks.*` / `POST /api/tasks`, `PATCH /api/tasks/:id`, `…/complete`, `…/archive`, `…/restore` / `create_task`, `update_task`, `complete_task`, `archive_task`, `restore_task` | `TaskService.create`, `update`, `complete`, `archive`, `restore` | Stage B |
| Reflection create / update / archive / restore | `reflections.*` / `POST /api/reflections`, `PATCH /api/reflections/:id`, `…/archive`, `…/restore` / `add_reflection`, `archive_reflection`, `restore_reflection` | `ReflectionService.create`, `update`, `archive`, `restore` | Stage B |
| Project create / update (fields, status, parent) | `projects.create`, `projects.update` / `POST /api/projects`, `PATCH /api/projects/:id` / `create_project`, `update_project`, `restore_project` | `ProjectService.create`, `update` | Stage C |
| Project archive | `projects.update` with an archived status / `PATCH /api/projects/:id` / `archive_project` | `ProjectService.archive` | Stage C |
| Saved project layout mode | `projects.update` from the dev-panel layout control | `ProjectService.update` | Stage C — tooling UI, but it changes real project state |
| Progress formula / manual settings | `projects.update` | `ProjectService.update` | Stage C; derived progress is not a second action |
| Optional page enable/disable | `projectPages.setEnabled` / `PATCH /api/projects/:projectId/pages/:kind` / `set_project_page_enabled` | `ProjectPageService.setEnabled` | Stage C |
| Shortcut add / update / move / remove | `sectionShortcuts.*` / `POST /api/projects/:projectId/shortcuts`, `PATCH`, `…/move`, `DELETE /api/shortcuts/:id` / `add_section_shortcut`, `remove_section_shortcut` | `SectionShortcutService.create`, `update`, `move`, `remove` | Stage C |
| Undo / Redo transition, retirement | `history.transition` / `POST /api/history/:historyId/transition` / `undo_operation`, `redo_operation` | `OperationHistoryService.transition` | Outside — history's own state, never an action |
| Agent permissions / revoke | `agents.setPermissions`, `agents.revoke` / `PATCH /api/agent-connections/:id`, `…/revoke` | `AgentConnectionService.updatePermissions`, `revoke` | Outside — workspace settings, not project content |
| Agent last-used stamp | every authenticated MCP call | `AgentConnectionService.touch` | Outside — bookkeeping, not a user gesture |
| Activity event | inside every write | `ActivityService.record` | Outside — the audit record of an action, never itself undone |
| Seed load, reset, clock, AI provider, friction notes | `POST /prototype/seed`, `/reset`, `/clock`, `/ai-provider`, `/notes` | host tooling | Outside — prototype tooling; a seed load or reset replaces the document and its histories with it |
| Theme, dashboard widget layout, persona, network simulation | browser-local state | none | Outside — client presentation, not in the document |

No write in any of the four inventories is unlisted.

## Outcome

**Deliverables.** Section add, move, settings update and removal now record typed actions into a
per-actor, per-workspace, per-owning-project operation history and undo *and redo* through
`OperationHistoryService` — domain, `GET /api/projects/:id/history` and
`POST /api/history/:historyId/transition`, and `get_operation_history`, `undo_operation` and
`redo_operation` over both MCP transports (37 tools). The document is schema version 4:
`undoRecords` is gone, `operationHistories` and `operationActions` joined it, and every section
carries a removal-only `archiveGeneration`; `pnpm prototype:upgrade` sniffs the version and runs the
frozen v2 → v3 step then the validating v3 → v4 step, retiring old receipts with a notice. The pure
state machine (`operation-history.ts`), the recorder and the direction-aware executors replace
`UndoService`, `RepositoryUndoRecorder` and section supersession with applied-state checks, the
per-section generation guard and `retired` actions. Web gateway, adapter, fake, page stores and the
Undo notice moved onto `OperationReceipt`; the notice stays Undo-only. Five decisions were recorded
(scope, retention, v4 conversion, retired actions, Stage A deferrals) and seven earlier ones
amended; the specification (§9, §14, §27, §31, §54, §57, §61–63), architecture sets, AGENTS.md,
README and both guides were updated. The coverage-matrix audit is above. Evidence for all thirteen
acceptance items: domain chain, branch, families, conflicts, retirement, expiry and pruning
(`operation-history*.test.ts`, `operation-recorder.test.ts`, `section-edit-undo.test.ts`); HTTP
chain and branch invalidation (`acceptance.mjs`); MCP chain on both transports with a fresh
connection (`mcp-acceptance.mjs`, `handler.test.ts`); commit-before-publish and three failure seams
(`live-updates.test.ts`); the race and safe replay on a real file store (`concurrency.test.ts`);
reload and CLI conversion (`recovery-undo-acceptance.test.ts`, `upgrade-cli.test.ts`,
`version-3-undo-compatibility.test.ts`); grants and 403/404 (`routes.test.ts`). Real use: the
developer data file (version 3, eight receipts) was converted with `pnpm prototype:upgrade`, loaded
by `dev:host`/`dev:web`, renamed twice through the canvas, undone from the notice, then
Undo/Redo/Redo, a stale replay (409 `history_revision_stale`) and Undo/Undo through the routes,
surviving a reload; two friction notes (`note-2026-09-16-001`, `-002`).

Final runs, after the review fixes: `pnpm docs:api`, `pnpm test` (root 9, contracts 253,
repositories 143, prototype-data 106, domain 611, mcp-tools 158, host 214, web 724), `pnpm e2e` 34
passed, `acceptance` and `mcp-acceptance` (both transports) passed, then `pnpm lint`, `pnpm build`
(998.18 kB initial; the 850 kB warning budget is exceeded as before, under the 1 MB error ceiling) and
`pnpm --filter web storybook:build`. The domain suite was rerun after a type-only fix to one new test.

**Diff review.** Three independent read-only reviewers (domain correctness; transport, web and
conversion; documentation and spec conformance). Verified and fixed:
- **P1 — move Redo straight after the actor's own Undo could refuse `moved`.** The check compared
  both recorded neighbours while `resolveRestoreIndex` places by one. It now checks the neighbour
  the placement used (surviving previous, else surviving next); two tests pin it.
- **P2 — the browser refused to resend a receipt after a `missing` conflict** the server treats as
  repairable (another actor's Undo can recreate the section). The "refused for good" rule and its
  disabled state were withdrawn; permanence is the server's retirement.
- **P2 — the Reflections page did not re-read its container** when a stale refusal showed the Undo
  had already landed. It now reconciles, like the canvas.
- **P2 — the v3 → v4 converter turned a non-array `sections` into `[]`.** It now throws.
- **P2 — stale text:** `contracts/how.md` literal version, `project-visibility.ts` reason name, the
  lazy-expiry comment in `operation-history.ts`, and the retired-actions decision's unqualified
  `missing` for removal Redo. The audit the docs reviewer found missing was written during review.
No finding was rejected.

**Deviations from the plan.**
- A transition naming a pruned action answers 409 `history_not_next`, not 404: the history is the
  caller's own, so a 404 would hide nothing and a 409 carries the summary to reconcile from.
  Acceptance item 9's expired-while-retained case refuses `history_expired` as planned.
- The summary answers `historyId: null` rather than 404 before a first write, and includes
  `blockedBy`.
- The move neighbour check compares only the neighbour the last placement used, not both (above).
- Transition results carry a direction-specific `result`; move and add outcomes may be `partial`;
  `section.remove` payloads require `disposition`.
- `operationHistories` and `operationActions` stay defaulted in version 4, as `undoRecords` was.
- The browser notice no longer names another actor on a conflict: under a per-actor history a
  conflict is always someone else's change.
- The "refused for good" browser rule was withdrawn rather than narrowed.
- Steps 3–9 of the implementation order landed as one change rather than nine commits.

**Deferred.** Historical activity identity (Stage B) and the persisted retry cache (Stage C), as
decided. Browser Redo and persistent header controls (Stage C). Task, reflection, project, page and
shortcut history per the audit. Friction: action labels name the pre-change title, which reads
ambiguously on a chain of renames; nothing in the browser shows Redo exists.

**Open questions.** Whether Stage C's labels should describe the change or the current title, and
whether editor commit boundaries need confirming before Stage B's autosaving text.
