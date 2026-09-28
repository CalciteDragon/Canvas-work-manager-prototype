<!-- plan id="49" status="active" summary="Align archived-section reparent and archived-task completion rules with history; give MCP conflicts plain-language repair steps" -->
# Slice 49 — Task history, service and MCP refusal repairs

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Close Slice 48's two task service/history divergences and make MCP history conflicts state their typed repair in plain words.

## Spec sections

§31 (archived sections freeze row writes and history refuses without writing); §§33–34 (task nesting, completion stamps and archive); §45 (Clock); §§54, 59–60 (history tools, text-only MCP errors and contract checks); §§77–79 (corrected intent, indexed decisions and real use).

## Build

This bounded [Slice 46](../planned/46-slice-34-closeout-follow-up.md) repair addresses `note-2026-09-28-002` and the MCP wording part of `note-2026-09-28-001`.

- **Service:** In `TaskService.update`, when a subtask follows its parent into a different section, reject an archived parent section before checking its page. Name the section and say to restore it first. Keep the current-section, live-row/archived-parent and disabled-page rules. An independently archived row may still reparent under an archived parent in a *live* section, with `tasks.write` alone.
- **History:** In `writeTaskUpdate`, refuse if the directional target status is `done`, current status differs, and the current task is archived. Add `rowConflict('task', id, 'archived-subject', taskLabel(current, id))` after existing field/structural checks but **before** `sectionConflicts` and before any write. Leaving `done` remains allowed for an archived task **in a live section**. **Deduplication choice:** a row cascaded by its section (`archivedWithSectionId` set) receives only the existing section conflict: restoring that section revives both. An independently archived row in a live section receives only the task conflict; if its section is also archived, report task then section because two Restores are needed. A child cascaded by its archived parent (`archivedWithTaskId` set) still gets the child task conflict, as the user specified; restore the parent first to revive the child, then retry. Preserve all typed lists, no-write and still-next behavior.
- **MCP text:** `refuseOnConflicts` appends plain words selected exhaustively from `UndoConflict.nextStep` to each displayed conflict. Keep the problem token, entity, title, id, first-five cap, `and N more` tail and leading reason prefix supplied by `errors.ts`. For a **repairable** list, mapping: `move-back-and-retry` → “move it back, then retry”; `restore-state-and-retry` → “restore its previous state, then retry”; `restore-or-move-dependent-and-retry` → “restore or move the dependent, then retry”; `remove-reference-and-retry` → “remove the reference, then retry”; `change-by-hand` → “make the change by hand”; `change-by-hand-or-archive` → “make the change by hand or check Archive”. The two “nothing” values need the conflict's **typed problem** too: `nothing-to-undo` + `missing` → “restore the missing item, then retry”; + `not-archived` → “return it to its recorded archived state, then retry”; `nothing-to-restore` + `missing` → “restore the missing item, then retry”; + `already-exists` → “free the recorded id, then retry”. **Retirement overrides retry wording for the whole list:** compute `willRetire = conflicts.some(permanent)` once from the existing predicate. When true, each displayed conflict still gets its typed guidance but no “then retry”; the “nothing” pairings describe the current state (“missing”, “already live”, “recorded id occupied”), and the sentence points to the refreshed history because this action retires. This avoids promising a retry for a permanent section conflict, even when another conflict in the same list would otherwise be repairable. The `OperationHistoryService` still selects `history_conflict:` versus `history_retired:` and owns retirement. The shared formatter serves page, project, section-edit/removal/restore, shortcut, task and reflection executors (reflection through `refuseRow`). The header renders typed conflicts in `history-feedback.ts`, so its copy stays as is.
- **Living record:** Create separate §78 entries for the reparent rule, archived completion history (including the deduplication choice) and MCP wording. Append dated amendments to the Slice 48 and task-status decisions, amend the now-stale Slice 48 spec sentence and rename its “history stricter” test. Update architecture, MCP guide, Slice 46 ledger, goals and friction-note statuses during implementation.

## Done when

- Ordinary reparent to an archived parent section refuses with a readable `DomainRuleError`, leaves the snapshot unchanged and succeeds after Restore; preserved live-target and permission-only paths pass.
- Completion Redo and reopen Undo refuse with exactly `[task archived-subject]` for an independently archived task or a child archived through its parent in a live section, exactly `[section archived-subject]` for a section-cascaded row, and exactly `[task archived-subject, section archived-subject]` when both independent row and section need restoring. A simultaneous later status edit gives `[task field-changed, task archived-subject]`. Each repair permits the same action with exact `status`/`completedAt` and one Activity event when no independent field conflict remains; parent-cascaded child repair restores its parent first. An archived task may leave `done` while its section is live.
- Every `UndoConflictNextStep` has plain words in shared refusal text. `history_conflict:` gives repair and retry guidance; `history_retired:` names the current blockers and sends the caller to refreshed history without promising a retry of the retired action. Both keep their leading token, show at most five conflicts plus the remaining count, and leave the typed payload and browser header copy unchanged.
- `pnpm test`, `pnpm lint`, `pnpm docs:check` and one isolated `nested-projects` HTTP MCP refusal/Restore/retry journey pass. Record friction honestly.

