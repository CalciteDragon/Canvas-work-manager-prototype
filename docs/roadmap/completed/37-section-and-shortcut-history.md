<!-- completed-record id="37" closed="2026-09-21" summary="Section duplication, durable section Restore and the four Home shortcut placement writes reverse and replay in the exact actor's owning-project history" -->
# Slice 37 — Section and shortcut operation history (Slice 34 Stage C1)

**Implemented and closed — 2026-09-21.** Planned on 2026-09-20 and built against that plan;
the **Outcome** at the end of this file is the record of what shipped.
[Slice 34](../planned/34-undo-redo-and-archive.md) is the parent direction, not a phase to
implement wholesale. [Stage A](../completed/35-operation-history-foundation.md) and
[Stage B](../completed/36-task-and-reflection-history.md) shipped before it; Stage C's remaining
obligations are named under **Phase boundary** below and are *not* closed by this slice.

## Goal

Make section duplication, durable section Restore and every existing Home shortcut placement
mutation safely reversible in the exact actor's owning-project history.

## Spec sections

Main §§8–13 (gateway, contracts, domain and repository boundaries), §§14–15 (compatible,
atomic persistence), §§19–20 (feature stores), §§27, 31–32 (ownership, placement, recovery,
committed canvas writes), §45 (Clock), §§53–55 (grants and MCP), §57 (Activity), §§61–63
(API, live refresh and optimistic state), §§69–70 (verification), §§77–79 (use and decisions).
[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md).

With implementation, amend §§27, 31–32, 54, 57 and 61–63 to name the added history coverage.
Spec §31's permanent-retirement explanation must distinguish an out-of-band Restore from a
recorded Restore that the same actor can Undo before undoing the earlier removal. Restore
still needs no receipt to invoke, still survives expiry and still initially appends.
Do not document persistent header controls or Stage D Archive filtering as shipped.

## Build

1. Record duplicate as `section.add`, capturing the actual copy and its combined placement.
2. Add `section.restore` with exact before/after archive markers and changed-row footprint.
3. Add `shortcut.add`, `shortcut.update`, `shortcut.move`, `shortcut.remove`; record in the
   destination Home project's history, never the source project's.
4. Extend typed contracts, executor dispatch, family grants and transport/write results.
5. Migrate gateway and existing browser consumers; verify live reconciliation without new UI.
6. Prove the operations through domain, HTTP, existing MCP tools and browser acceptance.

## Done when

This is a bounded portion of Stage C's gate: **the section duplicate/Restore and shortcut rows
of Slice 34's coverage matrix reverse and replay safely, including mixed placement, reload,
minimal grants, and exact source/row preservation.** All checks below pass. It does not finish
Stage C's entire coverage matrix or its persistent-controls gate.

## Do not

No runtime code during this planning request. During implementation, do not add project/page
history, project creation recovery, saved project layout/progress history, header controls,
receipt-reporting infrastructure, persisted transition retry cache, cascade-only removal,
Delete styling, Settings, or restorable-only Archive projection. No new duplicate, shortcut
update or shortcut move MCP tools; those existing HTTP/domain surfaces are enough for this
phase. No duplicate button, row-copy feature, new store framework or production infrastructure.

## Phase boundary and remaining Stage C work

Stage C in the parent combines independent action capture with project-lifecycle integrity,
request retry semantics and broad browser coordination. This slice closes the existing canvas
operation families first, using the recorder and repositories already present. Subsequent
bounded phases must cover project/page creation and lifecycle plus saved layout/progress,
then persistent controls/reporting and the deferred retry cache; creation Undo must ship with
its authorized recovery route, never an unreachable Redo. These are remaining obligations,
not an assertion that this slice satisfies them. Stage D still follows usable broad Undo/Redo.
Create their numbered candidates when selected; do not expand this plan to absorb them.

## Repository findings and implementation rules

### Duplication captures what the product actually copies

`SectionService.duplicate` creates a new section on the same page immediately after its source
in the combined section/shortcut order. It clones config, title and presentation, but **copies
no task/reflection rows**. The current frame deliberately has no Duplicate control. Keep these
rules. Return `SectionAddResult` and capture the final stored copy after renumbering with
`captureSectionAdd`; use a duplication label on the receipt. No second action or new
`section.duplicate` discriminator is needed. Existing section-add executors already protect
substantive edits, canonical rows and shortcut references, preserve stable IDs and use the
archive-generation floor. The source may later change or disappear: Redo uses the captured
copy, not the source or a new duplicate request. Creation on a disabled page remains refused;
recorded recovery keeps the existing disabled-page rules.

