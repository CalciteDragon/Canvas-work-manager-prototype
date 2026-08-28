# Slice 10 — The remaining first-milestone sections

## Goal

Add enough distinct, realistic project-section behavior to evaluate the canvas with nested work, configurable progress, journal entries, and a dense derived timeline.

## Spec sections

- §23 — Application Shell / inline project hierarchy
- §30 — Initial Section Types
- §36 — Reflections
- §38 — Timeline
- §39 — Progress
- §81 — First Prototype Milestone

## Acceptance check

With the host and web app running against realistic seeds:

1. load `nested-projects`, open the Home renovation project, and verify Sub-Projects shows the nested hierarchy and can create a direct child that remains after reload;
2. verify the same page offers registered Sub-Projects, Progress, Reflections, and Timeline sections through Quick Add, with each section isolated in its own feature folder;
3. load `busy-week`, open a populated project, use its Progress section to switch the project's canonical persisted setting between count-based, estimate-weighted, and manual formulas, enter a manual value, reload after each change, and verify both the header and section display the same value and coherent explanation even after duplicating or removing the Progress section;
4. add an optional-prompt reflection without a title, add a titled freeform reflection, edit one, reload, and verify reverse chronology plus created/updated timestamps;
5. verify Timeline renders a target-only project as a deadline marker, derives a visible earliest-child-date-to-target range when dated child work exists, distinguishes sub-project targets, ranged tasks, and seeded milestones, and lets a row be selected for details without creating timeline-event records or offering scheduling controls;
6. inspect `.prototype/data.json` to confirm child projects, progress settings, task estimates, reflections, and milestones are the persisted sources while progress and timeline read models are derived only;
7. run `pnpm test`, `pnpm lint`, and `pnpm build` successfully.

## File-level change list

