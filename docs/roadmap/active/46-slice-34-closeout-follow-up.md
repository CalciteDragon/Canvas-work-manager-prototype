<!-- plan id="46" status="active" summary="Resolve review defects, evidence gaps, recovery UX and umbrella documentation before final closure" -->
# Slice 46 — Slice 34 close-out follow-up

## Goal

Turn every finding from the 2026-09-27 review of [Slice 34](../planned/34-undo-redo-and-archive.md) into bounded, verifiable follow-up slices before final closure.

Planning only. The user requested all session findings, including previously deferred testing and UX work. Subagent review is skipped for this planning request at the user's explicit direction. No implementation is claimed.

## Spec sections

§§8–15 (boundaries/persistence), §§19–23 (state, tokens, themes, shell), §§26–34 and 36 (history/recovery), §45 (Clock), §§53–54 and 59–63 (permissions, MCP, live updates/failures), §§68–70 and 77–80 (routes, verification, decisions, prototype scope).

## Build

This is a planning and handoff phase. Turn A–D below into bounded numbered candidates using `scripts/roadmap.mjs`, preserving every numbered finding and its evidence requirement. Resolve any overlap between candidates, record their dependency order in `goals.md`, then complete Slice 46 **before** starting an implementation candidate. Activate only one candidate at a time. Refresh each candidate's concrete files, tests, architecture reads and decisions before coding. The user's no-subagent direction applies to this review; later implementation follows the then-current user direction and AGENTS.md's test-first and review protocol.

### A — Correctness and recovery safety

1. **Root Archive stale Restore:** retain the error/write block until a replacement projection read succeeds. Cover quiet live refresh and explicit Retry after successful Restore followed by failed refresh; a stale project row must not overwrite a newer status. Start in `apps/web/src/app/features/projects/pages/archive-page-store.ts`, its spec and `archive-page.html`; use Settings' existing retained-error behavior as reference.
2. **Settings focus:** after a restored row disappears, focus the next enabled status selector or heading, not a disabled Restore button. Preserve focus if the user moved elsewhere while waiting. Test remaining rows, a newly revealed child, last-row removal and failed refresh in `features/settings/archived-projects/archived-projects-page.ts` and its spec under `apps/web/src/app/`, plus `apps/e2e/archived-projects.spec.ts`.
3. **Task history under archived sections:** record a decision first. Recommended rule: scalar task Undo/Redo refuses while its container is archived, matching ordinary edits and reflection history; restoring the container makes the step usable again. Preserve intended Delete/Restore inverses and project exceptions. Add exact-state refusal/recovery tests in both directions to `packages/domain/src/row-history.test.ts`, then repair `task-history.ts`. The review reproduced an inconsistency, not an unequivocal spec violation.

### B — Evidence and one-file safety

4. **Test sensitivity:** temporarily remove the reflection transition grant check, then separately return a fake receipt for a task no-op. Confirm each existing assertion fails for the intended reason, revert each fault immediately, and rerun green. Record exact tests/results in the new Outcome; keep no injected fault in the final diff.
5. **MCP failure paths:** add isolated SDK-driven tests on HTTP and stdio for persistence failure before commit and response loss after commit. Failed commit leaves business/history/Activity unchanged and publishes nothing. Retrying a lost-response transition at the old revision returns the current stale-revision summary, with only one transition/event. Start from `apps/prototype-host/mcp/handler.test.ts`, `stdio.test.ts`, `live-updates.test.ts` and `scripts/mcp-acceptance.mjs`; select a minimal test-harness/composition seam at activation, without public fault tools or domain infrastructure.
6. **Stdio expiry:** use a controllable injected Clock in an isolated process; advance beyond 24 hours, verify Undo/Redo is unavailable, and recover the same retained content through Archive Restore. Include restart and retained Activity. No sleeps or changed normal clock default.
7. **Concurrent writers:** adopt one writer per canonical JSON path. Preferred remedy is a small fail-fast process ownership guard acquired before load/seed/write and held for the process lifetime. Test HTTP plus stdio, two stdio processes, independent files, normal release and abnormal-exit recovery without unsafe lock stealing. Audit seed/reset/upgrade writers too; do not claim protection they bypass. Decide the mechanism and recovery procedure before implementation in an indexed host/persistence decision. This excludes concurrent writers; it does not implement concurrent storage. If reliable enforcement requires production locking machinery, resolve that scope explicitly before proceeding or closing this item. Simultaneous browser/agent work should use the existing HTTP MCP host.

### C — Recorded recovery UX

8. **Section labels:** name rename, prose edit, collapse/expand and resize from recorded changes, with deterministic wording for combined changes. Assert accessible Undo/Redo labels and one action per committed gesture.
9. **Descendant history discovery:** provide a persistent, exact-actor way from root Todos/Archive to open the owning subproject's history after transient feedback disappears and after reload. Navigate to the owner's existing controls; keep separate cursors. Select the smallest UI/read contract in the phase design review, without merged history or exposing other actors' steps.
10. **Delete feedback:** after committed task Delete, announce recoverability through header Undo or Archive, with an owner link for descendant tasks. Cover Task List and Todos, keyboard/touch, failed-write rollback and navigation. Use one accessible status message; the header remains the sole Undo action surface.
11. **Phone layout:** collapse global navigation into an accessible drawer at phone widths. Handle focus entry/return, Escape, route selection and desktop resizing. Check the project navigation column too so it does not consume the recovered space. Verify usable workspace and actual hit targets at 375 px in both themes. Start in `apps/web/src/app/core/shell/` and the project workspace shell; keep state scoped and styles token-based.

