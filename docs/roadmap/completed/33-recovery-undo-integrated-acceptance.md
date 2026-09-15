<!-- completed-record id="33" closed="2026-09-15" summary="All twelve Refactor §26 criteria verified through domain, host, browser and both MCP transports; no production change" -->
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

Planned and reviewed on 2026-09-15 (two rounds, no findings left). Implemented, reviewed and
closed the same day at the user's request: `CURRENT_SLICE` was bumped to 33 at the first
implementation step, and the ledger below carries this diff's evidence.

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
| 1 | Progress, Timeline and Recent Activity removals never appear in Archive | R1, M1: assert each created ID absent, retained tombstone fixture still stored | Remove each type; Archive is empty of those IDs over UI and `get_project_archive` | PASS 2026-09-15. `removal-undo.spec.ts` “disposable sections stay out of Archive and Undo restores config, layout, and shortcut order” (each id absent from Archive and from `includeArchived` sections); `mcp-acceptance.mjs` “HTTP/stdio the removed progress/timeline/recent-activity view is deleted and absent from get_project_archive”; P1 “converted v2 and pre-Undo v3 files reopen…” (legacy Progress tombstone stored, unprojected). `pnpm e2e` 34 passed; `mcp-acceptance` both transports passed. |
| 2 | Disposable removals remain undoable | R1, M1: original ID, config, span, collapse and combined order restored; one consumption | Correct notice label and Undo; SDK `undo_operation` on own receipt | PASS 2026-09-15. Same R1 test (same id/config/span/collapse/combined order after Undo and reload; keyboard focus Undo → title); M1 “Undo recreates the <type> view under its id” and “a repeated <type> Undo is undo_consumed … adds no event or record” on both transports; D2 mixed-family pruning. Real use: removal/Undo of a shortcut-backed empty Reflections container on Kitchen. |
| 3 | Cascaded task list has durable recovery | P1, R2: close/reopen file; exact cascade IDs recovered after expiry/pruning of receipt | Reload Archive; restore list; independently archived parent/subtree still need their own restore | PASS 2026-09-15. P1 “Archive outlives expired and pruned receipts” (59 independent receipts, cap 50, pruned → not-found, expired → `undo_expired`, list restored from Archive after disk reopen, cascaded tasks live); `removal-undo.spec.ts` “retained content survives reload and Archive restore…” (cascade restore leaves the independently archived parent/child archived and listed). |
| 4 | Reassign-all source does not clutter Archive | R2, M1: task subtrees move between same-page lists; Reflections move across pages within one project; empty sources absent | Browser Reflections reassignment Home → Reflections page; SDK task-list reassign; Undo returns all original IDs and markers | PASS 2026-09-15. `archive.spec.ts` content journey and `removal-undo.spec.ts` “retained content survives reload…” (same-page task reassign, source absent from Archive, Undo returns parent/child and archived subtree); “cross-page reassignment and Undo preserve every reflection id and archive marker” (**driven over HTTP**: the browser dialog lists same-page targets only; both browser pages observed); M1 “HTTP/stdio recovery preserves exact row and source IDs (reassign)”. |
| 5 | Nonempty rich text is recoverable without owned rows | R2, P1: exact prose survives reopen and Restore; blank prose absent | Saved content label and body visible after restore; MCP projection names prose | PASS 2026-09-15. P1 exact prose `Whole-house plan. Kitchen first, garden in the spring.` survives remove → Undo → reopen and Archive Restore after pruning; `archive.spec.ts` placement-contrast test keeps `Keep the middle prose`; real use: Kitchen brief removed, “Keeps its text” row, Restore saved content brought the exact text back. |
| 6 | Archive consumes a recovery projection | Existing archive/store/route/contract assertions plus R1/P1; created disposable IDs absent while prose/cascade IDs present | UI and `get_project_archive` match projected IDs/metadata; separate gateway-boundary review | PASS 2026-09-15. Existing `project-archive-service`/route/contract suites (`pnpm test` green) plus P1 legacy tombstone absent while prose/cascade present; `get_project_archive` over both transports (M1) and UI rows match. Boundary reviewer (2026-09-15) found no gateway or component violations. |
| 7 | Activity and Undo remain separate | S1, L1: separate collections, one attributable event and record forward; Undo consumes record and adds only one event | Activity feed remains readable after source deletion; MCP receipt/frame contains no inverse data | PASS 2026-09-15. S1 `section-edit-undo.test.ts` “records exactly one record and event per changed operation, and Undo adds one event and no record”; L1 “%s publishes only after forward and inverse commit” now asserts `events` +1 forward and +1 Undo with `records` 1; `live-updates.test.ts` Slice 30 frame check has no inverse data; R2 placement test asserts refusals add no activity. Structural proof, UI corroboration only. |
| 8 | Mutation and promised inverse commit atomically | L1: recorder failure, persistence failure, Undo-time failure leave domain collections and receipt unchanged; zero published frames | Browser injected failure leaves saved state unchanged and retry usable; successful HTTP MCP frame reflects committed state | PASS 2026-09-15. L1 “%s: failed inverse persistence…” and “%s: failed recorder/persistence commits neither mutation nor receipt” for add/update/move/remove (bytes on disk unchanged, no frame, one frame on retry); fault-checked by publishing Undo frames before commit. B1 “nested injected failure keeps receipt and allows retry”; real use: 100% failure left Kitchen order unchanged and the same receipt worked at 0%. |
| 9 | One Undo reverses one multi-row action | R2, M1: exact row-ID/parent/section/archive-marker sets; preserve later nonstructural edits; reject structural conflicts | One click/tool call reverses cascade/reassign; repeated call refused without another event | PASS 2026-09-15. `undo-service.test.ts` cascade/reassign exact-row tests (S1); M1 reassign and cascade exact ids with one `undo_operation`; R2 cross-page and same-page Undo; repeated Undo refused without events (M1, R2); B1 “agent overlap refuses Undo without losing newer content”; real use: agent `move_section` superseded the browser move and Undo was refused for good. |
| 10 | Restore appends; Undo restores by neighbors | R1/R2, D1: same initial placement, separate removals: Restore appends after shortcut; Undo uses previous/next/fallback | Observe both combined orders in browser and SDK reads; do not reuse a consumed/conflicted receipt | PASS 2026-09-15. `archive.spec.ts` “Archive Restore appends while Undo returns between surviving shortcut neighbors” (same start; Undo → `[first, shortcut, middle, last]`, Restore → `[first, shortcut, last, middle]`; browser DOM, HTTP and SDK `list_sections`; first receipt `undo_consumed`, second `undo_conflict`); D1 “move Undo follows a surviving previous shortcut”. Real use: Kitchen brief Restore appended last. |
| 11 | Migration preserves referential integrity | P1: v2 conversion and pre-Undo v3 load preserve unrelated collections; validate every reopen and mutation; shortcut-backed source retained | Converted temp file opened through host and MCP; source unavailable then restored with same ID; no dangling row/source references | PASS 2026-09-15. P1 all three tests (`expectReferentialIntegrity` after every reopen; real `upgrade-cli.ts` subprocess; backup bytes identical; shortcut-backed Kitchen tasks retained under its id, then Undo). Step 3 real host: temp v2 copy (+ test-local `agent-claude` connection) converted by `pnpm prototype:upgrade`, backup `cmp`-identical, Archive viewed in browser, SDK remove → Archive → Undo, host restarted, repeat `undo_consumed`, section order and browser canvas intact. |
| 12 | Clear future Redo path without event sourcing | S1 plus boundary review: strict version/type union, unknown versions rejected, canonical reads work without Activity replay; Undo creates no new record | Browser and MCP execute four receipt families, with no Redo endpoint/control; review records extension seam, not implemented Redo | PASS 2026-09-15. S1 `packages/contracts/src/undo.test.ts` “rejects %s — the union is typed and versioned, never arbitrary JSON” and version-1 retention tests; no Redo route, tool or control (`grep` of routes, tools and web). Four families executed in browser (B1, R1, section-edit-undo journeys) and MCP (M1, `assertUndo`). Reviewer: the versioned operation union is the extension seam; Redo not implemented. |

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