- `development.md` — mark Slice 10 in progress, then done with concrete acceptance evidence.
- `docs/plans/10-remaining-first-milestone-sections.md` — keep this plan and iterative review revisions current.
- `packages/contracts/src/task.ts` and `packages/contracts/src/task.test.ts` — add the optional positive task estimate needed by §39 weighted progress.
- `packages/contracts/src/project.ts` and `packages/contracts/src/project.test.ts` — add the canonical per-project progress formula and optional bounded manual value, with count as the backward-compatible default when absent.
- `packages/contracts/src/inputs.ts` and `packages/contracts/src/inputs.test.ts` — add estimate create/update/clear, project progress updates, and shared `MilestoneQuery` / `ReflectionQuery` schemas.
- `packages/contracts/src/progress.ts` and `packages/contracts/src/progress.test.ts` — define formula/result/explanation vocabulary once.
- `packages/contracts/src/timeline.ts` and `packages/contracts/src/timeline.test.ts` — define timeline item kinds, ranges/markers, and derived result vocabulary once.
- `packages/contracts/src/index.ts` and `packages/contracts/src/index.test.ts` — export and pin all new shared contracts.
- `packages/repositories/src/interfaces.ts`, `packages/repositories/src/json-repositories.ts`, and `packages/repositories/src/repositories.test.ts` — add project-scoped reflection/milestone queries used by domain services, without moving derivation into persistence.
- `packages/domain/src/task-service.ts` and `packages/domain/src/task-service.test.ts` — persist estimate create/update/null-clear through the existing clock/activity/unit-of-work path.
- `packages/domain/src/project-service.ts` and `packages/domain/src/project-service.test.ts` — persist the canonical progress formula/manual setting and enforce that manual mode has a bounded value.
- `packages/domain/src/progress-service.ts` and `packages/domain/src/progress-service.test.ts` — calculate the selected project formula from the canonical project plus unarchived tasks.
- `packages/domain/src/timeline-service.ts` and `packages/domain/src/timeline-service.test.ts` — derive target markers/ranges and child rows from existing project/task/milestone entities.
- `packages/domain/src/reflection-service.ts` and `packages/domain/src/reflection-service.test.ts` — own reflection chronology/create/edit with workspace scoping, `Clock`, activity, ids, and unit-of-work.
- `packages/domain/src/index.ts` and `packages/domain/test/test-support.ts` — export and wire the new services while the existing source-tree boundary lint automatically covers the new files.
- `apps/prototype-host/persistence/store.ts`, `apps/prototype-host/api/services.ts`, `apps/prototype-host/api/routes.ts`, and `apps/prototype-host/api/routes.test.ts` — wire reflection/milestone repositories and thin routes for progress, timeline, and reflection operations.
- `apps/web/src/app/core/gateway/work-manager-gateway.ts` — add transport-free project creation, progress, timeline, and reflection gateway interfaces.
- `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts` and `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` — implement and validate the new HTTP boundary calls.
- `apps/web/src/app/core/gateway/testing/fake-gateway.ts` — supply controllable derived and reflection answers for component/store tests.
- `apps/web/src/app/features/tasks/task-detail-drawer.ts`, `task-detail-drawer.html`, `task-detail-drawer.scss`, and `task-detail-drawer.spec.ts` — expose optional estimate editing so weighted progress can be evaluated rather than only seeded.
- `apps/web/src/app/features/tasks/task-list-store.ts` and `task-list-store.spec.ts` — update estimates through the existing task gateway and notify the project progress refresh path.
- `apps/web/src/app/features/projects/project-page-store.ts` and `project-page-store.spec.ts` — replace the header's local count formula with the shared domain read model, refresh after task/progress changes, and guard navigation races.
- `apps/web/src/app/features/projects/project-page.ts`, `project-page.html`, and `project-page.spec.ts` — wire progress refresh and render the shared header result including unavailable/zero states.
- `apps/web/src/app/features/projects/sections/section-contract.ts`, `section-frame/project-section-frame.ts`, and `section-frame/project-section-frame.spec.ts` — carry one stable `onProjectDataChange` callback through the existing dynamic-content input boundary; the frame emits a transport-neutral event and never reads data.
- `apps/web/src/app/features/projects/sections/rich-text/rich-text-section.ts` and `rich-text-section.spec.ts` — accept the shared callback without firing it for section-local config edits.
- `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts` and `task-list-section.spec.ts` — invoke the callback only after successful create/complete/estimate changes that can affect progress.
- `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-store.ts` and `sub-projects-store.spec.ts` — load a project subtree and create direct children.
- `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-section.ts`, `sub-projects-section.html`, `sub-projects-section.scss`, and `sub-projects-section.spec.ts` — render hierarchy, creation, empty, and error states.
- `apps/web/src/app/features/projects/sections/progress/progress-store.ts` and `progress-store.spec.ts` — load the canonical project result and persist formula/manual project settings before refreshing it.
- `apps/web/src/app/features/projects/sections/progress/progress-section.ts`, `progress-section.html`, `progress-section.scss`, and `progress-section.spec.ts` — render and switch all formulas with accessible explanations and manual input.
- `apps/web/src/app/features/projects/sections/reflections/reflections-store.ts` and `reflections-store.spec.ts` — load/create/edit chronological journal entries.
- `apps/web/src/app/features/projects/sections/reflections/reflections-section.ts`, `reflections-section.html`, `reflections-section.scss`, and `reflections-section.spec.ts` — render optional prompts, composer, edit flow, timestamps, empty/error states.
- `apps/web/src/app/features/projects/sections/timeline/timeline-store.ts` and `timeline-store.spec.ts` — load the derived read model and own transient selected-row state.
- `apps/web/src/app/features/projects/sections/timeline/timeline-section.ts`, `timeline-section.html`, `timeline-section.scss`, and `timeline-section.spec.ts` — render dense markers/ranges, item-kind labels, selection/details, and empty/error states.
- `apps/web/src/app/features/projects/sections/registry.ts` and `registry.spec.ts` — register the four new §30 section types with only one registry entry apiece outside their folders.
- `packages/prototype-data/src/seeds.ts`, `packages/prototype-data/src/seeds.test.ts`, `prototype/seeds/nested-projects.json`, and `prototype/seeds/busy-week.json` — make the two acceptance seeds genuinely exercise all four sections, estimates, reflections, targets, and milestones.
- `.prototype/notes.json` — record concrete observations from using the four sections and comparing progress formulas.
- `docs/decisions/2026-08-progress-formula-experiment.md` — record what the three formulas communicate and where their persisted feature setting lives.
- `docs/decisions/2026-08-project-progress-count-based.md` — update the prior living decision now that `ProgressService` and the canonical project feature setting exist, retaining its archived/cancelled/empty semantics.
- `docs/decisions/2026-08-timeline-range-semantics.md` — record how the prototype represents a project that has a deadline but no explicit start-date field.
- `docs/decisions/2026-08-reflection-chronology-and-prompts.md` — record the tested chronology/prompt interaction choices.

