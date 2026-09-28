<!-- plan id="47" status="active" summary="Keep stale Archive restores blocked through refresh and move Settings focus to the next usable control" -->
# Slice 47 — Archive recovery state and focus

## Goal

Make Restore recovery safe and keyboard focus useful on the root Archive and Settings archived-projects pages.

## Spec sections

§§19 and 23 (scoped page state and usable navigation), §31 (current, ready-only Archive), §62 (quiet live refresh), §63 (acknowledged writes and read-only retry), §§69 and 77 (browser evidence and real use).

## Build

- Fix root Archive so a failed post-Restore projection read keeps its error and blocks stale Restore controls through quiet live refresh and explicit Retry, until a replacement read succeeds. Guard an older project row against replacing a newer status choice.
- After Settings removes a successfully restored row, focus the next enabled status selector in current list order, or the page heading if none exists. Keep focus where the user moved it while the request was pending; retain a usable focus target when refresh fails.
- Update the affected web architecture prose with the verified behavior and record friction from real browser use. Use existing gateway interfaces and recovery controls.

## Done when

- A test first reproduces a successful root Archive Restore followed by failed refresh. Quiet live refresh and Retry do not re-enable a stale write until a current read succeeds; the write is sent once, and an older answer cannot overwrite a newer status.
- Settings component and Playwright journeys cover remaining rows, a newly revealed child, last-row removal, failed refresh, and focus moved elsewhere during the request. Keyboard and touch recovery work in both themes with isolated seed data.
- Targeted tests, `pnpm test`, `pnpm lint`, `pnpm docs:check`, and the affected Playwright suites pass. A real browser journey confirms the behavior and logs any friction in `.prototype/notes.json`.

## Do not

- Change Archive eligibility, domain Restore rules, contracts or the sole header Undo surface.
- Resolve the archived-container task-history policy (Slice 46 finding 3), the MCP/persistence evidence gaps, or the later recovery UX work in this slice.
- Reset personal runtime data for tests or add a new shared store or concrete gateway dependency to components.

## Acceptance check

1. In an isolated root Archive, Restore a ready subproject or row, make the follow-up projection read fail, and verify the acknowledged write is not repeated. The retained row remains blocked with an error until a successful current read replaces it. Trigger a quiet live refresh and explicit Retry while the read is pending; neither clears the block early. A late older read cannot replace a newer projection or the selected project status.
2. In Settings, restore a row with a selected status. If another row remains or a child appears, focus its enabled status selector; if none remains, focus the heading. If the user moves focus elsewhere during the request, leave it there. If refresh fails, keep the retained row blocked and move focus to the Retry control only when focus would otherwise be lost.
3. Run focused store/component tests and `apps/e2e/archive.spec.ts` plus `apps/e2e/archived-projects.spec.ts` with isolated data. Verify keyboard and touch in both themes, then `pnpm test`, `pnpm lint`, `pnpm docs:check`; use the running app and record friction. Do not claim an unrun journey.

## File-level change list

