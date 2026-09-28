<!-- completed-record id="48" closed="2026-09-28" summary="Task Undo/Redo refuses while the row's current or target section is archived, and works again after the section is restored" -->
# Slice 48 — Task history under archived sections

## Goal

Make a task edit, completion or move step's Undo and Redo refuse while the section the row is in, or would be put in, is archived. Undo and Redo work again after that section is restored. The refusal changes nothing and gives typed "restore, then retry" guidance.

## Spec sections

§31 (Archive is a field; archived sections are frozen against row edits and moves; per-actor
operation history, `history_conflict` refusals that write nothing, repairable conflicts). §33–§34
(task fields, completion stamps `completedAt`, subtask and section moves). §36 (reflection
history, the parity reference: its Undo/Redo already refuse under an archived container). §45
(Clock-stamped `updatedAt` on a transition). §54 and §59 (`undo_operation` / `redo_operation`
carry the same typed refusal to an agent). §77–§78 (the rule is decided and indexed before code, and
the tests protect the intended behavior).

## Build

This implements [Slice 46](../planned/46-slice-34-closeout-follow-up.md) finding 3 only.

- **Decide first.** Add a §78 decision entry covering task history under archived sections, index
  it and link it from the domain `why.md`. Rule: every `task.update` transition refuses with
  `history_conflict` while the row's **current** section is archived, or while the section the
  transition would put the row in is archived. This covers edits, completion, reopening, moves and
  reparents, in both directions and whether the row is live or independently archived. The
  conflict is `{ entityType: 'section', problem: 'archived-subject', nextStep:
  'restore-state-and-retry' }`, reported once per section. The rule follows the archived-section
  freeze in [what Undo means for an archived row](../../decisions/2026-09-what-undo-means-for-an-archived-row.md).
  That decision refuses moving or editing a row inside an archived section, and `TaskService.update`
  enforces it through `assertSectionLive` (current section) and `requireContainer` (a root task's new
  section). It also matches `reflection.update` history, which already checks its current container.
  **History is deliberately stricter than the service on one path.** A reparent follows the new
  parent's section through `requireWithin`/`assertWritablePage` alone, so an ordinary update can put
  an *independently archived* row under an archived parent in an archived section
  (`task-service.ts` 265, 275–293). History refuses that step's Redo on the target section. The
  decision records why: the Undo of the same step is already refused by the current-section check,
  and the refusal is repairable by a Restore. That service gap is deferred (Open questions).
- **Preserve what already holds, and prove it.** The rule does not change `task.add`,
  `task.archive` (Delete) or `task.restore`. Their executors already refuse under an archived
  section through a row `archived-subject`, `archive-state-changed` or a live-container check. Tests
  lock that behavior in both directions and prove it recovers after the section is restored.
  The archived-project blocker stays ahead of every executor check (`history_blocked`), and
  the project family's archived-subject exception stays project-only.
- **Repair.** Add one container check to `writeTaskUpdate` in `packages/domain/src/task-history.ts`.
  It sits after `structuralConflicts` and before the `conflicts.length === 0` gate
  (today lines 667–669). It reuses `liveContainerConflicts`, so each entry carries the section's
  `nameOf` title, and a missing section reports `missing`, as reflection history does. It always
  checks the row's current section. When the operation records a structural target in a
  **different** section, it checks that target too, whatever the target's archive state, so one
  refusal names every archived section and one Restore round is enough. It deduplicates by section
  id, runs before any write, and adds nothing to the archive/restore/add executors. The gated
  block's own live-target `liveContainerConflicts` can then only run when the target is already
  known to be live, so it cannot add a duplicate. The old archived-target `missing` check
  (today lines 702–704) becomes dead code and is deleted. The conflict list order is: row
  field/structural conflicts first, then section conflicts (current, then target). Before, the gate
  hid a missing or archived target whenever a structural conflict was present; now it is listed
  alongside that conflict. That visible change is recorded in the decision and in `how.md`.
