<!-- completed-record id="57" closed="2026-09-29" summary="Task List and Todos announce committed Delete recovery through Archive and the owning header" -->
# Slice 57 — Task Delete recovery feedback

## Goal

Close [Slice 46 finding 10](../completed/46-slice-34-closeout-follow-up.md#build) by making a committed task Delete explain where its reversible recovery lives on Task Lists and root Todos.

## Spec sections

§§8–12 preserve gateway and contract boundaries; §§19–23 require feature-scoped state, accessible shell and token styling; §26 puts the only browser Undo/Redo action in the displayed project's header; §31 makes root Archive the durable recovery route; §34 defines Delete as task archive and Todos as a root-tree projection; §§63, 68–69 require honest optimistic failure behavior and browser verification; §§77–79 require real-use evidence, current docs and a decision for the UX answer.

## Build

- After a successful Task List Delete, show a compact, polite status near that list: the named task was **archived**, root Archive provides durable recovery when its owner is ready, and the owning project's header Undo may reverse the latest step when available. Keep the header as the sole Undo action. The section already knows its owner; a read-only Home shortcut never offers Delete.
- After a successful Todos Delete, show the same status outside the chronology, so the message survives removal of the row (including the final row). Capture the task title and owner before the optimistic removal. For a descendant-owned task, name the owner and offer its canonical `#history-controls` route using the same route rule as the existing descendant-history link. A root-owned task refers to the displayed header without a redundant navigation link. Offer root Archive through the page's existing `onOpenArchive` callback, which already delegates to the shell's guarded `openArchive()` route. Keep its existing failure behavior; add no gateway or contract field.
- Announce success only after the archive write commits. Todos must not announce while its optimistic row is absent and must clear any prior success when a new Delete begins, fails, or navigation changes the root. Task List must likewise clear stale success on a new attempt, failure, or section change; a late success from an earlier section must not paint on the new section. Preserve both surfaces' current error and focus behavior, and do not replace a user-moved focus target. A refresh failure after a committed Task List archive must not be described as a failed Delete: verify the store's existing return/error semantics and distinguish these outcomes if needed.
- Check the cue at 375 px in both themes and with mouse, Enter, Space and touch. When Archive is disabled, `openArchive()` first enables that root page as its own history action; test enabled, disabled, failed enable and committed-enable/read-failure plus Retry. The cue must not claim successful navigation or that Delete remains the next Undo step after this action. Keep it a status and route to existing recovery, not a temporary Undo button. Record the wording/recovery choice in an indexed §78 decision and correct current docs with implementation.

## Done when

A Delete committed from Task List or Todos announces that the task was archived and explains recovery through root Archive when the owner is ready, plus the owning project's existing header Undo when the step is available. A descendant task on Todos names and reaches its owner; a root task remains on its root. The status survives the last row disappearing, but no success is announced on a refused write. Existing keyboard focus restoration, touch activation, error display, page navigation, Archive Restore and header-only Undo remain correct. A 375 px journey in both themes and realistic browser use verify the wording and placement.

## Do not

- Do not create another Undo control, a receipt cache, a history browser, a new Archive aggregate, hard deletion or any server/history/permission change.
- Do not do Slice 46 finding 11's global phone navigation or findings 12–14's drift and umbrella closure in this phase.
- Do not reset personal `.prototype/data.json`, alter core-to-feature dependencies or introduce a parallel task/projection type.

## Acceptance check

1. Write the focused specs below first and observe each fail for missing feedback, wrong owner routing or premature success. For Task List, delete a live and a completed row; verify success only after a committed archive and persistent status when its last row leaves. Exercise a `tasks.write` permission denial, a transport/server failure, committed-write/read-failure and an in-flight section switch separately. For Todos, delete root and descendant tasks; verify optimistic disappearance has no success message before settlement, the descendant status names/links its owner, a root status refers to the displayed header, the final-row status remains visible, and both permission denial and transport failure restore the row without a success cue.
2. Run focused Playwright journeys with isolated `nested-projects` data. Exercise Task List and root Todos Delete by pointer, Enter/Space and touch; observe a polite message, owner link or existing header, then recover one row through header Undo and another through root Archive Restore. For the Archive control, cover an enabled page and a disabled page whose enable records a separate root-history action; cover refusal and committed-enable/context-read failure with the existing Retry. Verify the status after reload/navigation is not stale, that a failed Delete retains the task and reports the error, and that focus lands on the existing safe target unless the user moved it. At 375 px check the cue and controls in both light and dark themes without overflow.
3. Run `pnpm test`, `pnpm lint`, `pnpm docs:check` and the focused Playwright files. Start web and host separately against an isolated `nested-projects` file, use both Delete surfaces, and record genuine friction in `.prototype/notes.json`. Report exact commands, results and limits in Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts` | modify | Hold committed Delete cue for this section, clear it at the right boundaries and preserve focus. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.html` | modify | Render named polite archive/recovery status outside the rows. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.scss` | modify | Style the cue with design tokens at narrow width. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.spec.ts` | modify | Prove success, permission denial, transport failure, final-row, read-failure, section race and focus semantics. |
| `apps/web/src/app/features/tasks/task-list-store.ts` | modify only if needed | Preserve a committed archive result separately from a post-commit refresh failure. |
| `apps/web/src/app/features/tasks/task-list-store.spec.ts` | modify if store changes | Pin the committed-write/read-failure distinction. |
| `apps/web/src/app/features/projects/pages/todos-page.ts` | modify | Capture deleted task and owner, hold/clear status and use the canonical owner route. |
| `apps/web/src/app/features/projects/pages/todos-page.html` | modify | Render a polite status outside the chronology, with owner guidance. |
| `apps/web/src/app/features/projects/pages/todos-page.scss` | modify | Fit the cue in the chronology at 375 px using tokens. |
| `apps/web/src/app/features/projects/pages/todos-page.spec.ts` | modify | Prove optimistic pending, root/descendant guidance, permission and transport failures, final-row and navigation. |
| `apps/e2e/row-history.spec.ts`, `apps/e2e/todos.spec.ts` | modify | Browser Delete, recovery, focus, failure and narrow/touch evidence. |
| `docs/decisions/2026-09-task-delete-recovery-feedback.md` | create on implementation | Record the observed recovery wording and why it points to existing actions. |
| `docs/decisions/README.md`, `docs/architecture/web/tasks/why.md`, `docs/architecture/web/projects/why.md` | modify on implementation | Index and link the decision. |
| `docs/architecture/web/tasks/overview.md`, `docs/architecture/web/tasks/what.md`, `docs/architecture/web/tasks/how.md` | modify on implementation | Describe Task List feedback and any store-result change. |
| `docs/architecture/web/projects/overview.md`, `docs/architecture/web/projects/what.md`, `docs/architecture/web/projects/how.md` | modify on implementation | Describe Todos feedback, owner route and focus behavior. |
| `docs/architecture/testing/overview.md`, `docs/architecture/testing/what.md`, `docs/architecture/testing/how.md` | modify on implementation | Locate the focused browser acceptance evidence and update the E2E inventory. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify on implementation | Correct §§26 and 34 after the UX behavior is verified. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md` | modify on closure | Link finding 10's evidence and name the next remaining phase. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify when implementation starts | Set `CURRENT_SLICE` to 57 for real-use notes. |
| `.prototype/notes.json` | modify only if real use finds friction | Capture an observed issue. |

This active plan and generated `docs/roadmap/progress.md` are this planning phase's documentation changes; feature and architecture changes accompany implementation.

## Test plan — tests first

| Test | Proves |
|---|---|
| `task-list-section.spec.ts: Delete reports archive recovery only after commit` | Live/finished and last-row success show one polite cue; `tasks.write` denial and transport failure show the existing error and no success; a section switch during the pending write and a new attempt cannot leak stale text. |
| `task-list-store.spec.ts: committed archive survives a failed follow-up read` (if needed) | A committed archive is not reported as a failed Delete when reconciliation fails. |
| `todos-page.spec.ts: Delete status follows the task's true owner` | Root and descendant guidance use the right header route and title, stay outside removed rows, clear on `tasks.write` denial, transport failure or navigation and preserve focus moved during a request; Archive delegates to the existing callback. |
| `row-history.spec.ts` and `todos.spec.ts: Delete exposes existing recovery` | Pointer, keyboard and touch paths produce an accessible status; Undo/Archive Restore recover; refusal and narrow/theme states remain usable without a second Undo action. |

## Boundaries touched

- Components use feature state and existing projection/gateway values. They neither import a concrete adapter nor call HTTP. `TaskListStore` continues through `TaskGateway`, and Todos continues to report the write result's owner through `OPERATION_HISTORY_REPORTER`.
- The server remains authority for archive and history; the cue describes the committed archive result and routes to existing recovery. It does not decide eligibility or claim Undo availability from a locally held receipt. Contracts stay defined once in `packages/contracts`; no domain, MCP or persistence change is expected.
- The header remains the only Undo action. Added styles use tokens; `core/` gains no projects/tasks import; prototype behavior stays under its central flag.

## Explicit non-goals

- Auto-focus on the status, an inline Undo button, a per-row history lookup or a claim that this task is still the header's next step.
- Global sidebar collapse at phone width, Slice 46 documentation drift, and Slice 34/46 closure.
- Changes to task archive semantics, history grants, Clock or UnitOfWork.

## Open questions

None blocking. The shell already wires `onOpenArchive` to `openArchive()`, which resolves and navigates to the root Archive. The implementation decision will record the observed wording.

## Revisions

- **Initial plan (2026-09-29):** Scoped finding 10 to a committed archive cue on Task List and Todos, with descendant-owner guidance and no duplicate Undo action.
- **Review round 1 (2026-09-29):** Confirmed Todos already reaches guarded root Archive navigation through `onOpenArchive`; the reviewer caught that opening a disabled Archive first records a distinct page action. Added enabled/disabled, enable failure and committed-enable/read-retry cases, and removed any promise that Delete stays the next Undo step.
- **Review round 2 (2026-09-29):** Added the testing inventory file, explicit `tasks.write` permission denial beside transport failure, and a Task List in-flight section-switch guard and test.
- **Review round 3 (2026-09-29):** Reworded Archive recovery to respect §31's ready-owner projection: an archived owner can suppress the task row until the owner is restored.
- **Implementation review round 1 (2026-09-29):** Independent correctness, boundary and documentation reviewers found that a restored task left contradictory archive status on both surfaces, and that Task List touch and browser-controlled recovery were missing from acceptance evidence. Added restoration-aware cue withdrawal, component regressions, touch, real header Undo and Archive Restore journeys.
- **Implementation review round 2 (2026-09-29):** Reviewers found no remaining substantive implementation or boundary issue. A documentation pass caught an accidental edit to an older feedback note; restored its original fields. The phone touch journey exposed the existing details drawer covering Delete after quick create, so the journey closes that drawer and the friction is recorded for finding 11.
- **Close-out review (2026-09-29):** A direct diff review questioned moving Todos' `onProjectDataChange` call inside the new same-root guard. A red/green check showed `TodosPageStore.delete` already returns `false` for a stale root, so behaviour is unchanged and the code stayed as written. Restored one Mermaid node's indentation in the tasks `what.md`. Reran `pnpm test`, `pnpm lint` and the focused Playwright files: all green, 12/12.

## Outcome

**Deliverables.** Task List and root Todos now keep a polite, named archive status outside
the disappearing rows after a committed Delete. Todos routes descendant work to its true
owner's existing header history and opens root Archive through the shell's guarded callback;
Task List names those existing recovery locations without creating another Undo action.
Both cues clear on a new attempt, refusal, context change or fresh list showing a restored
task. Focused web specs and Playwright journeys cover commit timing, final rows, failed
writes, owner routing, focus, keyboard/touch, header Undo, Archive Restore and 375 px themes.

**Choices and deviations.** [The indexed decision](../../decisions/2026-09-task-delete-recovery-feedback.md)
records why the cue describes a committed archive and conditions Undo on the latest step.
The store already reports a committed Task List archive truthfully when its quiet follow-up
read fails, so its return type did not change. Diff review added cue withdrawal after
Restore; an initial touch test found the existing quick-create drawer over the row at
375 px, so the journey closes it before tapping Delete. That friction is
[recorded](../../../.prototype/notes.json) for Slice 46 finding 11. No gateway, contract,
domain, history or MCP change was needed.

**Verification and limits.** `pnpm --filter web test --include
src/app/features/projects/sections/tasks/task-list-section.spec.ts --include
src/app/features/projects/pages/todos-page.spec.ts` passed 39 tests. `pnpm test`,
`pnpm lint` and `pnpm docs:check` passed after implementation.
`pnpm --filter @cwm/e2e exec playwright test row-history.spec.ts todos.spec.ts`
passed 12/12 in Chromium with Playwright's separate web and host servers and isolated
`nested-projects` seeds. A first phone touch run timed out because quick create opened
the details drawer over Delete; closing that existing drawer made the final 12/12 run
green. No new MCP tool was applicable. The details drawer overlap at phone width remains
for the planned global phone-layout work; the focused browser test uses its existing
Close control. No other open product question arose.

**Documentation.** Corrected specification §§26 and 34, the tasks/projects/testing
architecture folders, the indexed decision and the Slice 46 finding ledger. The next
bounded phase is finding 11's phone navigation/layout; findings 12–14 remain for Slice
46's final reconciliation.
