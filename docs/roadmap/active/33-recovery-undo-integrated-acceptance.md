<!-- plan id="33" status="active" summary="Verify recovery, Undo, permissions and migration through browser and MCP journeys" -->
# Slice 33 — Recovery and Undo integrated acceptance

## Goal

Demonstrate the complete refactor against realistic persisted projects and both user interfaces.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§25–27 (all acceptance criteria); main §§54, 60, 62–63, 69, 75–79.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 32. Expand the existing Archive/browser/MCP acceptance journeys and realistic seeds only where necessary; preserve seed validation and snapshots. Include old disposable tombstones, independently archived subtasks, rich text, cross-page reassignment, shortcut neighbors and archived ancestry.
- Trace every Refactor §26 criterion to a named automated assertion and browser/MCP observation in the active plan. Reopen a converted file and a file written after Undo; prove both Archive durability and bounded receipt behavior.
- Review the actual diff with correctness/spec and separate boundary reviewers. Audit single-source contracts, acyclic domain graph, no infrastructure imports, gateway-only components, token styles, injected Clock and commit-only publication.
- Reconcile main §§29–32, 54, 61–63, 69 and changed architecture four-file sets against delivered code; audit decision amendments, README/upgrade and MCP/milestone guides. Mark supplemental proposal status in its index with accurate implementation coverage, preserving the supplied source.
- Run the app on a realistic seed and real MCP client; record observed friction in .prototype/notes.json and update CURRENT_SLICE when each implementation phase starts. Close candidates through roadmap.mjs; update goals with evidence and remaining questions.

## Done when

All twelve Refactor §26 criteria have explicit passing evidence. Run pnpm test, pnpm lint, pnpm build, pnpm e2e and the affected host acceptance commands. Demonstrate failure injection and current permission revocation without data loss, source-ID integrity after deletion/Undo, and Archive restore versus neighbor-aware Undo. Log skipped or blocked checks honestly; do not close the refactor if any required acceptance remains unverified.

## Do not

- Add speculative Redo, an ArchiveItem aggregate, production persistence, retention products or unrelated UI polish. Friction outside this refactor becomes a later candidate.

## Planning status

Active for implementation planning only, at the user's request on 2026-09-15. Slice 32
is complete. This turn writes and reviews the plan; it does not implement or claim passing
Slice 33 acceptance. Bump `CURRENT_SLICE` at the first implementation step, before real use.
Plan review is complete after two rounds with no substantive findings remaining. All implementation evidence below is **pending execution**, including tests reused from earlier slices.

## Implementation approach

Use the existing section recovery policy, four typed Undo families, Archive projection,
JSON UnitOfWork and gateway notice. Add acceptance coverage at the lowest layer that can
observe the guarantee, then join it through browser and real SDK-client journeys. Existing
passing behavior needs evidence, not artificial production edits to make a test fail.
For a new regression, write the assertion first; if it already passes, prove sensitivity
with a temporary targeted fault, observe the intended failure and revert the fault. If it
exposes a defect, keep the red assertion and make the smallest reviewed repair. No broad
refactor is authorized by this test inventory. Add any discovered repair's exact file to
this plan and re-review that change before implementation.

Keep the six shared seeds and committed historical fixtures unchanged. Build scenarios
from `nested-projects` / `agent-heavy` plus explicit test-local additions. Historical v2
and pre-Undo v3 files already live under `packages/prototype-data/test/fixtures/`; copy them
to temporary files. Do not rewrite the user's `.prototype/data.json`. A new host test is
the composition point for converter + domain + disk; do not add domain dependencies to
prototype-data. No new tool, endpoint, contract family or migration version is expected.

## Acceptance check

The candidate's Done when remains binding: all twelve Refactor §26 criteria need passing
evidence, including failure injection, current permission revocation, source-ID integrity,
and Archive Restore versus historical Undo placement. The matrix is the evidence ledger:
replace each pending entry with exact test title, command/result and dated observation at
implementation closeout. Counts alone and older slice results are not evidence for this diff.

### Refactor §26 traceability

Test IDs below resolve to concrete files and named assertions in the test plan. For
structural criteria, browser/MCP behavior is corroboration; contract/code review is the
proof and must be recorded as such, without claiming the UI exposes private records.