#### Audit results (2026-09-15)

| Folder | Result |
|---|---|
| contracts | accurate, unchanged |
| domain | accurate, unchanged |
| repositories | `how.md` and `why.md` said deletion served disposable removal only; both now name safe explicit-add Undo (`executeSectionAddUndo`) |
| mcp-tools | accurate, unchanged |
| prototype-data | accurate, unchanged |
| prototype-host/api | accurate, unchanged |
| prototype-host/mcp-transport | accurate, unchanged (`why.md` names only Slice 30's round trip but defers to testing) |
| prototype-host/live-updates | `how.md` credited `live-updates.test.ts` with the removal failure case only; now names the four-family commit and fault matrix |
| web/core | accurate, unchanged |
| web/projects | accurate, unchanged |
| web/prototype-tooling | accurate, unchanged |
| testing | all four files updated: integrated suite responsibility, inventory, rerun instructions, evidence split and fault-sensitivity rule; bundle figure refreshed |

Main spec: §31's receipt-replacement sentence now says the newest explicit operation replaces the
receipt, and §69 records Slice 33's integrated evidence; §§29–30, 32, 54, 61–63 were accurate.
README (pre-Undo v3 files load as-is; path resolution), `mcp-setup.md` (grants checked when Undo
runs, revocation, persistence, 50-record limit, stdio file sharing), the milestone walkthrough
(Undo versus Archive Restore contrast) and `docs/specifications/README.md` (delivered coverage,
Redo and `ArchiveItem` excluded) were updated. Decisions: no new product question; one dated
amendment to [reassign may cross pages](../../decisions/2026-09-reassign-may-cross-pages.md),
whose confidence note said the path had not been exercised. The other listed decisions are
consistent with the shipped behaviour.

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
  mapped all twelve criteria and every Slice 32 deferred test category. Review requested.

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
  Runtime acceptance has not been run in this planning-only phase.- **Implementation (2026-09-15):** Tests-first per the test plan; every new assertion passed
  against existing code, so each group was checked against a temporary, reverted fault (hub
  delivery before commit; skipped page, archived-subject and ancestor checks; placement
  previous-neighbour lookup; actor scoping; same-subject pruning and `outstandingFor`'s family
  filter; Archive projection filter; the 50-record limit; dropped refusal details; canvas and
  store stale-result guards; blur focus return). No defect was found, so no production file
  changed beyond `CURRENT_SLICE`. Deviations: (1) the browser removal dialog offers same-page
  reassign targets only (`ProjectPageStore.reassignTargets`), so cross-page Reflections
  reassignment runs over HTTP with both browser pages observing it; (2) P1 undoes its four
  receipts newest-first — undone out of order, two inverses can both follow the same surviving
  previous neighbour, which is placement working as designed; (3) Kitchen is a sub-project with
  no shortcuts, so B1 orders its sections only; (4) M1 revokes the second connection
  (`agent-cursor`, granted `projects.write` in its temp files) so the primary token still serves
  the restart checks, and removes the grant from the primary; (5) the "late Undo after
  navigation" focus case is protected by redundant store and canvas guards and did not fail under
  a single fault — the newer-receipt case did; (6) the step-3 v2 copy received a test-local
  `agent-claude` connection so a real MCP client could authenticate against the converted file.
- **Diff review (2026-09-15):** Two subagents reviewed `git diff 9f94650`. Correctness/acceptance
  (verified and fixed): L1's Undo frame check could pass if published before commit — now asserts
  the consumed receipt on disk and one activity event at delivery, fault-checked by publishing
  only Undo frames early; M1 revocation accepted any error — now requires an authentication
  refusal on each transport; the foreign refusal now compares business collections; M1 checks
  Progress, Timeline and Recent Activity absent from `get_project_archive` and that a repeated
  Undo adds nothing; P1 compares exact prose and `archivedWithTaskId`; the placement test asserts
  each receipt's reason and no refusal activity; the late-Undo focus test proves the Undo resolved
  and the rename committed; D2's cap test was renamed to what it proves (cap pruning always takes
  the oldest records, so same-subject cap pruning cannot be isolated; the expiry matrix covers the
  rule); the cross-page e2e title no longer claims a subtree. Boundaries: no violations; the only
  production change is `CURRENT_SLICE`. Documentation (fixed): `repositories/why.md` deletion
  sentence, `live-updates/how.md` test inventory, `goals.md` link, `mcp-setup.md` "writes
  nothing" (the authenticator still stamps *Last used*), connection naming in `testing/how.md`,
  and the HTTP-driven note in `testing/what.md`. Not taken: an out-of-order Undo placement check
  for MCP clients (placement is best-effort by decision and `undo-service.test.ts` pins the
  strategies); reflection subject references in the integrity helper (the fixtures carry none).
  Invalidated checks rerun: host `recovery-undo-acceptance`/`live-updates` 26 passed, domain
  `undo-recorder` 21 passed, canvas spec 48 passed, `mcp-acceptance` both transports passed,
  `archive.spec.ts` 3 passed, the renamed cross-page test passed, `apps/e2e` `tsc` clean.