- **Surface.** No contract, host, MCP or web code changes. The existing typed conflict already
  flows to HTTP 409, the MCP `history_conflict:` message and the header's conflict lines. One
  registry test proves an agent receives it.
- **Document** the rule in the spec's §31 history paragraph, the domain architecture files, and a
  dated amendment to the row-history decision.

## Done when

- An indexed decision states the container rule. The spec, domain `how.md`/`why.md` and the
  row-history decision point to it.
- `row-history.test.ts` shows each case below failing before the repair where it was wrong, and
  passing after. Each refusal leaves the store snapshot and history revision byte-for-byte
  unchanged, with the exact conflict list. The same step then succeeds after the section is
  restored, producing the exact expected row and one Activity event. Undo and Redo are both
  covered.
- Delete/Restore/Add inverses and the archived-project blocker keep their current behavior under
  test. The MCP registry test shows the typed refusal.
- `pnpm test`, `pnpm lint` and `pnpm docs:check` pass. One real-use journey over HTTP MCP on
  isolated `nested-projects` data confirms the refusal and the recovery, and its friction is
  logged.

## Do not

- Change the Delete/Restore/Add executors' rules, the archived-project blocker or its
  project-only exception, contracts, conflict vocabulary, retirement rules or the header summary.
- Disable the header Undo/Redo in advance from a per-entry container blocker (that is a summary
  contract change). Add history browsing, a new refusal reason, or a Restore-and-retry shortcut.
- Take on Slice 46 findings 4–14, or the two service/history divergences recorded under Open
  questions: archived-row completion/reopen, and an ordinary reparent into an archived section.
- Reset personal runtime data. Add a domain infrastructure dependency or a new service edge.

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

1. **Decision exists and is indexed.** `docs/decisions/2026-09-task-history-under-archived-sections.md`
   is in §78 format, listed under **Domain** in `docs/decisions/README.md`, and linked from
   `docs/architecture/domain/why.md`. `2026-09-row-operation-history.md` carries a dated
   `**Amended, 2026-09-28**` paragraph pointing to it. `pnpm docs:check` passes.
2. **Failing first.** Before the repair, run
   `pnpm --filter @cwm/domain exec vitest run src/row-history.test.ts`. The new edit, completion and
   archived-row move cases fail because the transition *succeeded* (the promise resolved, or the
   title/status/section changed). A typo or setup failure does not count. The preservation cases
   pass already. Record the observed failures under Revisions.
3. **Green after the repair.** The same command, then `pnpm --filter @cwm/mcp-tools exec vitest run
   src/contract.test.ts`, both pass.
4. **Whole suite.** `pnpm test`, `pnpm lint` and `pnpm docs:check` pass.
5. **Real use (HTTP MCP plus browser, isolated data).** Copy the `nested-projects` seed into a
   scratch file, set `CWM_DATA_FILE` to it, and start `pnpm dev:host` and `pnpm dev:web` in separate
   terminals. Actor A is the `agent-claude` connection over HTTP MCP, using its fixture token from
   `packages/prototype-data/src/agent-tokens.ts`. Its `nested-projects` grants include
   `tasks.write` (`packages/prototype-data/src/seeds.ts`, `nestedProjects`); re-check at
   implementation. Actor B is the signed-in persona in the browser.
   - A runs `update_task` to change a task's title in a task list that holds another live task.
   - B removes that task list on the canvas.
   - A runs `undo_operation` and receives `history_conflict:` naming the section, with restore
     guidance. `get_operation_history` shows the same revision and the same next action.
   - B restores the section from the root Archive page. A's `undo_operation` now succeeds.
   - B removes the section again, and A's `redo_operation` refuses the same way. B restores, and
     the Redo succeeds.

   Record friction in `.prototype/notes.json`. Say plainly if any step was not run.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `docs/decisions/2026-09-task-history-under-archived-sections.md` | create | §78 entry: the rule; options tested (scalar steps exempt, as today; mirror the service path-by-path, including its reparent gap; current + differing-target sections, adopted); what was reproduced; why history is stricter on reparent; confidence; revisit-when (the two deferred divergences). |
