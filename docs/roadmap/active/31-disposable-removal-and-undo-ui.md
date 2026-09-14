<!-- plan id="31" status="active" summary="Safely delete disposable sections and expose receipt-driven Undo through the gateway and canvas" -->
# Slice 31 — Disposable removal and immediate Undo UI

## Goal

Remove disposable sections safely while giving users an immediate, server-backed Undo action.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§7–16, 21–23, 25–27; main §§8–11, 19–21, 27, 31–32, 54, 61–63.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 30's committed inverse capture and tested executor. Apply recovery policy in SectionService: delete known disposable views, empty rich text and truly empty reassigned containers only when all canonical references are safe; retain content-bearing sections and necessary integrity tombstones.
- Audit `data-store.ts` validation and `SectionRepository.remove`, including sectionId, archivedWithSectionId, archivedWithTaskId and shortcut source IDs. Retain an integrity tombstone for shortcut-backed sources, as settled below; no shortcut placement is removed by this operation. Never relax integrity or silently delete archived rows.
- Complete the removal/Undo receipt API and gateway integration together, including fake/test gateways. UI stores consume receipts; never reconstruct inverse state or decide retention. Update SectionRemovalDialog consequence copy and the existing Archive presentation.
- Add an accessible project-scoped Undo action after successful removal, handle pending/failure/consumed/expired/conflict/partial states, and invalidate affected project/root views. Guard identity, navigation generation and live-write races. Failed remove produces no success action; failed Undo remains intelligible and retryable when appropriate.
- Visible-lifetime gate: the action is canvas-local, in memory, until dismissal, a newer successful removal, successful Undo, or leaving the page/project/session. No survival across navigation, reload or persona changes; no own-receipts read endpoint or tool. See the implementation choices below.
- Recover a lost receipt (Slice 30 friction): when the exact actor repeats a removal, the refusal carries that actor's outstanding receipt for the section — the highest-sequence record, unconsumed, unexpired — in HTTP 409 `details` and in the MCP message text (`undoId` and `expiresAt`). It stays a refusal: no write, no second event. Anyone else, or no outstanding record, gets today's message plus "restore it from Archive". Add one read to the recorder seam (e.g. `outstandingFor(actor, sectionId)`) over the same repository; the service graph is unchanged. Cover the hard-deleted path too, answering it only after the ownership check so it confirms nothing to non-owners.
- Make Undo refusals actionable (Slice 30 friction): `UndoConflictSchema` gains an optional current `title` (omitted for `missing`) and `undo_conflict` details gain a typed per-conflict `nextStep` (move back and retry; restore/move the new dependent and retry; use the later receipt or Archive; nothing to undo; nothing to restore), with Archive Restore always offered as the fallback. Messages keep the leading reason token, group by problem, name the section, show titles with ids in brackets and cap at five with "and N more". `undo_blocked` also names the blocking project's title. The UI renders `nextStep` from details, never by parsing text.
- Update web/core, web/projects, host/API, repositories and domain documentation, public comments and applicable main spec sections; amend old 'nothing deletes'/'Archive is undo' decisions only with the corresponding code.

## Done when

Tests first enforce the full removal matrix against persisted state as well as Archive output, including pre-archived rows and shortcuts. Browser tests show Progress/Timeline/Recent Activity and empty rich text removed, absent from Archive, then restored with config and placement by Undo; meaningful rich text and cascade recover durably; reassign-all leaves no empty Archive entry and Undo reverses all moved rows. Exercise failure injection, keyboard/touch focus, persona/navigation races and live refresh. A repeated removal by the exact actor returns the outstanding receipt in its refusal over HTTP and MCP, including after hard deletion, and executing it works. A second user, another agent connection, or a consumed, expired, pruned or superseded record reveals no receipt; a hard-deleted section remains not-found to everyone without an eligible own receipt. Every conflict names available current titles and a typed next step; blocked refusals name the blocking project and guidance. MCP Undo text still starts with its reason token. Run pnpm test, pnpm lint, pnpm e2e and MCP mutation/undo acceptance. This completes Refactor §26 criteria 1–11 for removal.