## Outcome

**Deliverables.** The Archive, removal and Undo refactor now has explicit, passing evidence for
all twelve Refactor §26 criteria (the ledger above). New coverage: domain edit-inverse
preconditions and mixed-family pruning ([section-edit-undo.test.ts](../../../packages/domain/src/section-edit-undo.test.ts),
[undo-recorder.test.ts](../../../packages/domain/src/undo-recorder.test.ts)); a host
commit-before-publish and fault matrix for every receipt family checked against the bytes on disk
([live-updates.test.ts](../../../apps/prototype-host/live-updates.test.ts)); a persisted-file suite
that runs the real upgrade CLI on v2 and pre-Undo v3 copies, reopens after Undo and proves Archive
outlives pruned and expired receipts ([recovery-undo-acceptance.test.ts](../../../apps/prototype-host/recovery-undo-acceptance.test.ts));
gateway refusal and Undo focus specs; MCP acceptance for exact ids, a foreign connection, a removed
grant and revocation on both transports ([mcp-acceptance.mjs](../../../apps/prototype-host/scripts/mcp-acceptance.mjs));
and browser journeys for placement contrast, cross-page reassignment, nested pointer move/resize
Undo, injected failure with retry and agent overlap. Final runs: `pnpm docs:api`, `pnpm test`
(contracts 252, repositories 140, prototype-data 100, domain 581, mcp-tools 150, host 209, web 715,
root 9), `pnpm lint`, `pnpm build` (994.27 kB initial; the 850 kB warning budget is exceeded as
before, under the 1 MB error ceiling), `pnpm e2e` 34 passed, and all four host acceptance scripts;
tests changed after that run were rerun as listed under Revisions. The converted v2 file was also
driven through a real host, the browser and an SDK client, restarted and reopened.

