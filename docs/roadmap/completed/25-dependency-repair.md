<!-- completed-record id="25 (repair)" closed="2026-09-07" summary="Restored the locked pnpm install and fixed the runtime and test defects it exposed" -->
# Slice 25 verification — local dependency repair

> **Completed record — frozen at closeout.** Status **done**, closed **2026-09-07**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.
>
> A verification follow-up rather than a feature slice: it restored the locked toolchain during the 25.x overhaul. Referenced from the Slice 17 and 25.7 records.

## Outcome

Restored the locked install after `pnpm install` reported *Already up to date* while tools
were missing — the working command is recorded in the README — and fixed the runtime and
test defects the repaired toolchain exposed. Afterwards the full test suites, `pnpm lint`,
the builds, the automated browser journeys and both MCP transports passed; the execution
evidence is in the plan below. Referenced from the
[Slice 17](17-design-lab-storybook-and-e2e.md) and
[25.7](25.7-completed-work-reflections.md) records.

---

## Implementation plan — Slice 25 verification — local dependency repair

**Status:** done.

### Diagnosis
- Initial `pnpm test` failed before collection with `ERR_MODULE_NOT_FOUND` for Vitest's nested Vite. Direct and nested junctions pointed at different peer variants, and Vite/Playwright CLI shims were missing.
- The sandbox PATH selected bundled pnpm 11.19.0, whose launcher ignores failed package-manager switching. Install metadata and `package.json` named 11.24.0. The normal permitted host environment ran the pinned 11.24.0.
- `pnpm install --frozen-lockfile` and the same command with `--force` skipped repair. The diagnostic reporter explicitly said no manifest/lockfile changed since validation. The installed pnpm implementation checks `optimisticRepeatInstall` before its install path.
- The sandboxed forced reconstruction stalled; its process was stopped. A permitted host repair with `pnpm install --frozen-lockfile --force --optimistic-repeat-install=false` completed, restoring 664 package entries (461 reused, 197 downloaded). The lockfile stayed unchanged. The original event that left the tree incomplete is not recoverable from this evidence.
- The restored suite revealed real failures previously hidden by startup failure. Their fixes and regression evidence are recorded below.

### Goal
Restore the locked local toolchain and execute the checks previously blocked for 25.6/25.7.

### Spec sections
§19, §27 (canvas state), §31 (Archive), §36 (reflections), §68 (navigation), §69 (tests), §77 (actual application and MCP verification). No product rule changes; exposed defects were repaired.

### Acceptance check
Run `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm storybook:build`, `pnpm e2e`, and `pnpm --filter @cwm/prototype-host mcp-acceptance`; record actual results and distinguish toolchain failures from application failures. This repairs verification prerequisites; it does not close all of Slice 25.8's integrated product acceptance.

### File-level change list
- Local ignored `node_modules` trees: repair from the existing frozen lockfile, retaining versions and approved dependency builds.
- `docs/roadmap/completed/25-dependency-repair.md`: diagnosis, review and execution evidence.
- `development.md`: replace stale dependency-blocker statements with current verification status.
- `docs/roadmap/completed/25.6-root-archive-and-reachable-undo.md`, `docs/roadmap/completed/25.7-completed-work-reflections.md`, `docs/roadmap/completed/25-multi-page-projects-overhaul.md`: link current follow-up evidence, preserving historical observations.
- Any necessary source fix requires a reproduced failure and a bounded plan amendment before implementation.

### Test plan
Use the existing executable gates as regression tests for this environment repair. Baseline `pnpm test` fails in contracts before collecting tests: Vitest cannot resolve its Vite package. Inspect the package junctions and package-manager selection, repair the install, then run the gates. Do not add an implementation-mirroring dependency test. E2e uses its dedicated data file; MCP acceptance creates temporary seed copies and its own host. Never seed the live data file. Check port ownership before e2e and do not stop unrelated servers.

### Boundaries and non-goals
Preserve all AGENTS.md boundaries: no UI/gateway/domain/MCP architectural changes, duplicated contracts, infrastructure expansion, version upgrades, budget changes, or unrelated feature edits. The working tree already contains extensive 25.7 changes; do not discard or commit those as dependency repairs. Do not claim story interactions passed from a static build alone.

### Open questions
No user product decision required. The initiating historical interruption is unknown; distinguish observed missing files from inferred cause.

### Bounded amendment: exposed failures
The restored tests reproduce `does not let a hidden live item claim direct restore` failing: Zod's default object strips an illegal operation instead of rejecting it. Make the `not-archived` restoration object strict in `packages/contracts/src/project-archive.ts` (§31), preserving the existing failing regression and adding a valid-state assertion. Lint reproduces an unbranded subject ID in `reflection-composer.stories.ts`; construct the fixture through the existing shared subject schema (§36), as neighboring stories do. Add the verified repair command to `README.md`; no permanent pnpm setting change or package upgrade.

### Revisions
Independent review found no substantive spec, boundary or scope findings. Clarified that successful toolchain execution is required: merely attempting a command is not repair completion, and any reproduced application failure remains unresolved until fixed or explicitly reported. The pnpm version mismatch is an observation, not proof of the historical cause.

The contract/story amendment also returned no substantive findings. Exact files include `packages/contracts/src/project-archive.test.ts` and `apps/web/src/app/features/projects/sections/reflections/reflection-composer.stories.ts`.

