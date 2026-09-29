<!-- plan id="46" status="planned" summary="Integrate follow-up evidence and close the Slice 34 umbrella after bounded repair slices" -->
# Slice 46 — Slice 34 close-out follow-up

## Goal

Close the 2026-09-27 review findings against [Slice 34](34-undo-redo-and-archive.md) after bounded implementation slices provide the missing behavior and evidence.

## Spec sections

§§8–15 (boundaries and persistence), §§19–23 (state and shell), §§26–34 and 36 (history and recovery), §45 (Clock), §§53–54 and 59–63 (permissions, MCP and failures), §§68–70 and 77–80 (routes, verification, decisions and scope).

## Build

The findings below are the follow-up ledger, not one implementation phase. [Slice 47](../completed/47-archive-recovery-state-and-focus.md) closed 1–2 (its recovery-focus friction remains for later recovery UX work). [Slice 48](../completed/48-task-history-under-archived-sections.md) closed 3 and left two history/service divergences for this umbrella to route (`note-2026-09-28-002`). [Slice 49](../completed/49-task-history-service-and-mcp-repairs.md) routed those; [Slice 50](../completed/50-fault-sensitivity-evidence.md) closed 4 and [Slice 51](../completed/51-web-storage-isolation-and-no-op-sensitivity.md) proved its remaining no-op assertions. Give 3–11 bounded implementing slices, one active at a time; then activate this umbrella only for final evidence and documentation reconciliation. Preserve the delivered history model and use current code and decisions when each candidate is activated.

1. **Root Archive stale Restore:** keep a failed-refresh error and write block until a current projection read succeeds; cover quiet live refresh, Retry, and stale project status. Slice 47.
2. **Settings focus:** after a restored row disappears, focus the next enabled status selector or heading; preserve focus moved during the request. Cover remaining rows, revealed child, last row and failed refresh. Slice 47.
3. **Task history under archived sections:** decide and index the container rule first, then test exact-state Undo/Redo refusal and recovery in both directions. Preserve Delete/Restore inverses and project exceptions. [Slice 48](../completed/48-task-history-under-archived-sections.md). [Slice 49](../completed/49-task-history-service-and-mcp-repairs.md) closes the two task service/history divergences and MCP refusal wording found during Slice 48 real use.
4. **Test sensitivity:** separately inject a missing reflection grant check and a fake task no-op receipt, prove the existing assertions detect each, revert the faults and record exact results. [Slice 50](../completed/50-fault-sensitivity-evidence.md); [Slice 51](../completed/51-web-storage-isolation-and-no-op-sensitivity.md).
5. **MCP failure paths:** [Slice 52](../completed/52-mcp-transport-failure-evidence.md) closes this finding. SDK-driven HTTP and stdio tests prove failed task and Undo commits preserve canonical business/history/Activity state and bytes; HTTP delivers no frame. Successful retry lands once. When a committed Undo's response is lost, a same-file reconnect's old-revision retry refuses with the advanced revision, an independent history read offers Redo, and no second Activity or HTTP frame appears.
6. **Stdio expiry:** [Slice 53](../active/53-stdio-expiry-and-durable-recovery.md) is the active plan to advance an injected Clock beyond 24 hours in an isolated process and prove history expiry, same-content Archive recovery, restart and retained Activity.
7. **Concurrent writers:** decide and index one-writer-per-canonical-JSON-path ownership. Verify HTTP plus stdio, two stdio processes, independent files, normal release, abnormal exit and all seed/reset/upgrade writers without lost data or unsafe lock stealing. Keep shared browser/agent work on HTTP MCP.
8. **Section labels:** derive rename, prose, collapse and resize labels from recorded changes; test combined wording, accessible controls and one action per committed gesture.
9. **Descendant history discovery:** persist an exact-actor route from root Todos/Archive to a descendant owner's existing history controls across reload, with separate cursors and no cross-actor leak.
10. **Delete feedback:** announce committed task Delete recovery through header Undo or Archive, with descendant owner guidance, across Task List/Todos, keyboard/touch, failure and navigation; keep the header as the only Undo action.
11. **Phone layout:** an accessible global-navigation drawer and usable project column at 375 px, including focus, Escape, route selection, desktop resize and both themes.
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