## Do not

- Purge existing tombstones wholesale, delete content to make integrity pass, expose storage policy in components, add global history UI or Undo for shortcut-only actions (source-removal side effects remain included).
- Make a repeated removal silently succeed, expose snapshot data through a receipt read or refusal, or add client-supplied idempotency keys.

## Planning status

2026-09-14: implementation planning only, at the user's request. The roadmap script moved the candidate to active; its pre-existing working-tree additions are preserved and expanded here. Runtime code, existing decisions and the main specification remain unchanged until implementation. Do not complete this slice or populate Outcome on the strength of plan review.

## Implementation choices

Recorded as a [pending planning decision](../../decisions/2026-09-disposable-removal-and-immediate-undo.md); these are not runtime claims.

### 1. Retention and the reference audit

Reuse `sectionRecoveryOf` after `settleRows`, with all canonical tasks/reflections including archived rows. Its `include: false` is necessary, never sufficient, for deletion. Delete only when it excludes recovery **and** no canonical task/reflection names the section through `sectionId` or `archivedWithSectionId` **and** no shortcut names `sourceSectionId`. `archivedWithTaskId` points to a task, not a section; preserve the complete task subtree and marker group when reassignment moves it. Existing integrity already requires section markers to equal their row's section and archive roots/parents to share that section. Keep those checks unchanged.

Retain a section when meaningful or uncertain content remains, or any reference prevents deletion. In particular, a shortcut to an otherwise disposable source keeps an internal tombstone; Home continues to show `source_archived`, and Undo revives the same source without changing the shortcut's identity/config/order. Do not remove any shortcut as a source-removal side effect in this slice, so no shortcut snapshot format is needed. This resolves the candidate's cleanup-versus-tombstone gate using Refactor §8 and the existing main §27 behavior.

Matrix, with deletion always subject to the reference guard:

| Input/state | Canonical outcome | Archive | Undo |
|---|---|---|---|
| Progress, Timeline, Recent Activity, Sub-Projects view | Delete | No section entry | Recreate original section/config/placement; real subprojects unchanged |
| Rich Text `{}`, `{ text: '' }`, or whitespace-only text | Delete | No section entry | Recreate exact config |
| Nonempty plain text; unknown type or uncertain config | Retain archived section | Existing recovery projection | Revive at historical placement |
| Empty Task List/Reflections | Delete | No section entry | Recreate |
| Cascade live tasks/reflections, possibly with pre-archived rows | Retain section and rows | Content entry plus existing row projection | Restore exactly changed rows; pre-archived rows remain archived |
| Reassign with live rows | Move all owned rows, including archived subtrees; delete empty source if safe | No empty source entry | Recreate/revive source and reverse every recorded move, preserving later title/body/status edits |
| Only pre-archived rows, even with requested reassign | Existing no-policy branch retains section and rows | Owner-container recovery remains | Revive section only |
| Any excluded section still referenced by a shortcut | Retain integrity tombstone, shortcut unchanged | No section entry | Revive source and placeholder content |

No historical tombstone purge. Inverse snapshots are not canonical references. Activity references the project, so hard deletion can emit `project.section_removed` / “Removed”; retained removals keep `project.section_archived` / “Archived”. Exactly one activity frame and one inverse per success, none on refusal/rollback.

### 2. Backwards-compatible inverse and response

Keep schema version 3 and `section.remove` version 1. Extend `SectionRemoveUndoOperationSchema` with optional `disposition: 'retained' | 'deleted'`; absent means retained for every existing record. Retain `postSectionArchivedAt` as the operation timestamp and compare it only for retained sections. New captures write an explicit disposition. Test parsing/executing a literal old record without the field. Reject unknown dispositions and invalid combinations without changing old valid records.

