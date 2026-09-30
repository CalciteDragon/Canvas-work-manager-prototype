<!-- completed-record id="51" closed="2026-09-28" summary="Web specs start from empty browser storage; no-op test's history and Redo-summary assertions proven fault-sensitive" -->
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
2. **A — red.** With the scratchpad config `ordered-one-worker.config.mjs` (`maxWorkers: 1`, `fileParallelism: false`, and a `sequence.sequencer` class whose `sort` orders files by `moduleId`; quoted verbatim in the Outcome), run from `apps/web`, **twice in a row**: `npx ng test --no-watch --runner-config <scratchpad>/ordered-one-worker.config.mjs --reporters verbose --include src/app/features/projects/project-canvas.spec.ts --include src/app/prototype/dev-panel/state-inspector-page.spec.ts`. **Expected each time:** exit 1; every `project-canvas.spec.ts` line precedes the first `state-inspector-page.spec.ts` line; `StateInspectorPage (§28) > lists projects with independent flow/grid controls` fails `to contain 'Website launch'`. Then run the same config across the **whole** web suite (no `--include`) and record it as the informational before-run.
3. **A — green.** Add `src/test-setup.ts`, register it in `angular.json`, adjust the three tsconfigs. Rerun step 2's command twice: exit 0 each time, all tests pass, with the same file order shown. The pair is the only discriminating evidence. Run the whole-suite command again as the after-run and record it beside step 2's: an informational regression check of one ordering, expected green both times (round 2 saw it green before the fix, because files between the pair reset the flag).
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
| `docs/decisions/2026-09-web-specs-start-with-empty-storage.md` | create | §78 entry: the shared-storage cause and why a global setup beat per-spec clears and `isolate: true`. Names Slice 51 in plain text, with no roadmap link, as other entries do. |
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

- No production behavior change (the one production edit is the dev-panel `CURRENT_SLICE` constant). `test-setup.ts` lives in the web app's test tooling, imports only `vitest`, and names no gateway or adapter; `core/`→`prototype/` is untouched. Faults stay in domain files and are reverted; F2c's cast is fault-only and never committed, so the domain's recorder-interface boundary is unchanged. `tsconfig.compodoc.json` also sweeps `apps/web/src`; it parses the setup file harmlessly (it exports nothing), so it is left as is. The testing docs and the decision name Slice 51 in plain text, never by roadmap link, so no link breaks across `complete`.

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
- **Review round 3 (2026-09-28, fresh cold subagent):** **No substantive findings.** Nitpicks taken: the whole-suite before-run moved into step 2 so the steps read in order; new docs name Slice 51 in plain text so no link breaks at either `docs:check`; Compodoc's sweep of the setup file is noted as intended. The reviewer confirmed the `setupFiles` path resolves against `apps/web`, the three tsconfig edits, lines 343–346 and 391, the package names, the Done-when-to-step mapping and the closing order.
- **Implementation review (2026-09-28, two fresh subagents):** **No substantive findings.** One reproduced part A (red twice with `setupFiles` removed, green twice restored, same file order), F2c and F2d in an isolated worktree reset to `a8681d0`. A probe spec, since deleted, confirmed the setup hook runs before a spec's own top-level and nested `beforeEach`. Its one correction was taken: `summary()` also reads the project row, so the Outcome's F2d argument now names it. The other audited the diff, the decision's §78 format and index, the testing docs and the links. Nitpicks taken: the round-3 commit hash, `pnpm test` as the web-suite evidence, and the setup file's comment now says a spec's `beforeAll` storage writes would be cleared.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — [`apps/web/src/test-setup.ts`](../../../apps/web/src/test-setup.ts), registered under `test.options.setupFiles` in [`angular.json`](../../../apps/web/angular.json), clears `sessionStorage` and `localStorage` before every web test. The spec tsconfig includes it, and the app and Storybook tsconfigs exclude it. The failure Slice 50 recorded as a presumed flake no longer reproduces. F2c and F2d each turned the target no-op test red at its predicted assertion and were reverted, so all four of that test's assertions now have a demonstrated fault. No production behavior changed; the only production edit is `CURRENT_SLICE = 51`. Every command below ran on 2026-09-28.

*Step 1 — baseline.* The plan was committed (`d3d513a`, round-3 edits `c2f1e20`). `git status --porcelain` printed nothing, and `git diff --exit-code packages/domain/src/task-service.ts packages/domain/src/operation-history-service.ts` exited 0. It exited 0 again before F2c and before F2d.

*Step 2 — A, red.* The reproduction config (session scratchpad, never committed), verbatim:

```js
class ByPath {
  async shard(files) { return files; }
  async sort(files) { return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId)); }
}
export default { test: { maxWorkers: 1, fileParallelism: false, sequence: { sequencer: ByPath } } };
```

The command ran from `apps/web`: `npx ng test --no-watch --runner-config <scratchpad>/ordered-one-worker.config.mjs --reporters verbose --include src/app/features/projects/project-canvas.spec.ts --include src/app/prototype/dev-panel/state-inspector-page.spec.ts`. Both runs exited 1. In both, `project-canvas.spec.ts` filled verbose lines 9–53 and `state-inspector-page.spec.ts` lines 54–58. Each run ended `Tests  1 failed | 48 passed (49)` with:

```text
 ×  web  src/app/prototype/dev-panel/state-inspector-page.spec.ts > StateInspectorPage (§28) > lists projects with independent flow/grid controls, beside §46’s shared panel
AssertionError: expected 'Development panelPrototype state The …' to contain 'Website launch'
```

The whole-suite before-run (same config, no `--include`) exited 0: `Test Files  71 passed (71)`, `Tests  792 passed (792)`.