### Section Restore is a new action, not a removal replay

`restoreSection` currently returns a bare section, appends at `live.length`, clears
`archivedAt` and each row's `archivedWithSectionId`, retains independently archived rows and
leaves `archiveGeneration` alone. A live-section retry is a true no-op. Preserve all of that,
including allowed recovery onto a disabled page and the archived-project/ancestor freeze.
Return `SectionWriteResult`, with a receipt on a change and `operation: null` on a no-op.
On a changed Restore, append to the ordered live placements and renumber that combined list
before capturing the final section/placement. Today's `live.length` assignment alone can
insert ahead of sparse positions; a hand-edited sparse canvas must still append densely.
Keep sibling updatedAt unchanged, and never normalize positions on a live-section no-op.

Capture `section.restore` version 1: owning project/page/section identity, archived marker
before Restore, archive generation, the tombstone's old position, actual combined placement
after Restore, and distinct `UndoRowChange` entries for only rows actually changed. Capture
all fields changed by that Restore, after schema normalization; do not infer the row set later
from current container contents. Reuse structural state schemas and `writeRow`, not a second
row definition or calls to TaskService/ReflectionService.

Undo Restore retains the section as archived, restores the captured archive markers/position
and exact affected-row markers, and densely renumbers the remaining live placements. It never
runs section-removal recovery policy, deletes the section, increments archiveGeneration, or
archives additional rows. Redo revives the captured rows and resolves the captured post-Restore
placement with the existing previous/next/index rule; the first ordinary Restore appends,
whereas Redo replays its committed placement. Report partial fallback and pageEnabled like
existing section transitions. Preserve unrelated title/config/row edits, createdAt and business
dates; only updatedAt uses Clock. Validate expected placement before Undo so another actor's
subsequent move is not erased. Redo compares the archived marker and generation; Undo requires
the live subject at that generation. Never move archiveGeneration backwards.

Extend `generationFloor` to consider stored `section.restore` generations as well as removals.
Another actor's removal action can be pruned while its later Restore remains: Add Undo/Redo
must not recreate the section at an older generation in that case. Extend the existing
repository integrity comparison to reject a Restore generation above a present canonical
section's generation, while still allowing absent historical subjects. This is the same
generation invariant, not a broader payload-reference requirement or integrity relaxation.

Before any transition write, preflight the subject, owner/page compatibility, captured rows'
current project/container/parent/archive-marker state and the entire live owned-row set.
Undo refuses a new live row or newly attached dependent that it would hide under the section;
Redo refuses newly marked rows it would otherwise silently absorb. Independently archived
rows that the original Restore did not change remain untouched. Missing/moved/structurally
changed captured rows refuse atomically. A conflicting unrelated field is not grounds to
rewrite it. Reuse the existing typed conflict vocabulary where accurate; add a contract member
only for a demonstrably distinct case, with its retry guidance.

Sequence tests must prove Remove → Restore → Undo Restore → Undo Remove → Redo Remove →
Redo Restore. An out-of-band Restore still makes a removal Undo retire when attempted;
recording Restore does not globally disable that safety rule. Later removal generations must
block the older Restore in both directions even at the same clock instant. For the new Restore
kind, use repairable refusal for field/placement/dependent/missing-row conflicts; a subject
whose generation advanced is permanent and retires explicitly. Never silently skip a conflict.

### Shortcuts own only a placement

`SectionShortcutService` already has projects/pages/sections/shortcuts, Activity, Clock, IDs
and a caller-owned UnitOfWork; inject `OperationRecorder`, as SectionService does. Do not add
TaskRepository/ReflectionRepository dependencies to this service. Each action stores the
**destination** project ID explicitly (the placement itself only has pageId).

- Add/remove capture the canonical `SectionShortcut` and combined placement, not the resolved
  source projection. Undo Add deletes just the unchanged placement; Redo Add recreates the same
  ID. Remove deletes it; Undo Remove recreates that same ID. No source section/config/row write.
- Update captures distinct changed `collapsed`/`columnSpan` fields with before/after values;
  preserve the other field and position. One committed gesture is one action.
- Move captures before/after combined neighbors and index, checks surviving expected neighbors,
  renumbers one page and changes only the moved subject's updatedAt. Fix the existing move
  no-op path, which currently calls `renumberPlacements` before discovering nothing moved:
  compare the combined index first, matching `SectionService.move`. A clamped no-op changes
  no timestamps or sibling positions, emits nothing and preserves Redo.

All transitions require the exact stored workspace/actor/history and `projects.write` without
an extra read grant. Add `shortcut` to the shared operation-family map and discovery metadata.
A removed placement's history remains in the destination root; source-subproject events never
enter that history. No source row data is returned under project grants.

