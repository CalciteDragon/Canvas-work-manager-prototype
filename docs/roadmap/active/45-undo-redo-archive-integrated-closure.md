<!-- plan id="45" status="active" summary="Integrated acceptance and documentation closure for Slice 34 stages A–D" -->
# Slice 45 — Undo/Redo and Archive integrated closure

## Goal

Demonstrate Slice 34's Undo/Redo, removal and Archive direction across the browser, HTTP and both MCP transports, then reconcile its living documentation and record remaining design questions.

## Spec sections

[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md) §§8–14 (boundaries and persistence), 19–23 (UI state), 26–34 and 36 (project, page, section, task and reflection behavior), 53–54 (grants and MCP), 57 (Activity), 61–63 (API, frames and failure), 68–70 (routes and verification), 77–79 (real use, decisions and notes). [Slice 34 Stage E](../planned/34-undo-redo-and-archive.md#delivery-stages) and its [acceptance check](../planned/34-undo-redo-and-archive.md#acceptance-check) are the completion contract. Its 2026-09-23 amendment retires the retry cache; a lost response retried at the old revision must yield a stale-summary refusal.

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

## Outcome

Pending implementation and integrated verification.
