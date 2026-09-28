<!-- completed-record id="50" closed="2026-09-28" summary="Reflection grant and task no-op receipt assertions proven fault-sensitive; faults reverted" -->
# Slice 50 — Fault sensitivity for reflection grant and task no-op receipt

> **Note (2026-09-28):** [Slice 51](51-web-storage-isolation-and-no-op-sensitivity.md) traced the web failure recorded below as a presumed load-dependent flake to an order-dependent `sessionStorage` leak between spec files, and fixed it. It also proved, with reverted faults, the target no-op test's `operationHistories` and Redo-summary assertions left unclaimed here. This record's text is unchanged.

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Close [Slice 46](../planned/46-slice-34-closeout-follow-up.md) finding 4 by showing that the two existing assertions whose sensitivity Slice 45 could not demonstrate fail against deliberate, reverted faults.

## Spec sections

§53 (per-family write grants); §54 (history tools declare and the domain enforces the stored action's family grant); §34 and §36 (task and reflection history; a no-op write records nothing); §69 (a test must fail for the right reason); §77 (tests protect intentional behavior).

## Build

This bounded Slice 46 repair produces **evidence, not behavior**. Its subject is the Slice 45 record's “Open gaps” paragraph ([Slice 45](../completed/45-undo-redo-archive-integrated-closure.md), *Sensitivity*): two faults were never run, so two assertions in `packages/domain/src/row-history.test.ts` are unproven.

- **F1 — missing reflection grant check.** In `OperationHistoryService` (`packages/domain/src/operation-history-service.ts`, the `assertPermitted(actor, OPERATION_FAMILY_PERMISSION[…])` guard before the revision check) skip the assertion only when the stored next action's family is `reflection`. Target test: *“a reflection transition needs reflections.write, and tasks.write alone is refused before any change”*.
- **F2a — fake task no-op receipt.** In `TaskService.update` (`packages/domain/src/task-service.ts`, `if (committed === current) return { task: current, operation: null };`) answer a fabricated non-null receipt without recording anything. Target test: *“a no-op task write answers a null receipt and leaves the Redo branch standing”*.
- **F2b — silent recording on a no-op.** In the same no-op branch, keep answering `operation: null` but first call `this.dependencies.history.record` with a valid synthetic `task.update` (one title change whose `before` and `after` differ, via `captureTaskUpdate`). Same target test; this variant reaches its `operationActions` equality, which F2a never reaches. Vitest stops at the first failed `expect`, so F2b proves that assertion only; the `operationHistories` and Redo-summary assertions after it are not claimed. (Merely deleting the early return is not a usable fault: `TaskUpdateOperationSchema` refuses an update with no changes and no rows, so `captureTaskUpdate` throws before `history.record` — `packages/contracts/src/row-history.ts`.)
- Apply one fault at a time, run the named suites, record the verbatim failing assertion, revert, and prove the working tree matches `HEAD` for that file before the next fault. Faults are never committed. If tooling or the session refuses to apply a fault (as happened in Slice 45), record the refusal verbatim, do not claim the sensitivity, and do not complete the slice.
- If a fault is **not** detected, the gap is real: strengthen only the target test until it fails under the fault, revert the fault and see it pass, then re-review this plan before continuing. No production code changes in any case.
- Record results in this plan's Outcome; add a dated note under the Slice 45 record's title pointing to this record (the roadmap README's rule for a record a later phase supersedes; it does not edit the record's own text); link Slice 50 from the Slice 46 ledger and `goals.md`. No architecture file changes: no system's behavior, shape or dependencies change, and `testing/how.md` never listed these two gaps.

## Done when

- F1, F2a and F2b each turn their target test red with the predicted assertion failure (resolved-instead-of-rejected for F1; non-null receipt for F2a; unequal `operationActions` for F2b), and each fault is reverted with `git diff --exit-code` clean on its production file.
- After every revert the domain suite is green; `pnpm test`, `pnpm lint` and `pnpm docs:check` pass at the end.
- The exact commands, fault diffs, failing output and pass counts are in the Outcome; Slice 45's dated note, Slice 46 finding 4 and `goals.md` link it.

## Do not

- Change production behavior, contracts, grants, `OPERATION_FAMILY_PERMISSION` or any other test than the two targets (unless a fault is undetected, per Build).
- Add a fault-injection framework, a committed mutation-test harness or a new test seam (Slice 46 *Do not*).
- Touch Slice 46 findings 5–14 or edit the frozen Slice 45 record.

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

All commands from the repository root. Record each command in steps 1–7 and the pre-`complete` checks of step 8, with exit code and the vitest failure block verbatim, in the Outcome.

1. **Baseline.** The plan is committed. After the `CURRENT_SLICE` bump, `git status --porcelain` lists only change-list files, and `git diff --exit-code packages/domain/src/operation-history-service.ts packages/domain/src/task-service.ts` exits 0 — rerun this check **before** each fault so a revert can never discard an unrelated edit. Run `pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts` and record the pass count; both target tests pass.
2. **F1.** Edit `operation-history-service.ts` so the guard reads, in effect,
   `if (action !== null && familyOfOperationKind(action.operation.type) !== 'reflection') assertPermitted(…)`.
   Run `pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts -t "reflection transition needs reflections.write"`. **Expected:** that test fails because the `tasks.write`-only Undo resolves instead of rejecting with `PermissionDeniedError` (or, if it rejects for another reason, the failure shows the wrong error class — record which). Then run the whole domain suite, `pnpm --filter @cwm/mcp-tools test` and `pnpm --filter @cwm/prototype-host test` under F1 and record **every** failing test title as additional detectors (informational; only the target is required). `git checkout -- packages/domain/src/operation-history-service.ts`; `git diff --exit-code packages/domain/src/operation-history-service.ts` exits 0.
3. **F2a.** Replace the `committed === current` early return in `TaskService.update` with one answering a receipt-shaped literal with all seven `OperationReceiptSchema` fields (`operation: 'task.update'`, `revision: 1`, fixed ISO stamps, cast to `OperationReceipt` only for the fault) and recording nothing. Run `pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts -t "no-op task write answers a null receipt"`. **Expected:** `expected { … } to be null` on the receipt. Revert and prove clean as in step 2.
4. **F2b.** In the no-op branch, before returning `operation: null`, record a synthetic `task.update` as described in Build. Run the same focused command. **Expected:** the target fails at the `operationActions` equality (a new action exists) — the first assertion after the still-`null` receipt. Record the failure verbatim; if a different assertion or a thrown error fires first, record that instead and explain it. Then run the whole domain suite under F2b and record every other failing title (informational). Revert and prove clean.
5. **Undetected fault branch (only if any of steps 2–4 stays green).** Stop; add the missing assertion to the target test, show it red under the re-applied fault and green after revert; add the file to the change list and re-review this plan before step 6.
6. **Green.** `git status --porcelain` shows only files in the change list, and both production files have no diff. Run `pnpm --filter @cwm/domain test` and `pnpm test`, and record counts.
7. **Real use (§77).** No runtime behavior changes, so no browser/MCP journey is run; the Outcome says so. No personal runtime data is touched.
8. **Closing order.** `complete` freezes the record and `roadmap.mjs` repairs no inbound links, so: (a) run `pnpm lint` and `pnpm docs:check` on the pre-`complete` tree and record their results with step 6's counts; (b) write the Outcome, whose *Documentation updated* names the three link edits of (d) exactly; (c) run `node scripts/roadmap.mjs complete docs/roadmap/active/50-fault-sensitivity-evidence.md --summary "…"`; (d) add the Slice 45 dated note, the Slice 46 finding-4 link and the `goals.md` sentence, all pointing at `completed/50-fault-sensitivity-evidence.md`; (e) rerun `pnpm docs:check` and `pnpm lint` as a gate — their results go in the closing commit message, not the frozen record.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/operation-history-service.ts` | temporary fault, reverted | F1 only; must end byte-identical to `HEAD`. |
| `packages/domain/src/task-service.ts` | temporary fault, reverted | F2a and F2b only; must end byte-identical to `HEAD`. |
| `docs/roadmap/completed/45-undo-redo-archive-integrated-closure.md` | dated note | One line under the title: the two open sensitivities were demonstrated on 2026-MM-DD by Slice 50, with a link; the record's text is untouched. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md` | modify | Finding 4 links Slice 50 as closing it; Build paragraph lists Slice 50 among closed follow-ups. |
| `docs/roadmap/goals.md` | modify | One sentence under the 2026-09-27 follow-up: Slice 50 closed finding 4. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 50` at implementation start (AGENTS.md Step 4). |
| `docs/roadmap/active/50-fault-sensitivity-evidence.md` | modify | Revisions now; Outcome with exact evidence before `complete`. |
| `docs/roadmap/progress.md` | generated | `roadmap.mjs new/start` regenerated it; `complete` regenerates it. |

`packages/domain/src/row-history.test.ts` joins the list only through acceptance step 5.

## Test plan — tests first

No new test is expected: the tests exist and already pass, which is exactly the case AGENTS.md and `testing/how.md` (“The trap”) resolve by injecting a temporary targeted fault.

| Test (existing) | Fault | Proves |
|---|---|---|
| `row-history.test.ts: a reflection transition needs reflections.write, and tasks.write alone is refused before any change` | F1 | The domain, not the MCP declaration, enforces the stored reflection action's grant; without it a `tasks.write` connection could reverse a reflection. |
| `row-history.test.ts: a no-op task write answers a null receipt and leaves the Redo branch standing` | F2a | A fabricated receipt on a normalized no-op is caught by the exact `null` assertion. |
| same | F2b | A no-op that silently records while still answering `null` is caught by the `operationActions` equality, which F2a alone leaves unproven. The two assertions after it stay unclaimed (Explicit non-goals). |

## Boundaries touched

- None is crossed. Both faults live in domain files and are reverted; the test harness already builds the domain over in-memory repositories and an injected `Clock`. No `new Date()`, infrastructure, contract or web-core edge is added. The one web edit is the prototype dev-panel constant.

## Explicit non-goals

- Separate faults for the target no-op test's `operationHistories` and Redo-summary assertions (`row-history.test.ts`, the two lines after the `operationActions` equality); finding 4 asks for the receipt fault, and the Outcome lists them as unproven rather than implying otherwise.
- Proving sensitivity of the other task no-op paths (`complete` on done, `archive` on archived, `restore` on live) or of grants for the other families; Slice 45 already recorded those it ran.
- Transport-level MCP faults (finding 5), stdio expiry (finding 6), and every other Slice 46 finding.
- Any decision entry: this phase answers no product question (the grant and no-op rules already have decisions and tests).

## Open questions

- None that changes the shape. If a fault is undetected, acceptance step 5 decides the response.

## Revisions

- **Draft (2026-09-28):** Grounded in Slice 45's *Sensitivity* “Open gaps”, the two target tests in `row-history.test.ts`, the grant guard in `OperationHistoryService.transition` (domain-enforced per `mcp-tools/src/tool.ts`), and the no-op returns in `TaskService.update`/`commit`. `roadmap.mjs new 50` then `start` created the active record and regenerated the board.
- **Review round 1 (2026-09-28, cold subagent):** Four substantive findings, each checked against the code and accepted. (1) The original F2b (delete the early return) never reaches `history.record`: `TaskUpdateOperationSchema` refuses an empty update, so it tests the contract backstop, not the target's history/Redo assertions. F2b is now a silent synthetic record behind a `null` receipt, predicted to fail at the `operationActions` equality. (2) The baseline assumed an empty `git status`; it now allows change-list files and checks both production files are clean before each fault, so `git checkout` cannot discard unrelated work. (3) `testing/how.md` never listed these gaps, so its row and the matching Done-when were vacuous; replaced by a dated note on the Slice 45 record plus the Slice 46 and goals links. (4) Step 6 wording now covers the dev-panel code edit, and a refused fault is recorded and blocks completion. The reviewer confirmed F1 resolves (no other guard rejects a same-connection `tasks.write` actor) and F2a's literal fits `OperationReceiptSchema`.
- **Review round 2 (2026-09-28, fresh cold subagent):** Two substantive findings, both accepted. (1) The Slice 45 note, Slice 46 link and goals sentence must point at the completed record, and `roadmap.mjs` repairs no inbound links; acceptance step 8 now fixes the order (Outcome → `complete` → links → `docs:check`/`lint`). (2) Vitest stops at the first failed `expect`, so F2b proves only the `operationActions` equality; the plan no longer claims the history and Redo-summary assertions and lists them as unproven non-goals. The reviewer traced F2b as constructible in the no-op branch (`captureTaskUpdate` with one real title change passes `TaskUpdateOperationSchema`; `record` runs in `update`'s unit and discards the undone Redo action), reconfirmed F1 and the commands, and found the dated note on Slice 45 permitted by the roadmap READMEs.
- **Review round 3 (2026-09-28, fresh cold subagent):** One substantive finding, accepted. Step 8 ran the final `lint`/`docs:check` after `complete` froze the Outcome, so their evidence could not be recorded honestly. The pre-`complete` checks are now recorded in the Outcome, *Documentation updated* names the post-`complete` link edits in advance, and the final gate's results go in the closing commit message. Done-when now also requires the `goals.md` link. The reviewer confirmed the F1/F2 sites and harness, the note's placement below Slice 45's marker line, and that the plan's own links resolve from `completed/`.
- **Review round 4 (2026-09-28, fresh cold subagent):** **No substantive findings.** The reviewer re-traced F1 (the only `assertPermitted` on the transition path), F2a (`toBeNull` fails first) and F2b (the new action fails the `operationActions` equality first), confirmed the commands, the downstream mcp-tools/host runs exercising the domain source, `complete`'s Outcome requirement and `check-docs.mjs`'s link handling for the closing order, and every AGENTS.md Step 1 section. The plan is ready for Step 3, which this planning request does not start.
- **Implementation review (2026-09-28, two fresh subagents):** **No substantive findings.** One reproduced F1, F2a and F2b in an isolated worktree at `f0857df` and confirmed every failure title, assertion, line, count and clean revert in the Outcome. It also found the host runs the live domain source (`@cwm/domain` exports `./src/index.ts`), so the host's silence under F1 is a real detector gap and not an import artifact. The other audited the diff against the plan and protocol. Its two wording nitpicks were accepted: the flake note now names where `CURRENT_SLICE` is read, and the flake is called presumed rather than diagnosed.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — Evidence, not behavior. All three faults were applied, turned their target test in [`row-history.test.ts`](../../../packages/domain/src/row-history.test.ts) red with the predicted assertion, and were reverted; both production files end byte-identical to `HEAD` and neither test needed strengthening, so acceptance step 5 never ran. The only committed code change is `CURRENT_SLICE = 50` in [`dev-panel-store.ts`](../../../apps/web/src/app/prototype/dev-panel/dev-panel-store.ts). Slice 46 finding 4 is closed. Every command below ran from the repository root on 2026-09-28.

*Step 1 — baseline.* After the `CURRENT_SLICE` bump, `git status --porcelain` listed only ` M apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`; `git diff --exit-code packages/domain/src/operation-history-service.ts packages/domain/src/task-service.ts` exited 0 (and again before F2a and before F2b). `pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts` exited 0: `Tests  39 passed (39)`.

*Step 2 — F1, missing reflection grant check.* Fault diff in `operation-history-service.ts`:

```diff
-      if (action !== null) {
+      if (action !== null && familyOfOperationKind(action.operation.type) !== 'reflection') {
         assertPermitted(actor, OPERATION_FAMILY_PERMISSION[familyOfOperationKind(action.operation.type)]);
```

`pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts -t "reflection transition needs reflections.write"` exited 1, `Tests  1 failed | 38 skipped (39)`:

```text
 FAIL  src/row-history.test.ts > row history closure evidence (Slice 45; §§31, 34, 36) > a reflection transition needs reflections.write, and tasks.write alone is refused before any change
AssertionError: promise resolved "{ direction: 'undo', …(3) }" instead of rejecting
 ❯ src/row-history.test.ts:355:84
```

The predicted failure: the `tasks.write`-only Undo resolved rather than rejecting for another reason. Additional detectors under F1 (informational): `pnpm --filter @cwm/domain test` exited 1, `Tests  1 failed | 798 passed (799)` — only the target. `pnpm --filter @cwm/mcp-tools test` exited 1, `Tests  2 failed | 171 passed (173)` — `contract.test.ts > undo_operation and redo_operation — one grant per operation family > refuses a reflection action for a connection holding only projects.write` and `… only tasks.write`. `pnpm --filter @cwm/prototype-host test` exited 0, `Tests  267 passed (267)` — no host test detects F1. Reverted with `git checkout -- packages/domain/src/operation-history-service.ts`; `git diff --exit-code` on it exited 0; `pnpm --filter @cwm/domain test` exited 0, `Tests  799 passed (799)`.

*Step 3 — F2a, fake task no-op receipt.* Fault diff in `task-service.ts`:

```diff
-      if (committed === current) return { task: current, operation: null };
+      if (committed === current) return { task: current, operation: { historyId: 'fault-history', actionId: 'fault-action', operation: 'task.update', revision: 1, label: 'Fault', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z' } as OperationReceipt };
```

`pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts -t "no-op task write answers a null receipt"` exited 1, `Tests  1 failed | 38 skipped (39)`:

```text
 FAIL  src/row-history.test.ts > row history closure evidence (Slice 45; §§31, 34, 36) > a no-op task write answers a null receipt and leaves the Redo branch standing
AssertionError: expected { historyId: 'fault-history', …(6) } to be null
 ❯ src/row-history.test.ts:343:98
```

Reverted with `git checkout -- packages/domain/src/task-service.ts`; `git diff --exit-code` on it exited 0; the domain suite exited 0, `Tests  799 passed (799)`.

*Step 4 — F2b, silent recording behind a `null` receipt.* Fault diff in `task-service.ts`:

```diff
-      if (committed === current) return { task: current, operation: null };
+      if (committed === current) {
+        await this.dependencies.history.record(actor, {
+          projectId: current.projectId,
+          label: 'Fault',
+          operation: captureTaskUpdate({ taskId: id, projectId: current.projectId, completion: false, changes: [{ field: 'title', before: 'fault-before', after: 'fault-after' }], rows: [] }),
+        });
+        return { task: current, operation: null };
+      }
```

The same focused command exited 1, `Tests  1 failed | 38 skipped (39)`, at the predicted assertion — the receipt check passed and the `operationActions` equality failed:

```text
 FAIL  src/row-history.test.ts > row history closure evidence (Slice 45; §§31, 34, 36) > a no-op task write answers a null receipt and leaves the Redo branch standing
AssertionError: expected [ { id: 'operation-1', …(7) }, …(1) ] to deeply equal [ { id: 'operation-1', …(7) }, …(1) ]
-     "id": "operation-2",
-     "label": "Updated \"Changed\"",
+     "id": "operation-3",
+     "label": "Fault",
-     "order": 2,
-     "state": "undone",
+     "order": 3,
+     "state": "applied",
 ❯ src/row-history.test.ts:344:49
```

(The diff excerpt omits the unchanged fields and the `changes` lines, which differ as the fault's title values.) The received list shows the fault discarded the undone `operation-2` Redo step and appended an applied `operation-3`, which the unclaimed `operationHistories` and Redo-summary assertions would also have caught. Under F2b `pnpm --filter @cwm/domain test` exited 1, `Tests  1 failed | 798 passed (799)`, and the target is its only failing test. Reverted with `git checkout -- packages/domain/src/task-service.ts`; `git diff --exit-code packages/domain/src/operation-history-service.ts packages/domain/src/task-service.ts` exited 0; the domain suite exited 0, `Tests  799 passed (799)`.

*Step 6 — green.* `git status --porcelain` listed only the dev-panel store; both production files had no diff. `pnpm --filter @cwm/domain test` passed (799). `pnpm test` exited 0: root `node --test` 9, contracts 355, repositories 164, web 792, prototype-data 120, domain 799, mcp-tools 173, prototype-host 267.

*Step 7 — real use.* No runtime behavior changed, so no browser or MCP journey was run and no personal runtime data was touched.

*Step 8a — pre-`complete` checks.* `pnpm lint` exited 0; `pnpm docs:check` exited 0 (`docs: ok — 18 system folders, 236 documents checked`).

**Deliberate choices** — F2b records a synthetic one-field title change rather than deleting the early return, because `TaskUpdateOperationSchema` refuses an empty update before `history.record` (review round 1). No decision entry: the phase answers no product question.

**Deviations from the plan** — One: the first full `pnpm test` exited 1 on an unrelated web spec, `state-inspector-page.spec.ts > StateInspectorPage (§28) > lists projects with independent flow/grid controls, beside §46’s shared panel` (`expected 'Development panelPrototype state The …' to contain 'Website launch'`). `CURRENT_SLICE` is read only in `DevPanelStore.addNote` (`dev-panel-store.ts:109`), which this test never calls. `pnpm --filter web test` then passed twice (`792 passed (792)`), and the rerun of `pnpm test` recorded in step 6 passed. It is a presumed load-dependent flake in the parallel run, noted here rather than fixed.

**Deferred** — The target no-op test's `operationHistories` and Redo-summary assertions remain individually unproven (explicit non-goal). F1 has no detector in `@cwm/prototype-host`; the domain and MCP contract tests carry it. Slice 46 findings 5–14 stay in [Slice 46](../planned/46-slice-34-closeout-follow-up.md).

**Open questions** — Whether the `state-inspector-page.spec.ts` flake deserves a bounded fix; it has not reproduced in `pnpm --filter web test` (2 runs).

**Documentation updated** — No architecture, decision or guide file. After `complete`, three link edits point at `completed/50-fault-sensitivity-evidence.md`: a dated note under the title of [Slice 45's record](../completed/45-undo-redo-archive-integrated-closure.md), a Slice 50 link on finding 4 of [Slice 46](../planned/46-slice-34-closeout-follow-up.md), and a sentence under the 2026-09-27 follow-up in [`goals.md`](../goals.md).