Validate canonical destination Home ownership and same-tree, same-workspace source identity
before recreating a placement. A missing source blocks without fabricating it. An existing
archived or hidden source may be relinked as the existing unavailable placeholder; recovery
is of the reference, not an ordinary Add and not a source unarchive. A disabled source page
remains valid. Ordinary Add retains its live-source rule. Existing update/move/remove work
on unavailable references; preserve those rules. Ordinary Remove remains permitted while the
destination is archived, like existing section removal; history transitions remain blocked
until the destination's archived ancestry is reactivated.

Preflight occupied placement IDs, page/source drift, substantive edits before deleting a
created/recreated placement, and changed fields/neighbors before applying updates/moves.
Source *content* edits are never shortcut conflicts. Occupied IDs on a recreation retire like
section Add Redo; missing source/page and other repairable conflicts leave cursor/revision
unchanged. If source/page safety can be repaired, never classify it permanent merely because
it is currently unavailable. Preserve all unrelated placements and sibling updatedAt values.

### Contracts, atomicity, Activity and compatibility

Use strict version-1 payload members in new `section-restore-history.ts` and
`shortcut-history.ts` under contracts; compose into `UndoOperationSchema` and Undo/Redo result
unions in `undo.ts`. Shared helpers stay below the unions to avoid import cycles. Update
`operationProjectOf`, `operationSubjectOf`, `subjectSectionOf`, `OperationKindSchema`,
`OperationFamilySchema` and `OPERATION_FAMILY_PERMISSION` exhaustively.

Public envelopes: duplicate uses `SectionAddResult`, Restore uses `SectionWriteResult`;
shortcut create uses `{ shortcut: ResolvedSectionShortcut, operation: OperationReceipt }`,
update/move the same with nullable operation; remove uses `{ shortcutId, projectId, pageId,
operation }` with required receipt and no claim that a live shortcut remains. New shortcut
write contracts live separately from payload schemas, like row-write-result.ts. Public
transition results name the kind and destination project/page/shortcut ID, expose the canonical
placement only when present, and placement/outcome metadata for recreation/movement. Restore
transition results expose the current section and changed-row count/IDs, not structural snapshots.
No payload reaches a receipt, summary, refusal, Activity event or live frame.

Return the shortcut remove envelope from HTTP as 200 JSON instead of today's 204, and forward
it from `remove_section_shortcut` instead of undefined. Keep route/tool names and inputs.
Existing MCP covers add/remove shortcut and section Restore; duplicate and shortcut
update/move are HTTP/domain-only and receive HTTP evidence. Existing undo/redo tools can
execute all these families. Update descriptions and exact family metadata tests.

One ordinary write records one action and one event in the same unit; one transition records
one event and one cursor step without a new action. New transition events use
`project.section_restoration_undone/redone` and `project.shortcut_addition/update/move/removal_undone/redone`
(expand the slash alternatives into individual verbs). Target the destination project as the
existing section/shortcut events do, so no new Activity missing-target exception is necessary.
Atomic rollback includes rows, placements, history, Activity and live publication. No-op,
refusal and retirement publish no frame; retirement changes only its existing history state.

Keep schema version 5: these are additive operation variants, with no changed old payload or
canonical entity meaning. Explicitly test opening a pre-slice v5 document with all old action
kinds unchanged, then persist/reopen each new kind. No converter, seed reset or repository
integrity relaxation is authorized; extend only the existing generation comparison as above.
If implementation discovers that a stored shape really
must change, stop and revise this boundary and conversion plan before changing it.

### Browser integration is result migration, not a second history UI

Update the gateway interfaces, parser schemas, fake and callers together. `ProjectPageStore`
owns shortcut mutations; `ShortcutStore` is only the picker read and needs no history state.
Unwrap shortcut envelopes where the current store inserts/replaces/optimistically resizes a
placement; preserve generation guards, pendingWrites, complete-order guards, rollback and
read-only refresh retry. Archive Restore still returns success if the write committed but the
follow-up projection read failed. Retain receipts in the public gateway result; do not build
an unused reporter before persistent controls have a consumer.

Expand existing discriminated-result consumers (notably `undoResultMessage`) explicitly for
the added kinds so a new union member is never treated as a section with a placement by default.
Do not offer shortcut or Restore receipts through SectionUndoNotice in this phase. If a later
shortcut action makes an old notice stale, the existing typed stale/not-next handling must
refuse safely and must never undo the wrong action. `project.*` transition frames must refresh
both Home placement/source identity and Archive/container projections, including another tab.