| `docs/decisions/README.md` | modify | New index row under Domain. The row-history entry's status changes from "current (Slice 36)" to "amended; Slice 48 adds the archived-section rule", per the status-column rule. |
| `docs/decisions/2026-09-row-operation-history.md` | modify | Dated amendment paragraph linking the new rule (never rewrite). |
| `packages/domain/src/row-history.test.ts` | modify | New `describe` block "task history under archived sections (Slice 48; §§31, 34)" with the cases in the test plan, plus a small `refusalOf`/snapshot helper local to the block. |
| `packages/domain/src/task-history.ts` | modify | `writeTaskUpdate`: `liveContainerConflicts` for the current section and for a differing structural target, deduplicated by section id, after `structuralConflicts` and before the gate. Delete the now-dead archived-target `missing` branch. Update the doc comment. |
| `packages/mcp-tools/src/contract.test.ts` | modify | One test: `undo_operation` on a task edit under an archived section rejects with `history_conflict:` naming the section, and succeeds after `restore_section`. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | §31 history: an "*Amended in Slice 48.*" paragraph with the rule and decision link. It goes directly after the "*Landed in Slice 39.*" paragraph and before "*Amended in Slice 41.*". |
| `docs/architecture/domain/how.md` | modify | The "Neither direction overwrites a later write" bullet names the container rule for `task.update`, including that a missing or archived target is now listed alongside a structural conflict. |
| `docs/architecture/domain/why.md` | modify | One sentence plus the decision link beside the row-history rationale. |
| `docs/architecture/testing/what.md` | modify | The "Row history chains" row adds Slice 48's archived-section refusal and recovery cases. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 48` at implementation start. |
| `.prototype/notes.json` | modify | Real-use friction from acceptance step 5. |
| `docs/roadmap/active/48-task-history-under-archived-sections.md` | modify | Revisions, evidence, Outcome. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | modify | Link finding 3 to this slice. Record direction. Regenerate the board. |

## Test plan — tests first

All tests are in `packages/domain/src/row-history.test.ts` unless named otherwise, using
`buildHarness()`.

**Fixture rules.** These avoid the compound-container and disposable-deletion paths, which would
change the conflict lists.

- **A = `h.actor`** owns the history under test.
- **B = the agent connection `agentActorFor(0, …)`** does every section removal and
  restore (`h.sectionWriteService.remove` / `restoreSection`) and any independent task archive.
  Its steps land in B's own history, so A's task step stays next.
- **Every section is created before the subject task**, by `h.sectionWriteService.add(B, MINE,
  { type: 'task-list' })`. The harness document has no sections (`test-support.ts:102`), and a
  create without one would record a compound `task.add`.
- **Every section B removes holds a live filler task** created by B. Any row reference already
  retains a section (`section-service.ts:802–808`), but the filler also keeps it retained after a
  subject row has moved out. It is never hard-deleted.
- **B holds `projects.read` too** (`agentActorFor(0, ['projects.read', 'projects.write',
  'tasks.write'])`), because B also archives and reactivates MINE: `h.projectService.archive(B,
  MINE)`, as in `project-history.test.ts:644`, and `h.projectService.update(B, MINE, { status:
  'active' })`. A never reactivates, or that write would become A's next step.
- **The Clock ticks** (`h.clock.setNow(+60 s)`, as `project-history.test.ts:15` does) before
  every recovery, so the `updatedAt === now` assertion distinguishes the transition's stamp from
  earlier writes on the frozen `SEED_NOW`.

**Each refusal assertion checks four things:**

1. `details.reason === 'history_conflict'`.
2. `details.conflicts` equals exactly the listed array, in order.
3. `details.summary.undo` or `.redo` still names the same `actionId`, so the step was not retired.
4. `h.store.snapshot()` deeply equals the snapshot taken just before, which covers rows, history
   revision/cursor and Activity.