### Bounded amendment: frontend test harnesses
Restored execution exposes six failed assertions. In `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts`, reuse the same gateway for the two journal reads instead of configuring TestBed twice. In `apps/web/src/app/features/projects/pages/archive-page-store.spec.ts`, assert the replacement restore spy, since it bypasses the fake's call recorder. In `reflections-page-store.spec.ts` and `reflections-page.spec.ts` in that same directory, likewise assert replacement create spies with the exact project and input. In `archive-page.spec.ts`, supply the origin section ID/name that the real domain projection includes. In `apps/web/src/app/features/projects/sections/reflections/reflections-section.spec.ts`, assert the current neutral marker text while retaining the no-ID/no-extra-read checks (§36). These repair tests without weakening the behavior they protect. Diagnose two worker memory failures separately before changing runner settings.

Independent review confirmed the six harness fixes. It also confirmed that `apps/e2e/archive.spec.ts` and `apps/e2e/reflections.spec.ts` must expect canonical `/pages/home` on disabled-page fallback (§68); direct bare-root URLs remain valid. Keep the Todos heading assertion.

### Bounded amendment: canvas load feedback loop
Independent diagnosis traced both frontend worker exhaustion and Todos stuck at “Loading project…” to `ProjectCanvas` calling `ProjectPageStore.load` inside a tracked effect. With shortcuts disabled, load synchronously reads and writes sections state, subscribing its caller to its own updates. In `apps/web/src/app/features/projects/project-canvas.spec.ts`, first add a bounded regression that mocks load reading a signal, changes that signal and proves load does not repeat; changing a page input must still reload. Then wrap only the store call in `untracked` in `project-canvas.ts`, reading all three input signals first. This matches the shell's existing idiom (§19, §27, §68). Existing canvas/shell tests and the unchanged Todos browser journey verify the real path. No memory-limit increase or runner workaround.

Red regression observed: changing the internal store signal called load twice instead of once. After the fix all 58 frontend files finish without worker exhaustion. Two previously unreachable canvas shortcut tests omit `shortcutsAllowed: true` from their Home fixture; add that explicit input to those two tests, retaining the default false and the no-shortcut-read protections elsewhere.

### Bounded amendment: remaining domain/MCP gates
The full frontend suite now passes (582 tests). Subsequent domain execution exposes: (1) `packages/domain/src/project-archive-service.ts` labels live sections under archived projects `blocked` instead of `not-archived`, unlike its task/reflection branches and the existing failing §31 test; correct that discriminator while preserving blocked for sections archived in their own right. (2) `packages/domain/src/project-journal-service.test.ts` uses `seedContainer` for a dynamically created project, but that helper hardcodes seed page IDs; create that task container via `sectionService.add` on the real canonical page. Preserve chronology by selecting the intended subjectless entry by ID rather than assuming the first tied entry is oldest. (3) `packages/mcp-tools/src/contract.test.ts` checks the first returned reflection after archiving one; look up the actual archived ID because §36's list is newest-first. Existing failing cases are the regressions; do not change ordering or loosen persistence integrity.

Independent review approved these fixes and identified the same discriminator error for live subprojects. Extend `packages/domain/src/project-archive-service.test.ts` to distinguish live Cabinets hidden under Kitchen from an independently archived Cabinets, then correct both section/subproject branches. The MCP verification must also opt into `includeArchived: true`; retain an explicit assertion that the ordinary list excludes the archived ID. Final review of this amendment initially hit a usage limit, then completed after the user requested continuation.

### Execution evidence
- `pnpm test`: all 1,702 tests pass (195 contracts, 126 repositories, 582 web, 94 prototype-data, 392 domain, 139 MCP tools, 174 host).
- `pnpm lint`: passes, including stories, e2e types, token checks and architectural import checks.
- `pnpm build`: passes. Initial web bundle is 961.82 kB against the existing 850 kB warning budget and 1 MB error budget; budgets unchanged.
- `pnpm storybook:build`: passes. Existing large-chunk warnings remain; this does not claim interactive story playback.
- `pnpm e2e`: all five Chromium journeys pass after the final domain correction. Dedicated e2e store used; live `.prototype/data.json` untouched.
- `pnpm --filter @cwm/prototype-host mcp-acceptance`: HTTP and stdio pass, including task archive/restore, subject-linked reflections and restart persistence, using temporary data stores.
- Local command logs are ignored under `.prototype/dependency-*.log`. Lockfile and dependency manifests are unchanged.

### Closeout
The repair grew only where restored checks demonstrated failures: a canvas reactive feedback loop, archive restoration discrimination, and stale or invalid test fixtures. Existing contracts and infrastructure were retained. README now documents the verified recovery command; development and phase plans no longer claim missing dependencies block execution. Browser-observed friction and its resolution are recorded in `.prototype/notes.json`.

Deferred to 25.8: broader integrated/manual product evaluation, seed/story coverage sweep, and interactive Storybook sign-off. This repair does not claim that entire phase is done. Final independent diff/documentation review returned no substantive findings and confirmed the recorded gate results. `git diff --check` passes.

The workspace already contained extensive uncommitted 25.7 implementation. The repair commit includes only files that were clean at the start plus this new plan; narrow corrections within pre-existing modified/untracked files remain in the working tree with that implementation, avoiding an unrelated feature commit.