*Step 3 — A, green.* After the setup file, the `angular.json` option and the three tsconfig edits, the pair command ran twice. Both exited 0 with `Tests  49 passed (49)`, the same file order (`project-canvas.spec.ts` lines 9–53, then `state-inspector-page.spec.ts`), and `✓ … lists projects with independent flow/grid controls`. The whole-suite after-run exited 0: `71 passed`, `792 passed`. Only the pair discriminates the fix; the whole-suite run is green both ways. Committed as `a8681d0`.

*Step 4 — F2c, a no-op bumps the history revision.* Fault diff in `task-service.ts`:

```diff
-import type { OperationRecorder } from './operation-recorder';
+import { historyBelongsToActor, type OperationRecorder, type RepositoryOperationRecorderDependencies } from './operation-recorder';
…
-      if (committed === current) return { task: current, operation: null };
+      if (committed === current) {
+        const { histories } = (this.dependencies.history as unknown as { dependencies: RepositoryOperationRecorderDependencies }).dependencies;
+        const history = (await histories.list({ workspaceId: actor.workspaceId, projectId: current.projectId })).find((candidate) => historyBelongsToActor(candidate, actor));
+        if (history !== undefined) await histories.update({ ...history, revision: history.revision + 1 });
+        return { task: current, operation: null };
+      }
```

`pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts -t "no-op task write answers a null receipt"` exited 1 with `Tests  1 failed | 38 skipped (39)`. Assertions (1) and (2) passed:

```text
 FAIL  src/row-history.test.ts > row history closure evidence (Slice 45; §§31, 34, 36) > a no-op task write answers a null receipt and leaves the Redo branch standing
AssertionError: expected [ { id: 'history-1', …(7) } ] to deeply equal [ { id: 'history-1', …(7) } ]
-     "revision": 3,
+     "revision": 4,
 ❯ src/row-history.test.ts:345:51
```

The diff excerpt omits the unchanged fields. Under F2c, `pnpm --filter @cwm/domain test` exited 1 with `Tests  1 failed | 798 passed (799)`; the target was the only failure. Reverted with `git checkout -- packages/domain/src/task-service.ts`. `git diff --exit-code` exited 0, and the domain suite passed `799 passed (799)`.

*Step 5 — F2d, the summary hides the Redo branch.* Fault diff in `operation-history-service.ts` (`summaryOf`):

```diff
-      redo: await entry(nextOperationAction(state, 'redo'), 'redo'),
+      redo: null,
```

The same focused command exited 1 with `Tests  1 failed | 38 skipped (39)`. Assertions (1)–(3) passed:

```text
 FAIL  src/row-history.test.ts > row history closure evidence (Slice 45; §§31, 34, 36) > a no-op task write answers a null receipt and leaves the Redo branch standing
AssertionError: expected undefined to be 'operation-2' // Object.is equality
 ❯ src/row-history.test.ts:346:85
```

Under F2d the domain suite exited 1 with `Test Files  7 failed | 33 passed (40)` and `Tests  34 failed | 765 passed (799)`, the target among them. Reverted with `git checkout -- packages/domain/src/operation-history-service.ts`. `git diff --exit-code` on both domain files exited 0, and the domain suite passed `799 passed (799)`.

*Step 6 — green.* `git status --porcelain` was clean after `a8681d0`, and both domain files had no diff. `pnpm test` exited 0, covering `pnpm --filter web test` as its web package: root `node --test` 9, contracts 355, repositories 164, web 792, prototype-data 120, domain 799, mcp-tools 173, prototype-host 267.

*Step 7 — real use.* No runtime behavior changed; the setup file runs only under `ng test`. No browser or MCP journey was run, and no personal runtime data was touched.

*Step 8a — pre-`complete` checks.* `pnpm lint` exited 0. `pnpm docs:check` exited 0 with `docs: ok — 18 system folders, 238 documents checked`.

**Deliberate choices** — One global setup hook, per the [decision](../../decisions/2026-09-web-specs-start-with-empty-storage.md). Per-spec clears were rejected because they fix only today's leakers. `isolate: true` was rejected because the builder chose `false` deliberately, and per-file environments would cost every run to fix shared storage. F2d faults `summaryOf` rather than the no-op path: once (2) and (3) hold, the stored actions and history are unchanged, and `redo` depends on nothing else but the project row (`summary()` refuses a missing or foreign project) and the clock. So no realistic no-op-path fault can fail (4) alone: only deleting or moving the project, or advancing the injected clock past expiry, would. Assertion (4) is implied by (2) and (3) on the no-op path, and its independent value is guarding the summary read.

**Deviations from the plan** — None in substance. A scripted plan edit failed on a line-wrapped match after the plan commit had already run, so the round-3 edits went into a second docs commit.

**Deferred** — The `shell-store.spec.ts` `nestedProjects` leak is latent and now harmless under the setup file; the spec itself was not edited (non-goal). The rest of Slice 46 stays in [Slice 46](../completed/46-slice-34-closeout-follow-up.md).

**Open questions** — None.

**Documentation updated** — `docs/architecture/testing/how.md` (runtime flow step 1), `what.md` (web specs row) and `why.md` (decision link); the new [decision](../../decisions/2026-09-web-specs-start-with-empty-storage.md) and its *Testing* index row. After `complete`, three link edits point at `completed/51-web-storage-isolation-and-no-op-sensitivity.md`: a dated note under the title of [Slice 50's record](../completed/50-fault-sensitivity-evidence.md), `[Slice 51]` beside Slice 50 in the Build paragraph and finding 4 of [Slice 46](../completed/46-slice-34-closeout-follow-up.md), and one sentence after Slice 50's in [`goals.md`](../goals.md).