| §26 | Required behavior | Automated assertion | Browser / MCP observation | Evidence |
|---|---|---|---|---|
| 1 | Progress, Timeline and Recent Activity removals never appear in Archive | R1, M1: assert each created ID absent, retained tombstone fixture still stored | Remove each type; Archive is empty of those IDs over UI and `get_project_archive` | pending |
| 2 | Disposable removals remain undoable | R1, M1: original ID, config, span, collapse and combined order restored; one consumption | Correct notice label and Undo; SDK `undo_operation` on own receipt | pending |
| 3 | Cascaded task list has durable recovery | P1, R2: close/reopen file; exact cascade IDs recovered after expiry/pruning of receipt | Reload Archive; restore list; independently archived parent/subtree still need their own restore | pending |
| 4 | Reassign-all source does not clutter Archive | R2, M1: task subtrees move between same-page lists; Reflections move across pages within one project; empty sources absent | Browser Reflections reassignment Home → Reflections page; SDK task-list reassign; Undo returns all original IDs and markers | pending |
| 5 | Nonempty rich text is recoverable without owned rows | R2, P1: exact prose survives reopen and Restore; blank prose absent | Saved content label and body visible after restore; MCP projection names prose | pending |
| 6 | Archive consumes a recovery projection | Existing archive/store/route/contract assertions plus R1/P1; created disposable IDs absent while prose/cascade IDs present | UI and `get_project_archive` match projected IDs/metadata; separate gateway-boundary review | pending |
| 7 | Activity and Undo remain separate | S1, L1: separate collections, one attributable event and record forward; Undo consumes record and adds only one event | Activity feed remains readable after source deletion; MCP receipt/frame contains no inverse data | pending |
| 8 | Mutation and promised inverse commit atomically | L1: recorder failure, persistence failure, Undo-time failure leave domain collections and receipt unchanged; zero published frames | Browser injected failure leaves saved state unchanged and retry usable; successful HTTP MCP frame reflects committed state | pending |
| 9 | One Undo reverses one multi-row action | R2, M1: exact row-ID/parent/section/archive-marker sets; preserve later nonstructural edits; reject structural conflicts | One click/tool call reverses cascade/reassign; repeated call refused without another event | pending |
| 10 | Restore appends; Undo restores by neighbors | R1/R2, D1: same initial placement, separate removals: Restore appends after shortcut; Undo uses previous/next/fallback | Observe both combined orders in browser and SDK reads; do not reuse a consumed/conflicted receipt | pending |
| 11 | Migration preserves referential integrity | P1: v2 conversion and pre-Undo v3 load preserve unrelated collections; validate every reopen and mutation; shortcut-backed source retained | Converted temp file opened through host and MCP; source unavailable then restored with same ID; no dangling row/source references | pending |
| 12 | Clear future Redo path without event sourcing | S1 plus boundary review: strict version/type union, unknown versions rejected, canonical reads work without Activity replay; Undo creates no new record | Browser and MCP execute four receipt families, with no Redo endpoint/control; review records extension seam, not implemented Redo | pending |

### Commands and execution order

1. Run targeted suites while driving each gap; then run `pnpm docs:api` before `pnpm test`
   so the generated Compodoc-anchor regression is exercised. Run `pnpm test`, `pnpm lint`,
   `pnpm build`, `pnpm docs:check` and the full `pnpm e2e` suite. Keep the 1 MB bundle error
   ceiling; record warnings and skipped checks. Stop only task-owned dev servers before
   Playwright, which refuses occupied ports and owns `.prototype/e2e-data.json`.
2. Run all four existing commands separately: `pnpm --filter @cwm/prototype-host acceptance`,
   `pnpm --filter @cwm/prototype-host agent-acceptance`,
   `pnpm --filter @cwm/prototype-host mcp-acceptance`, and
   `pnpm --filter @cwm/prototype-host live-acceptance`. Scripts own temporary files/processes.
   HTTP and stdio must never mutate the same file concurrently. Stdio does not promise SSE.
3. On a separate disposable copy, run `pnpm prototype:upgrade <absolute-temp-v2-file>`;
   check backup bytes, start host with absolute `CWM_DATA_FILE`, inspect Archive and use a
   real MCP client, stop host, reopen the converted file. Repeat reopening after Undo.
   P1 automates conversion, service operations and disk reopen. This separate real-host/browser/MCP observation proves that the converted file is usable through both interfaces; browser reload alone is not disk proof.
4. Start host and web separately for real use, with `nested-projects` on an isolated data
   file: nested Kitchen canvas pointer move/resize/Undo; meaningful removal and Archive
   Restore; shortcut source removal/recovery; agent edit followed by conflict; injected
   write failure and retry. Set failure to 100% only after reads settle, then reset it to
   0% through the independent dev controls before re-reading. Record notes via the app in
   `.prototype/notes.json`, with actual interaction method, route and receipt/scenario IDs.
