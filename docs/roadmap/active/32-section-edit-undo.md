<!-- plan id="32" status="active" summary="Extend typed operation Undo to section add, move and settings updates" -->
# Slice 32 — Section creation, movement and settings Undo

## Goal

Extend operation-level Undo to the other section writes named in the proposal.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§10–13, 17, 23 phase 4, 25–27; main §§11–12, 20, 27, 31–32, 45, 57, 63.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 31. Extend the same versioned union for explicit section add, move/reorder and editable settings (title, config, collapse and span); share the existing receipt/executor and browser surface.
- Gate before implementation: define user-operation boundaries for blur/autosave/drag, duplicate and implicitly created containers. Only explicit section actions in the current UI are included by default. No-op/cancelled gestures create no record.
- An add inverse must refuse if later content/shortcuts make removal destructive; it must not cascade newly authored work. A settings inverse changes only fields touched by the operation and validates their postconditions. A move inverse uses combined neighbors without overwriting unrelated inserts/moves.
- Keep existing minimal grants and retry/expiry/conflict semantics; test interleaved agent and user writes. Record any newly needed decisions; extend public API/MCP/gateway results consistently with working implementations.
- Update contracts/domain, host/API, MCP and web/core/projects docs and main §32 as behavior lands. Reserve versioned inverse extension for future Redo; no redo stack is required.

## Done when

Failing tests first cover each explicit action and no-op, exact field restoration, add followed by new content, intervening edits, combined shortcut order, missing neighbors/page, conflicts and permission revocation. Browser and MCP journeys exercise add/move/settings then Undo with reload verification and one record/event per operation. Run pnpm test, pnpm lint and relevant pnpm e2e journeys. Refactor §23 phase 4's four operation families are implemented without broadening removal's guarantees.

## Do not

- Undo row CRUD, project/page changes, implicit container creation, shortcut-only actions, or every historical activity; build Redo, generic middleware or a global mega-store.

## Planning status

Activated for implementation planning only, at the user's request. Slice 31 is complete.
This change writes and reviews the plan; runtime implementation, TDD and real-use acceptance
remain future work. Do not close the slice on the strength of plan review.
Independent review is complete after two rounds, with no substantive findings remaining.

## Implementation design and operation boundaries

### One committed action

| Entry point | Operation boundary |
|---|---|
| Contextual Create / public `SectionService.add` | One `section.add` record after inserting and renumbering, in the same unit. Capture the created section including its initial config. |
| Reflections page “Add Reflections container” | Explicit add through `ReflectionsPageStore.ensureContainer`, also one `section.add`; reuse the notice on that page. This is distinct from automatic row container resolution. |
| Section drag / keyboard move | One `section.move` record per completed drop or keyboard move. Pointer previews do not write. A clamped move to the existing combined index changes nothing. Movement remains within one page. |
| Inline title | One `section.update` record on Enter or blur; the existing pending/editing guard prevents the subsequent blur from duplicating Enter. Normalize first; Escape and a normalized unchanged value do nothing. |
| Rich Text / config callback | One `section.update` per changed blur save or explicit inspector submission. Rich Text currently saves on blur, not a timer. No new autosave timer or typing-session aggregation. |
| Collapse | One update per persisted toggle. Transient expansion for a section hash is not a write. |
| Section width | One update on pointer release, or keyboard Enter/blur. Preview steps, Escape, pointer cancellation and an unchanged span create no record. |
| HTTP/MCP update with several fields | One update record containing exactly the fields whose normalized values actually changed. |
| Duplicate | Excluded: Slice 27 removed the browser control. Keep the existing domain/HTTP/gateway duplicate behavior and bare-section result; do not add a tool or control. |
| Implicit container / shortcut / row writes | Excluded. `resolveContainer` continues to use `addWithin` without a receipt or extra grant. Existing activity behavior remains. |

These are recorded in the [§78 planning decision](../../decisions/2026-09-section-edit-undo-boundaries.md), clearly marked pending implementation.
They follow main §§27, 31–32 and the current handlers, not the proposal's illustrative types.

### Contracts and forward writes

Extend `packages/contracts/src/undo.ts` with strict version-1 `section.add`, `section.move`
and `section.update` members; keep the existing removal member, including absent-disposition
compatibility. Retain document schema version 3, defaulted undo collection, 24-hour expiry,
50-record workspace cap, exact-actor ownership and `projects.write` for all four families.