## Acceptance check

Use returned IDs in isolated `personal-workspace`, `nested-projects` and `agent-heavy` data.
Never mutate the user's working document for acceptance setup.

1. HTTP-duplicate a populated Task List and a configured Rich Text section. Assert copy config
   is detached, copied row count is zero, order is immediately after the source, and one
   `section.add` receipt exists. Undo/Redo via HTTP across reload restores identical IDs/config.
   A later row or shortcut referencing the copy blocks destructive Undo without loss.
2. On a child work canvas remove a container containing live and independently archived rows,
   then Restore through root Archive. Assert only marked rows revive and section appends.
   Run the six-step Remove/Restore history sequence above; compare exact row markers and IDs
   after every step. Repeat with reflections, empty retained sections and disabled owner page.
3. On root Home add a shortcut to a child source between local sections, resize, collapse,
   move and remove. Undo all in reverse order, Redo in order and reload. Assert root-owned
   history, stable placement ID, mixed dense order and byte-identical source business data.
4. Recreate an unavailable reference safely; refuse missing/foreign source, occupied ID,
   changed local fields/order, new Restore dependents and later archive generation. Another
   actor's disjoint changes survive. Denials expose no other actor's history or payload.
5. HTTP and both actual MCP transports demonstrate supported tool families with only
   `projects.write` using receipts; summary discovery separately needs `projects.read`.
   Revoke grants/connections, race two transitions at one revision, and inject a failed commit:
   no duplicate step/event and no partial canonical changes. Reopen a JSON store and finish Redo.
6. In the browser use contextual shortcut creation, resize/collapse/move/remove and Archive
   Restore. Drive Undo/Redo through the same user's HTTP history endpoint (header controls are
   explicitly later), verify another tab/live view refreshes, reload, navigate during a delayed
   result and fail the post-commit refresh. Retry reads must never repeat writes. Prove Escape
   and same-value gestures create no history. Duplicate remains an HTTP acceptance action.
7. Advance Clock beyond 24 hours, prove transitions expire but ordinary section Restore still
   succeeds and records a fresh action. Record actual-use friction under slice 37.

Implementation commands: `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`;
`pnpm --filter @cwm/e2e e2e -- canvas-history archive canvas-editing section-edit-undo removal-undo`;
`pnpm --filter @cwm/prototype-host acceptance` and
`pnpm --filter @cwm/prototype-host mcp-acceptance`. Use existing separate host/web start commands
for manual use; Playwright owns its isolated servers. No application tests are claimed run
by this planning-only change.

## File-level change list

Paths are repository-relative; comma-separated basenames in a cell each name a concrete file.
`new` identifies proposed files. Existing unrelated fixtures are only migrated where their
return-shape/constructor assumptions actually change. Record exact final changes at closure.