For retained operations preserve all existing executor checks. For deleted operations require canonical absence; an existing ID is a conflict and is never overwritten. The snapshot supplies original section/page/config for recreation. Check higher-sequence removals by any actor, recorded row structures and new dependents before inserting anything. Use `sections.insert` for deletion inverses, `sections.update` for retained inverses. Resolve page/neighbor placement using existing helpers. Preserve original id, createdAt, title, config, collapsed and span; update only the restored section's updatedAt and touched rows as today. An unavailable original page uses the existing tested canonical fallback and reports `partial`; no page deletion API is added.

`SectionRemovalResult` remains `{ section, undo }`. For deletion, `section` is the removed section's final archived-shaped result (including operation timestamp), **not a claim that it is still stored**. Keep storage disposition private to the inverse. Update the result's public comment and transport documentation accordingly. The UI uses its name and receipt and re-reads authoritative collections; it never chooses retention from the result.

### 3. Lost-receipt refusal and actionable conflicts

Add `UndoRecorder.outstandingFor(actor, sectionId): Promise<UndoReceipt | null>`, with a public comment specifying that it is called inside the caller's unit, reads only and opens no transaction. Extract exact-actor comparison to a pure helper shared with `UndoService` (in `undo-recorder.ts`, not a new service). Select the highest sequence for the subject across **all actors in the workspace first**, then check exact ownership, unconsumed and `now < expiresAt`; never fall back to an older actor-owned record. Return only strict receipt fields. No grant expansion beyond `projects.write` and no snapshot data in errors, events or reads.

`remove` still checks actor and grant before any read. If the canonical section exists, establish workspace visibility before reporting archived/repeat state. If it is absent, consult the scoped recorder: an eligible exact-owner receipt permits a 409; otherwise preserve ordinary section not-found (do not confirm a deletion). Archived sections without an eligible receipt get the existing refusal plus “restore it from Archive”. Add `SectionAlreadyRemovedDetailsSchema` in `undo.ts`: `reason: 'section_already_removed'`, `sectionId`, `undo: UndoReceipt`. A repeat does no writes, does not prune/extend records, and emits no event. MCP text includes `undoId` and `expiresAt`, while HTTP carries these via typed details. Fix the candidate's contradictory hard-deleted exclusion as recorded under Revisions.

Extend `UndoConflictSchema` with optional current `title` (omitted for `missing`) and a typed `nextStep` enum. Map problems explicitly: `moved`/`reparented` → `move-back-and-retry`; `archive-state-changed` → `restore-state-and-retry` only when the expected post-removal state is live and ordinary Restore can recover it; otherwise `use-later-receipt-or-archive` (historical archive timestamps/markers cannot be recreated through ordinary commands); `new-dependent` → `restore-or-move-dependent-and-retry`; `superseded`/`archived-differently` → `use-later-receipt-or-archive`; `not-archived` → `nothing-to-undo`; `missing` → `nothing-to-restore`. A recreated ID on a deleted inverse is `not-archived` if live or `archived-differently` if archived. Repair instructions explain the previous container/parent or restoring an expected-live row. Never tell the caller to reproduce a historical timestamp/cascade marker, and never weaken the exact structural comparison to make a retry succeed. Cover expected-live and expected-archived variants separately.

Resolve section titles with `nameOf`, task titles and optional reflection titles from current canonical entities in the same scoped unit (an untitled reflection uses the label “Untitled reflection”, never its body); never fetch foreign content for a label. Retain complete typed conflict details. Format MCP/domain text deterministically grouped by problem, name the removed section, render current titles with ids in brackets, cap displayed conflict entries at five total and append “and N more”. Preserve leading `undo_conflict:`. Add `blockingProjectTitle` to the blocked details and name the highest archived blocker in `undo_blocked:` text. All refusal copy offers Archive as a fallback **for retained content**, never promises it can recreate a deleted view. UI renders typed next steps, never parses message text; malformed details fall back to the ordinary error string.

### 4. Immediate UI and race handling