## Test plan

Write each test first and observe it fail for the intended missing behavior:

- Contract tests accept positive task estimates, reject zero/negative estimates, validate formula settings and all progress/timeline result variants, and keep reflection inputs/query transport-neutral.
- Repository tests scope milestones and reflections by project while preserving unfiltered list behavior.
- `TaskService` persists estimate on create/update, clears it with `null`, retains timestamp/activity/idempotence rules, and rolls back rejected writes.
- `ProjectService` persists formula/manual updates, rejects out-of-range or missing manual values for manual mode, and retains prior values when changing formulas.
- `ProgressService` returns unavailable for no tasks; count retains the documented all-unarchived-task denominator (including cancelled); weighted uses positive estimates with a documented fallback of one for unestimated tasks; manual returns the canonical project value; and foreign projects remain not-found.
- `TimelineService` emits a target-only deadline marker; infers a project range only when the earliest dated descendant precedes the target; collapses equal/after-target inference to the deadline marker; normalizes task start-after-due for chronological rendering while flagging the inconsistency for details; handles no-target/no-dated-child projects; derives stable rows for direct and nested sub-projects, ranged tasks, and milestones; excludes archived/foreign data; and emits no stored timeline records.
- `ReflectionService` lists newest-first, creates body-only or prompted/titled entries, edits title/body, preserves created time, updates through `Clock`, records activity, rolls back atomically, and hides foreign projects/reflections as not-found.
- Host route tests prove schemas, actor scoping, response status/body, invalid input, and not-found behavior for progress, timeline, and reflection routes.
- Gateway tests prove method/path/query/body/actor headers, response validation, malformed-response handling, and mapped failures for project create, progress/timeline reads, and reflection list/create/update.
- Task drawer/store tests prove estimates render, clear, persist, and surface failure without losing the current task.
- Project-page-store tests prove the header consumes the domain progress answer, serializes/coalesces explicit refresh requests after task mutation or formula/manual change, rejects stale answers after navigation, and distinguishes unavailable from zero.
- Sub-Projects tests prove nested hierarchy rendering, empty/error states, trimmed direct-child creation, parent/workspace arguments, persistence answer rendering, and failure retention.
- Progress tests prove all three settings persist on the canonical project (the section config stays `{}`), manual input is bounded 0–100, the domain result is reloaded, the stable `onProjectDataChange` callback fires only after success, each formula explains itself, and unavailable/error states remain distinct.
- Reflections tests prove optional prompt selection, body-only and titled creation, cancel/edit/save flows, reverse chronology, timestamp semantics, and visible failures.
- Timeline tests prove all item kinds, chronological positioning/order, target-only/equal/inverted range handling, visible inconsistent task-date details, dense labels/ranges, row selection/details, empty/error states, and absence of scheduling controls.
- Registry tests prove all four definitions, defaults, and the §30 one-folder-plus-one-registry-line extension rule.
- Section-frame/Rich Text tests prove every dynamic content component accepts the stable project-data callback, while section-local Rich Text saves do not trigger a progress refresh.
- Seed tests prove `nested-projects` and `busy-week` contain the section/data variety required by the acceptance sequence and remain schema/referentially valid.

## Boundaries touched