| File | Change and responsibility |
|---|---|
| `packages/contracts/src/section-restore-history.ts`, `section-restore-history.test.ts` (new) | Strict Restore footprint and directional results; distinct rows and coherent identity/markers. |
| `packages/contracts/src/shortcut-history.ts`, `shortcut-history.test.ts` (new) | Four strict placement operation payloads and results; no source content snapshot. |
| `packages/contracts/src/shortcut-write-result.ts`, `shortcut-write-result.test.ts` (new) | Lightweight public envelopes, required/null receipt rules. |
| `packages/contracts/src/undo.ts`, `undo.test.ts`, `operation-receipt.ts`, `operation-history.test.ts`, `tool-permissions.ts`, `tool-permissions.test.ts`, `index.ts`, `index.test.ts` | Compose unions and exports, helpers/family permission; migrate pinned family/result-union counts and reject malformed/unknown variants. |
| `packages/domain/src/section-service.ts`, `section-service.test.ts` | Duplicate receipt and exact Restore capture/no-op result. |
| `packages/domain/src/section-restore-history.ts`, `section-restore-history.test.ts` (new) | Pure capture/revert/reapply functions with preflight, generation, row and placement checks. |
| `packages/domain/src/shortcut-history.ts`, `shortcut-history.test.ts` (new) | Pure placement capture/revert/reapply; narrow repository dependency type. |
| `packages/domain/src/section-shortcut-service.ts`, `section-shortcut-service.test.ts` | Recorder injection, four result envelopes, no-op-before-renumber. |
| `packages/domain/src/operation-history-service.ts`, `operation-history-service.test.ts`, `operation-recorder.ts`, `operation-recorder.test.ts` | Dispatch, Activity, source/section identity, explicit retirement and mixed-stack tests. |
| `packages/domain/src/section-edit-undo.ts`, `section-edit-undo.test.ts`, `section-removal-undo.ts`, `operation-execution.ts`, `page-placements.ts` | Reuse/extract only the existing neighbor comparison/row-structure helpers needed by shortcut/Restore; keep generation floor and section behavior. Snapshot helpers already exist in page-placements. |
| `packages/domain/test/test-support.ts`, `packages/domain/src/page-ownership.test.ts`, `section-ownership.test.ts`, `project-archive-service.test.ts` | Recorder wiring and duplicate/Restore envelope fixture migrations. |
| `packages/repositories/src/data-store.ts`, `data-store.test.ts` | Extend generation integrity to Restore; v5 compatibility and new-kind persist/reopen tests. |
| `apps/prototype-host/api/services.ts`, `services.test.ts`, `routes.ts`, `routes.test.ts` | Wire recorder; typed JSON write envelopes, status change, scope and refusal checks. |
| `packages/mcp-tools/src/tools/sections.ts`, `tools/shortcuts.ts`, `tools/undo.ts`, `contract.test.ts`, `registry.test.ts`, `packages/mcp-tools/test/harness.ts` | Descriptions, returned envelopes, family metadata/minimal-grant tests and wiring. |
| `apps/prototype-host/mcp/handler.test.ts`, `apps/prototype-host/live-updates.test.ts`, `recovery-undo-acceptance.test.ts` | Real transport discovery/revocation, one-frame/rollback evidence, existing Restore fixture migration. |
| `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | HTTP chains and both-transport add/remove shortcut + section Restore chains/reopen evidence. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `prototype-work-manager-gateway.ts`, `prototype-work-manager-gateway.spec.ts`, `testing/fake-gateway.ts` | Typed results, parser/status changes and accurate fakes. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `project-page-store.spec.ts`, `project-canvas.spec.ts` | Unwrap shortcut results, retain guards and exhaustive transition messages; fixture migration. |
| `apps/web/src/app/features/projects/pages/archive-page-store.ts`, `archive-page-store.spec.ts`, `archive-page.spec.ts` | Restore envelope adoption and committed-write/read-failure regression. |
| `apps/e2e/canvas-history.spec.ts` (new), `apps/e2e/archive.spec.ts`, `canvas-editing.spec.ts`, `section-edit-undo.spec.ts`, `removal-undo.spec.ts` | New browser/HTTP histories and relevant raw-envelope assumptions in existing journeys. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | CURRENT_SLICE at implementation start, real-use evidence only. |
| Main specification (linked above), `AGENTS.md` | Shipped coverage and named shortcut-service recorder edge; no new executor-to-service edge. |
| `docs/architecture/contracts/overview.md`, `why.md`, `what.md`, `how.md` | Payload/result/family additions, lightweight imports and symbols. |
| `docs/architecture/domain/overview.md`, `why.md`, `what.md`, `how.md` | Scope, Restore and placement semantics, acyclic recorder/executor graph. |
| `docs/architecture/repositories/overview.md`, `why.md`, `what.md`, `how.md` | Restore generation consistency alongside removal generation; unchanged owner/reference requirements. |
| `docs/architecture/mcp-tools/overview.md`, `why.md`, `what.md`, `how.md` | Existing-tool results and fourth family, unchanged tool count. |
| `docs/architecture/prototype-host/api/overview.md`, `why.md`, `what.md`, `how.md` | JSON remove result and composition wiring. |
| `docs/architecture/web/core/overview.md`, `why.md`, `what.md`, `how.md`; `docs/architecture/web/projects/overview.md`, `why.md`, `what.md`, `how.md` | Gateway/results and actual browser capabilities, no premature header UI claims. |
| `docs/architecture/testing/overview.md`, `why.md`, `what.md`, `how.md` | Named acceptance evidence and commands. |
| `docs/decisions/2026-09-section-restore-and-shortcut-history.md` (new), `docs/decisions/README.md` | Adopt tested choices in the six-field §78 format, index and link from affected why files. |
| `docs/decisions/2026-09-operation-history-retired-actions.md`, `2026-09-section-edit-undo-boundaries.md`, `2026-09-what-undo-means-for-an-archived-row.md`, `2026-09-operation-family-permissions.md`, `2026-09-a-shortcut-resolves-identity-not-content.md` | Dated amendments where this phase changes previous rules. |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | New envelope/recovery semantics where the existing walkthrough or examples use them. |
| `docs/roadmap/active/37-section-and-shortcut-history.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | Reviewed plan/outcome, bounded Stage C direction, script-generated board. |