5. Review actual diff with correctness/spec/acceptance and separate boundary subagents;
   fix verified findings and re-run only invalidated checks. Audit documentation as below.
   Fill the twelve evidence cells and Outcome, then complete through `roadmap.mjs` and
   update goals/board. Never close with a required failed, skipped or blocked criterion.

## File-level change list

Paths are repository-relative. Modify listed test files only for the named missing proof;
reuse existing assertions otherwise. Product repairs require a reviewed addition here.

| File | Change / responsibility |
|---|---|
| `docs/roadmap/active/33-recovery-undo-integrated-acceptance.md` | This plan, reviews and eventual evidence/Outcome; roadmap command moves it at completion |
| `docs/roadmap/goals.md` | Active planning link now; implementation coverage and remaining questions at close |
| `docs/roadmap/progress.md` | Generated by roadmap commands |
| `apps/e2e/archive.spec.ts` | R2 durable recovery and contrasting placement, reuse content projection journey |
| `apps/e2e/removal-undo.spec.ts` | R1/R2 exact IDs, shortcut order and cross-page reassignment evidence |
| `apps/e2e/section-edit-undo.spec.ts` | B1 nested pointer gestures, failure/retry and interleaved agent refusal |
| `apps/prototype-host/recovery-undo-acceptance.test.ts` | New P1 offline temporary-file converter/reopen/retention integration over real services |
| `apps/prototype-host/scripts/mcp-acceptance.mjs` | M1 two-transport recovery/refusal and persisted-state assertions |
| `apps/prototype-host/live-updates.test.ts` | L1 forward and inverse commit/failure publication matrix |
| `packages/domain/src/section-edit-undo.test.ts` | D1 deferred edit inverse preconditions, neighbors and actor/scope cases |
| `packages/domain/src/undo-recorder.test.ts` | D2 mixed-family pruning and no older receipt revival |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | G1 edit refusal parsing across the adapter boundary |
| `apps/web/src/app/features/projects/project-canvas.spec.ts` | F1 result-specific focus and stale-navigation guard coverage |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.spec.ts` | F1 committed/failed rename focus and input preservation |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | Set `CURRENT_SLICE` to Slice 33 at implementation start |
| `.prototype/notes.json` | Observed real-use friction only, append via existing notes flow |
| `docs/architecture/testing/overview.md` | Integrated suite responsibility |
| `docs/architecture/testing/what.md` | New host acceptance-test inventory |
| `docs/architecture/testing/how.md` | Executable matrix/journey and failure/reopen instructions |
| `docs/architecture/testing/why.md` | Evidence split and decision links if a new finding answers a question |
| `docs/specifications/README.md` | Accurate delivered coverage, references and explicit optional Redo/ArchiveItem exclusions; preserve source proposal |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | Reconcile §§29–32, 54, 61–63, 69 to verified delivered behavior |
| `README.md` | Audit and correct existing upgrade/verification instructions only |
| `docs/guides/mcp-setup.md` | Recovery, exact-actor/current grants, expiry and file-store limitation walkthrough |
| `docs/guides/first-milestone-walkthrough.md` | Reproducible integrated recovery and Undo steps |

### Documentation audit and conditional repairs

Audit all four files (`overview.md`, `why.md`, `what.md`, `how.md`) in these existing
folders against code: `docs/architecture/contracts`, `domain`, `repositories`, `mcp-tools`,
`prototype-data`, `prototype-host/api`, `prototype-host/mcp-transport`,
`prototype-host/live-updates`, `web/core`, `web/projects`, `web/prototype-tooling`, and
`testing`. Record each folder's result here, including “accurate, unchanged.” This is a
bounded documentation audit, not a mandate to rewrite 48 files. Before modifying an audit
finding, list its exact file and discrepancy in Revisions.

Already identified: `docs/architecture/repositories/how.md` describes section deletion only
as disposable removal and must also acknowledge safe explicit-add Undo; main §31's notice
paragraph still says a newer removal rather than the newest explicit operation replaces the
receipt. Reconcile these against the implementation, preserving removal-specific retry rules.

Audit the existing decisions on content-oriented Archive, section removal records,
disposable removal, section edit boundaries, row ownership, row archive Undo, root Archive
guidance, section activity targets and combined Home ordering. Preserve frozen records and
original decisions. If this phase answers a new product question, add a small dated §78 entry,
index it in `docs/decisions/README.md`, link the relevant system `why.md`, and append dated
amendments only where contradicted. No new product question is pre-settled by this plan.

## Test plan — tests first

| ID / file | Named assertions and what they prove |
|---|---|
| R1 — `apps/e2e/removal-undo.spec.ts` | Extend `disposable sections stay out of Archive and Undo restores config, layout, and shortcut order`: iterate Progress/Timeline/Recent Activity by exact IDs; shortcut previous neighbor; deletion versus reference-required tombstone; same ID/config/span/collapse after Undo/reload. Reuse `a shortcut on another browser page follows source removal and same-page Undo` for source identity. |
| R2 — `apps/e2e/archive.spec.ts`, `apps/e2e/removal-undo.spec.ts` | `Archive Restore appends while Undo returns between surviving shortcut neighbors`; `cross-page reassignment and Undo preserve every archived subtree marker`; extend current content/cascade journey with independently archived child and parent subtree, exact affected and untouched ID sets, prose and Reflections. Task lists use same-page reassignment (no second valid task-list page exists in one project); cross-page coverage uses supported Home-to-Reflections reassignment, including independently archived reflections. |
| P1 — `apps/prototype-host/recovery-undo-acceptance.test.ts` (new) | `converted v2 and pre-Undo v3 files reopen with content and references intact`: invoke the existing `packages/prototype-data/src/upgrade-cli.ts` through a Node/tsx subprocess on temp copies (it is not publicly exported), check backup equality, `JsonDataStore.load`, `createApi`, service reads/writes and fresh reloads; legacy disposable tombstones remain stored but unprojected. `post-Undo files preserve canonical state and consumed receipts`: all four families, schema validation, repeat refused, no snapshot IDs required to resolve after deletion. `Archive outlives expired and pruned receipts`: pin clock, >50 independent subjects across four families, assert cap <=50, other workspace unchanged, expired/pruned receipt refusal, retained prose/cascade still restored after disk reopen. |
| D1 — `packages/domain/src/section-edit-undo.test.ts` | `edit Undo refuses a missing page before writing` via repository doubles, since an invalid live subject/page pair cannot be committed; `update and move refuse archived or page-changed subjects`; `each edit inverse blocks on an archived ancestor`; `move Undo follows a surviving previous shortcut`; `each edit family accepts its system actor and hides foreign-workspace or other-actor receipts`. Use real valid fixtures where possible; doubles only for unreachable corrupted states; snapshot all relevant collections before/after each refusal. |
| D2 — `packages/domain/src/undo-recorder.test.ts` | `mixed-family pruning never revives an older receipt`: expiry and cap pruning of newer add/move/update/remove on the same subject removes lower-sequence records; unrelated subjects/workspaces survive; `outstandingFor` cannot recover an edit receipt or an older removal through a newer edit, consumed or expired record. |
| L1 — `apps/prototype-host/live-updates.test.ts` | `each section family publishes only after forward and inverse commit`; `failed inverse persistence preserves canonical state, unconsumed receipt and publishes nothing`; `failed recorder or forward persistence commits neither mutation nor receipt`. Extend the current temporary-file harness across add/update/move/remove: override `store.persist` for persistence faults and `undoRecords.insert` for recorder faults, saving/restoring originals before retry; no new production seam. Snapshot section/row/order/activity/record state and durable bytes; then remove fault and retry once, observing exactly one event/frame, no additional Undo record for Undo. |
| M1 — `apps/prototype-host/scripts/mcp-acceptance.mjs` | Named checks `HTTP/stdio recovery preserves exact row and source IDs`, `HTTP/stdio current grant removal refuses issued receipt`, `HTTP/stdio revoked connection refuses issued receipt`. Exercise create/update/move/remove→Undo on both SDK transports, grant-only success, consumed/foreign-actor refusal, Archive projection and cascade/reassign. HTTP changes grants/revocation through API; stdio edits only its isolated file between completed calls. Assert unchanged business collections/activity/receipt on refusals; tolerate the authenticator's documented `lastUsedAt` write. |
| G1 — `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | `preserves edit Undo refusal details and never invents Archive recovery`: representative typed conflict, blocked, expired/consumed and foreign 404 results retained as GatewayError; no dropped fields or accidental success parsing. |
| F1 — canvas/frame specs in file list | `add Undo focuses notice after removing subject`; `move/update Undo focuses surviving section title`; `refused Undo retains focus on the visible aria-disabled button for permanent refusal and remains retryable for reparable refusal`; `late Undo cannot steal focus after navigation or newer receipt`; failed rename preserves input, successful Enter returns title focus while blur keeps the user's chosen target. Test public callbacks with fake gateway, not concrete HTTP. |
| B1 — `apps/e2e/section-edit-undo.spec.ts` | `nested pointer move and resize Undo preserve persisted layout`: actual Playwright pointer drag and snapped resize in Flow/Grid, saved order/span checked after reload; `nested injected failure keeps receipt and allows retry`: fail before transport, verify saved state unchanged after resetting failure; `agent overlap refuses Undo without losing newer content`, using real HTTP MCP and browser notice. |
| S1 — existing contract/domain tests | Reuse `packages/contracts/src/undo.test.ts` strict version/type and receipt tests, `packages/domain/src/section-edit-undo.test.ts` one-record/event test, and `packages/domain/src/undo-service.test.ts` exact cascade/reassign, scope and legacy-operation tests. Record exact titles/results in ledger; no duplicate parallel contract definitions or speculative Redo implementation. |

