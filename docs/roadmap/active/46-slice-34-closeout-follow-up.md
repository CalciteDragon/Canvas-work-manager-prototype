<!-- plan id="46" status="active" summary="Integrate follow-up evidence and close the Slice 34 umbrella after bounded repair slices" -->
# Slice 46 — Slice 34 close-out follow-up

## Goal

Close the 2026-09-27 review findings against [Slice 34](../planned/34-undo-redo-and-archive.md) after bounded implementation slices provide the missing behavior and evidence.

## Spec sections

§§8–15 (boundaries and persistence), §§19–23 (state and shell), §§26–34 and 36 (history and recovery), §45 (Clock), §§53–54 and 59–63 (permissions, MCP and failures), §§68–70 and 77–80 (routes, verification, decisions and scope).

## Build

The findings below are the follow-up ledger, not one implementation phase. [Slice 47](../completed/47-archive-recovery-state-and-focus.md) closed 1–2 (its recovery-focus friction remains for later recovery UX work). [Slice 48](../completed/48-task-history-under-archived-sections.md) closed 3 and left two history/service divergences for this umbrella to route (`note-2026-09-28-002`). [Slice 49](../completed/49-task-history-service-and-mcp-repairs.md) routed those; [Slice 50](../completed/50-fault-sensitivity-evidence.md) closed 4 and [Slice 51](../completed/51-web-storage-isolation-and-no-op-sensitivity.md) proved its remaining no-op assertions. Give 3–11 bounded implementing slices, one active at a time; then activate this umbrella only for final evidence and documentation reconciliation. Preserve the delivered history model and use current code and decisions when each candidate is activated.