Review all four files for each affected architecture system; change only statements/diagrams
made stale by the implementation. Public new helpers get doc comments and Compodoc links.
Activity integrity, seed/converter structure, visual styles and route names are unchanged,
so their production files/docs are not a speculative work list. README commands remain unchanged.

## Test plan — tests first

Write each named failing case before its implementation, observe the intended failure, implement
the minimum and keep it green before the next case. Use the existing harness/fault injection.

| Test file / case | What it proves |
|---|---|
| New contract suites: valid/invalid Restore and shortcut actions | Unknown versions/extra keys, duplicate fields/rows, self-neighbors, mismatched page/project/row markers and malformed directional results fail; public envelopes contain no snapshots. |
| `section-service.test.ts`: duplicate is one captured add | Config detached, original page, immediate mixed-order placement, zero copied rows, required receipt; disabled page refusal writes nothing. |
| `section-edit-undo.test.ts`: duplicate replay uses saved copy | Stable ID/config without source, dependents block Undo, unchanged old add behavior and generation floor. |
| `section-restore-history.test.ts`: exact reversible Restore | Task and reflection cascades, independently archived rows, empty/prose/reference-retained sections, old tombstone position, disabled page, append then recorded Redo placement, unrelated fields survive. |
| `section-service.test.ts`: sparse Restore appends densely | Mixed sparse placements become dense only after a changed Restore; sibling timestamps survive and a no-op Restore writes nothing. |
| `section-restore-history.test.ts`: new rows and competing generations refuse | New live row/subtask/reflection, moved/missing rows, added cascade markers, later removal at same Clock instant; exact snapshot comparison before/after refusal. |
| `operation-history-service.test.ts`: removal/Restore sequence | Six steps in order, two repeated cycles, branch clearing by changed Restore, no-op Restore keeps Redo, archived ancestor blocks and expiry never blocks durable Restore. |
| `shortcut-history.test.ts`: add/update/move/remove reverse and replay | Same destination history, stable IDs and createdAt, no source writes, mixed neighbors/partial fallback, independent presentation fields preserved, all kinds on same cursor. |
| Same suite: scope/source/conflict paths | Missing/foreign/same-page source, destination drift, source archived/hidden/disabled, occupied ID retirement, altered placement and changed fields; no source content disclosure. |
| `section-shortcut-service.test.ts`: normalized move/update no-op | Sparse and dense positions, current/clamped move, no updatedAt changes, no action/event/frame, Redo preserved. |
| `operation-history-service.test.ts`: actor, grants and concurrency | Exact actor/workspace/destination isolation, projects.write-only transitions, missing grant before disclosure, wrong action/direction/revision, no skipping and explicit retirement. |
| `data-store.test.ts`: old/new v5 reopen | Existing v5/history parsed unchanged, each new payload survives JSON persistence, reload then Redo stable; no integrity relaxation. |
| `operation-history-service.test.ts`: cross-actor pruning preserves generation floor | A adds at g0; B removes/restores at g1 then 49 actions prune only its removal; A Undo/Redo Add recreates at g1 from retained Restore evidence. `data-store.test.ts` rejects a present section below its stored Restore generation. |
| `live-updates.test.ts`: atomic restore/shortcut failures | Fail recording, history update and persist separately on ordinary writes/transitions; exact row/placement/history/Activity rollback and zero frames, one frame on success. |
| `routes.test.ts`, MCP contract/handler and acceptance scripts | Result/status parsing, HTTP-only actions, unchanged tool inventory, fourth-family discovery, minimal grants, second connection and fresh-call revocation over both transports. |
| Gateway/store specs: result migrations | Correct nested entity parsing, remove JSON, optimistic field rollback, stale generation/actor/seed responses ignored, incomplete combined order blocks writes, old notice cannot execute a different action. |
| Archive store spec: committed Restore then failed read | Success retained, retry only reads, repeated live Restore returns null receipt without another event. |
| `canvas-history.spec.ts`: visible reconciliation | Existing UI writes plus same-user HTTP Undo/Redo, second-tab live refresh, reload, unavailable shortcut, disabled-page Restore, exact created IDs, Enter/blur single commit and Escape/no-op zero actions. |

## Boundaries touched

- Contracts define every shared payload, result and family once; frontend imports public
  result modules without pulling new inverse modules into the eager bundle unnecessarily.
- Shortcut service gains only OperationRecorder. Executors receive repository abstractions
  and Clock; OperationHistoryService never composes a writing service or nests public writes.
- MCP calls services; routes parse/forward; Angular stores use the injected gateway interface.
- No direct domain Date, HTTP, JSON-adapter import, new global store or core → prototype edge.
- Shortcuts never mutate source content. Restore is exact captured structure, never a newly
  computed cascade. No styling change calls for literal colors/spacing/radii.