## Do not

- No contract, conflict-vocabulary or history-summary change, per-entry header blocker, section project/page label, Add/Delete/Restore executor change or project-only exception change.
- Leave `note-2026-09-28-001`'s other two items and Slice 46 findings 4–14 for their own slices. No personal-data reset, new service edge, `new Date()` in domain or §80 infrastructure.

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

1. **Red first:** Add the named tests below. Before production edits, run `pnpm --filter @cwm/domain exec vitest run src/task-service.test.ts src/row-history.test.ts src/operation-execution.test.ts src/operation-history-service.test.ts` and `pnpm --filter @cwm/mcp-tools exec vitest run src/contract.test.ts`. Record actual failures caused by a resolved forbidden write or missing words, not a typo/fixture failure; preservation tests should pass already.
2. **Focused green:** Implement the three repairs and rerun those commands. For task history, assert exact ordered typed conflicts, unchanged `store.snapshot()` including revision/cursor and Activity, same action next in the refusal summary, then exact task and one event after B's Restore and retry. For the service, assert `DomainRuleError` (rather than commit-time integrity failure), section id and restore guidance, no write, and recovery. For text, test all eight enum cases, cap and tail, `history_conflict:` with retry words and `history_retired:` without them. Retirement assertions verify the existing retirement-only state change rather than requiring an unchanged history snapshot.
3. **Whole suite and review:** Run `pnpm test`, `pnpm lint`, `pnpm docs:check`. Search domain, MCP, host, e2e and all four host acceptance scripts for refusal-message matches; update affected assertions only. Confirm `history-feedback.ts` uses typed `conflicts`, not the server message. Complete the AGENTS.md Step 4 review and real-use checks when implementing.
4. **HTTP MCP real use:** Copy `nested-projects` into a scratch `CWM_DATA_FILE`. Authenticate with bearer token `prototype-user-a-readwrite` (the resulting connection id is `agent-claude`; `packages/prototype-data/src/agent-tokens.ts`). Start `pnpm --filter @cwm/prototype-host start`; Slice 48's preview launcher needed a temporary `.claude/launch.json` entry using `cmd /c "set CWM_DATA_FILE=<scratch>&& pnpm --filter @cwm/prototype-host start"`, removed after use. Actor A completes a task via `complete_task`, then Undoes. Actor B, on a separate connection or in the browser, archives it. A's Redo returns `history_conflict:` naming the task and “restore its previous state, then retry”; `get_operation_history` keeps the same Redo and revision. B restores the task; A's Redo succeeds with `done` and `completedAt`. Log friction in `.prototype/notes.json`; never use personal runtime data.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/task-service.test.ts` | modify | Red/green archived-target reparent, no-write and permission-only/live-target preservation. |
| `packages/domain/src/row-history.test.ts` | modify | Directional completion/reopen exact lists and recovery; allowed leaving done; rename the stale Slice 48 “stricter” case, whose live-target setup stays valid. |
| `packages/domain/src/operation-execution.test.ts` | create | Exhaustive wording matrix including all reachable “nothing”/problem pairings, repairable vs permanent/mixed lists, and five-conflict cap/tail, with typed payload intact. |
| `packages/domain/src/operation-history-service.test.ts` | modify | Assert a repairable row refusal keeps `history_conflict:`/retry words while permanent section removal `not-archived` and `already-exists` refusals keep `history_retired:` without retry advice. |
| `packages/mcp-tools/src/contract.test.ts` | modify | Assert an archived-section and archived-task refusal include repair words, token and recovery. |
| `packages/domain/src/task-service.ts` | modify | Reject archived reparent target section before writable-page check; correct related comment. |
| `packages/domain/src/task-history.ts` | modify | Directional entering-done guard with cascaded-section deduplication and doc comment. |
| `packages/domain/src/operation-execution.ts` | modify | Exhaustive `nextStep`-to-words formatter in shared conflict refusal. |
| `packages/mcp-tools/src/tools/undo.ts` | modify | Tell agents conflict text includes the repair in words. |
| `docs/decisions/2026-09-task-reparent-archived-section.md` | create | §78 ordinary reparent destination answer. |
| `docs/decisions/2026-09-archived-task-completion-history.md` | create | §78 entering-done answer and cascade deduplication choice. |
| `docs/decisions/2026-09-mcp-history-conflict-guidance.md` | create | §78 text-only agent guidance answer. |
| `docs/decisions/2026-09-task-history-under-archived-sections.md` | append | Dated amendment retiring “history stricter than service”, leaving original record intact. |
| `docs/decisions/2026-08-task-status-transitions-and-archive.md` | append | Dated amendment applying archived-completion rule to history. |
| `docs/decisions/2026-09-row-operation-history.md` | append | Dated amendment linking the new completion-history rule. |
| `docs/decisions/README.md` | modify | Index three entries and update amended statuses. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | Correct §31 Slice 48 sentence, state completion-history rule and clarify §54 text guidance. |
| `docs/architecture/domain/how.md` | modify | Service target, history status guard and shared refusal format. |
| `docs/architecture/domain/why.md` | modify | Link new domain and formatter decisions; remove stale “stricter” claim. |
| `docs/architecture/mcp-tools/how.md` | modify | Describe conflict words and cap without a registry-shape change. |
| `docs/architecture/mcp-tools/why.md` | modify | Link MCP guidance decision. |
| `docs/architecture/testing/what.md` | modify | Inventory service, history, formatter and registry evidence. |
| `docs/guides/mcp-setup.md` | modify | Explain the text itself gives a repair. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | Set `CURRENT_SLICE = 49` at implementation start. |
| `.prototype/notes.json` | modify | Record real-use friction; append dated resolution text and Slice 49 link to notes `-001` and `-002`, preserving original observations and the existing note shape. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md` | modify | Link Slice 49 as bounded follow-up to finding 3, or add bounded 3a–3c ledger items. |
| `docs/roadmap/goals.md` | modify | Track this bounded repair and its eventual result. |
| `docs/roadmap/active/49-task-history-service-and-mcp-repairs.md` | modify | Review rounds now; Step 3–5 evidence/Outcome only when implemented. |
| `docs/roadmap/progress.md` | generated | `roadmap.mjs new/start` regenerated the active board; complete regenerates it again. |

## Test plan — tests first

`A` owns the task action; `B` archives/restores in a separate history. Use explicit task-list sections and a live filler when removal must retain a section. Tick the injected Clock before retry. The Slice 48 `refuses`/`recovers` helpers already check full snapshot, exact list, still-next action, task and one event.

| Test | Proves |
|---|---|
| `task-service.test.ts: archived child cannot follow archived parent into archived section` | Two sections, independently archived child/parent; refusal names target and restore, snapshot unchanged; succeeds after Restore. |
| `task-service.test.ts: tasks.write-only archived-row reparent to live section remains allowed` | No new `projects.read` need; existing live-row/archived-parent and current-section refusals remain. |
| `row-history.test.ts: completion Redo refuses independently archived task` | A completes and Undoes, B archives in live section; Redo gets `[task archived-subject]`, restores then succeeds with exact status/stamp. |
| `row-history.test.ts: reopen Undo refuses independently archived task` | A reopens done, B archives; Undo target done gets `[task archived-subject]`, then exact recovery. |
| `row-history.test.ts: archived task leaving done stays reversible` | Completion Undo or reopen Redo on an archived task in a **live** section does not gain a task conflict. |
| `row-history.test.ts: section cascade gets only its section conflict` | Slice 48 completion Redo and reopen Undo stay `[section archived-subject]`; one Restore repairs each. |
| `row-history.test.ts: independent row plus archived section names both` | Entering done gets `[task archived-subject, section archived-subject]`; section Restore leaves task conflict, task Restore permits retry. |
| `row-history.test.ts: archived parent cascade blocks child completion history` | B archives the live parent after A Undoes the child's completion; A's Redo gets exactly `[child task archived-subject]` with no write and still-next action. Direct child Restore is refused; B restores the parent, reviving the child, and A's same Redo succeeds with exact status/stamp and one event. |
| `row-history.test.ts: field changed before archived task conflict` | After A Undoes a completion, B changes status and archives in a live section; Redo gets `[task field-changed, task archived-subject]` in that order, writes nothing and remains next. |
| `row-history.test.ts: reparent Redo still refuses archived section` | Rename old case, retain setup and exact section list; service now agrees. |
| `operation-execution.test.ts: every nextStep has exact repair words` | Eight enum values plus reachable `missing`/`not-archived` with `nothing-to-undo` and `missing`/`already-exists` with `nothing-to-restore`; token/title/id and typed problem untouched. |
| `operation-execution.test.ts: retirement changes guidance for the whole list` | With a permanent predicate (including a mixed list), the typed guidance remains readable but no displayed conflict tells the caller to retry the retired action; the thrown `permanent` flag stays exact. |
| `operation-execution.test.ts: five shown, one counted` | Six typed conflicts remain in the error, text shows five and `and 1 more`. |
| `operation-history-service.test.ts: retired section conflicts do not promise a retry` | Existing `not-archived` Undo and occupied-id cases retain `history_retired:` with the advanced summary and no retry wording; a repairable missing/occupied row case keeps `history_conflict:` and retry words. |
| `contract.test.ts: agent sees repair words` | Actual history-tool archived section/task refusals start `history_conflict:` and permit restore/retry. |

## Boundaries touched

- `TaskService` keeps its existing acyclic `SectionService` edge and unchecked lookup; history uses repositories and `Clock` only, never another service, HTTP or MCP. No production `new Date()`.
- `UndoConflictNextStep` remains defined only in `packages/contracts`; the formatter consumes that type. No schema, summary, reason, result or grant change.
- MCP tools still call domain services and the transport forwards their text. The browser remains on gateway interfaces and typed conflict rendering, with no production web change.

## Explicit non-goals

- No project/page-qualified section label or per-entry header blocker (the other two `note-2026-09-28-001` items).
- No general browser-copy rewrite, MCP response field or transport wrapper; no project-family archive exception, retirement or disabled-page policy change; no Slice 46 finding 4–14 work.

## Open questions

- **Settled:** suppress the task conflict for a section-cascaded row, because section Restore is the single repair. Report both for an independently archived row under an archived section, which needs two Restores. A parent-cascaded child keeps the user-requested conflict on the child; its parent must be restored first. The decision will record these cases and the rejected duplicate-list option.
- No shape-changing question remains; the user supplied the other two rules and MCP wording goal.

## Revisions

- **Draft (2026-09-28):** Grounded in Slice 48's Outcome/decision, `TaskService.update`, `writeTaskUpdate`, `refuseOnConflicts`, all eight `UndoConflictNextStep` values, the header's typed `history-feedback.ts`, shared formatter callers, MCP registry/host assertions, four host acceptance scripts and the cited spec. `roadmap.mjs new` then `start` created active Slice 49 and regenerated the board.
- **Review round 1 (2026-09-28, cold subagent):** Three substantive findings accepted after checking the code. (1) `nothing-to-restore` also covers `already-exists`, where Archive guidance is misleading; both terminal messages are now neutral and the wording test includes an occupied-id case. (2) A simultaneous field conflict needed an exact ordering test; the plan now puts the new task conflict after existing row conflicts and before section conflicts, and pins `[field-changed, archived-subject]`. (3) “Leaving done” needed the live-section qualification because §31 freezes all updates under an archived section. My own pass also fixed the reversed task/section insertion order and a duplicate test-table header. No boundary or impossible-fixture finding.
- **Review round 2 (2026-09-28, fresh cold subagent):** Three substantive findings accepted after checking token mapping, task cascade/restore and conflict mappings. The real-use bearer is `prototype-user-a-readwrite`, producing connection `agent-claude`; the previous line would have sent the connection id as a token and received 401. A parent archive cascades to its child, whose direct Restore is refused until the parent returns; the plan now pins the child task conflict and parent-first recovery. “Nothing to undo/restore” can be repairable, so the formatter now uses `nextStep` plus `problem` to distinguish missing, not-archived and occupied-id states, with tests for all reachable pairings. It does not imply permanent retirement or direct agents to Archive for an occupied id.
- **Review round 3 (2026-09-28, fresh cold subagent):** One substantive finding accepted. `nothing-to-undo`/`not-archived` and `nothing-to-restore`/`already-exists` can be **permanent** for section removal, while the same pairings can be repairable elsewhere; `OperationHistoryService` appends retirement text to the former. The shared formatter already receives each executor's `permanent` predicate, so the plan now computes whole-list retirement before choosing words, suppresses retry promises for every conflict in a retiring list, and tests both real `history_retired:` and repairable `history_conflict:` paths. No other substantive gap reported.
- **Review round 4 (2026-09-28, fresh cold subagent):** **No substantive findings.** The reviewer traced every shared-formatter caller and permanent predicate, including a permanent conflict beyond the five displayed entries; confirmed the field/structural → archived task → current/target section order; and found the parent/section cascade, permission and recovery tests constructible. No revision was needed. The plan is ready for Step 3, which this planning request does not start.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

To be written after implementation and verification.
