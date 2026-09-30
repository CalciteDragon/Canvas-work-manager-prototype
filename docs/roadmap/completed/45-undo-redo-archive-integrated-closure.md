<!-- completed-record id="45" closed="2026-09-27" summary="Integrated Undo/Redo and Archive evidence ledger; header 375 px and stdio concurrency repairs" -->
# Slice 45 — Undo/Redo and Archive integrated closure

> **Note (2026-09-28):** the two sensitivities listed under *Open gaps* below (the reflection transition grant check and the task no-op receipt) were demonstrated with applied and reverted faults by [Slice 50](50-fault-sensitivity-evidence.md). This record's text is unchanged.

## Goal

Demonstrate Slice 34's Undo/Redo, removal and Archive direction across the browser, HTTP and both MCP transports, then reconcile its living documentation and record remaining design questions.

## Spec sections

[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md) §§8–14 (boundaries and persistence), 19–23 (UI state), 26–34 and 36 (project, page, section, task and reflection behavior), 53–54 (grants and MCP), 57 (Activity), 61–63 (API, frames and failure), 68–70 (routes and verification), 77–79 (real use, decisions and notes). [Slice 34 Stage E](../completed/34-undo-redo-and-archive.md#delivery-stages) and its [acceptance check](../completed/34-undo-redo-and-archive.md#acceptance-check) are the completion contract. Its 2026-09-23 amendment retires the retry cache; a lost response retried at the old revision must yield a stale-summary refusal.

## Build

1. Inventory the shipped assertions from Slices 35–44 against every Slice 34 coverage-matrix row and acceptance step. Put an evidence ledger in this plan: named domain test/assertion for every family, integrated test/assertion, command/result, browser or real SDK observation, and any uncovered guarantee. A prior slice's green claim alone is not evidence.
2. Add missing domain or integration assertions in the existing suites named below. Write each assertion first. If it already passes, prove sensitivity with a temporary targeted fault and revert it. If it exposes a defect, keep the red test, add exact repair files to this plan, re-review and fix minimally.
3. Run all gates and exercise realistic work in the app and a connected MCP client. Include exact-actor history after navigation/reload, creation recovery, compound cascades, current grant refusal, conflicts, expiry, same-file restart, parent-first Archive and Settings restoration. Record friction in `.prototype/notes.json`.
4. Reconcile the current main spec, architecture, decisions index and guides with what the integrated pass proves. Amend decisions only if this phase answers or changes a question. Close the Slice 34 direction in `goals.md` only when every acceptance row has evidence.

## Done when

All six Slice 34 user requests and every included action family have explicit passing evidence in the ledger. Unsafe Undo/Redo and Restore attempts change no business record, history cursor or Activity; navigation and reload preserve only the current actor's history; Archive remains useful after history expiry. The seven acceptance steps below have exact-ID, command and observed-result entries, all required commands pass, and limitations and friction are recorded. If a required step cannot be verified, leave this phase active and report the gap.

## Do not

- Add a new action family, history browser, global shortcut, production infrastructure, standalone ArchiveItem store, event sourcing or task purge.
- Redesign shipped Stage A–D behavior merely to satisfy an old proposal. Follow current decisions and document a genuine disagreement before changing intent.
- Rewrite completed records or decisions; append a dated amendment where necessary. Do not reset personal `.prototype/data.json` for automated tests.

## Acceptance check

Use isolated `personal-workspace`, `nested-projects` and `agent-heavy` data. For each step below, write a dated ledger entry under **Outcome** naming the domain assertion where applicable, integrated test/assertion, executed command/result and observed browser or real SDK behavior. Assert returned IDs and exact affected fields/markers. Mark unsupported claims as gaps rather than PASS.

1. On every root page and a subproject, including empty/populated and Archive-disabled states, see both header controls. Check enabled/blocked reason, keyboard/touch and 375 px in both themes. A different persona and a second tab must not act on the first actor's history.
2. Add → complete → rename → Delete a task; Undo all four and Redo all four with the same IDs and `createdAt`, exact captured business fields (including prior `status` and `completedAt`) and Archive result. Check that `updatedAt` follows the injected `Clock` on each transition rather than requiring equality. Repeat a descendant write from root Todos and follow its owner-labelled history. Cover reflection CRUD and implicit-container Add independently.
3. Save prose, resize, move through mixed placements, collapse, change layout/progress settings, add/move/remove a Home shortcut, duplicate a section, Restore, enable an optional page for the first time and create a project. Undo/Redo each applicable action through navigation and reload, including same-ID creation recovery. Cancel, preview and same-value writes create no step.
4. Remove task and reflection containers with live and independently archived descendants in one request, without policy/reassignment UI. Confirm exact cascaded markers, retained independent markers and parent-first Archive after Restore. Repeat for empty, meaningful/blank prose and reference-safe disposable views. Retired removal fields refuse over HTTP and MCP without mutation; ordinary task moves still work.
5. Archive child then root; recover root with an explicit status through `/settings/archived-projects`, then independently archived descendants through Settings/root Archive. Check ancestor blockers, disabled Archive, persona scope, empty/error/retry, navigation/frame refresh and concurrent Restore refusal without a partial write. Restore retained content after history expires.
6. Audit every Slice 34 coverage-matrix row against a named domain assertion and browser or MCP evidence. Include task/reflection, shortcut, page, project lifecycle/creation, duplication, Restore, layout and progress families; do not infer one from another.
7. Through HTTP, Streamable HTTP MCP and stdio MCP, check overlapping agent edits, per-family grant revocation, foreign actor/workspace, two-tab expected-revision race, lost-response stale-summary retry, injected persistence/recorder failure and expired/pruned history. Inventory canonical Restore races separately from history-transition faults: an archived owner/ancestor (or archived parent task) must refuse Restore without a partial business/history/Activity change or frame. A new dependent must refuse an unsafe history inverse or Redo; that refusal likewise leaves all four unchanged. A committed transition adds exactly one event. Retry after failure and same-file restart must preserve correct state.

Run `pnpm docs:api`, `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`, `pnpm storybook:build`, `pnpm e2e` and all four `@cwm/prototype-host` acceptance commands (`acceptance`, `agent-acceptance`, `mcp-acceptance`, `live-acceptance`). Record the initial bundle measurement against the current 1050 kB error ceiling. Start `pnpm dev:web` and `pnpm dev:host` in separate terminals for real use; do not run Playwright against those personal servers.

## File-level change list

| File | Change / responsibility |
|---|---|
| `docs/roadmap/active/45-undo-redo-archive-integrated-closure.md` | Maintain the acceptance ledger, review rounds and final Outcome with exact evidence and gaps. |
| `apps/e2e/project-history.spec.ts`, `apps/e2e/web.spec.ts`, `apps/e2e/row-history.spec.ts`, `apps/e2e/section-edit-undo.spec.ts`, `apps/e2e/canvas-history.spec.ts`, `apps/e2e/page-history.spec.ts`, `apps/e2e/project-creation-history.spec.ts` | Inventory header project edit/archive and direct prose/keyboard resize/mixed-placement gestures in their existing journeys; tighten only uncovered history-family, no-op, conflict, reload and cross-owner assertions. |
| `apps/e2e/removal-undo.spec.ts`, `apps/e2e/archive.spec.ts`, `apps/e2e/archived-projects.spec.ts`, `apps/e2e/todos.spec.ts`, `apps/e2e/reflections.spec.ts` | Tighten only uncovered cascade, task Delete, parent-first recovery and cross-surface observations. |
| `apps/prototype-host/scripts/acceptance.mjs`, `apps/prototype-host/scripts/agent-acceptance.mjs`, `apps/prototype-host/scripts/mcp-acceptance.mjs`, `apps/prototype-host/scripts/live-acceptance.mjs`, `apps/prototype-host/recovery-undo-acceptance.test.ts`, `apps/prototype-host/live-updates.test.ts` | Add only missing exact-ID HTTP/MCP, failure atomicity, grants, restart/expiry and frame assertions; reuse existing temp-file harnesses. |
| `packages/mcp-tools/src/contract.test.ts`, `apps/prototype-host/mcp/handler.test.ts` | Inventory per-family minimal grants separately from live connection revocation; add only a missing permission assertion. |
| `packages/domain/src/row-history.test.ts`, `packages/domain/src/section-restore-history.test.ts`, `packages/domain/src/shortcut-history.test.ts`, `packages/domain/src/page-history.test.ts`, `packages/domain/src/project-history.test.ts`, `packages/domain/src/operation-history.test.ts`, `packages/domain/src/operation-history-service.test.ts`, `packages/domain/src/section-service.test.ts`, `packages/domain/src/task-service.test.ts`, `packages/domain/src/reflection-service.test.ts`, `packages/domain/src/project-service.test.ts`, `packages/domain/src/project-page-service.test.ts` | Inventory a named domain assertion for each matrix row; add only uncovered inverse, no-op, permission, dependency or canonical Restore-refusal cases in its owning suite. |
| `docs/architecture/testing/overview.md`, `docs/architecture/testing/why.md`, `docs/architecture/testing/what.md`, `docs/architecture/testing/how.md` | Update only if acceptance coverage or commands change; record the final evidence map and limits in the appropriate current-state file. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md`; affected `docs/architecture/{contracts,domain,repositories,mcp-tools,prototype-host,web}/` system files; `docs/decisions/README.md` and affected existing decisions | Audit against current behavior; edit only confirmed drift or a newly answered question, with exact files added to this checklist before editing. |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md`, `README.md` | Audit commands, tool names and recovery paths; edit only verified drift and record exact changed files. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | Set `CURRENT_SLICE` to 45 at implementation start and capture real-use friction. |
| `docs/roadmap/goals.md`, `docs/roadmap/progress.md` (generated by `roadmap.mjs`) | Record direction at closure and regenerate board; leave Slice 34's umbrella file planned with accurate Stage E status. |
| `apps/prototype-host/mcp/stdio.ts`, `apps/prototype-host/mcp/stdio.test.ts` | **Repair (added 2026-09-27, defect D2).** The stdio entry reloads the data file for every call (so it sees another process's revocation), which gives each call its own store and write lock: two overlapping `undo_operation` calls at one expected revision both pass the revision check and race on persisting — observed as several calls reporting success while only one survives on disk (a lost update), or as `ENOENT … rename` on the loser. Serialize each call's load, execution and persist inside the stdio process. Red test first: a stdio case firing three transitions at one revision expects exactly one success, two `history_revision_stale` refusals, one new Activity event and one revision step. Cross-process writes (stdio beside the HTTP host on one file) stay the existing one-file limitation. |
| `apps/web/src/app/features/projects/project-header.scss`, `apps/web/src/app/features/projects/history/project-history-controls.scss` | **Repair (added 2026-09-27, defect D1).** Under 40rem the actions row is `justify-content: flex-end` without wrapping, so in the 135 px workspace the unshrinking sidebar leaves at 375 px, Undo/Redo/More overflow the header's left edge beneath the sidebar and cannot be tapped. The Undo/Redo pair is itself one unwrapping 92 px flex item, wider than the ~65 px header content box. Let both rows wrap inside the header box. Red test first: `project-history.spec.ts` "Slice 45 · 1" asserts both controls lie inside the header and viewport, then taps them, at 375 px in both themes. The sidebar collapse itself stays a separate, previously recorded shell limitation. |

The test files are inspection targets, not a mandate to modify each one. Before an edit, identify the precise missing assertion in the ledger and mark its chosen file. Any discovered runtime repair gets an exact file row and reviewed test-first sequence before code changes.

## Test plan — tests first

| Test / evidence target | What it proves |
|---|---|
| `project-history.spec.ts` and `web.spec.ts`: exact header/project sequence with revisions and reload; `row-history.spec.ts`: task and reflection reverse/replay | UI controls follow server order; compound row actions preserve IDs, `createdAt` and captured business dates, while `updatedAt` uses the transition clock. |
| `section-edit-undo.spec.ts`: Rich Text blur, keyboard resize and mixed-placement move | Direct canvas commits record one step; preview/cancel adds none. Identify exact existing test titles first. |
| `canvas-history.spec.ts` and `page-history.spec.ts`: shortcut/duplicate/Restore/first-enable dependency and no-op assertions | Each distinct layout/page action is one step, unsafe inverse refuses and no-op adds none. |
| `project-creation-history.spec.ts`: creator-only absent URL and descendant projections | The browser keeps same-id Redo reachable only by the creator while history exists. |
| `acceptance.mjs` and `recovery-undo-acceptance.test.ts`: project creation same-file restart, clock advance and Activity after expiry | Same-id Redo survives restart before expiry; the durable Activity anchor remains after the receipt expires. |
| `removal-undo.spec.ts`, `archive.spec.ts`, `archived-projects.spec.ts`: exact parent-first and independent-marker sequence | One-step removal and root recovery agree with canonical Archive projection, including disabled page and concurrent blocker. |
| `acceptance.mjs`, `mcp-acceptance.mjs`: stale expected revision, lost-response retry, revoked write grant, old removal-input refusal | HTTP and both SDK transports reject without a second mutation/event and expose a useful current summary. |
| `contract.test.ts`: per-family minimal grant; `handler.test.ts`: connection revocation after receipt | Registry authorization and live authenticator revocation are each proven at their owning layer. |
| `recovery-undo-acceptance.test.ts`, `live-updates.test.ts`: persisted bytes, Activity count and zero frames under fault | Recorder/persist failure is atomic and a retry succeeds once; expiry leaves durable Archive recovery. |
| `section-service.test.ts`, `task-service.test.ts`, `reflection-service.test.ts`, `project-service.test.ts`: Restore after an owner/ancestor/parent archive; `live-updates.test.ts`: the same refusal through a real commit boundary | Canonical Restore refusal leaves business rows, operation history, Activity and published frames unchanged; only a current successful Restore changes markers. Inventory Slice 44's existing 409 assertions before adding one. |
| `row-history.test.ts`, `section-restore-history.test.ts`, `shortcut-history.test.ts`, `page-history.test.ts`, `project-history.test.ts`, `operation-history.test.ts`: one named assertion per coverage row | Domain footprint and unsafe inverse are proven at the rule owner, not inferred from browser appearance. |

First locate each existing assertion by test title and run its focused suite. Add a new test only for a concrete uncovered guarantee. A new test must fail for the intended missing behavior; when current code already passes, temporarily inject and revert a targeted fault to show the assertion detects it. Re-run the focused suite after a production repair, then the full gates above.

## Boundaries touched

Audit that contracts remain the sole shared shapes; domain services use repository interfaces and injected `Clock`; MCP tools call services; web components use gateway interfaces; `core/` never imports `prototype/`; styles use tokens; history and Archive add no persistence aggregate. Existing import/date/token/docs lints plus independent boundary diff review enforce these. Acceptance tests may compose layers in the host harness, but production code must retain their direction. No new domain service edge is authorized.

## Explicit non-goals

- UI polish suggested by friction (section edit labels, root access to descendant history, task Delete's disappearance cue) belongs to a later friction-chosen slice unless it blocks acceptance.
- No comprehensive new suite duplicating named assertions; no seed/snapshot rewrite just for this ledger.
- No production migration, new retention policy, task-status change or alternate Archive route.

## Open questions

No product decision blocks the integrated audit. If it finds disagreement between shipped behavior and Slice 34's matrix, check dated decisions and later stage outcomes first. Record the concrete conflict and re-review the needed change before implementing; escalate only if it changes direction rather than correcting a defect. The three known UX friction questions above remain open for future use, not closure blockers.

## Revisions

- **Draft (2026-09-27):** Scoped Stage E from Slice 34 and Slice 44. Identified existing test surfaces and made the evidence ledger, fault sensitivity and defect-expansion rule explicit.
- **Review round 1 (2026-09-27):** Added exact domain test targets and a required domain-assertion column for every coverage row. Separated canonical Restore race/refusal atomicity from history-transition faults, with a focused domain and live-frame evidence path.
- **Review round 1 continuation (2026-09-27):** Added the existing section-edit and web journeys to the inventory. Distinguished stable IDs/`createdAt` and captured business dates from `updatedAt`, which transitions stamp with the injected clock.
- **Review round 2 (2026-09-27):** Corrected the canonical Restore preflight: archived owner/ancestor/parent blocks it; a new dependent blocks an unsafe history inverse or Redo instead.
- **Review round 2 continuation (2026-09-27):** Added the registry contract and MCP handler suites so per-family grants and live connection revocation have separate named evidence.
- **Review round 3 (2026-09-27):** Moved project-creation restart/expiry/Activity proof to its actual host suites; the Playwright file supplies creator-route and projection evidence.
- **Implementation — defect D1 (2026-09-27):** The new 375 px touch journey could not tap the header Undo: `elementFromPoint` at its centre returns the global sidebar, because the actions row overflows the 115 px header box leftwards. Slice 41's 375 px check measured the boxes and document overflow only, so it passed. Added the header repair above.
- **D1 repair review (2026-09-27):** An independent reviewer confirmed the diagnosis and scope, and found that wrapping the header row alone still leaves the 92 px Undo/Redo pair ~2 px outside the header box, and that a tap test cannot see that. The repair now also wraps `.history-controls`, and the journey asserts containment in the header and viewport before tapping.
- **Diff review round 1 (2026-09-27):** Three independent reviewers found no boundary violation. Accepted: `.history-controls` `justify-content` also moved Slice 42's recovery panel (dropped; wrapping alone keeps containment); layout, progress and shortcut-move Redo lacked reload evidence (added); step 7 transport claims needed marking (MCP race and canonical Restore refusal added on both transports; faults and stdio expiry recorded as limits); ledger citation fixes. The new MCP race exposed **defect D2** in stdio, added above with its red test.
- **Diff review round 2 (2026-09-27):** One reviewer found no substantive defect remaining. It
  confirmed the D2 turn is released on every path and reproduced the pre-fix race on five of five runs.
  The minor findings were applied: honest D2 red wording, and the MCP Restore refusal pinned to "archived section".

## Outcome

### Evidence ledger (2026-09-27)

Abbreviations: **RH** `packages/domain/src/row-history.test.ts`, **OHS** `operation-history-service.test.ts`,
**SEU** `section-edit-undo.test.ts`, **SRH** `section-restore-history.test.ts`,
**SHH** `shortcut-history.test.ts`, **PGH** `page-history.test.ts`, **PJH** `project-history.test.ts`,
**SS/TS/RS/PPS/PAS** the section, task, reflection, project-page and project-archive service suites (all
in `packages/domain/src/`); **LU** `apps/prototype-host/live-updates.test.ts`; **MA**
`apps/prototype-host/scripts/mcp-acceptance.mjs` (every MA label runs on Streamable HTTP *and* stdio, except the expiry journey, which needs the Streamable HTTP host's simulated clock);
**AC** `apps/prototype-host/scripts/acceptance.mjs`; **API** `apps/prototype-host/api/routes.test.ts`; **PH** `apps/e2e/project-history.spec.ts`. "New" marks an assertion
this phase added; every other entry already existed and was located by title and rerun.

**Coverage matrix (Slice 34 acceptance step 6).**

| Family | Domain assertion | HTTP / MCP evidence | Browser evidence |
|---|---|---|---|
| Task add (+ implicit container) | RH "reverses and replays task creation, completion, editing and archive twice…"; RH "Redo task Add refuses a recreated implicit container id"; RH "later children and subject links block creation Undo atomically"; new RH "Undo Add leaves the task out of the task repository and the Archive projection" | LU "task Add publishes only after forward, Undo and Redo commit"; MA new "the chain records an add, two updates (completion is one) and an archive" (MA undoes three of the four: the chain's children depend on its creation) | New PH "Slice 45 · 2" (same id/`createdAt`, absent from Archive after Undo Add); `row-history.spec.ts` "agent compound history removes and restores containers…" |
| Task complete / edit / move | RH chain above; RH "disjoint edits survive and overlapping edits refuse…"; RH "same-section reparent Undo and Redo…"; new RH "a no-op task write answers a null receipt…"; new RH Delete test (Clock-stamped `updatedAt`) | MA new "Undo completion restores the prior status and clears completedAt", "Redo completion keeps the captured completedAt"; MA `update_task` move Undo/Redo | New PH "Slice 45 · 2" (captured `status`/`completedAt`, `updatedAt` within the transition's Clock minute); PH "4. a write recorded in another project's history…" |
| Task Delete / Restore | New RH "task Delete over a live and an independently archived subtree…"; new RH "Undo of a task Restore re-archives only the rows that Restore revived"; TS restore refusals (new whole-store equality) | MA new "Delete cascades to the live child only", "Undo Delete revives only its own cascade", "Redo Delete re-archives exactly its cascade"; new LU Restore races | New PH "Slice 45 · 2"; `todos.spec.ts` coarse-pointer Delete; `row-history.spec.ts` live Archive tab |
| Section add / duplicate | SEU "records an explicit add; Undo removes only that section…"; new SS "records the copy as one add…same id and place" | AC duplicate Undo/Redo same id; MA `create_section` Undo/Redo | `section-edit-undo.spec.ts` "canvas gestures and the Reflections page…" (contextual add undone from the header); `canvas-history.spec.ts` "duplication records the add it is…" (HTTP-driven: the frame has no Duplicate control) |
| Section edit | OHS "the Stage A gate"; SEU "restores a cleared title and a replaced config exactly…", no-op and overlap cases | AC section chain; MA `update_section` A→B chain | `section-edit-undo.spec.ts` "canvas gestures and the Reflections page…"; PH "2–3, 8" (resize, reload, navigation) |
| Section move / remove / restore | SS "…one receipt, one action and one activity event for a multirow cascade"; OHS "removal Undo rows"; OHS "Redo of a removal refuses when new rows appeared…"; SRH "reverses and replays a cascade restore…"; SS restore under an archived project (new whole-store equality) | LU section families; new LU "refuses a removal Redo once a new row joined…"; MA remove/restore chains | `removal-undo.spec.ts` "one-step cross-page reflection removal…"; `canvas-history.spec.ts` "Archive Restore records its own action…"; real use below |
| Shortcut add / remove / move / settings | SHH "reverses and replays add, resize, collapse, move and remove in one stack"; new SHH "an unchanged settings update records nothing…" | AC all four kinds, same placement id; MA add/remove | PH "2–3, 8"; `canvas-history.spec.ts` "shortcut gestures record once…"; new PH "Slice 45 · 3" (keyboard move; Redo after reload and navigation) |
| Reflection add / edit / delete / restore | RH "reflection add, edit, archive and durable restore…"; new RH "a reflection transition needs reflections.write…"; RS restore refusal (new whole-store equality) | MA new reflection Restore, archive and Add Undo, and Add Redo under the same id; LU reflection Add faults | `row-history.spec.ts` canvas add/edit/cancel and journal add Undo/Redo. **No browser Delete control exists**; delete evidence is MCP |
| Project add / edit / archive / reactivate | OHS "creates, removes and restores a project…"; PJH edit, own-archive, live-child Redo refusal and reactivation tests | AC creation restart/expiry; MA project block | `project-creation-history.spec.ts`; PH "2–3, 8" rename; `web.spec.ts` header archive; real use below |
| Optional page enable / disable | PGH "removes only the created record on Undo…", dependent refusals; PPS no-op | AC and MA page journeys | `page-history.spec.ts`; PH "2. an optional page toggle…" |
| Saved layout / progress | PJH "records only the changed fields…"; PJH "refuses a manual formula coming back…"; new PJH "a same-value layout or progress write records nothing, and its transition needs projects.write" | MA new layout/progress Undo/Redo and same-value null receipt | New PH "Slice 45 · 3" (dev-panel layout control and Progress formula; Redo after reload and navigation) |

**Acceptance steps.**

1. *Header controls.* PH "1. both controls render on every project page…" (every root page, sub-projects,
   keyboard order); new PH "Slice 45 · 1": Archive disabled, populated Home, Todos, Reflections, fallback and
   sub-project; both controls inside the header and the 375 px viewport, then tapped, in dark and light;
   Alex's browser gets not-found and runs Alex's own history (corroboration; exact-actor isolation is proven in
   OHS and API). PH "6." covers the second tab. **Defect D1** found and fixed here (Revisions).
2. *Task and reflection chain.* New PH "Slice 45 · 2" in the plan's order (add → complete → rename → Delete),
   plus the domain and MA rows above. Descendant-from-root-Todos: PH "4.". Reflection CRUD: see the matrix.
3. *Canvas, layout, page, project.* PH "2–3, 8", new PH "Slice 45 · 3", `section-edit-undo.spec.ts`,
   `canvas-history.spec.ts`, `page-history.spec.ts`, `project-creation-history.spec.ts`. No-step cases:
   `row-history.spec.ts` Escape/Cancel; SEU and SHH no-ops; new PJH and SHH same-value tests.
4. *Removal.* SS cascade receipt; OHS removal rows; `removal-undo.spec.ts` exact markers through
   Undo/Redo; `archive.spec.ts` "Archive lists recoverable content only…"; `canvas-editing.spec.ts`
   keyboard and touch removal; retired fields: API, LU "publishes no frame…", MA "MCP refuses
   retired reassign removal fields"; ordinary moves: MA `update_task` move.
5. *Archived projects.* PAS and `archived-projects-service.test.ts`; `archived-projects.spec.ts` (parent-first,
   explicit status, disabled Archive, persona, narrow touch); new LU Restore races (project under an archived
   ancestor, 409, nothing written); MA new "Archive Restore recovers it after its history expired" (Streamable HTTP only);
   new PH "Slice 45 · 3" Archive Restore after 25 h in the browser. Error/retry: `archived-projects-page.spec.ts`
   and store spec (web, fake gateway).
6. *Matrix audit.* The table above; no family is inferred from another.
7. *Races, grants, faults, restart.* Each item names its layer; "both" means Streamable HTTP and stdio MCP.
   - Overlapping agent edit: RH, SEU; `section-edit-undo.spec.ts` "agent overlap refuses Undo…" (real SDK
     client over Streamable HTTP); PH "7.".
   - Per-family grants: `contract.test.ts` "runs a … action in both directions with … alone" and its
     refusals (registry); MA page and project minimal grants (both); new RH reflection and PJH layout grants.
   - Connection revocation: `handler.test.ts`; MA revoked receipts (both).
   - Foreign actor or workspace: OHS, API, MA second connection (both).
   - Two-tab race: `concurrency.test.ts` (HTTP), PH "6." (browser), new MA "two transitions at one
     revision…" (both), new `mcp/stdio.test.ts` "lets exactly one of several concurrent transitions…".
   - Lost-response retry: `concurrency.test.ts`; MA "a replayed Undo is refused with history_revision_stale:"
     (both).
   - Faults: LU section and row matrices (HTTP routes) and new LU "an MCP task write rolls back a failed
     recorder or persist…" (MCP registry; its `undo_operation` fault is persistence-only). **Limit:** no fault
     is injected inside either MCP transport; both run the same registry, services and commit boundary.
   - Expiry and pruning: OHS, AC (HTTP), new MA expiry journey (Streamable HTTP), new PH "Slice 45 · 3"
     (browser). **Limit:** stdio has no simulated clock; its expiry is covered by the file-level
     `recovery-undo-acceptance.test.ts` "Archive outlives expired and pruned actions".
   - Restart: AC, MA "a fresh connection sees its own persisted history after restart" (both),
     `recovery-undo-acceptance.test.ts`.
   - Canonical Restore races: new LU "refuses a Restore under an archived section, parent task, owner
     project or ancestor over HTTP and MCP…" (HTTP routes and registry); new MA "restore_task under an
     archived container is refused, naming it" and "the refused Restore changes no business, history or
     Activity state" (both).
   - Unsafe Redo: OHS; new LU removal Redo, whose refusal names the new dependent.

**Sensitivity.** Passing-first assertions were shown to fail against temporary faults that were then
reverted: cascade rows skipped in task transitions (RH Delete and Restore, MA chain); Undo Add archiving
instead of removing (RH Undo Add); a write outside the unit in task Restore (TS refusals, LU races); the
Redo new-dependent check skipped (LU removal Redo); duplicate capturing an empty config, and shortcut and
project no-op guards bypassed (SS, SHH, PJH). D1's journey failed with the repair removed (Undo drawn at x=215, left of the header at 264).
D2's stdio test failed before the repair (more than one of three transitions reported success; a reviewer reproduced it on five of five runs against the old entry).
**Open gaps:** two faults were not run because the session refused them: removing the reflection
transition grant check, and a fake receipt on a task no-op. Their RH tests now assert
`PermissionDeniedError` and a `null` receipt exactly, but their sensitivity is not demonstrated.

**Commands.** Initial run (before this phase's changes): `pnpm test` (root 9, contracts 355,
repositories 164, prototype-data 120, domain 752, mcp-tools 171, host 262, web 776), `pnpm lint`,
`pnpm build` (initial total 1.04 MB = 1038.26 kB against the 1050 kB error ceiling; the 850 kB warning
budget is exceeded as before), `pnpm docs:api`, `pnpm storybook:build`, `pnpm e2e` 64 passed, and
`acceptance`, `agent-acceptance`, `mcp-acceptance`, `live-acceptance` all passed. Final run, after both repairs: `pnpm test`
(root 9, contracts 355, repositories 164, prototype-data 120, domain 760, mcp-tools 171, host 267,
web 776), `pnpm build` (initial total 1038.29 kB, under the 1050 kB ceiling; the 850 kB warning
persists), `pnpm docs:api`, `pnpm storybook:build`, `pnpm e2e` 67 passed, and all four host
acceptance scripts passed. `mcp-acceptance` was rerun after round 2 tightened one label, and passed.
`pnpm lint` and `pnpm docs:check` were run after `roadmap.mjs complete`, because the testing
architecture links to the completed record.

**Real use.** An isolated `nested-projects` copy (host on a scratch `CWM_DATA_FILE`, `pnpm dev:web`
separately): a task added, completed and deleted on Home; the label survived Todos and reload; three header
Undos walked it back. A Task List was removed in one click, with no dialog. Archive listed only the
container, and after Restore its independently archived task became its own entry. Garden was archived
from its header and restored from Settings as on hold, and its history then offered Undo. The measured
375 px overlap became D1. Real SDK behavior on both transports is MA. Friction is recorded in
`note-2026-09-27-002`.

### Closure

**Deliverables.** Slice 34's direction now has a complete evidence ledger. This phase adds domain
assertions for task Delete over mixed descendants, Undo of task Restore, Undo Add outside Archive,
section duplicate Undo/Redo, same-value no-ops, the reflection and layout grants, and whole-store
atomicity for canonical Restore refusals. The host adds Restore races and MCP-path faults at the
commit boundary ([live-updates.test.ts](../../../apps/prototype-host/live-updates.test.ts)). Both
MCP transports gain the row, layout, race and refusal journeys
([mcp-acceptance.mjs](../../../apps/prototype-host/scripts/mcp-acceptance.mjs)). Three browser
journeys close the header, task-chain and layout/expiry gaps
([project-history.spec.ts](../../../apps/e2e/project-history.spec.ts)).
Two defects were repaired test-first: header containment at 375 px
([project-header.scss](../../../apps/web/src/app/features/projects/project-header.scss),
[project-history-controls.scss](../../../apps/web/src/app/features/projects/history/project-history-controls.scss)),
and one call at a time in stdio ([stdio.ts](../../../apps/prototype-host/mcp/stdio.ts)).

**Deliberate choices.** Evidence sits at the lowest layer that can observe each guarantee, and only
real gaps got new tests; shared seeds and snapshots are unchanged. D1 wraps the header instead of
collapsing the sidebar, which remains a recorded shell limitation. D2 serializes inside one stdio
process and does not claim cross-process safety, which stays the documented one-file workflow.
Neither defect answered a product question, so no decision entry changed.

**Deviations from the plan.** The two defects added the two repair rows and their reviews. The browser has no reflection Delete or
section Duplicate control, so those families' interactive evidence is MCP or HTTP. The completion
action records as `task.update`, which the MCP chain now expects.

**Deferred and limits.** Faults are not injected inside either MCP transport, and stdio has no
simulated clock for expiry. Two fault sensitivities were not demonstrated (see Sensitivity). UI
friction stays for a friction-chosen phase: whether section labels name the edit, root access to
descendant history, Delete's disappearance cue and the non-collapsing sidebar.

**Open questions.** Whether those limits warrant a transport-level fault seam. Whether stdio and the
HTTP host should ever share one file safely, which would need cross-process locking and belongs
under §80's never-build list unless use demands it.

**Documentation updated.** Main spec §26 and §69; `docs/architecture/testing/` (overview, what,
how); `docs/architecture/web/projects/how.md`; `docs/architecture/prototype-host/mcp-transport/`
(overview, why, what, how); `docs/roadmap/goals.md`; the Slice 34 umbrella's Stage E amendment;
`.prototype/notes.json` (`note-2026-09-27-002`). The README and guides were audited, with no drift
found.