- Add stores the created section snapshot. Move stores section id, project/page identity,
  before placement and post-move placement. Update stores section id, project/page identity
  and a nonempty array of typed field changes (`title`, `config`, `collapsed`, `columnSpan`).
  Each entry has before and after values; title absence uses explicit `null`, converted back
  to an omitted field on restoration. Reject duplicate field entries, invalid values,
  empty change arrays, mismatched identity/page and unknown types/versions/keys.
- Treat `config` as **one editable field**, replaced whole, matching the existing config
  ownership decision. Compare JSON structurally (object key order irrelevant; array order
  significant). Undo never merges arbitrary config keys. Preserve the exact previous raw
  title, including legacy values; normalization applies to the forward input only.
- Add returns `{ section, undo }` with a required receipt. Update and move return a shared
  contracts result `{ section, undo: UndoReceipt | null }`; `null` means a no-op, never an
  unimplemented receipt. Domain, HTTP, MCP, gateway adapter and fake all use those shapes.
  Removal and duplicate retain their existing result contracts.
- Public `add` wraps the existing private `addWithin` and records its inverse before the
  unit resolves; private container resolution does not record. Update records after detecting
  actual changed fields. Move detects no-op from the combined list before renumbering, fixing
  the current path that can renumber sparse siblings before its no-op return.
- Forward mutation, activity, UndoRecord and queued live frame commit atomically. A recorder
  failure rolls everything back. No-op returns preserve timestamps, activity and record counts.
  There is no promise of generic forward-request idempotency: an uncertain create must not
  be automatically replayed. Existing exact-request removal receipt recovery stays intact.

### Inverse execution and conflict rules

Use `UndoService`'s exhaustive switch and small function modules, without a command framework
or new service edge. Perform all reads/conflict collection before writes, then consume the
record and record exactly one operation-specific activity event in the existing unit.

| Inverse | Preconditions and effect |
|---|---|
| Add | Section still exists, is live, has the same identity/page/type and substantive fields as the created snapshot. Ignore numeric position and timestamps shifted by other placements. Refuse any newer record for this subject. Audit **all** canonical task/reflection section and cascade references and Home shortcut source references, including archived rows; any reference refuses. Then delete only the created section and renumber its page. Initial config supplied in this add is part of that operation and can be removed; subsequently changed prose/config must conflict. Never call removal or cascade content. |
| Update | Section exists and is live in the recorded project/page. Compare only touched fields with their recorded after values. Restore only their before values; preserve all other fields, rows, placement and unrelated edits. A newer overlapping update, add or removal record supersedes it, even if consumed or values changed back under a frozen clock. Disjoint field updates and moves do not supersede this settings inverse. |
| Move | Section exists and is live on its recorded project/page. A newer move, add or removal for this subject supersedes it; settings changes do not. Current numeric position may have shifted because a different section/shortcut moved or was inserted. Remove the subject from the current combined list; use existing `resolveRestoreIndex` against its **before** snapshot, then insert and densely renumber. Preserve the current relative order and timestamps of all other placements, and current section settings. |

For new executors, archived owning projects/ancestors produce `undo_blocked`; archived/missing
subjects or changed pages produce typed conflicts before mutation. Disabled existing pages do
not prevent Undo. An add/settings/move inverse does not recreate a missing subject or relocate
it to another page. A valid document cannot have a live subject on a missing page; directly
test this refusal with repository doubles. Removal alone retains its existing missing-page
canonical fallback and partial-result guarantees. For move, missing previous neighbor uses
next, both missing use clamped index; reordered surviving neighbors use previous priority.

Extend `subjectSectionOf` to all members. Keep removal's existing conservative newer-record
conflict rule unchanged. New update/move executors compare newer records by the footprints
above, not timestamps. Pruning may remain conservatively grouped by section as today: loss
of an older receipt under retention is acceptable, revival of a superseded one is not.
`outstandingFor` must select the newest subject record first and return it only if its type
is `section.remove` and its owner/status/expiry qualify; never surface an add/update/move
receipt as an already-removed response or search backwards past a disqualifying newer record.