Use one receipt slot in `ProjectPageStore`, rendered by a small `SectionUndoNotice` in `ProjectCanvas`. Scope it to the loaded project/page and load generation. The slot lasts while that canvas stays mounted, until explicit Dismiss, a newer successful removal, or successful Undo; it is cleared on page/project load, destruction, reload, persona switch and seed reset. No timer auto-dismiss and no cross-page history. The server's 24-hour lifetime/50-record cap stays authoritative; do not disable by comparing wall-clock time because the prototype server clock is settable. Expiry is rendered from server refusal. Copy explains “Undo is available here until you leave this page” without suggesting navigation destroys the server record.

Capture a removal response before reconciliation; retain its receipt even when the refresh fails. A failed new removal leaves the old receipt intact and creates no success message. Keep the failed removal id/input in canvas-local presentation state with an explicit Retry remove control, even if live refresh has removed that frame; this is how a lost response can reach the same-id recovery refusal. Clear this retry state on context changes, resolved repeat/success, or dismissal; never retry automatically. A repeated-removal 409 with a valid own receipt offers “Already removed. Undo is available” separately from success. Capture context and identity for async writes; a result from an old context cannot show a receipt, paint entities or focus controls in a new context. Persona switching already reloads and the adapter uses the memoized resolved identity; do not read persona localStorage from a feature or change this architecture.

Undo calls the new gateway member with only the held id, disables duplicate invocation and stays inside the store's existing pending-write/live-refresh guards. Serialize removal/Undo entry points while either is pending so responses cannot replace a newer receipt out of order. Other canvas writes retain existing behavior; reconcile authoritative state only after outstanding writes settle. On success clear the executable receipt, report restored/partial/disabled-page outcome, reconcile sections and shortcuts and call `notifyProjectDataChanged` even when the removed section owned no rows. Retained and recreated Undo both use the committed result; no optimistic inverse reconstruction. Keep read-refresh failure separate from mutation failure; after a committed Undo only offer read retry, never re-execute automatically.

Network/500 failure preserves the receipt with Retry. Consumed/expired/not-found is terminal for that button and explains the result; conflict/blocked/unavailable keeps a repair-and-retry path. Always offer the existing root Archive entry path for content recovery using the workspace shell's existing `openArchive` flow (including disabled Archive and nested projects). Pass a stable `onOpenArchive` callback via the existing renderer inputs, declaring that input on every renderer because NgComponentOutlet forwards all keys; do not import a shell store into core or duplicate enable/navigation logic. A lost Undo response followed by `undo_consumed` also reconciles current state, without pretending the retry executed another inverse.

The notice has an announced status/error, normal keyboard-focusable Undo/Retry/Dismiss/Open archive controls, visible coarse-pointer controls and token-only styles. After removal, move focus to Undo only if focus was in the removed frame/dialog; otherwise announce without stealing focus. After successful Undo, focus the restored heading if rendered on this canvas, otherwise keep a stable notice with destination/enable guidance. Dismissal chooses a surviving frame heading or canvas heading. Pending/error paths keep a connected focus target; no focus operation may run for an obsolete generation. Use the existing canvas's frame-id lookup idiom, not interpolated selectors.

## Acceptance check

Implement with tests first, watching each new behavior fail for the right reason, then pass. Existing changed-intent tests must change with implementation and docs. Green increments: domain/contracts; transport/gateway; UI/acceptance and living docs, each referencing Slice 31 and its spec sections. This planning task stops before these increments.