**Each recovery assertion checks:** the exact row, one Activity event, and `updatedAt` equal to the
Clock's ticked now.

**Conflict notation.** `rowConflict` gives every problem except `missing` a `title`
(`task-history.ts:179–190`):

- `S(x)` means `{ entityType: 'section', id: x, title: nameOf(x), problem: 'archived-subject',
  nextStep: 'restore-state-and-retry' }`. `nameOf` gives "Task list" for an untitled list.
- A task conflict such as `task field-changed` carries the task's **current** title and the next
  step its problem implies (`rowNextStepFor`).

The tests build these entries from the stored rows rather than hard-coding strings.

| Test | Expected lists | Proves |
|---|---|---|
| **edit, both directions, cascaded row**: A edits the title; B removes S; Undo refuses; B restores S; Undo succeeds (title back); B removes S; Redo refuses; B restores S; Redo succeeds. | Undo `[S(S)]`; Redo `[S(S)]` | The core finding: a scalar step no longer edits a row in an archived container, and a Restore is the whole repair. **Fails today** (the Undo resolves). |
| **completion, both directions**: the same sequence over `complete`, with `status` and `completedAt` asserted together. | `[S(S)]` each way | A completion is a scalar step too, and its paired fields stay exact. **Fails today.** |
| **reopen, both directions**: A completes T, then reopens it with `update({ status: 'todo' })` (the reopen is A's next step); then the same sequence. | `[S(S)]` each way | A reopen is covered and `completedAt` comes back verbatim. **Fails today.** |
| **field changed and section archived**: A edits the title; B edits the title again, then removes S; A's Undo refuses. | `[task field-changed, S(S)]` | The exact order, and parity with reflection history (`reflection-history.ts:290–293`). **Fails today** (only the field conflict is reported). |
| **subtask**: A edits a subtask's title; B removes the parent's section, which cascades both; Undo refuses; restore; Undo succeeds. | `[S(S)]` | A subtask's container is its parent's section. **Fails today.** |
| **edit of an independently archived row**: B archives T; A edits T's title (allowed, because S is live); B removes S (T keeps its own markers); Undo refuses; B restores S (T stays independently archived); Undo succeeds with T's markers unchanged. | `[S(S)]` | The rule keys on the container, not on the row's own archive state, and never revives or re-marks the row. **Fails today.** |
| **archived-row move out of an archived section**: B archives T in X; A moves T X→Y; B removes Y; Undo refuses (current Y); restore Y; Undo succeeds (T in X, markers unchanged); B removes Y (a filler keeps it retained); Redo refuses (target Y); restore; Redo succeeds. | Undo `[S(Y)]`; Redo `[S(Y)]` | The current section is checked for archived rows, and on Redo so is an archived target, which the old branch only checked for existence (`task-history.ts:702–704`). **Fails today.** |
| **archived-row move into an archived section**: as above, but B removes X; Undo refuses (target X); restore X; Undo succeeds; B removes Y instead; Redo refuses (target Y). | Undo `[S(X)]`; Redo `[S(Y)]` | The archived-target check in both directions. **Fails today.** |
| **one conflict per section**: B archives T and P in S; A reparents T under P (same section); B removes S; Undo refuses. | `[S(S)]`, exactly once | The current and target checks are deduplicated. **Fails today** (no conflict). |
| **cascaded live structural step**: A moves a live T X→Y; B removes Y (T cascaded); Undo refuses. Then B also removes X; Undo refuses. | `[task archive-state-changed, S(Y)]`, then `[task archive-state-changed, S(Y), S(X)]` | The exact list when the existing structural conflict and the new checks coincide. One refusal names both sections, so a single Restore round repairs it. **Fails today** (only the task conflict). |
| **reparent into an archived section (history stricter)**: B archives P in X and T in Y; A reparents T under P (T moves to X); A undoes (succeeds, because X is live); B removes X; Redo refuses. | `[S(X)]` | The decision's stricter-than-service Redo target rule. It is also the stated behavior for the deferred service gap. **Fails today.** |
| **Add inverses preserved**: A creates T in existing S. (1) B removes S (T cascaded); Undo Add refuses; restore; Undo succeeds. (2) After that Undo, B removes S; Redo Add refuses; restore; Redo succeeds. | (1) `[task T archived-subject]`; (2) `[S(S)]` | `task.add` behavior is unchanged in both directions. **Passes before and after.** |
| **Delete inverses preserved**: A deletes T (task Delete = archive). (1) B removes S (T keeps its own markers); Undo refuses; restore; Undo succeeds. (2) After that Undo, B removes S (T cascaded); Redo refuses; restore; Redo succeeds. | (1) `[S(S)]`; (2) `[task archive-state-changed]` | The Delete executor is untouched and already safe. **Passes before and after.** |
| **Restore inverses preserved**: A archives T, then restores T (the next step is `task.restore`). (1) B removes S (T cascaded); Undo refuses; restore; Undo succeeds. (2) After that Undo (T independently archived), B removes S; Redo refuses; restore; Redo succeeds. | (1) `[task archive-state-changed]`; (2) `[S(S)]` | The Restore executor is untouched and already safe. **Passes before and after.** |
| **archived project wins over an archived section**: A edits; B removes S; B archives MINE; Undo answers `history_blocked` naming MINE; B reactivates MINE; Undo answers the section conflict; B restores S; Undo succeeds. | `history_blocked`, then `[S(S)]` | The blocker still runs first, and the task family gets no subject exception. **Fails today** at the section step (the Undo resolves after reactivation); the `history_blocked` step passes before and after. |
| **existing target-missing case, tightened**: `row-history.test.ts` "an archived task move refuses when its target container for Undo was removed" additionally asserts `details.conflicts` equals `[{ entityType: 'section', id: source, problem: 'missing', nextStep: 'nothing-to-undo' }]`. | as stated | The moved check reports a hard-deleted target through the new path. **Passes before and after**: the old branch produced the same entry, and the new path now owns it. |
| **unrelated archived section**: A edits a task in live S1 while B has removed S2; Undo and Redo succeed. | none | The check is scoped to the row's own and target sections. |
| `packages/mcp-tools/src/contract.test.ts`: **`undo_operation` on a task edit under an archived section rejects `history_conflict:` naming the section, then succeeds after `restore_section`**. It uses the registry harness's own fixtures (`packages/mcp-tools/test/harness.ts`, agent-heavy seed): A = `agent(['projects.read', 'tasks.write'])` calls `update_task` on `OPEN_TASK` (a root task in `TASK_CONTAINER`, which holds other live tasks; confirm it is a root task); B = `user()` calls `remove_section`; A's `undo_operation` rejects; B calls `restore_section`; A's `undo_operation` resolves. | message starts `history_conflict:` and contains the section id | An agent sees the typed refusal and the repair through the registry both transports share. |

**Order.** Before writing new cases, run the existing task-history suites once as a baseline:
`row-history.test.ts`, `operation-history-service.test.ts` and `section-restore-history.test.ts`.
Write the **preserved** cases first and run them green, so they are evidence of existing behavior.
Then write the edit case and watch it fail for the right reason: the transition resolves. Implement
the check, then add the remaining "fails today" cases one at a time. Confirm that each fails first,
or record honestly if one already passed.

## Boundaries touched

- **Domain depends on abstractions only.** The change lives in `task-history.ts` and reads
  through `RowHistoryRepositories` (`sections.find`), which it already uses. It adds no service
  edge, so `TaskService` is still not composed by history. There is no `new Date()`: `updatedAt`
  keeps coming from the injected `Clock`.
- **MCP tools call domain services.** The registry test drives `undo_operation`, and the tool is
  unchanged.
- **Contracts defined once.** It reuses the existing `UndoConflict` problem and next step, with no
  new vocabulary or type.
- **Web/components, tokens, prototype flag, `core/`.** It does not touch them. The header already
  renders the conflict line.

## Explicit non-goals

- No change to summary eligibility (`blockedBy` stays project-only), so the header control stays
  enabled and a click shows the conflict. This is the existing behavior for every conflict.
- No retirement: an archived section is repairable, so the action stays next.
- No change to reflection history (already conforming), section/page/shortcut/project families,
  or the ordinary `TaskService` rules.
- No e2e spec. The browser path is unchanged and generic, and real use covers it.

## Open questions

- **Archived-row completion (not a container rule).** `TaskService.update` refuses to *complete* an
  archived task (`task-service.ts:299–301`). A `task.update` Redo of a completion, or Undo of a
  reopen, can still write `done` onto a row another actor archived in a live section. Finding 3 is
  about containers, so the default is to defer it. It is named in the decision's *Revisit when*,
  logged as a friction note and listed under the Outcome's Deferred for the Slice 46 umbrella to
  route. It does not change this slice's shape.
- **Ordinary reparent into an archived section (service gap).** As described under Build,
  `TaskService.update` lets an independently archived row follow an archived parent into an archived
  section, contrary to the archived-section freeze. History refuses the Redo of such a step. The
  default is to defer the service fix, with the same routing as the item above; this slice only
  states and tests the history behavior.
- **Where the check sits.** It sits in the executor (a conflict), not in `transitionBlocker` (a
  `history_blocked` reason). The blocker is project-scoped and contract-typed with
  `blockingProjectId`, so routing a section through it would change the contract. The executor is
  where reflection history already does it. Settled.

## Revisions

- **Draft (2026-09-28):** Grounded in `task-history.ts` (`writeTaskUpdate` checks a container only
  when `rows` is non-empty and the target is live), `reflection-history.ts` (always checks
  the current container), `TaskService.update` (`assertSectionLive` + `requireContainer`),
  `SectionService.removalOutcome` (a section that is still referenced by rows is retained, so the
  archived-row move cases are reachable), `OperationHistoryService.transition` (the blocker runs
  before executors), the earlier Slice 46 finding text and the spec's §31 history paragraphs.
- **Review round 1 (2026-09-28, cold subagent against code):** Five substantive findings, all
  accepted after checking the code:
  1. The harness has no sections, so the Add cases would hit the compound container (Redo Add
     could never see an archived section). Subjects are now created in a section that exists first.
  2. A second removal of an emptied section hard-deletes it. Every removed section now holds a
     filler task.
  3. A `projects.write`-only B cannot archive a task. B now also holds `tasks.write`.
  4. The "mirrors the service" claim was false for a reparent's target. The rule now cites the
     archived-section freeze decision, states that history is stricter on that path, adds a test,
     and defers the service gap.
  5. The check's placement and the conflict order were unspecified. The check now sits after
     `structuralConflicts` and before the gate, and checks the target only when it is archived;
     every case lists its exact array.

  Minor findings, all accepted: reopen is added to the deferred divergence and tested; the Delete
  and Restore expectations are spelled out per direction; the project-archive actor is named;
  field-changed + archived, subtask and not-retired (`summary` actionId) assertions are added,
  with a baseline run of the existing suites; the real-use step names the actors and confirms the
  token grants first.
- **Review round 2 (2026-09-28, fresh cold subagent):** It traced all rows through the services and
  confirmed every row is constructible and every "fails today" / "passes" claim is true. Its one
  substantive finding, accepted: the expected arrays omitted each conflict's `title`, so
  exact-equality assertions would fail. The notation now defines titles, and the new check reuses
  `liveContainerConflicts`, which also reports `missing`.

  Minor findings, all accepted:
  - The reactivating actor is now B, never A, and the misleading "third actor" is gone.
  - The target is now checked whenever it is a different section, whatever its state, so a refusal
    names every archived section at once. A case covers X and Y together.
  - The row-history index status is updated.
  - The MCP test names the registry harness's own actors, section and tools.
  - The project case is classified as "fails today" at its section step.
  - The Clock ticks before each recovery.

  Not acted on: fixing the one-line service reparent gap now. The reviewer judged deferral
  acceptable, and it would change ordinary `TaskService` behavior outside finding 3.
- **Review round 3 (2026-09-28, fresh cold subagent):** **No substantive findings.** It searched
  every domain, mcp-tools, host and e2e test and found no existing exact conflict-list assertion on a
  `task.update` transition that the repair would change. It confirmed that the subtask/reparent
  target section is meaningful, that the round-2 lists are correct, and that the MCP actors own
  separate histories.

  Minor findings, all accepted:
  - Delete the dead archived-target `missing` branch.
  - Record the newly visible target conflicts next to structural ones.
  - Name `OPEN_TASK` and the reopen setup.
  - Pin the spec insertion point before "*Amended in Slice 41.*".
  - Tighten the existing target-missing test to an exact list.

  The plan is ready for implementation.
- **Implementation, 2026-09-28:** Baseline first: `row-history.test.ts`,
  `operation-history-service.test.ts` and `section-restore-history.test.ts` passed (99 tests). All
  sixteen new domain cases were then written before the repair and run together rather than one at a
  time; the result is the same evidence. The three preserved cases (Add, Delete, Restore) and the
  unrelated-section case passed. All twelve "fails today" cases failed for the named reason: ten with
  "expected the transition to be refused, but it resolved" (edit, completion, reopen, subtask,
  independently archived edit, archived move out, archived move in, one-per-section, stricter
  reparent Redo, archived project after reactivation), and two with a conflict list holding only the
  task conflict (field-changed + section, cascaded live move). The MCP registry test failed with
  "promise resolved … instead of rejecting" against the unrepaired executor. After the repair all
  pass. The gated block's live-target `liveContainerConflicts` call was deleted along with the
  archived-target `missing` branch, not kept: `sectionConflicts` already checks the target whenever
  the gate can open, so it could never add anything. `pnpm lint` then caught index-signature reads of
  `details` in the new tests; the helper now parses details with
  `OperationHistoryRefusalDetailsSchema`.
- **Review round 1 of the diff (2026-09-28, two cold subagents: correctness/tests; boundaries/docs):**
  no substantive findings. Both confirmed that deleting the gated checks changes no behavior and that
  no other test depended on the old order. Minor findings, all accepted: five refusal-only cases now
  also show their recovery (a Restore leaves only the field conflict in the field-changed case,
  because that half is a by-hand repair); the test helper reads details through the contract schema
  instead of a hand-written shape; the decision's list of reproduced failures now names all twelve,
  and says that a missing current section now reads `missing` too; the `sectionConflicts` comment and
  the testing `what.md` row say exactly what is checked and tested. Not acted on: the
  pre-existing no-op line in `liveContainerConflicts` (out of scope).
- **Review round 2 of the diff (2026-09-28, fresh cold subagent):** no substantive findings. It
  confirmed that no section conflict retires a step. No chain is newly wedged: a row's current
  section can never be hard-deleted, and a missing target was already `missing` before. Minor
  findings, all accepted:
  - The target-missing test now asserts its conflict list with `toEqual`.
  - The `history_blocked` step also asserts that the Undo is still next.
  - The decision no longer wrongly says only archived targets were checked for `missing`.
  - `liveContainerConflicts`' comment covers archived rows.

  Not acted on: asserting restore wording in the MCP text. That wording does not exist (see
  Deferred), and the plan asks only for the token and the section.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables.** A task step's Undo and Redo now refuse while the row's section, or the section the
step would put it in, is archived, and work again after a Restore. `writeTaskUpdate` in
[`task-history.ts`](../../../packages/domain/src/task-history.ts) calls a new `sectionConflicts`
after the row's field and structural checks and before any write. It always checks the row's current
section, and a recorded structural target when that is a different section, whatever either is. Each
section is reported once, through the existing `liveContainerConflicts`. The refusal is
`archived-subject` with `restore-state-and-retry` for an archived section and `missing` for a deleted
one. It never retires the step. Tests:
- sixteen cases in the new block of
  [`row-history.test.ts`](../../../packages/domain/src/row-history.test.ts), covering edit,
  completion, reopen, field conflict with the section, subtask, independently archived row, archived
  moves out and in, one conflict per section, cascaded live move, stricter reparent Redo, the
  archived-project blocker, an unrelated section, and the Add, Delete and Restore inverses;
- the tightened exact list on the existing target-missing case;
- one registry test in [`contract.test.ts`](../../../packages/mcp-tools/src/contract.test.ts):
  `undo_operation` answers `history_conflict:` naming the section, then succeeds after
  `restore_section`.

**Evidence.** The twelve "fails today" cases and the MCP test failed before the repair for the
reason named under Revisions. The preserved cases passed before and after. `pnpm test` (2,646
tests), `pnpm lint` and `pnpm docs:check` pass. Real use ran on an isolated `nested-projects` copy
(scratch `CWM_DATA_FILE`, `pnpm --filter @cwm/prototype-host start` and `pnpm dev:web`). Actor A was
`agent-claude` over HTTP MCP. Actor B was the signed-in persona in the browser, using the canvas's
Remove section and the root Archive's "Restore saved content". The journey:
1. A renamed `task-kitchen-appliances`, and B removed Kitchen's Task List.
2. A's `undo_operation` refused with `history_conflict: … archived-subject: section "Task List"
   [section-project-kitchen-tasks]`. `get_operation_history` kept revision 1 and the same Undo.
3. B restored the section, and the Undo succeeded (revision 2).
4. B removed the section again. The Redo refused the same way, then succeeded after B restored it
   (revision 3).

All steps ran (`note-2026-09-28-001`). The host was started with the non-watch `start` script
because `tsx watch` did not come up under the preview launcher.

**Deliberate choices.** The rule and its reasons are in
[a task step's Undo and Redo refuse while its section is archived](../../decisions/2026-09-task-history-under-archived-sections.md):
- The target is checked whatever its state, so one refusal names every section and one Restore round
  is enough.
- History is stricter than `TaskService` on the archived-row reparent path.
- The check lives in the executor, not the project-typed blocker, so the contract is unchanged.

The field-changed case shows that a Restore repairs only the section half. The other actor's edit
stays a by-hand repair, as before.

**Deviations from the plan.**
- The gated block's live-target check was deleted, not kept, because it could no longer add
  anything.
- The new cases were written together and run once before the repair, not one at a time.
- Five refusal-only cases gained recovery steps in review, to match *Done when*.
- The test helper parses refusal details with `OperationHistoryRefusalDetailsSchema`.

**Deferred.** Two divergences between history and the service go to the Slice 46 umbrella
(`note-2026-09-28-002`):
- A completion's Redo, or a reopen's Undo, can write `done` onto a row another actor archived in a
  live section.
- `TaskService.update` lets an archived row follow its archived parent into an archived section.

Friction for later work: the MCP text carries the problem token but not `nextStep`. A section named
only "Task List" doesn't say which one to restore. The summary still offers a step it will refuse
(a per-entry blocker is a contract change). Slice 46 findings 4–14 are untouched.

**Open questions.** Should MCP refusal text spell out the next step in words? Should section
conflicts name their project or page? Both are MCP-wide questions, not specific to this rule.

**Documentation updated.** New decision and index row, row-history amendment and status, spec §31
"*Amended in Slice 48*", `docs/architecture/domain/how.md` and `why.md`,
`docs/architecture/testing/what.md`, `.prototype/notes.json`, the Slice 46 ledger link,
`docs/roadmap/goals.md`, and `CURRENT_SLICE = 48`.