### D — Documentation and final closure

12. **Drift:** correct MCP transport `how.md` from five families to six, including `project`. Reconcile Slice 34's 1 MB acceptance text with the existing 1050 kB decision while retaining the 850 kB warning. Replace the misleading opening “No runtime implementation” status with dated delivered/follow-up status.
13. **Living documentation:** update each touched system's architecture, spec, indexed decisions and guides alongside implementation. Likely systems: domain, web/core, web/projects, web/tasks, web, prototype-host/MCP transport, repositories and testing. Record the container policy, writer ownership and chosen UX rules. Completed records stay frozen; use dated addenda where needed.
14. **Umbrella lifecycle:** write an Outcome linking Slices 35–45 and the new evidence. After all phases pass, complete this follow-up and move Slice 34 through the supported roadmap lifecycle to `completed/`, sequentially with only one active record. Update `goals.md`, regenerate `progress.md`, and repair inbound links to moved records without rewriting historical prose. Slice 34 must no longer appear as unimplemented planned work.

## Done when

- Every numbered finding below has an owning planned candidate, with no duplicate active plan, and the candidates have a dependency order in `goals.md`.
- Each candidate has a bounded goal, relevant spec sections, concrete acceptance evidence and scope guards. The final closure candidate owns the Slice 34 lifecycle and documentation reconciliation.
- `node scripts/roadmap.mjs check`, `pnpm docs:check` and `git diff --check` pass. The handoff and any unresolved product choices are recorded in Slice 46's Outcome before it is completed.

## Follow-up acceptance contract

- All fourteen items have named test/journey or documentation/decision evidence; no unresolved finding is hidden behind the old Stage E completion claim.
- A's UI failures are reproduced and repaired in the browser; task-container behavior has tests and an indexed decision.
- B's deliberate faults are detected and reverted; both MCP transports prove failed-commit and lost-response handling; stdio proves expiry and durable recovery; concurrent writers are refused without lost data.
- C works with keyboard/touch, both themes, reload and relevant persona changes. No cross-actor history leaks or duplicate Undo surface.
- Run `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`, `pnpm docs:api`, `pnpm storybook:build`, `pnpm e2e`, and all four host acceptance scripts (`acceptance`, `agent-acceptance`, `mcp-acceptance`, `live-acceptance`). Record bundle size against 1050 kB.
- Use isolated `personal-workspace`, `nested-projects` and `agent-heavy` data; start web/host separately, exercise browser/MCP, update `CURRENT_SLICE` for implementing phases and append real-use friction to `.prototype/notes.json`.
- Complete implementation/diff reviews, resolve substantive findings, and close with evidence and any explicitly agreed limits. The prior review's green tests/lint are baseline evidence, not verification of future changes.

## Do not

- Implement product code or mark either umbrella complete during this planning request; execute the whole list as one sprawling phase.
- Add merged/cross-user history, a history browser, permanent deletion, new archive storage, a generic fault framework, production storage/locking, or another bundle-budget increase.
- Add domain infrastructure dependencies, concrete gateway imports in components, core-to-feature/prototype edges or duplicate contracts. Keep injected Clock and existing UnitOfWork boundaries.
- Rewrite Slice 45 to imply these gaps were already closed, or reset personal runtime data for tests.

## Acceptance check

1. Compare each of findings 1–14 with the new planned candidates; every finding has one owner and a named test, journey or documentation check.
2. Check `goals.md` for the dependency order and verify no implementation candidate is active while Slice 46 is active.
3. Run `node scripts/roadmap.mjs check`, `pnpm docs:check` and `git diff --check`. Record results and the candidate links in the Outcome before completing this planning phase.

## File-level change list

| File | Responsibility |
|---|---|
| `docs/roadmap/active/46-slice-34-closeout-follow-up.md` | Own the review findings, candidate handoff, revisions and planning Outcome. |
| `docs/roadmap/planned/<new-numbered-candidates>.md` | Split A–D into bounded phases while retaining all fourteen findings and the follow-up acceptance contract. Exact names are assigned through `roadmap.mjs new`. |
| `docs/roadmap/goals.md` | Record candidate order and the status of this follow-up. |
| `docs/roadmap/progress.md` | Regenerated status board from `roadmap.mjs`. |

## Test plan — checks first

| Check | Proves |
|---|---|
| Manual finding-to-candidate matrix in the Outcome | Every numbered finding has exactly one owner and its intended evidence survives the split. |
| `node scripts/roadmap.mjs check` | Plan states, ids and generated board are coherent. |
| `pnpm docs:check` | New candidate links and roadmap structure resolve. |
| `git diff --check` | The documentation change has no whitespace errors. |

## Boundaries touched

This phase changes roadmap documentation only. The candidate plans must preserve the standing gateway, domain, MCP, contracts, Clock, design-token and core dependency boundaries. No product behavior is claimed before an implementing slice verifies it.

## Explicit non-goals

- No application implementation, runtime testing or Slice 34 closure in this phase.
- No second active plan. Complete this planning phase before starting an implementation candidate.

## Open questions

- The task-history container rule and the writer ownership mechanism require decisions in their implementing candidates. Neither is silently settled by this planning phase.

## Revisions

- **Self-review, 2026-09-27:** The draft combined a planning handoff with the final implementation acceptance, which would leave an umbrella active alongside its implementing candidates. Restricted Slice 46's completion to a bounded candidate handoff, retained all fourteen findings as the downstream acceptance contract, and added executable roadmap checks. The user explicitly requested this review without subagents.
