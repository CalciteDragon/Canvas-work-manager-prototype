<!-- completed-record id="53" closed="2026-09-29" summary="SDK stdio proves 24-hour removal expiry, durable Archive Restore and Activity across restart" -->
# Slice 53 — Stdio expiry and durable Archive recovery

## Goal

Close [Slice 46 finding 6](../completed/46-slice-34-closeout-follow-up.md#build) with an isolated real stdio MCP client journey proving that a removal action expires while its retained content and Activity remain recoverable across process restart.

## Spec sections

Main specification §§14–15 (valid atomic JSON document), §27 (section content), §31 (24-hour per-action history and durable Archive Restore), §45 (injected Clock), §§53–54 and 59–60 (agent grants and SDK stdio tools), §§57 and 61–62 (retained Activity and typed history refusal), §§69–70 and 77 (executable evidence and real use). [Slice 34 acceptance step 7](../completed/34-undo-redo-and-archive.md#acceptance-check) and [Slice 45's stdio limit](../completed/45-undo-redo-archive-integrated-closure.md) identify the gap.

## Build

1. Drive production `startStdio` and its registry from a dedicated test child with one injected `SimulatedClock` shared by startup and every per-call `createApi`. Add only a host-local clock option to `StdioStartupHooks`; ordinary `pnpm mcp:stdio` keeps its current clock. The SDK test writes the newly returned removal receipt's exact `expiresAt` to a sidecar file outside canonical JSON. After the first `get_operation_history` call, the child reads that sidecar and advances the shared clock to `expiresAt + 1_000 ms`; reconnects initialize from that same sidecar. The child accepts only the sidecar path and mode as test arguments, not a public tool or production environment switch.
2. On a unique temporary `agent-heavy` JSON file, use the SDK client to create a rich-text section with nonempty prose, remove it, and capture the section id, content, receipt, history revision, Activity ids and archived marker. Before expiry, `get_operation_history` must offer the removal as Undo. Advance the child clock to `expiresAt + 1 second`, perform a read under that clock, and show the summary's Undo is unavailable.
3. Call `undo_operation` with the captured action and current revision. Assert an SDK `history_expired:` refusal naming the expiry; no section, history cursor/action state or Activity mutation, and no file-byte change after authentication has settled. `get_project_archive` must still list the same retained section with its original prose.
4. Close the child, restart on the **same file** with an injected clock still beyond expiry, and repeat the unavailable-history and present-Archive reads. `restore_section` must recover the same section id and prose through the canonical tool, record its own new action and one Activity event, and persist those results across a second reopen. After closing each child, reopen the file through the host's `createApi(...).activity.list` to prove the old removal event remains readable, not merely stored. Never run another writer on this file.
5. Reconcile the MCP transport/testing architecture descriptions, Slice 46 ledger and roadmap direction when the evidence lands. This planning commit does not claim the proof has shipped.

## Done when

- A real SDK stdio client observes the removal's Undo before expiry and `history_expired:` after the 24-hour boundary; the refusal changes no business row, history revision/action state or Activity.
- The same file reopened in a new stdio process still exposes the retained section through Archive; canonical Restore brings back the same id and prose, records exactly one new Activity event and a new Restore action, and survives another reopen. A host ActivityService read after each child closes returns the earlier removal event.
- Focused stdio tests, `pnpm test`, `pnpm lint`, `pnpm docs:check` and stdio MCP acceptance pass. Outcome records exact observed ids/counts and limits. No public protocol, contract, persistence or domain behavior changes.

## Do not

- Implement Slice 46 findings 7–14, including concurrent process ownership, labels, navigation, Delete or phone UI.
- Add a public stdio clock tool, runtime clock environment switch, new MCP transport or broad fault framework.
- Change 24-hour retention, convert Archive Restore to receipt-based recovery or erase historical Activity.
- Run the HTTP host or another stdio writer against this phase's test file, or reset personal `.prototype/data.json`.

## Acceptance check

1. Run baseline `pnpm --filter @cwm/prototype-host exec vitest run mcp/stdio.test.ts`; inspect existing HTTP and domain expiry cases. Give the new case its own temporary `agent-heavy` file and SDK client.
2. Create rich-text prose and remove its section over stdio. Record exact `section.id`, `config.text`, removal `operation` (`historyId`, `actionId`, `revision`, `expiresAt`), archived marker and Activity ids. Show `get_operation_history.undo.actionId` equals the removal before the clock move.
3. Write that receipt's `expiresAt` to a sidecar in the test's temporary directory. The child reads it in `afterCall` after serving the first `get_operation_history`, so the returned summary proves availability before its clock moves to `expiresAt + 1_000 ms`. Warm authentication at the advanced time; prove a second read leaves `lastUsedAt` unchanged before taking the refusal baseline. Show `get_operation_history.undo: null`, then call `undo_operation` with the original action and current revision. Require `history_expired:` and the expiry timestamp in MCP text; unchanged archive status, history revision/action state, Activity ids and bytes after the settled baseline. A clock or auth touch is not counted as a transition.
4. Read `get_project_archive` for the same id and prose, close the first child, and use `createApi(await loadPersistence(path)).activity.list` to read the removal event with its actor and entity identity. Restart stdio on that same file with the clock beyond expiry; warm authentication before byte comparisons. Confirm Undo remains unavailable, Archive still contains the section and all earlier Activity ids remain. Invoke `restore_section`; assert same id and prose, no archive marker, one new `section.restore` action/receipt and one new Activity id. Close that child, read both events through ActivityService, then reopen stdio once more and assert the restored section, action and events persist.
5. If the new test passes without a production change, temporarily omit the injected clock on per-call `createApi`, show the named expiry assertion fails for the intended reason, revert it and confirm no fault diff remains. Run focused tests, `pnpm test`, `pnpm lint`, `pnpm docs:check`, and `pnpm --filter @cwm/prototype-host mcp-acceptance`. For real use, run the SDK journey on isolated `agent-heavy`, set `CURRENT_SLICE = 53`, and record observed friction in `.prototype/notes.json` if any. Capture exact command results in Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/prototype-host/mcp/stdio.ts` | modify | Add optional shared `SimulatedClock` to host-local startup hooks and pass it to startup and per-call `createApi`; preserve ordinary execution and turn serialization. |
| `apps/prototype-host/mcp/test/clock-stdio.ts` | create | Test-only child supplying the shared clock, reading the receipt expiry from a sidecar after the selected read, and starting advanced on reconnect. |
| `apps/prototype-host/mcp/stdio.test.ts` | modify | SDK expiry, refusal, Archive Restore, Activity and same-file restart assertions. |
| `docs/architecture/prototype-host/mcp-transport/overview.md`, `how.md`, `what.md`, `why.md` | modify as needed | Describe actual clock seam and verified stdio expiry without implying a public rig control. |
| `docs/architecture/testing/what.md`, `how.md` | modify | Update the acceptance matrix row that currently marks post-expiry Archive Restore as HTTP only, and locate stdio expiry/restart evidence. Check `overview.md` and `why.md` against the diff; edit only if their descriptions change. |
| `docs/guides/mcp-setup.md` | modify only if needed | Clarify expired removal refusal and Archive recovery for stdio users if omitted. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify when implementing | Set `CURRENT_SLICE = 53` for real-use notes. |
| `.prototype/notes.json` | modify only for observed friction | Record actual use, never synthetic planning notes. |
| `docs/roadmap/active/53-stdio-expiry-and-durable-recovery.md` → `completed/` | modify, move on closure | Record reviews, tested Outcome and lifecycle. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md` | modify on closure | Link finding 6 evidence while preserving findings 7–14. |
| `docs/roadmap/progress.md` | generated | Keep status board synchronized via `roadmap.mjs`. |

No domain, repository or contract file is planned. If the journey reveals a behavior defect, revise this list before the test-driven fix; update that system's architecture docs and an indexed decision if product intent changes.

## Test plan — tests first

| Test | Proves |
|---|---|
| `mcp/stdio.test.ts`: SDK removal offered before injected-clock expiry | Receipt and exact actor/project history are connected over stdio. |
| `mcp/stdio.test.ts`: SDK expired removal refuses without write | The same action becomes unavailable after 24 hours; refusal preserves rows, cursor/action, Activity and settled bytes. |
| `mcp/stdio.test.ts`: retained Archive restores after stdio restart | Expiry does not erase prose or Activity; canonical Restore returns the same content, records once and persists. |
| Temporary targeted fault: omit injected clock on per-call API creation | The expiry assertion detects missing clock wiring rather than passing through fixture setup. |

## Boundaries touched

- The stdio adapter remains an SDK wrapper over `ToolRegistry`; registry tools call domain services, never repositories. The test child composes the host's startup hook, and production keeps its ordinary `SimulatedClock` through `createApi`.
- Domain time still comes solely from injected `Clock`. The isolated child advances it; no persisted timestamp edit, domain `new Date()` or second expiry rule.
- One process writes the unique JSON file at a time; sequential reconnects avoid Slice 46 finding 7's unresolved ownership hazard. Authentication may touch `lastUsedAt`, so byte equality follows that independent write.
- Contracts remain single-source. Browser and gateway boundaries are untouched except the dev-panel slice number for real-use notes.

## Explicit non-goals

- HTTP expiry proof: Slice 45 already has it; this phase closes only stdio evidence.
- Cross-process locking, retry caching, pruning/cap tests, or every history family: lower layers test retention/pruning; rich-text section removal is the representative durable Archive case.
- A new product decision unless the test disproves current behavior. Pure verification belongs in Outcome and architecture/testing docs.

## Open questions

- None blocking. Use the smallest test-child control that advances the shared clock after the pre-expiry summary and initializes the advanced time after restart. Do not expose it to ordinary stdio clients.

## Revisions

- **Initial plan (2026-09-28):** Scoped Slice 46 finding 6 to one SDK stdio journey, separated clock movement from file mutation, and made restart, same content and retained Activity explicit.
- **Review round 1 (2026-09-28):** Corrected the governing spec from §34 to §§27 and 31; added an ActivityService read on reopened files because stored ids alone do not prove the feed remains readable; made the testing matrix's HTTP-only expiry row a required update.
- **Review round 2 (2026-09-28):** Specified a test-only sidecar carrying the exact new receipt's expiry. The child reads it after the first pre-expiry summary and on restart, so the clock advance has a deterministic source and cannot select an unrelated seeded action.
- **Review round 3 (2026-09-28):** Reviewer found no substantive issue after checking the clock sidecar, sequential ActivityService reads, required testing matrix update and file list against the code.
- **Diff review round 1 (2026-09-28):** Independent correctness review found that advancing to a receipt expiry alone would not detect a changed 24-hour lifetime. Added an exact `86_400_000` ms receipt interval assertion and tied the pre-expiry summary to its history id and revision. Independent boundary/documentation review found the `StdioStartupHooks` inventory row omitted the new clock seam; corrected it.
- **Diff review round 2 (2026-09-28):** Both reviewers re-read the updated diff and reported no remaining substantive correctness, boundary or living-documentation findings.

## Outcome

The SDK stdio client now drives one isolated `agent-heavy` file through rich-text creation, retained removal, expiry, refusal, Archive Restore and two sequential process restarts. `startStdio` accepts an optional host-local `SimulatedClock` used at startup and on every per-call API. A test-only child advances that clock from the exact receipt expiry in a sidecar. Ordinary `pnpm mcp:stdio` has no new control or changed protocol. The test warms authentication before its refusal byte baseline, reads the old Activity event through a reopened host `ActivityService` after each child closes, and proves Restore creates exactly one new event and one new action. The existing MCP setup guide already explains `history_expired:` and receipt-free Archive Restore. Transport and testing architecture, the Slice 46 ledger and roadmap direction now cite the stdio evidence; `CURRENT_SLICE` is 53.

In one observed focused run, section `section-ac5e9eda` kept the exact prose after its removal receipt (`history-f096598d`, action `operation-7fba1ac7`, revision 2, expiry `2026-09-30T06:13:07.492Z`) stopped offering Undo. The refusal left settled bytes, row, history and Activity unchanged. Removal event `activity-9b889c54` stayed readable. Canonical Restore returned the same section id and prose, created action `operation-1413d595` and event `activity-5c623543`, and both events were readable after closing the second and third child. The final file held 11 Activity events and one operation action: the next write pruned expired actions, while their Activity remained. These randomly generated ids are observed evidence from that run, not fixed fixtures.

The test first failed at the intended expired-summary assertion while the per-call API lacked the injected clock. The temporary targeted fault repeated that failure after the working change; it was reverted. No domain, persistence, contract or public transport behavior changed. The known one-writer-per-file limit remains Slice 46 finding 7, and findings 8–14 remain deferred there. No new friction surfaced during the isolated SDK journey, so no synthetic note was added to `.prototype/notes.json`. There is no open product question from this phase.

Verification: focused `mcp/stdio.test.ts` passed 6/6; full `pnpm test` passed (root tooling 9, contracts 355, repositories 164, web 792, prototype-data 120, domain 799, MCP tools 173, host 274); `pnpm --filter @cwm/prototype-host mcp-acceptance` passed both real SDK transports. The sandboxed `pnpm test` could not read existing Angular workspace files, so the full gate was rerun without that filesystem restriction and passed. `pnpm docs:check` and `pnpm lint` are run after the roadmap move resolves the completed-record links.