- Angular components inject only feature stores; stores depend only on `WORK_MANAGER_GATEWAY`, never the concrete adapter or HTTP (§8, §19).
- Cross-feature refresh uses the existing dynamic section-content boundary: Task List and Progress call stable `onProjectDataChange` only after successful writes; `ProjectSectionFrame` emits that intent; `ProjectPage` asks `ProjectPageStore` to coalesce/reload the canonical progress answer. No section store imports another feature store, and route generation guards stale answers.
- `ProgressService`, `TimelineService`, and `ReflectionService` depend on repository interfaces plus `Clock`/existing domain collaborators only; host routes remain adapters (§12).
- MCP is unchanged in this slice. The new domain services are still the only future entry point; no adapter is allowed to read repositories directly.
- Estimate, formula, progress result, timeline result, reflection inputs, and query shapes live only in `packages/contracts` (§11).
- Progress and timeline are derived on demand from project/task/milestone entities. No progress-history or timeline-event collection is added (§38, §39).
- Domain timestamps use injected `Clock`; no direct `Date` construction is introduced (§45).
- Component styles use design tokens only (§21).
- The canonical progress formula/manual value is a project setting, so the header and every Progress section have one answer even if there are zero or multiple section instances. The registered Progress feature owns the controls, while `ProgressService.calculate(actor, projectId)` reads the project and tasks and never depends on UI section records.

## Explicit non-goals

- No Calendar section or calendar-event records (Slice 18).
- No Milestones section or milestone authoring UI (Slice 19); milestones are seeded read-only inputs to Timeline.
- No AI Summary (Slice 13), Recent Activity (Slice 13), dashboard (Slice 11), search, or MCP tools.
- No advanced scheduling, dependencies, drag-to-reschedule, zooming, Gantt behavior, critical path, or resource planning.
- No general project editor/archive UI beyond direct child creation.
- No progress history, velocity, roll-up across descendants, configurable weight algorithms, or inferred estimates. An unestimated task has a documented neutral fallback weight of one; cancelled but unarchived tasks retain the existing count/weight denominator semantics.
- No global feature-flag work from Slice 12. The Progress section owns the controls, but the per-project experiment setting is persisted on `Project`; Progress section config remains `{}` so duplicates cannot create competing answers.

## Open questions

None blocking. The data model has project target dates but no explicit project start date. Timeline will show a target-only project as a deadline marker; when the project has a target and an earlier dated descendant, its visual range begins at the earliest descendant start/due/target date and ends at the project target. An equal or later descendant leaves a marker rather than creating a zero/negative range. A task whose start is after its due date is rendered in chronological order but visibly flagged in selected details. A project with no target gets no fabricated project-level range. These choices will be tested and recorded rather than expanding the project contract speculatively.

## Revisions

- Initial plan written from Slice 10, §§23/30/36/38/39/81, the prior progress decision, and the current contracts/domain/gateway/registry/seeds.
- Round 1 review moved the progress setting from ambiguous section config to the canonical project, added the omitted TaskService estimate write path and shared milestone/reflection queries, retained documented cancelled-task semantics, added Timeline row selection/details, expanded wildcard checklist entries to concrete paths, and made target-only versus inferred project-range behavior executable.
- Round 2 review removed two leftover section-config contradictions; defined a stable frame-to-page project-data callback and coalesced progress refresh path; added the existing progress decision to living-doc updates; replaced remaining checklist wildcards with concrete paths; and specified equal/inverted project/task date behavior.
- Round 3 review added the existing Rich Text section to the shared dynamic-input change and pinned that its section-local config saves never fire project progress refresh.
- Implementation review found and fixed a missing manual-value invariant on project create,
  archived descendant leakage in Timeline, incomplete Timeline edge coverage, and stale
  architecture comments. Domain tests now cover equal/later targets, no-target projects,
  archived subtrees, foreign roots, and inverted task ranges.
- Browser acceptance found two issues that review and the first unit test missed: the
  Sub-Projects section showed only direct children, and duplicated Progress sections could
  diverge. Sub-Projects now renders the full descendant hierarchy. Progress uses one
  page-scoped store, with coherent-value assertions and generation guards for out-of-order
  loads and stale write failures across project navigation.
- Final correctness and boundary re-reviews returned no substantive findings. Real-app
  acceptance created and reloaded a nested child and reflection, selected Timeline details,
  switched count (`1 of 3`), weighted (`2 of 10`), and manual (`41%`) formulas, and verified
  two duplicated Progress sections plus the header switch together. Direct data inspection
  confirmed persisted project settings/task estimates/reflections/milestones and no timeline
  event collection. `pnpm test`, `pnpm lint`, and `pnpm build` passed; the production build
  retains the non-fatal initial-bundle budget warning (737.28 kB vs 725.00 kB).