- UnitOfWork owns persistence/publication; tests focus on new reusable semantics, not exhaustive
  disposable infrastructure coverage.

## Explicit non-goals

The Do not list applies throughout. Also: no project schema migration, tombstones for shortcuts,
ArchiveItem aggregate, global keyboard interception, history browser, task move changes or
retrospective history for old writes. Do not rewrite completed records or old decision prose.

## Open questions

No user decision is required for this bounded plan. Proposed defaults to verify in review:
record duplicate as an existing section.add; preserve the actual no-row-copy behavior;
allow recovery of a shortcut to an existing unavailable source; keep Restore's generation;
use repairable conflicts except the explicitly named permanent cases. Adopt these in the
new decision entry with implementation evidence, not as shipped facts during planning.
The original Stage C controls, project lifecycle and retry-cache obligations remain open work,
not unresolved gates for C1.

## Revisions

- **Draft (2026-09-20):** Grounded in the completed Stage B record, Stage A deferral decision,
  current spec, architecture and service/gateway callers. Split Stage C to keep project
  lifecycle, header state and retry semantics out of this action-family phase.
- **Round 1 (2026-09-20):** The review found two substantive gaps, both accepted after
  checking the implementation: generationFloor must use retained Restore generations when
  another actor's removal is pruned, and ordinary Restore must renumber sparse mixed placements
  before capturing its appended position. Added the repository invariant/file/docs and targeted
  cross-actor pruning, malformed-generation and sparse-placement tests. Independent file audit
  corrected the undoResultMessage symbol and listed section-removal-undo.ts for shared row
  structure helpers. The reviewer found the C1 split coherent and no additional boundary,
  permission, acceptance or documentation gap; round 2 checked the fixes.
- **Round 2 (2026-09-20):** The original reviewer rechecked both fixes against the revised
  plan and returned no substantive findings. Final file inventory additionally names
  tool-permissions.test.ts and index.test.ts, which pin the old family/result counts.
  The independent final review below checked the resulting plan.
- **Round 3 — independent review (2026-09-20):** A second reviewer checked Restore capture
  and preflight, shortcut semantics/results, generation/recorder helpers, gateway/store
  consumers including Reflections notice safety, conflict entities and Stage B/C scope.
  It returned no new substantive findings: generation, row/dependent and placement cases
  are covered without a new writing-service edge or scope leak. Plan review is closed.

## Planning validation

Three review passes completed, with no substantive findings outstanding. `node
scripts/roadmap.mjs check`, `pnpm docs:check` (18 system folders, 211 documents) and
`git diff --check` passed. Only this plan, the direction link in goals.md and the generated
progress.md board changed. No application code, runtime tests or actual-use acceptance ran;
those belong to implementation.

## Outcome

**Deliverables.** The three canvas operations that were still irreversible now reverse and
replay through the existing per-actor history, with no new transition route, no new tool and no
schema version change.

- **Duplication** records the `section.add` its copy actually is
  ([`section-service.ts`](../../../packages/domain/src/section-service.ts)). Redo replays the
  captured copy, so a source that has since changed or gone cannot affect it, and duplication
  still copies configuration and layout and no rows.
- **Archive Restore** records a new `section.restore` family — its own payload
  ([contracts](../../../packages/contracts/src/section-restore-history.ts)) and its own inverse
  ([domain](../../../packages/domain/src/section-restore-history.ts)) — while staying durable:
  no receipt is needed to invoke it, it survives every expiry, and a repeat on a live section
  writes nothing and answers `operation: null`. Undo re-archives at the captured marker,
  generation and stored position and takes back down exactly the rows the Restore revived.
- **The four Home shortcut placement writes** record `shortcut.add/update/move/remove`
  ([contracts](../../../packages/contracts/src/shortcut-history.ts),
  [domain](../../../packages/domain/src/shortcut-history.ts)) in the **destination** root
  project's history. `shortcut` is a fourth operation family sharing `projects.write`, published
  by both history tools' family map.

Public surfaces moved with them: duplicate answers `SectionAddResult`, Restore
`SectionWriteResult`, shortcut create/update/move `{ shortcut, operation }`, and
`DELETE /api/shortcuts/:id` answers **200** with `{ shortcutId, projectId, pageId, operation }`
instead of 204 — a body-less status cannot carry a receipt, and no API route answers 204 any more.