1. **Root Archive stale Restore:** keep a failed-refresh error and write block until a current projection read succeeds; cover quiet live refresh, Retry, and stale project status. Slice 47.
2. **Settings focus:** after a restored row disappears, focus the next enabled status selector or heading; preserve focus moved during the request. Cover remaining rows, revealed child, last row and failed refresh. Slice 47.
3. **Task history under archived sections:** decide and index the container rule first, then test exact-state Undo/Redo refusal and recovery in both directions. Preserve Delete/Restore inverses and project exceptions. [Slice 48](../completed/48-task-history-under-archived-sections.md). [Slice 49](../completed/49-task-history-service-and-mcp-repairs.md) closes the two task service/history divergences and MCP refusal wording found during Slice 48 real use.
4. **Test sensitivity:** separately inject a missing reflection grant check and a fake task no-op receipt, prove the existing assertions detect each, revert the faults and record exact results. [Slice 50](../completed/50-fault-sensitivity-evidence.md); [Slice 51](../completed/51-web-storage-isolation-and-no-op-sensitivity.md).
5. **MCP failure paths:** [Slice 52](../completed/52-mcp-transport-failure-evidence.md) closes this finding. SDK-driven HTTP and stdio tests prove failed task and Undo commits preserve canonical business/history/Activity state and bytes; HTTP delivers no frame. Successful retry lands once. When a committed Undo's response is lost, a same-file reconnect's old-revision retry refuses with the advanced revision, an independent history read offers Redo, and no second Activity or HTTP frame appears.
6. **Stdio expiry:** [Slice 53](../completed/53-stdio-expiry-and-durable-recovery.md) closes this finding. A real SDK stdio client sees removal Undo before the exact receipt expiry, then `history_expired:` with no settled file, history or Activity change. Sequential children on the same isolated file keep the rich-text section in Archive, restore its original id and prose through `restore_section`, and read both Activity events through `ActivityService` after restart.
7. **Concurrent writers:** closed by [Slice 54](../completed/54-data-file-ownership.md) and [its decision](../../decisions/2026-09-one-writer-per-data-file.md). Every canonical JSON writer takes turns through an advisory owner record: the host for its lifetime, stdio per call, and the seed, reset, upgrade and e2e writers around their write. Spawned-process evidence covers HTTP plus stdio, two stdio processes, independent files, release, hard-kill reclaim and the CLIs. Shared browser and agent work stays on HTTP MCP.
8. **Section labels:** [Slice 55](../completed/55-section-history-labels.md) closed this finding. Domain receipts and summaries now name single-field rename, Rich Text prose, collapse/expand and resize; combined edits keep one general action, and normalized no-ops keep no action. The `nested-projects` browser journeys prove exact header Undo/Redo names, reload, keyboard and pointer resize in Flow and Grid.
9. **Descendant history discovery:** [Slice 56](../completed/56-descendant-history-discovery.md) closed this finding. Root Todos and Archive link a descendant row to its owner's existing header controls. The isolated browser journey verifies click, Enter, reload, labeled-group focus, child Undo/Redo with the root revision unchanged, another browser persona's unavailable project and a same-workspace MCP agent's empty separate history; focused component tests cover the row kinds and navigation races.
10. **Delete feedback:** [Slice 57](../completed/57-task-delete-recovery-feedback.md) closes this finding. Task List and Todos announce committed archive outside removed rows, point to root Archive and the owning header, withdraw after restore or context change, and retain failure/focus behavior. Focused component and browser journeys cover permission/transport refusal, last row, descendant owner, header Undo, Archive Restore, disabled Archive enable/Retry, keyboard, touch and 375 px themes. The phone drawer overlap found in use remains with finding 11.
11. **Phone layout:** [Slice 58](../completed/58-phone-navigation-layout.md) closes this finding. Below 48rem the global sidebar is a modal drawer with a focus trap, Escape/backdrop/Close returning to Menu, link and create choices closing to the workspace, and resize resetting it with focus kept; a narrow project-column choice re-collapses the column and focuses its toggle across reloads; a narrow Task List stacks its details drawer so Delete stays tappable. `apps/e2e/phone-layout.spec.ts` covers touch, keyboard, both themes, overflow on five pages and a separate resize context.
12. **Drift:** correct MCP transport's family count to six including `project`; reconcile Slice 34's 1 MB text with the 1050 kB decision and 850 kB warning; date its delivered/follow-up opening status.
13. **Living documentation:** update touched architecture, spec, indexed decisions and guides with each implementation. Keep completed records frozen and use dated addenda for historical corrections.
14. **Umbrella lifecycle:** assemble evidence from Slices 35–45 and every follow-up, write the Outcome, move Slice 34 through the supported roadmap lifecycle to completed with one active record at a time, repair inbound links, update goals and regenerate the board.

## Done when

- Findings 1–14 each have linked test, journey or documentation/decision evidence; no unresolved finding hides behind Slice 45's earlier closure claim. UI failures are reproduced and fixed; container policy has exact tests and an indexed decision.
- Deliberate faults are detected and reverted; both MCP transports prove commit and lost-response behavior; stdio proves expiry and durable recovery; concurrent writers are refused without lost data. Recovery UX works with keyboard/touch, both themes, reload and relevant personas, without cross-actor history leaks or duplicate Undo surfaces.
- Run `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`, `pnpm docs:api`, `pnpm storybook:build`, `pnpm e2e`, and all four host acceptance scripts. Record the initial bundle against 1050 kB. Use isolated `personal-workspace`, `nested-projects` and `agent-heavy` data, real browser/MCP journeys and `.prototype/notes.json` friction. Review each implementing diff and report any agreed limit explicitly.
- Complete this plan and Slice 34 sequentially, with accurate outcomes and no stale planned-work links.

## Do not

- Implement all findings as one phase or mark either umbrella complete before evidence exists.
- Add merged/cross-user history, a history browser, permanent deletion, new archive storage, a generic fault framework, production storage/locking or another bundle-budget increase.
- Add domain infrastructure dependencies, concrete gateways in components, core-to-feature/prototype edges or duplicate contracts; change the injected Clock or UnitOfWork boundaries.
- Rewrite Slice 45 to imply these gaps were already closed, or reset personal runtime data for tests.

## Acceptance check