`UndoResultSchema` becomes discriminated by operation. Preserve the removal result's existing
fields. Move returns the updated section, placement strategy and `outcome: 'restored'`;
update returns the updated section and `outcome: 'restored'`; add returns `sectionId`,
`projectId`, `pageId` and `outcome: 'removed'`, with no fictional live section or placement.
Receipt operation literals expand correspondingly. Conflict details gain the necessary
field-change, archived-subject and shortcut-reference vocabulary and server-selected next
steps. HTTP retains typed details; MCP text retains reason prefixes and actionable guidance.
Expiry/consumption copy must say “operation” and never promise Archive can reverse an add,
move or settings write. New activity verbs are `project.section_addition_undone`,
`project.section_move_undone`, `project.section_update_undone`; removal keeps its current verb.

### Transport and browser integration

Add `move_section` to the existing MCP section tool group, using `MoveSectionInputSchema`
plus `sectionId`, under only `projects.write`, calling the existing domain move service.
The registry becomes 35 tools; add its pinned name and minimal-grant case. No duplicate tool,
new HTTP endpoint or history-list endpoint. Existing create/update/move routes pass through
the new results without follow-up reads that would acquire `projects.read`.

Generalize the existing canvas-local notice/store execution method to all four operations.
Capture a successful non-null receipt **before** any reconciliation. Failed writes and
no-ops preserve the held receipt; a later committed section action replaces it. Keep notice
state memory-only and clear it on page/project navigation and reload. Removal's separate
failed-request descriptor, explicit Retry remove and dismissal guard remain removal-specific.

Receipt ordering must follow commit order even when responses arrive out of order. Add the
recorder's existing workspace `sequence` to the public receipt (no inverse data); old clients
holding pre-change receipts still execute by id alone, and stored operations are unchanged.
Within one canvas generation accept only receipts above a retained high-water mark, including
after dismiss/consume. Do not use arrival order or `createdAt`. New successful calls must not
resurrect an older notice after a newer call has been dismissed or undone.

Continue existing optimistic move/resize behavior, field-only rollback and live-refresh guards.
Undo is unavailable while a section write or Undo is pending, including the blur-save triggered
by clicking Undo; do not execute a stale held receipt during that save. Avoid a wait cycle
between concurrent writes and reconciliation. An uncertain add/update/move reports its failure
and offers a read reconciliation, without automatic replay or a removal-style receipt lookup.
If the server committed but a read failed, keep the receipt and offer read-only Retry refresh.
Typed conflict/error results retain the receipt; consumed/expired/not-found become terminal.

Generalize result copy, accessible announcements and focus: add Undo removes a frame, so focus
the surviving notice or insertion control; settings/move focus the still-live subject title;
removal retains its restored-title/fallback behavior. Offering a receipt after a blur save must
not steal focus. Removal Archive links keep their existing meaning; do not advertise Archive
as recovery for new edit operations. Update stories for all result shapes and keyboard states.

The Reflections page's explicit container button is another public-add consumer. Unwrap the
new result in `ReflectionsPageStore`, hold its receipt before rendering the composer, and
reuse `SectionUndoNotice` on that page. Keep a small page-local state and execute through the
same gateway; do not introduce a cross-feature store. Guard by generation/pending writes,
clear on navigation/reload, handle consumed/expired/conflict and failed refresh as on canvas,
and refresh the container/feed after Undo. A successful inverse restores the empty-container
prompt and focuses the notice or Add container control. If a reflection has since been
authored, the server refuses the inverse; the UI must retain that reflection and draft input.

## Acceptance check

The original Done when above is the completion contract. Demonstrate it as follows:

1. Red/green tests below establish each explicit boundary, normalized no-op, exact field
   restoration, add followed by new content/references, intervening user/agent edits,
   combined shortcut order, missing neighbors/pages, conflicts and permission revocation.
   Assert canonical state plus deltas: one record/event/frame on a forward change; one
   consumption/event/frame and no extra record on Undo; none on cancellation/no-op/refusal.
2. Add `apps/e2e/section-edit-undo.spec.ts`, seeded with `nested-projects`. On Home and a
   nested work canvas: contextual add→Undo; create a second section, rename→Undo;
   blur-save Notes→Undo; collapse→Undo; snapped resize→Undo; drag and keyboard move across
   section/shortcut neighbors→Undo. Reload **after Undo** and verify canonical result and
   dense combined order; a reload clears the local notice as designed. Exercise user edit
   followed by an agent's overlapping update (refusal), and disjoint edit (preserved).
   Also explicitly add a Reflections-page container, undo it, reload to the empty prompt;
   add again and author a reflection, then verify add Undo refuses without data loss.