For D1's per-family rows, cover add/update/move; removal's existing equivalents remain in
`undo-service.test.ts`. Current permission changes require transport M1 evidence, not just
changing an in-memory actor. Retention tests must exceed the limit with independent subjects
so same-subject pruning cannot make the cap assertion vacuous. No test may infer success
from an empty list without first proving its expected IDs were present.

## Boundaries touched

- UI stores/components use gateway interfaces; tests may instantiate the concrete adapter
  only in its own spec. No HTTP/domain imports in components and no core→prototype edge.
- Contracts remain single-source. Domain uses repository interfaces and injected Clock;
  `UndoService` composes only ActivityService. Test harnesses in host may compose concrete
  persistence, converter and services without changing production dependency edges.
- Tools call domain services. Use the official SDK clients; protocol/auth are not rewritten.
- Canonical document state, ActivityEvent and UndoRecord remain separate. Mutation, inverse
  metadata and publication commit together; no event replay and no inverse data on frames.
- Recovery and deletion are domain decisions. Row ownership, cascade markers and shortcut
  source identity survive; historical tombstones are not purged.
- Existing tokens, centralized flags, pnpm split servers and disposable infrastructure rules
  hold. Review acyclic edges and gateway-only usage separately from mechanically passing lint.

## Explicit non-goals