1. Run `pnpm test` and `pnpm lint` after implementation. Domain suites assert both canonical store snapshots and Archive projection for every matrix row, old inverse compatibility, deletion recreation and non-overwrite conflicts. Persistence tests read back committed JSON, not merely returned objects. No skipped relevant test counts as acceptance.
2. Extend `apps/e2e/archive.spec.ts` and add `apps/e2e/removal-undo.spec.ts` over `nested-projects`. Create uniquely named/id-tracked views between known neighbors, including an interposed shortcut. Remove Progress, Timeline, Recent Activity and blank Rich Text; assert absence via the Archive API **without leaving the canvas**, then click browser Undo and assert original id/config/span/collapse and placement. Inspect persisted deletion through domain/host tests, not browser absence alone. Repeat for Sub-Projects and truly empty containers in the domain matrix.
3. Browser: remove prose and cascade tasks/reflections, navigate to Archive and reload, then restore durably; pre-archived rows need their separate recovery. In a separate no-navigation Undo journey, reassign live plus pre-archived nested tasks and undo all recorded moves; later task title/status/body edits survive. Observe a shortcut-backed source from a second browser page on root Home: removal in the source canvas retains a placeholder, and Undo in that same source canvas revives its content with placement unchanged. Do not navigate away from the receipt-bearing canvas to perform this assertion. Confirm root Archive is reachable from a nested canvas with its tab disabled.
4. Browser/store failures: 100% injected failure leaves the section and no new Undo action; lower failure to zero and retry successfully. Lose a committed remove response, retry that id and use the recovered receipt. Lose Undo's response, retry and reconcile consumed. Use deterministic deferred promises/request interception for pending navigation, reload/persona changes, duplicate clicks and live frames during writes. Confirm receipt clearing on page/project changes and Back, and no incorrect repaint/focus after a stale response. Check post-commit read failure independently.
5. Browser accessibility: keyboard removal/dialog choice → Undo → restored heading; Escape/cancel and dismiss; touch control availability; pending and error focus; partial/disabled-page guidance through store/component fixtures (no production page-delete route). Run `pnpm e2e` and `pnpm build` (including style budgets).
6. Run `pnpm --filter @cwm/prototype-host acceptance` and `pnpm --filter @cwm/prototype-host mcp-acceptance`. Extend the scripts to repeat removal, recover the receipt, undo and inspect the persisted file. MCP covers both stdio and Streamable HTTP: success and refusal prefix/receipt text, same connection versus another connection, current grant denial/revocation, no private inverse output. Cover remaining fine-grained cases in route/registry/handler tests, not a sprawling transport harness.
7. Finally run the actual application with a realistic seed and try browser plus MCP removal/Undo. Start host and web separately; do not replace occupied user servers or seed their data silently. Record observed friction in `.prototype/notes.json`; set `CURRENT_SLICE` to `31` only when implementation begins. Run independent diff reviews for correctness/spec/acceptance and architectural boundaries/living docs, fix findings and rerun affected checks. Write Outcome only after evidence, complete through `roadmap.mjs`, check docs/lint before closing commit.

## File-level change list