**Deliberate choices**, all recorded in
[the decision entry](../../decisions/2026-09-section-restore-and-shortcut-history.md). Duplication
is not its own operation kind: a `section.duplicate` inverse would do what the add inverse already
does, and its Redo would be tempted to re-run duplication rather than replay the copy. Recording
Restore costs it none of its durability, which is what made the Stage A deferral safe to close. A
placement action belongs to the canvas it sits on, so the payload names the destination project and
nothing of the source — which is also why a source **content** edit is not a placement conflict,
while a source that has gone, left the root tree or moved onto the destination page is. Recovering
a reference onto an archived or hidden source is allowed and produces the existing unavailable
placeholder rather than unarchiving anything.

**Deviations from the plan.** Three, all found by reading the code rather than reasoning about it.
Two were caught in planning review and are implemented as the plan required: `generationFloor` now
counts retained `section.restore` generations, and ordinary Restore renumbers the combined order
before capturing its placement. The third was not in the plan at all —
`SectionShortcutService.move` renumbered the page *before* discovering nothing had moved, which
normalized a hand-edited sparse page on a clamped no-op and stamped the subject; it now compares
the combined index first, as `SectionService.move` already did.

One rule genuinely narrowed. An Archive Restore used to **retire** the removal beneath it. A
Restore the same actor made now sits above that removal in their own stack, so the removal is
`history_not_next` and undoing the Restore reaches it; a Restore by someone else still retires it.
Two existing tests asserted the old behaviour and were changed, not worked around
([amendment](../../decisions/2026-09-operation-history-retired-actions.md)).

The closing review found two real defects in the Restore executor, each fixed with a regression in
`section-restore-history.test.ts`: a recorded row somebody had **moved** was reported as `missing`
with `nothing-to-restore` rather than `moved` with `move-back-and-retry`, because recorded rows were
looked up in the section's own contents instead of project-wide; and a Restore whose section a later
disposable removal **deleted** refused `history_conflict` forever, wedging every action beneath it
for 24 hours, where it should retire. It also found nine stale documentation statements the feature
commits left behind, and one spec sentence that overclaimed — recreating a placement does *read* its
source, because §27's same-tree rules must hold before a reference may exist again.

**Deferred.** Everything the plan's *Do not* list named, unchanged: project and page lifecycle
history, project creation recovery, saved project layout/progress history, persistent Undo/Redo
header controls, receipt-reporting infrastructure, the persisted transition retry cache,
cascade-only removal, Delete styling, Settings and restorable-only Archive projection. No MCP tool
was added, so the registry still holds thirty-seven: duplication and shortcut resize, collapse and
move remain HTTP-and-domain operations. The browser's Undo notice deliberately does **not** offer
shortcut or Restore receipts — that waits for the header controls.

**Open questions.** Actual use raised two, recorded under slice 37 in `.prototype/notes.json`.
Placement labels are generic ('Updated a shortcut') where section labels name their subject
('Restored the Rich Text section'); on a Home page with four placements a header control could not
say which one it meant, so the label should name the source. And removing a section shows the canvas
Undo notice while removing the shortcut directly beneath it shows nothing — the deliberate Stage C
boundary, but visible in the product now, and an argument for the header controls landing before any
further families are recorded. The broader Stage C obligations named under **Phase boundary** remain
open work, not gates this slice failed.

**Documentation updated.** Spec §§27, 31, 32, 54, 57 and 61–63; `AGENTS.md`'s boundary list; the new
decision entry plus dated amendments to
[retired actions](../../decisions/2026-09-operation-history-retired-actions.md),
[section edit boundaries](../../decisions/2026-09-section-edit-undo-boundaries.md),
[what undo means for an archived row](../../decisions/2026-09-what-undo-means-for-an-archived-row.md),
[operation family permissions](../../decisions/2026-09-operation-family-permissions.md) and
[a shortcut resolves identity](../../decisions/2026-09-a-shortcut-resolves-identity-not-content.md);
the architecture tree's `overview.md` plus the contracts, domain, repositories, mcp-tools,
prototype-host api / mcp-transport / live-updates, web core, web projects and testing folders; and
both guides.

**Verified**, each command by its own exit code: `pnpm test` (2356 unit tests plus 9 doc-script
tests), `pnpm lint`, `pnpm build`, `pnpm docs:check` (18 system folders, 212 documents),
`git diff --check`, all four host acceptance scripts — `acceptance`, `mcp-acceptance` over both
transports, `agent-acceptance`, `live-acceptance` — and `pnpm e2e` (39). The feature was also used
by hand against an isolated copy of `nested-projects`; the developer's own `.prototype/data.json`
was deliberately not touched, since it is still at schema version 4 and starting the host against
it would have required a reset or conversion.