1. Make an evidence ledger in this plan with one row for each finding 1–14. For 1–11, link the completed repair record, the exact test or browser/MCP journey, and any indexed decision. Separately crosswalk every row of Slice 34's coverage matrix and each of its seven acceptance steps to named existing domain tests plus browser or MCP evidence (or a fresh run where evidence is missing). Include exact returned IDs, failure paths and permission paths where the source gate asks for them. Mark a limit as a limit; do not turn the earlier Slice 45 claim into evidence. For 12–14, link the corrected document or lifecycle result. Verify both ledgers against current files, not only the completed records' prose.
2. Correct `docs/architecture/prototype-host/mcp-transport/how.md` to name all six discovery families including `project`. Confirm the exact six-key map in `handler.test.ts` and `stdio.test.ts` and the registry declaration before editing prose. Correct Slice 34's budget instruction to the current 850 kB warning and 1050 kB error decision; add a dated status amendment that distinguishes delivered Stages A–E, the review follow-ups, and this final close-out. Do not rewrite historical stage claims.
3. Audit the main spec, affected architecture folders, decisions index, README and MCP guide against the evidence ledger. Change a living page only for a demonstrated stale statement. Add an indexed decision only if this phase actually answers a new product question; do not invent one for link maintenance. Keep completed records' outcome prose intact, changing only link targets that would otherwise break when the umbrella files move.
4. Run `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`, `pnpm docs:api`, `pnpm storybook:build`, `pnpm e2e`, and `pnpm --filter @cwm/prototype-host` with each of `acceptance`, `agent-acceptance`, `mcp-acceptance`, `live-acceptance`. Record command result and the production initial bundle in kB against 1050 kB (and its 850 kB warning). Re-run a failed gate after a relevant repair; report an environmental limit without claiming it passed.
5. In isolated data, use `personal-workspace`, `nested-projects` and `agent-heavy` through the browser and real MCP clients. Exercise one representative history and Archive path for a person and an agent, including the separate actor history, recovery after reload or reconnect, 375 px keyboard/touch access and both themes. This fresh use supplements the full Slice 34 crosswalk in step 1; it does not replace any of its seven acceptance steps. Check that the canonical file and Activity agree. Record any friction in `.prototype/notes.json`; do not reset personal data or reuse the user's running host. Review the actual documentation diff and link migration, then recheck after corrections.
6. Write this plan's Outcome, complete Slice 46, start Slice 34 as the only active plan, write its final Outcome and complete it. Update all inbound documentation links for both moves, `goals.md`, and the generated board. Run `pnpm docs:check` and `pnpm lint` after the final move; both umbrella records must appear as completed and no link may point to their old locations.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `docs/roadmap/active/46-slice-34-closeout-follow-up.md` → `completed/46-slice-34-closeout-follow-up.md` | modify, then move | Evidence ledger, review revisions, outcome and closure record. |
| `docs/roadmap/planned/34-undo-redo-and-archive.md` → `active/` → `completed/34-undo-redo-and-archive.md` | modify, then move | Correct current budget/status wording, add final outcome, close through the supported lifecycle. |
| `docs/architecture/prototype-host/mcp-transport/how.md` | modify | Correct six-family discovery prose against the transport tests. |
| `docs/roadmap/goals.md` | modify | State the active phase now and the completed direction after closure; update umbrella links. |
| `docs/roadmap/progress.md` | regenerate | Roadmap script owns both lifecycle transitions. |
| `docs/documentation-protocol.md` | modify | State the narrow link-maintenance exception for roadmap moves without allowing historical prose edits. |
| `docs/roadmap/completed/{35-operation-history-foundation,36-task-and-reflection-history,37-section-and-shortcut-history,38-optional-page-history,42-project-creation-history,43-one-step-removal-and-task-delete,44-actionable-archive-and-archived-projects,45-undo-redo-archive-integrated-closure}.md` | retarget links only | Keep references to Slice 34 valid after its move; leave outcomes and claims untouched. |
| `docs/roadmap/completed/{48-task-history-under-archived-sections,49-task-history-service-and-mcp-repairs,50-fault-sensitivity-evidence,51-web-storage-isolation-and-no-op-sensitivity,52-mcp-transport-failure-evidence,53-stdio-expiry-and-durable-recovery,54-data-file-ownership,55-section-history-labels,56-descendant-history-discovery,57-task-delete-recovery-feedback,58-phone-navigation-layout}.md` | retarget links only | Keep references to Slice 46 valid after its move; leave outcomes and claims untouched. |
| `docs/decisions/2026-09-disposable-removal-and-immediate-undo.md`, `docs/decisions/2026-09-history-stage-a-deferrals.md` | retarget links only | Keep historical decision references to Slice 34 valid. |