Paths below are relative to repository root. “Modify” includes public comments and corresponding changed-intent assertions. No unlisted runtime refactor is authorized by this list.

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/undo.ts`, `packages/contracts/src/undo.test.ts` | Modify | Optional disposition, repeat-refusal details, conflict titles/next steps, blocker title, compatibility and malformed cases |
| `packages/domain/src/section-service.ts`, `packages/domain/src/section-service.test.ts`, `packages/domain/src/section-ownership.test.ts` | Modify | Post-settlement recovery/reference decision, delete/retain activity and exact-owner repeat refusal; matrix and prior archive-only expectations |
| `packages/domain/src/section-removal-undo.ts`, `packages/domain/src/section-removal-undo.test.ts` | Modify | Deleted inverse capture/execution, collision checks, current-title enrichment and bounded grouped text; placement/structural regression cases |
| `packages/domain/src/undo-recorder.ts`, `packages/domain/src/undo-recorder.test.ts`, `packages/domain/src/undo-service.ts`, `packages/domain/src/undo-service.test.ts` | Modify | Scoped outstanding receipt, shared actor predicate, actionable terminal/blocked errors and atomicity/ownership tests |
| `packages/domain/src/project-archive-service.test.ts` | Modify | Projection still agrees with deletion matrix, archived-only rows, old tombstones and shortcut retention |
| `packages/repositories/src/interfaces.ts`, `packages/repositories/src/data-store.test.ts` | Modify | Update remove seam comment; prove deletion only without canonical references and old/new inverse persistence; validation implementation unchanged |
| `apps/prototype-host/api/routes.test.ts`, `apps/prototype-host/mcp/handler.test.ts` | Modify | HTTP 200/409 contract, absent exact-owner recovery, no leakage, real MCP error-text boundary |
| `packages/mcp-tools/src/tools/sections.ts`, `packages/mcp-tools/src/contract.test.ts` | Modify | Removal/recovery descriptions and minimal-grant cases; existing tools only |
| `apps/prototype-host/scripts/acceptance.mjs`, `apps/prototype-host/scripts/mcp-acceptance.mjs` | Modify | Persisted hard-delete/recovered-receipt Undo evidence over real transports |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts`, `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | Modify | `sections.remove: Promise<SectionRemovalResult>` and `undo.execute(id): Promise<UndoResult>`; success/error mapping and fixture responses, no fake domain engine |
| `apps/web/src/app/features/projects/project-page-store.ts`, `apps/web/src/app/features/projects/project-page-store.spec.ts` | Modify | Canvas receipt state, repeat recovery, request guards, retries and invalidation |
| `apps/web/src/app/features/projects/section-undo-notice.ts`, `apps/web/src/app/features/projects/section-undo-notice.html`, `apps/web/src/app/features/projects/section-undo-notice.scss`, `apps/web/src/app/features/projects/section-undo-notice.spec.ts`, `apps/web/src/app/features/projects/section-undo-notice.stories.ts` | Create | Accessible presentational receipt/refusal/result notice, including terminal/partial/error variants |
| `apps/web/src/app/features/projects/project-canvas.ts`, `apps/web/src/app/features/projects/project-canvas.html`, `apps/web/src/app/features/projects/project-canvas.spec.ts` | Modify | Mount notice, callback wiring, context-safe focus and refresh retry |
| `apps/web/src/app/features/projects/project-page-contract.ts`, `apps/web/src/app/features/projects/project-workspace-shell.ts`, `apps/web/src/app/features/projects/project-workspace-shell.spec.ts` | Modify | Stable Open archive callback using existing root enable/reconcile/navigation flow |
| `apps/web/src/app/features/projects/pages/todos-page.ts`, `apps/web/src/app/features/projects/pages/archive-page.ts`, `apps/web/src/app/features/projects/pages/reflections-page.ts` | Modify | Declare the new renderer input, preserving the common outlet contract |
| `apps/web/src/app/features/projects/section-removal-dialog.ts`, `apps/web/src/app/features/projects/section-removal-dialog.html`, `apps/web/src/app/features/projects/section-removal-dialog.spec.ts` | Modify | Content-consequence copy and immediate Undo promise; existing policy inputs preserved |
| `apps/web/src/app/features/projects/archived-region/archived-region.html`, `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts` | Modify | Archive Restore wording promises content recovery, never temporary view history |
| `apps/e2e/removal-undo.spec.ts`, `apps/e2e/archive.spec.ts` | Create / modify | Browser journeys listed above, reuse existing seed helper |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | Modify during implementation | Slice attribution and actual-use findings |
| `docs/roadmap/active/31-disposable-removal-and-undo-ui.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | Modify now / at close | Plan/review evidence, accurate planning status and script-generated board |
| `docs/decisions/2026-09-disposable-removal-and-immediate-undo.md`, `docs/decisions/README.md` | Create / modify now | Record these planning choices as pending implementation, then append evidence when implemented |
| `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md`, `docs/decisions/2026-09-content-oriented-archive-policy.md`, `docs/decisions/2026-09-section-removal-undo-records.md` | Append at implementation | Dated amendments to no-deletion, absent-section conflict, result and recovery-refusal rules; no history rewrite |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | Modify at implementation | Reconcile §§9, 27, 31–32, 54, 61–63 with actual recovery and UI behavior |
| `docs/guides/mcp-setup.md` | Modify at implementation | Exact-connection lost-receipt recovery and actionable error examples |