- All candidate Do not items; no Redo, ArchiveItem, purge/retention product, production storage,
  generic command framework, new MCP tools, new migration framework or shared seed overhaul.
- No Undo for row CRUD, pages/projects, shortcuts, duplicate or implicit containers.
- No notice size/layout/copy redesign or auto-dismiss experiment. Preserve and verify the already shipped aria-disabled behavior after a permanent refusal (the 2026-09-15 decision amendment).
  Slice 32's friction stays recorded unless acceptance exposes a concrete correctness defect.
- No implementation in this planning request; no phase completion or claimed runtime evidence.

## Open questions

None blocking the plan. Existing decisions fix 24-hour expiry, 50 records per workspace,
exact actor/current grant checks, conservative pruning, Archive append and neighbor Undo.
Redo is an extension seam only. Notice redesign questions remain later-use findings, not
choices needed to execute this slice. Any acceptance failure requiring a new product guarantee
must be recorded and resolved before expanding implementation.

## Revisions

- **Draft (2026-09-15):** Grounded in Slices 29–32, current services, test harnesses and
  architecture. Activated through `roadmap.mjs`. Isolated migration composition in the host;
  mapped all twelve criteria and every Slice 32 deferred test category. Review pending.

- **Round 1 (2026-09-15):** Independent plan reviewer checked spec, boundaries, deferred
  cases and concrete harness feasibility. Corrected P1's evidence claim: its automated
  conversion/service/disk sequence is distinct from the real-host/browser/MCP observation.
  Parallel local audit replaced an unavailable converter import with the existing CLI,
  removed an impossible same-project cross-page Task List fixture in favor of cross-page
  Reflections plus same-page task subtrees, and incorporated the later permanent-refusal
  button amendment. Also named the existing `store.persist` override and repository insert fault seams precisely, with originals restored before retry. No production surface or seed change is needed for these corrections.
  Re-review requested against the revised plan.
- **Round 2 (2026-09-15):** Reviewer re-read the revised plan and returned **no substantive
  findings**. Confirmed all twelve criteria, Slice 32's deferred cases, feasible fixtures,
  current authorization, retention, atomic publication and documentation obligations.
  Planning validation: `node scripts/roadmap.mjs check` passed; `pnpm docs:check` passed
  (18 system folders, 197 documents). The initial sandboxed docs check could not resolve
  Mermaid through its Windows dependency junction; the same command passed with read access.
  Runtime acceptance has not been run in this planning-only phase.