The audit in acceptance step 3 may reveal another stale living page. Add its exact path to this list and record why before editing it. No production file, contract, test, seed or migration is planned.

## Test plan — tests first

| Check | Proves |
|---|---|
| `apps/prototype-host/mcp/handler.test.ts`: exact Undo/Redo discovery map | Streamable HTTP publishes all six families and no static grant key for a history transition. |
| `apps/prototype-host/mcp/stdio.test.ts`: exact Undo/Redo discovery map | Stdio publishes the same six-family declaration. |
| `scripts/check-docs.test.mjs` and `node scripts/roadmap.mjs check` | The completed move cannot leave invalid roadmap markers or broken documentation links. |
| Existing domain, host, web and E2E cases named in the ledger | Each finding's behavior remains observable at the layer that can prove it. |

Read and run the existing focused checks before changing factual prose. This is an evidence and documentation phase: there is no behavior change to drive with a new failing product test. If the audit finds a behavior defect or an unproved acceptance path, stop closure, create a bounded repair slice with a failing test first, and return to this umbrella afterward.

## Boundaries touched

- **Transport and domain:** Documentation only; the MCP tool registry remains transport-free, tools still call domain services, and no new domain dependency or contract is introduced.
- **Web gateway, core and styling:** Browser journeys observe existing UI. No component or adapter edit is planned, so the gateway, core/prototype and design-token boundaries stay intact.
- **Persistence and clock:** Use isolated seed files and the existing acceptance harnesses. Never reset `.prototype/data.json`; do not alter the injected `Clock`, unit of work or one-writer rule.
- **Documentation:** Preserve completed outcomes and decisions as historical evidence. Retarget links when files move; amend current living prose only where contradicted by current code or the recorded decision.

## Explicit non-goals

- The `Do not` list above applies in full. No new product behavior, test framework, endpoint, schema or bundle-budget change belongs in this umbrella.
- Recovery-focus friction left by Slice 47 and later per-entry history-display friction are candidates for later UX work, not claims of finding 1–11 reopening. If real use shows a blocker to the written acceptance check, record it and route a bounded repair before closure.
- No broad rewriting of the main spec, architecture tree, guides, completed records or decisions merely to make the ledger read more smoothly.

## Open questions

- None that blocks planning. The current six-family map and bundle thresholds are settled in tests and the indexed budget decision. Whether real use exposes a new blocking defect is decided from the acceptance run; a defect requires a bounded repair slice before either umbrella closes.

## Revisions

- **Round 1 (2026-09-29):** Review found that a 14-finding ledger plus a representative fresh journey could close Slice 34 without demonstrating its independent seven-step gate and every coverage row. Added a separate exact-evidence crosswalk and made the fresh journey supplemental.
- **Round 2 (2026-09-29):** Review found that the plan's mechanical link migration conflicted with the protocol's unqualified append-only rule. Clarified the narrow exception for relative link targets after roadmap moves, while keeping claims, labels and surrounding prose frozen; made that protocol edit a required file change.
- **Round 3 (2026-09-29):** Reviewer rechecked the revised plan and protocol, and reported no remaining substantive findings. The final link audit also kept historical inline path examples unchanged while retargeting only live Markdown links.