Architecture documentation checklist (all paths under `docs/architecture/`): the seven `why.md` files receive a clearly marked pending-decision link during planning; all runtime descriptions and diagrams change with code.

| Exact files | Responsibility |
|---|---|
| `contracts/overview.md`, `contracts/how.md`, `contracts/why.md` | New shared shapes, compatible optional disposition, decision link |
| `domain/overview.md`, `domain/how.md`, `domain/what.md`, `domain/why.md` | Retain/delete and recreation flows, read-only recorder seam, no new service edges |
| `repositories/how.md`, `repositories/why.md` | Deletion seam now used; canonical references versus inverse snapshots |
| `prototype-host/api/how.md`, `prototype-host/api/why.md` | Removal-result meaning and 409 recovery details |
| `mcp-tools/how.md`, `mcp-tools/why.md` | Existing tools' receipt recovery and refusal text |
| `web/core/overview.md`, `web/core/how.md`, `web/core/what.md`, `web/core/why.md` | Fifteenth gateway sub-interface, adapter/fake, decision |
| `web/projects/overview.md`, `web/projects/how.md`, `web/projects/what.md`, `web/projects/why.md` | Notice, canvas-local lifetime, callbacks, races, Archive distinction |
| `testing/how.md`, `testing/what.md` | New browser journey and extended acceptance evidence |

Review the other files in each four-file folder for truth; do not churn unchanged inventories. Routes, errors, exports, repository implementation and live transport should need no runtime changes: routes already pass service results/details, `index.ts` already exports undo, and existing project/root activity frames trigger affected views. If code inspection during implementation disproves this, revise this file list before proceeding.

## Test plan — tests first

| Suite and named cases | Proves |
|---|---|
| `undo.test.ts`: legacy retained operation; explicit deleted operation; unknown disposition; strict receipt/repeat details; conflict next-step validation | Backward compatibility, safe public shapes, no accidental inverse disclosure |
| `section-service.test.ts` / `section-ownership.test.ts`: table above; shortcut forces retention; mixed archived subtree reassign; archived-only requested reassign; invalid target / wrong type / other project / disabled page / archived target | Recovery and deletion never discard canonical references; existing failure/grant semantics persist |
| `data-store.test.ts`: reject dangling section/source/archive-root; accept deleted subject inside inverse only; persist/reload new and legacy records | Same integrity constraints and durable state, not only in-memory return values |
| `section-removal-undo.test.ts`: deleted reconstruction; retained old record; id collision; neighbor priority and interposed shortcut; fallback partial; disabled original page; no compatible page | Inverse fidelity, compatibility and safe placement; unreachable UI fixtures never justify new APIs |
| `undo-service.test.ts`: deleted reassign with later nonstructural edits; every structural conflict and new dependent; highest blocker title; >5 grouped conflicts; omitted title for missing | No overwrite, intelligible repair instructions, exact formatting and bounded text |
| `undo-recorder.test.ts`: highest-sequence exact-owner only; higher record belongs to another actor/consumed/expired; frozen/backward clocks; pruned records; lookup writes nothing | No resurrection of superseded receipts and no retention extension |
| `section-service.test.ts` / `routes.test.ts` / `contract.test.ts`: repeat retained and hard-deleted removal returns same receipt; execute it; repeat under second user/connection/system/foreign workspace; missing write grant before reads | Privacy and refusal semantics across domain, HTTP and MCP; no second event or mutation |
| `undo-service.test.ts` / `routes.test.ts`: consumed/expired/pruned/superseded, grant loss/revocation; activity/recorder/persistence failure during delete and Undo | Unit rollback includes section/rows/placements/record/event and emits no live frame; transport auth stays current |
| `prototype-work-manager-gateway.spec.ts`: removal body passed through; Undo POST id/body; 409 details; network failure; resolved identity during delay | Interface/adapter boundary, no discarded receipt and stable identity |
| `project-page-store.spec.ts`: success receipt before failed refresh; failed remove preserves prior receipt; recovered refusal; Undo success/partial/disabled; typed repair and terminal states; malformed details | UI reports mutation truth and renders server decisions |
| `project-page-store.spec.ts`: deferred remove/Undo + live refresh; lost response then live frame removes source before explicit Retry remove using the saved input; duplicate/replacement guard; page/project load and destroy during request; consumed after lost response; post-Undo read retry | No stale receipt/paint or duplicate mutation; retry remains available only when useful |
| `section-undo-notice.spec.ts` / `project-canvas.spec.ts` / shell specs: announcement, tab order, focus/dismiss, destination guidance, Open archive from disabled root/nested route | Accessible controls and reuse of existing recovery navigation |
| `removal-undo.spec.ts` / `archive.spec.ts` and acceptance scripts | Executable checks 2–6, including reload/persona isolation, real browser Undo, MCP refusal text and persisted deletion |