| File | Responsibility |
|---|---|
| `apps/web/src/app/features/projects/pages/archive-page-store.spec.ts` | Reproduce failed post-write read, quiet refresh, Retry, stale response and single-write cases first. |
| `apps/web/src/app/features/projects/pages/archive-page-store.ts` | Retain the error/write block until a current replacement read succeeds; keep generation guards. |
| `apps/web/src/app/features/projects/pages/archive-page.html` | Show the retained error and read-only Retry while stale rows remain blocked, if current template behavior needs repair. |
| `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts`, `apps/web/src/app/features/projects/archived-region/archived-region.ts` | Assert and preserve project status choice if a refreshed row for the same id arrives; edit implementation only if the test exposes loss. |
| `apps/web/src/app/features/settings/archived-projects/archived-projects-page.spec.ts` | Reproduce focus behavior for next row, revealed child, last row, failed refresh and user-moved focus first. |
| `apps/web/src/app/features/settings/archived-projects/archived-projects-page.ts` | Choose a usable focus target after a row disappears without stealing deliberately moved focus. |
| `apps/web/src/app/features/settings/archived-projects/archived-projects-page.html` | Expose a stable target for next status/Retry if needed; keep status and Restore semantics. |
| `apps/e2e/archive.spec.ts`, `apps/e2e/archived-projects.spec.ts` | Exercise the browser recovery and keyboard/touch journeys on isolated seed data. |
| `docs/architecture/web/projects/how.md`, `docs/architecture/web/how.md` | Describe the corrected Archive state and Settings focus behavior after implementation. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | Set the current implementing slice and record real-use friction. |
| `docs/roadmap/active/47-archive-recovery-state-and-focus.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | Record review, evidence and outcome; update direction and generated board. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `archive-page-store.spec.ts`: committed Restore with failed read, then quiet frame and Retry | Error/write block persists until a current successful projection; the write is not resent. |
| `archive-page-store.spec.ts`: older answer after newer root/project read | Generation guard prevents stale projection and status from winning. |
| `archived-region.spec.ts`: selected project status survives a same-id row refresh | The user's explicit choice is not reset by projection replacement. |
| `archived-projects-page.spec.ts`: next row, revealed child, last row, failed refresh, moved focus | Focus lands on an enabled target only when the Restore action still owns focus. |
| `archive.spec.ts`, `archived-projects.spec.ts`: keyboard/touch recovery in both themes | The rendered app exposes the promised block, Retry and focus behavior. |

Write each failing test before its repair, then run the focused suite green. If an existing behavior already passes, retain only an assertion that proves the acceptance case; do not add a mirrored implementation test.

## Boundaries touched

The stores use `WORK_MANAGER_GATEWAY`, `LIVE_UPDATES` and the core history reporter only. Components do not import a concrete adapter or HTTP. No domain, repository, MCP or contract change is planned. Styling, if needed, uses tokens; route state stays feature scoped and `core/` gains no feature dependency.

## Explicit non-goals

- No Archive eligibility or domain Restore change, no new status option and no additional Undo control.
- No task-history container-policy decision or MCP/persistence work.
- No broad focus-management framework or unrelated Settings redesign.

## Open questions

- None blocks implementation. The existing project status choice is keyed by id in `ArchivedRegion`; verify it survives same-id projection refresh before changing that component.

## Revisions

- **Activation review, 2026-09-27:** Moved Slice 46 back to planned as the final follow-up umbrella and activated this bounded first implementation slice. Checked the current Archive and Settings stores, component templates, architecture and spec. Added explicit quiet-refresh, single-write and focus-ownership cases. The earlier user direction to review without subagents is respected.
- **Implementation, 2026-09-27:** The failing store tests showed `load()` cleared the error at the start of every read, re-enabling a stale Restore while a quiet frame or Retry was pending; the error now clears only on a successful current read or a root change, and Retry is quiet when a list is on screen so the error and Retry (and its focus) stay put. The page passed `error !== null` into `restoreBlocked`, which also showed the archived-project "Reactivate" note; `ArchivedRegion` gained a `restorePaused` input that disables without the note. Settings focus now targets the enabled status selector at the restored row's index (a later row's Restore is disabled until a status is chosen, so the old target was unfocusable), Retry while an error blocks, else the heading, and only when focus was lost; the rescue also runs after a successful Retry, which removes itself. Real use found the root Archive's "Restore as" select displaying Planning while Restore sent Active (`[value]` bound before its `@for` options); fixed with per-option `[selected]` under a test.
- **Diff review round 1, 2026-09-27 (two independent subagents: correctness/spec; boundaries/docs):** Accepted: a later failed read replaced "Restore succeeded" with a transport message (both stores now keep the retained error); no test for the root-change error reset (added); the Settings e2e used keyboard only in dark and a pre-focused tap only in light (now both methods per theme, tap without pre-focus); the decision amendment used a heading instead of the house `**Amended, …**` form; doc wording for Retry's focus target and non-quiet reads; testing docs and a `RestorePaused` story. Deferred as friction (outside Done-when): focus dropping when a live frame, not Retry, clears the Settings error, and root Archive focus after Restore/successful Retry. Not acted on: a click on blank space during a pending Restore counts as lost focus (acceptable), and the e2e cannot distinguish an older same-data answer (the store unit test covers it).
- **Diff review round 2, 2026-09-27 (fresh independent subagent on commit 643d22e):** No blockers; three minors accepted. Round 1's "keep the retained error" kept *every* earlier error, so a failed Retry after a refusal showed no change — now only the committed-write message survives a later failed read. A `prototype.reloaded` frame on the same root kept the old persona's list and error — the root Archive now clears both, as Settings already did. The Settings failed-refresh e2e step could be hit by a late frame's read before the child's Restore — the failure is now armed by the child's own PATCH; both suites passed 18/18 with `--repeat-each 2`.