3. Through real MCP clients, `create_section`, `move_section`, `update_section` then
   `undo_operation` each return their contract shape under minimal write grants. Inspect
   persisted state after restarting the temp host. Test both Streamable HTTP and stdio in
   the existing MCP acceptance script; independently check receipt consumption, event counts
   and unchanged removal recovery. Revoke a grant/connection after issuing a receipt and
   prove the next transport call refuses without mutation.
4. Run `pnpm test`, `pnpm lint`, `pnpm build`,
   `pnpm --filter @cwm/prototype-host acceptance`,
   `pnpm --filter @cwm/prototype-host mcp-acceptance`, and
   `pnpm --filter @cwm/e2e e2e section-edit-undo.spec.ts removal-undo.spec.ts canvas-editing.spec.ts archive.spec.ts mcp.spec.ts reflections.spec.ts todos.spec.ts`.
   E2E owns its servers; do not run against separately started dev servers. Build must remain
   below the existing 1 MB initial bundle error budget. Run `pnpm docs:check` after closeout
   document changes. Report any unavailable check explicitly, never as passed.
5. In the actual app, start `pnpm dev:host` and `pnpm dev:web` separately, load
   `nested-projects`, perform the actions using keyboard and pointer in Flow/Grid, inspect
   failure injection and actual MCP interleaving, and record concrete friction with slice 32
   in `.prototype/notes.json`. Automated journeys do not substitute for this design pass.
6. Review the implementation diff with correctness/spec/acceptance and boundary/documentation
   subagents, fix verified findings, rerun affected checks, write Outcome and complete via
   the roadmap script. Leave Slice 33's broader integrated refactor reconciliation to 33.

## File-level change list

Paths below are concrete; paired files are each in scope. Test files contain the named cases
below. Read each before editing during implementation; new files are marked **create**.

