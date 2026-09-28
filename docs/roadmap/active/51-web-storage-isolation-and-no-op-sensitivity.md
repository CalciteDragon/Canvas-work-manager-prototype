<!-- plan id="51" status="active" summary="Clear browser storage before every web spec; prove the no-op test's history and Redo-summary assertions" -->
# Slice 51 — Web spec storage isolation and remaining no-op assertion sensitivity

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Remove the order-dependent web spec failure that [Slice 50](../completed/50-fault-sensitivity-evidence.md) recorded as a presumed flake, and show that the two no-op assertions Slice 50 left unclaimed each fail against a deliberate, reverted fault.

## Spec sections

§69 (tests are deterministic and fail for the right reason); §77 (tests protect intentional behavior); §47 (flags held by one service, mirrored to `sessionStorage`); §34 and §36 (a no-op write records nothing and leaves the Redo branch standing); §54 (the history revision is the caller's staleness check).

## Build

**A — web spec storage isolation.** *Root cause, reproduced 2026-09-28:* `@angular/build:unit-test` runs vitest with `isolate: false` by default (`plugins.js` project defaults: “Default to `false` to align with the Karma/Jasmine experience”), so spec files that share a worker share one jsdom `sessionStorage` and `localStorage`. `project-canvas.spec.ts` (“renders the same project as flow when the flag is off”) calls `PrototypeSettings.setFlag('gridProjectLayout', false)`, which persists to `sessionStorage`, and never clears it. When `state-inspector-page.spec.ts` next runs in the same worker, its first test constructs `PrototypeSettings`, reads `gridProjectLayout: false`, hides the layout experiment and fails `toContain('Website launch')` — the exact text Slice 50 saw. `shell-store.spec.ts:187` also writes `nestedProjects: false` and never clears it — a latent leak, not observed failing (pinned with `sidebar.spec.ts`, the next tree reader in path order, the pair passed 31/31 on 2026-09-28). The failure needs both files in one worker **and** `project-canvas.spec.ts` first: in separate workers the pair passes, and even in one worker vitest's default sequencer runs the file that failed last time first (its results cache), so a plain `maxWorkers: 1` run alternates red and green. That is why it looked like load. Pinning the order with a path-sorting sequencer makes it fail every time.

- One web test setup file, `apps/web/src/test-setup.ts`, registers a global `beforeEach` that clears `sessionStorage` and `localStorage`, so every web test starts from an empty browser session regardless of which file ran before it in the worker. Registered through the builder's `setupFiles` option in `apps/web/angular.json`.
- Rejected: per-spec `afterEach` clears in the two leaking files (fixes today's leakers, not the next one); `isolate: true` (the builder chose `false` deliberately, and a fresh environment per file costs every run for a problem that is only shared storage). The existing per-spec `sessionStorage.clear()` calls now overlap with the setup file and stay (non-goal).

**B — the two no-op assertions Slice 50 left unclaimed.** Target test (unchanged): `row-history.test.ts` *“a no-op task write answers a null receipt and leaves the Redo branch standing”*. Its four assertions are (1) `null` receipt — F2a; (2) `operationActions` unchanged — F2b; (3) `operationHistories` unchanged; (4) summary `redo.actionId` is the undone edit. Vitest stops at the first failed `expect`, so each fault must leave every earlier assertion passing.

- **F2c — a no-op bumps the history revision.** In `TaskService.update`'s no-op branch, before returning `{ task: current, operation: null }`, find the actor's history for the project and write it back with `revision + 1`, touching no action. `TaskService` holds only the `OperationRecorder` interface, so the fault reaches the recorder's repositories through a cast (`histories.list` filtered by `historyBelongsToActor`, then `histories.update`; both need a fault-only value import from `./operation-recorder`) — acceptable only because the fault is never committed. It models a real defect: every client's `expectedRevision` would go stale on a write that changed nothing. Predicted: (1) and (2) pass, (3) fails with `revision` differing.
- **F2d — the summary hides the Redo branch.** With (2) and (3) holding, the stored actions and history are unchanged, and `OperationHistoryService.summaryOf` derives `redo` only from them and the clock — so **no realistic fault in the no-op path can fail (4) alone** (only one that advanced the injected test clock past expiry could); (4) is implied by (2) and (3) there. Its independent role is guarding the summary read. F2d therefore faults `summaryOf` itself: `redo: null` in place of `await entry(nextOperationAction(state, 'redo'), 'redo')`. Predicted: (1)–(3) pass, (4) fails `expected undefined to be '<edit action id>'`. The Outcome states the implication plainly rather than presenting F2d as a no-op-path fault.
- Same discipline as Slice 50: one fault at a time, the plan's file check before each, verbatim failure, revert, `git diff --exit-code` on the production file. Faults are never committed. If a fault is undetected, strengthen only the target test and re-review this plan. No production behavior change.

## Done when

- The pinned-order one-worker reproduction of `project-canvas.spec.ts` + `state-inspector-page.spec.ts` fails on two consecutive runs before the setup file exists and passes on two consecutive runs after it, with `project-canvas.spec.ts` running first each time; `pnpm --filter web test` and `pnpm test` pass.
- F2c fails the target at the `operationHistories` equality and F2d at the Redo-summary assertion, each with the earlier assertions passing, and each reverted clean.
- Testing docs describe the setup file; a decision entry records the storage-isolation choice; Slice 50's record carries a dated note pointing here, and the Slice 46 ledger and `goals.md` link this record.

## Do not

- Change production behavior, contracts or any domain test (unless a fault is undetected, per Build).
- Turn on `isolate`, add a vitest runner config file, or edit the leaking specs' own hooks.
- Commit the one-worker reproduction config (it lives in the session scratchpad) or any fault.

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

All commands from the repository root unless a `cd` is shown. Record each with exit code, counts and the vitest failure block verbatim in the Outcome.

1. **Baseline.** `git status --porcelain` is empty (the plan committed first), and `git diff --exit-code packages/domain/src/task-service.ts packages/domain/src/operation-history-service.ts` exits 0.
2. **A — red.** With the scratchpad config `ordered-one-worker.config.mjs` (`maxWorkers: 1`, `fileParallelism: false`, and a `sequence.sequencer` class whose `sort` orders files by `moduleId`; quoted verbatim in the Outcome), run from `apps/web`, **twice in a row**: `npx ng test --no-watch --runner-config <scratchpad>/ordered-one-worker.config.mjs --reporters verbose --include src/app/features/projects/project-canvas.spec.ts --include src/app/prototype/dev-panel/state-inspector-page.spec.ts`. **Expected each time:** exit 1; every `project-canvas.spec.ts` line precedes the first `state-inspector-page.spec.ts` line; `StateInspectorPage (§28) > lists projects with independent flow/grid controls` fails `to contain 'Website launch'`.
3. **A — green.** Add `src/test-setup.ts`, register it in `angular.json`, adjust the three tsconfigs. Rerun step 2's command twice: exit 0 each time, all tests pass, with the same file order shown. The pair is the only discriminating evidence. Also run the same config across the **whole** web suite (no `--include`) both before the setup file (in the red phase) and after it, and record both: an informational regression check of one ordering, expected green both times (round 2 saw it green before the fix, because files between the pair reset the flag).
4. **F2c.** Recheck step 1's `git diff`. Apply F2c to `task-service.ts`. `pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts -t "no-op task write answers a null receipt"`. **Expected:** exit 1, failure at `row-history.test.ts:345` (`operationHistories`), a `revision` diff. Run the whole domain suite under F2c and list every failing title (informational). `git checkout -- packages/domain/src/task-service.ts`; `git diff --exit-code` on it exits 0; domain suite green.
5. **F2d.** Recheck. Apply F2d to `operation-history-service.ts`. Same focused command. **Expected:** exit 1, failure at `row-history.test.ts:346` (`redo?.actionId`), `expected undefined to be '<edit action id>' // Object.is equality`. Run the whole domain suite under F2d and record the failing **count** and the target's presence (many summary tests are expected to fail; titles are not listed). Revert and prove clean; domain suite green.
6. **Green.** `pnpm --filter web test`, `pnpm test`, `pnpm lint`, `pnpm docs:check` exit 0; `git status --porcelain` lists only change-list files; both production domain files have no diff.
7. **Real use (§77).** No runtime behavior changes; the setup file runs only under `ng test`. No browser/MCP journey; the Outcome says so.
8. **Closing order** (as Slice 50): pre-`complete` `pnpm lint`/`docs:check` recorded in the Outcome; `complete`; then the Slice 50 dated note, the Slice 46 ledger links and the `goals.md` sentence, all pointing at `completed/51-…`; rerun `docs:check` and `lint` as the gate, results in the commit message.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/test-setup.ts` | create | Global `beforeEach` clearing `sessionStorage` and `localStorage`; its doc comment names the `isolate: false` reason and that the per-spec clears it overlaps are left alone by design. |
| `apps/web/angular.json` | modify | `test.options.setupFiles: ["src/test-setup.ts"]`. |
| `apps/web/tsconfig.spec.json` | modify | Include `src/test-setup.ts` so the spec type-check covers it. |
| `apps/web/tsconfig.app.json` | modify | Exclude `src/test-setup.ts` from the app type-check. |
| `apps/web/.storybook/tsconfig.json` | modify | Exclude `../src/test-setup.ts` beside the spec exclude; it is test tooling, not a Storybook source. |
| `packages/domain/src/task-service.ts` | temporary fault, reverted | F2c only; ends byte-identical to `HEAD`. |
| `packages/domain/src/operation-history-service.ts` | temporary fault, reverted | F2d only; ends byte-identical to `HEAD`. |
| `docs/decisions/2026-09-web-specs-start-with-empty-storage.md` | create | §78 entry: the shared-storage cause and why a global setup beat per-spec clears and `isolate: true`. |
| `docs/decisions/README.md` | modify | Index the entry under *Testing*. |
| `docs/architecture/testing/how.md` | modify | Runtime flow step 1: web specs run non-isolated and start from empty storage via the setup file. |
| `docs/architecture/testing/what.md` | modify | Web specs row names `src/test-setup.ts`. |
| `docs/architecture/testing/why.md` | modify | Link the decision. |
| `docs/roadmap/completed/50-fault-sensitivity-evidence.md` | dated note | Under the title: the presumed flake was an order-dependent storage leak fixed by Slice 51, and the two unclaimed assertions are proven there. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md` | modify | Build paragraph and finding 4 add `[Slice 51]` beside Slice 50. |
| `docs/roadmap/goals.md` | modify | One sentence after Slice 50's: Slice 51 fixed the presumed flake as a storage leak and proved the two remaining no-op assertions. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 51`. |
| `docs/roadmap/active/51-web-storage-isolation-and-no-op-sensitivity.md` → `completed/` | modify, moved by `complete` | Revisions, Outcome. |
| `docs/roadmap/progress.md` | generated | `new`/`start`/`complete`. |

## Test plan — tests first

| Test | Proves |
|---|---|
| Pinned-order one-worker run of `project-canvas.spec.ts` then `state-inspector-page.spec.ts` (step 2), red twice before the setup file, green twice after | The failure is the storage leak and the setup file removes it; the pinned order rules out the results cache flipping the result. The reproduction is the failing test, so no new spec is needed. |
| Pinned-order one-worker run of the whole web suite, before and after (steps 2–3) | Informational only: the setup file does not break any spec in one reproducible single-worker order. It does not discriminate the fix. |
| `row-history.test.ts: a no-op task write …` under F2c | The `operationHistories` equality catches a no-op that stales the revision. |
| same, under F2d | The Redo-summary assertion catches a summary that drops the standing Redo branch. |

## Boundaries touched

- No production behavior change (the one production edit is the dev-panel `CURRENT_SLICE` constant). `test-setup.ts` lives in the web app's test tooling, imports only `vitest`, and names no gateway or adapter; `core/`→`prototype/` is untouched. Faults stay in domain files and are reverted; F2c's cast is fault-only and never committed, so the domain's recorder-interface boundary is unchanged.

## Explicit non-goals

- Editing the leaking specs, or changing `PrototypeSettings`' `sessionStorage` mirror (§47 behavior).
- Enabling `isolate`, or tuning web worker counts.
- Faults for other no-op paths or other assertions; transport faults (Slice 46 finding 5) and the rest of Slice 46.
- Agent-worktree housekeeping (a git config and worktree matter, not repository content).

## Open questions

- None that changes the shape.

## Revisions

- **Draft (2026-09-28):** Grounded in a deterministic one-worker reproduction of the Slice 50 web failure, `@angular/build`'s `isolate: false` default and `setupFiles` option, the storage writers in `apps/web/src/app/core` and `prototype/`, and the target test's four assertions against `RepositoryOperationRecorder` and `summaryOf`.
- **Review round 1 (2026-09-28, cold subagent):** Three substantive findings, each checked and accepted. (1) A plain one-worker run is not deterministic: vitest's results cache runs the last-failed file first, so the reviewer saw the red command pass then fail, and a green after the fix could have been the cache. The reproduction now pins file order with a path-sorting sequencer, runs red and green twice each and records the order. (2) `ThemeService` never touches storage; the root cause now names only the two real leakers. (3) Slice 50's `goals.md` and Slice 46 ledger links need Slice 51 beside them; both joined the change list. Nitpicks taken: the Storybook tsconfig excludes the setup file too, "no production behavior change" replaces "no production code changes", and F2d's claim is "no realistic fault". The reviewer confirmed `setupFiles` re-registers the global `beforeEach` for every spec file under `isolate: false`, that no spec seeds storage outside `it`/`beforeEach`, and that F2c (unwrapped recorder, `histories.update` inside the unit of work) and F2d (`redo` nullable) fail at lines 345 and 346 as predicted.
- **Review round 2 (2026-09-28, fresh cold subagent):** Two substantive findings, accepted. (1) The whole-suite pinned run is green before the fix too, so it cannot prove "no other spec depends on storage"; it is now informational, run before and after, and the pinned pair is named as the only discriminating evidence. (2) The `shell-store.spec.ts` leak was asserted but never shown; a pinned run with `sidebar.spec.ts` passed 31/31, so it is now worded as a latent leak, not an observed failure. Nitpicks taken: the plan row names its `completed/` move, the setup file's comment will name the overlapping per-spec clears, and F2d's expected text is vitest's exact wording. The reviewer reproduced the red pair, simulated the setup file from the scratchpad (pair 49/49, whole suite 792/792), and reconfirmed the tsconfig count and the F2c/F2d sites.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
