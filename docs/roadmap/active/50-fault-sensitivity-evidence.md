<!-- plan id="50" status="active" summary="Prove the reflection transition grant and task no-op receipt assertions detect deliberate faults" -->
# Slice 50 — Fault sensitivity for reflection grant and task no-op receipt

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

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