**Deliberate choices.** Evidence sits at the lowest layer that can observe each guarantee, then is
joined through the browser and both transports; shared seeds and snapshots are unchanged, and every
scenario uses temp copies or test-local additions. Passing-first assertions were made to fail with
reverted faults rather than by editing production code. Structural criteria (§26.6, 7, 12) are
proven by contract, domain and review, with UI and MCP as corroboration only.

**Deviations from the plan.** Listed under Revisions: cross-page reassignment is HTTP-driven because
the dialog is same-page only; P1 undoes newest-first; Kitchen orders sections only; revocation uses
the second connection; one focus case is guarded redundantly; the step-3 v2 copy gained a test-local
agent connection.

**Deferred.** Redo and an `ArchiveItem` aggregate remain unimplemented by design. Four friction notes
from real use (`note-2026-09-15-005` … `-008`) are later candidates, not part of this refactor: raw
`undo_conflict:` text and "use the later receipt" advice when the newer change was an agent's; the
notice offering Open Archive for a shortcut-backed empty container Archive does not list; Archive
Restore silently moving a brief to the end of its page; a failure message that does not say Undo is
still available, and the same-page-only reassign dialog. Slice 32's notice size and copy friction also
still stands — the notice covered a Task List row during real use.

**Open questions.** Whether a person should be able to choose a cross-page reassign target in the
dialog, and whether refusal copy should name the actor whose change superseded theirs. Both are for
the next friction-chosen phase.

**Documentation updated.** Architecture `testing` (all four files), `repositories/how.md` and
`why.md`, `prototype-host/live-updates/how.md`; main spec §31 and §69; `README.md`;
`docs/guides/mcp-setup.md` and `first-milestone-walkthrough.md`; `docs/specifications/README.md`
(implemented through Refactor §23 phase 5); a dated amendment to
[reassign may cross pages](../../decisions/2026-09-reassign-may-cross-pages.md) and its index row;
`goals.md`.