| File | Change / responsibility |
|---|---|
| `packages/contracts/src/undo.ts`, `packages/contracts/src/undo.test.ts` | Strict new inverse/result variants, field changes, receipt sequence, typed guidance and compatibility cases. Existing index wildcard already exports them. |
| `packages/contracts/src/index.test.ts` | Update export assertions for the discriminated Undo result and new symbols. |
| `packages/domain/src/section-service.ts`, `packages/domain/src/section-service.test.ts` | Atomic explicit recording/results, normalized no-op detection, implicit and duplicate exclusions. |
| `packages/domain/src/section-edit-undo.ts`, `packages/domain/src/section-edit-undo.test.ts` | **Create** bounded add/update/move capture/execution helpers and conflict tests; reuse placement functions. |
| `packages/domain/src/undo-service.ts`, `packages/domain/src/undo-service.test.ts` | Dispatch, per-operation result/event/message, transaction rollback and actor checks. |
| `packages/domain/src/undo-recorder.ts`, `packages/domain/src/undo-recorder.test.ts` | Subject union, receipt sequence, removal-only recovery and mixed-operation pruning. |
| `packages/domain/src/section-removal-undo.test.ts` | Regression: new operation records do not broaden removal's guarantees. |
| `packages/domain/src/section-removal-undo.ts` | Narrow the removal-only conflict helper's accepted problem set and executor result branch as the shared unions expand; preserve every existing removal mapping and behavior. |
| `apps/prototype-host/api/routes.ts`, `apps/prototype-host/api/routes.test.ts` | Pass-through write results and minimal-grant HTTP integration. |
| `packages/mcp-tools/src/tools/sections.ts`, `packages/mcp-tools/src/tools/undo.ts` | New move tool, result descriptions and operation-specific refusal guidance. |
| `packages/mcp-tools/src/registry.ts`, `packages/mcp-tools/src/registry.test.ts`, `packages/mcp-tools/src/contract.test.ts` | 35-tool inventory and real mutation/permission/result cases. |
| `apps/prototype-host/mcp/handler.test.ts` | Transport interleaving, grant removal and connection revocation after receipt issuance. |
| `apps/prototype-host/scripts/acceptance.mjs`, `apps/prototype-host/scripts/mcp-acceptance.mjs` | New result consumers and persistent new-family journeys over both transports. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts`, `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | Shared result contracts and working adapter/fake with success/error cases. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `apps/web/src/app/features/projects/project-page-store.spec.ts` | Receipts from all explicit actions, operation-neutral execution, sequence/generation/pending-write guards and reconciliation. |
| `apps/web/src/app/features/projects/project-canvas.ts`, `apps/web/src/app/features/projects/project-canvas.html`, `apps/web/src/app/features/projects/project-canvas.spec.ts` | General Undo action binding, focus/announcement branches and pending behavior. |
| `apps/web/src/app/features/projects/section-undo-notice.ts`, `apps/web/src/app/features/projects/section-undo-notice.html`, `apps/web/src/app/features/projects/section-undo-notice.spec.ts`, `apps/web/src/app/features/projects/section-undo-notice.stories.ts` | Operation-appropriate labels, guidance, results and accessible states. |
| `apps/web/src/app/features/projects/pages/reflections-page-store.ts`, `apps/web/src/app/features/projects/pages/reflections-page-store.spec.ts`, `apps/web/src/app/features/projects/pages/reflections-page.ts`, `apps/web/src/app/features/projects/pages/reflections-page.html`, `apps/web/src/app/features/projects/pages/reflections-page.spec.ts` | Explicit container add result, reused local Undo notice and executor, generation/pending/error guards and focus. |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.spec.ts`, `apps/web/src/app/features/projects/sections/rich-text/rich-text-section.spec.ts`, `apps/web/src/app/features/projects/canvas-chrome/section-resize-handle.spec.ts` | Boundary regression tests; modify handlers only if tests expose a boundary defect and revise the file list first. |
| `apps/e2e/section-edit-undo.spec.ts` | **Create** browser journeys with reload and agent interleaving. |
| `apps/e2e/canvas-editing.spec.ts`, `apps/e2e/removal-undo.spec.ts`, `apps/e2e/archive.spec.ts`, `apps/e2e/mcp.spec.ts`, `apps/e2e/seed.ts` | Update existing API result consumers/fixtures without weakening original assertions. |
| `apps/e2e/reflections.spec.ts`, `apps/e2e/todos.spec.ts` | Update add-result consumers and verify explicit Reflections container add/Undo/refusal. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | Set CURRENT_SLICE to 32 when runtime implementation starts; real-use notes at acceptance. |

Result-type changes may expose additional test consumers. Before implementation, run a focused
call-site search for `sections.add/update/move`, gateway `sections.create/update/move` and
`UndoReceipt`/`UndoResult` fixtures, enumerate extra concrete files in a plan revision, and
review any scope expansion. Do not change unrelated runtime behavior to silence type errors.

### Documentation in the implementation change

| File | Responsibility |
|---|---|
| `docs/decisions/2026-09-section-edit-undo-boundaries.md` | Created during planning: boundaries, safe add, field footprint/conflicts, missing-page refusal, result/receipt shape and browser receipt selection; append evidence when implemented. |
| `docs/decisions/README.md` | Index the new decision. |
| `docs/decisions/2026-09-section-removal-undo-records.md`, `docs/decisions/2026-09-disposable-removal-and-immediate-undo.md` | Dated amendments for extension of operation types and canvas notice; preserve original text and guarantees. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | Update §§27, 31–32, 54, 57 and 63 only as new behavior lands, including 35 tools. Preserve proposal as supplied. |
| `AGENTS.md`, `docs/guides/mcp-setup.md` | Tool count; recorder now covers explicit edits; receipt/result examples and supported operation boundaries. |
| `docs/architecture/overview.md` | Update top-level MCP inventory to 35 tools when implemented. |
| `docs/architecture/contracts/overview.md`, `docs/architecture/contracts/why.md`, `docs/architecture/contracts/what.md`, `docs/architecture/contracts/how.md` | New schema members, results and public symbol links. |
| `docs/architecture/domain/overview.md`, `docs/architecture/domain/why.md`, `docs/architecture/domain/what.md`, `docs/architecture/domain/how.md` | New executors, field-aware conflicts, unchanged acyclic edges and removal guarantees. |
| `docs/architecture/prototype-host/api/overview.md`, `docs/architecture/prototype-host/api/why.md`, `docs/architecture/prototype-host/api/what.md`, `docs/architecture/prototype-host/api/how.md` | Actual create/update/move result contracts. |
| `docs/architecture/mcp-tools/overview.md`, `docs/architecture/mcp-tools/why.md`, `docs/architecture/mcp-tools/what.md`, `docs/architecture/mcp-tools/how.md` | Move tool and 35-tool inventory, receipt semantics and grants. |
| `docs/architecture/web/core/overview.md`, `docs/architecture/web/core/why.md`, `docs/architecture/web/core/what.md`, `docs/architecture/web/core/how.md` | Gateway result shapes, unchanged transport boundary. |
| `docs/architecture/web/projects/overview.md`, `docs/architecture/web/projects/why.md`, `docs/architecture/web/projects/what.md`, `docs/architecture/web/projects/how.md` | Operation-neutral notice, gesture boundaries, sequence selection and failure/focus behavior. |
| `docs/architecture/testing/overview.md`, `docs/architecture/testing/why.md`, `docs/architecture/testing/what.md`, `docs/architecture/testing/how.md` | New focused journeys and acceptance evidence. |
| `docs/roadmap/active/32-section-edit-undo.md`, `docs/roadmap/progress.md`, `docs/roadmap/goals.md` | This plan/revisions; generated board via script; activation and eventual outcome/closure status. |

Review all four files of each touched system; edit behavior/diagrams/dependencies where changed,
and link the decision from relevant `why.md` files. No commands or URLs change, so README and
the first-milestone guide do not need a new walkthrough. Do not edit frozen completed plans.

## Test plan — tests first

Write each new behavior test, observe a failure caused by missing behavior, then implement
only enough to pass. Existing passing regressions are protection, not claimed red/green evidence.

| Test file / named cases | What they prove |
|---|---|
| `undo.test.ts`: strict variants; title absent/legacy round trip; malformed changed fields; result discrimination; v1 removal still parses | Stored and public contracts are exhaustive; no raw arbitrary inverse; old persisted removal records remain executable. |
| `section-service.test.ts`: explicit add vs implicit task/reflection container vs duplicate; normalized no-op matrix; one changed operation/one receipt | Minimal grants unchanged; each explicit operation records once; no-op update including reordered config keys, clamped/unchanged move on sparse positions, cancelled UI submissions do not mutate. |
| `section-service.test.ts`: forward add/update/move recorder failures; forward persistence failure | Force `UndoRecorder.record` to reject for each family and persistence to reject a forward operation. Assert full canonical state (including renumbered siblings), undo records/sequences, activity and published live frames unchanged. Automatic container creation remains unaffected. |
| `section-edit-undo.test.ts`: add deletes only its snapshot; later authored work refuses | Empty and initial-prose adds can undo; new prose/config, live or archived task/reflection, cascade reference or shortcut prevents destructive Undo; no new Archive tombstone or row deletion. |
| `section-edit-undo.test.ts`: settings restores only changed fields | Title clear/legacy restoration; config replacement; span/collapse; multi-field patch; unrelated field and row edits survive; touched-field change and change-back under a newer overlapping receipt refuse. |
| `section-edit-undo.test.ts`: combined move restoration | First/middle/last; previous shortcut, next-only, neither, reordered neighbors, unrelated insert/move; preserve all non-subject relative order/timestamps and settings. Same-subject move supersedes even under repeated clock values. |
| `section-edit-undo.test.ts`: scope/page/state matrix | Missing/archived/moved subject refuses; disabled page succeeds; missing page via doubles refuses for new families; archived owner/ancestor blocks. Removal fallback stays separately green. |
| `undo-service.test.ts`: per-family actor/grants and atomicity matrix | Exact user/agent/system and foreign workspace; only projects.write needed; consumed, expiry boundary, blocked/conflict; forced inverse/record/activity/persist failures leave state, consumption and live publications unchanged. |
| `undo-recorder.test.ts`: mixed records, supersession and retention | Sequence in receipts, same clock/reversed clock ordering, pruning cannot revive superseded receipts; repeated remove only recovers newest eligible removal, never an edit receipt. |
| `section-removal-undo.test.ts`: remove → restore → edit/removal interleaving | Retained/deleted v1 removal behavior, actor recovery and conservative supersession remain unchanged. |
| Host routes / MCP contracts / handler cases | Each forward shape and Undo variant; actual store changes under minimal grants; no-op null; no snapshots in receipt/activity/frame; 35-tool pin; grant and connection revocation after issuance; reason-prefixed errors. |
| Gateway adapter cases | Create/update/move result parsing by contract types; success, typed refusal and network error; removal/duplicate unchanged. |
| `project-page-store.spec.ts`: receipts for each action, no-op/failure preservation, out-of-order responses | Capture before failed refresh, highest-sequence selection even after dismissal/consume, navigation generation discard, mutation vs read retry separation, no deadlock with pending writes/live refresh, blur-save cannot execute stale Undo. |
| Canvas/notice/frame/Rich Text/resize specs | One commit per gesture; Enter then blur saves once; cancellation unchanged; pending controls; no focus theft on blur; add result has no restored frame; server guidance and removal retry retained. |
| Reflections page/store specs | Explicit add surfaces receipt; Undo restores empty prompt; authored reflection prevents deletion; stale responses/navigation and refresh failure retain correct state. |
| Browser and real MCP journeys in Acceptance check | Real pointer/keyboard behavior, interleaved writers, persistence/reload, failure handling and unchanged removal experience. |

Use seeded helper setup deliberately: explicit `add` in test setup will now create receipts
and consume sequence numbers, so assert operation deltas or known baselines rather than
weakening assertions to “at least one”. No new exhaustive fake-infrastructure suite.

## Boundaries touched

- Contracts stay defined once in contracts; browser local notice state only holds public results.
- Domain uses repository interfaces, Clock and the existing recorder/activity edges. Helpers
  never call SectionService/TaskService/ReflectionService or import host/JSON/HTTP/MCP.
- Tools call domain only; components/stores use gateway interfaces only; adapter names remain
  confined to the composition root. `core/` gains no prototype or feature import.
- Keep feature-local signals, current flags and design tokens. No new global history store,
  literal style values, timer-based autosave or production infrastructure.
- Activity and live frames describe committed operations, never carry inverse payloads.

## Explicit non-goals

All original Do not items remain. Also exclude duplicate Undo, cross-page section moves,
generic request deduplication, persistent browser receipt history, Redo, per-key config merging,
new inspectors, automatic reversal of later authored work, new grants and removal-policy changes.
Slice 33 owns full refactor-wide integrated closure; this slice proves its three new families
plus the necessary removal regressions.

## Open questions

No product question requires user input before this bounded implementation. The choices above
resolve the candidate gates from current code and spec. If review or use requires a history
stack, cross-page moves, duplicate UI, different authorization or request deduplication,
re-slice and review that scope instead of quietly adding it.

## Revisions

- **Initial draft, 2026-09-14:** Grounded in Slice 31, both specs, the contracts/domain/API/MCP/
  web architecture and current handlers. Identified missing MCP movement, absent duplicate UI,
  private implicit creation, whole-config replacement and removal-only result assumptions.
  Independent review pending.
- **Call-site audit, 2026-09-14:** Included the explicit Reflections-page container action,
  export-shape test, Todos/Reflections API fixtures and top-level architecture tool count.
  The private automatic container path remains excluded. Shared this expansion with the reviewer.
- **Review round 1, 2026-09-14:** Independent reviewer found two substantive gaps: the removal
  executor's exhaustive shared conflict switch needs a concrete compatibility edit, and
  inverse rollback tests did not prove forward recording atomicity. Added the runtime file
  with a removal-only type narrowing, and named recorder-rejection tests for each forward
  family plus a persistence-rejection case with full state/activity/publication assertions.
  Submitted the revised plan and planning decision for re-review.
- **Review round 2, 2026-09-14:** The same independent reviewer rechecked the complete plan,
  both fixes, the Reflections-page addition, decision and lifecycle diff. No substantive
  findings remain. Approval covers planning only; implementation tests and app acceptance
  are still required. File inventory check found only the three intentionally new source/test
  files absent. `node scripts/roadmap.mjs check` passed. `pnpm docs:check` passed (18 system
  folders, 197 documents) after running with access to linked dependencies; the sandboxed
  attempt could not read Mermaid's package. No runtime source was changed or feature tests run.
