<!-- plan id="47" status="planned" summary="Keep stale Archive restores blocked through refresh and move Settings focus to the next usable control" -->
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