## Boundaries touched

- UI talks only to `WORK_MANAGER_GATEWAY`, never HTTP/concrete adapters/repositories. Shared request/result/error shapes remain contracts; local notice status is presentation state only.
- Domain retains existing acyclic edges. `UndoRecorder` gains one read, no new composed service; `UndoService` still composes only ActivityService. Pure functions share ownership checks; time comes from `Clock`.
- MCP tools still call domain services only. HTTP/MCP errors and responses contain receipt fields, never inverse state. Activity/live updates remain audit/invalidation, not recovery storage.
- No relaxed integrity, schema reset or user-data migration. Section policy owns deletion, and canonical references include archived rows and shortcuts.
- Feature state stays in ProjectPageStore; core never imports prototype or projects. Token-only styles, current centralized flags, no global Undo store.

## Explicit non-goals

The candidate's Do not list remains binding. Also: no Redo, other operation Undo (Slice 32), own-receipt listing/history, browser Undo of an agent's action, cross-navigation receipt retention, permanent Archive purge, shortcut cleanup/snapshot expansion, automatic conflict repair, new grant, idempotency key, page-delete API, generic command framework, new production infrastructure, Archive redesign or unrelated friction cleanup. Slice 33 owns broader integrated-refactor closure; this slice proves removal criteria 1–11 without declaring all future Undo work done.

## Open questions

None blocking the proposed implementation. The two candidate gates are resolved above as explicit planning defaults: retain shortcut-backed integrity tombstones; keep the visible action local to the canvas. Their usability is to be evaluated during implementation, and a change to either requires revising this plan and reviewing the affected schema/lifetime/tests before code proceeds.

## Revisions

- **Preparation (2026-09-14):** Grounded in Slice 30's actual recorder/executor, reference validation, gateway, canvas store, identity reload and current Archive policy. Preserved the candidate's existing working-tree additions. Corrected its inconsistent hard-delete acceptance clause to permit only exact-owner receipt recovery, as its Build explicitly requires. Expanded both decision gates, compatibility, matrix, file list and executable failure/privacy checks. Submitted to independent subagent review.

- **Round 1 (2026-09-14):** Reviewer found two substantive gaps. Added a failed-removal descriptor and explicit Retry remove outside the disappearing frame, preserving it across live reconciliation; added expected-live versus historical-archive-state guidance so no retry requires reproducing a timestamp/marker. Parent audit also added the callback input on every page renderer, an untitled-reflection fallback, and a second browser page for shortcut observation without leaving the receipt-bearing canvas. Re-review requested.

- **Round 2 (2026-09-14):** The same independent reviewer re-read the revised plan and pending decision against the code and returned **no remaining substantive findings**. Confirmed both Round 1 fixes, common renderer input coverage and receipt-lifetime-safe browser acceptance. Added Refactor §§10–13 to the cited sections per the reviewer’s minor consistency note. Implementation remains unstarted; plan review is complete.
