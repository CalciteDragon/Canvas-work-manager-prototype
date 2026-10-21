<!-- plan id="77" status="active" summary="Redesign slice 6a (TH09): one task-row shape across surfaces; rows that look openable open their canonical owner, the rest stop looking openable" -->
# Slice 77 — Objects: one row shape, openable rows

**State (2026-10-21):** planned and reviewed (three rounds, no substantive findings remain); implementation not started.

Redesign slice 6a under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). Redesign slice 6
("Objects and states", TH09 + TH10) is **split** by the user's choice on 2026-10-21, as slice 4
was: this slice, **6a Objects**, takes theme **TH09** "The same object takes many shapes" in
[themes.json](../70-ui-ux/themes.json) and the row-shaped items earlier slices deferred to slice 6.
**6b States** (TH10: empty, loading, error and archived states, retry, the digest's overdue line,
the Markdown editor's Cancel and Preview) is planned after this one closes.

The user also answered the bundle question on 2026-10-21: the initial-bundle hard ceiling rises
from 1100 kB to **1150 kB** in this slice, recorded as an amendment to the
[budget decision](../../decisions/2026-08-initial-bundle-budget.md). The 850 kB warning stays.

## Goal

A task has one anatomy on every surface that lists it, every row that looks openable opens its
canonical owner, and every row that cannot be opened stops looking like it can (principles 1, 3
and 6 of [direction.md](../70-ui-ux/direction.md)).

## Spec sections

- **§21** visual design system. One list-row primitive in `_controls.scss`, tokens only; the left
  accent rule means high priority or overdue and nothing else.
- **§24** Home Dashboard. Today, Upcoming and Recent Progress rows open their task's owner; Active
  Projects shows each project's place in the tree.
- **§27** Section Canvas, "Shortcuts on Home": a shortcut's read-only rows open their source; the
  picker shows what each source is.
- **§33/§34** task model and interactions. Task List, Todos and dashboard rows share one anatomy.
  §34's "drag ordering" stays Slice 20's; this slice stops the Task List from *pretending* to
  reorder. Todos' canonical-navigation rule and its write semantics are unchanged.
- **§38** Timeline. Rows scan as a list in shared columns; task and workstream rows open their
  owner; the select-to-expand detail is removed (Open question 3).
- **§67** Design Lab: row specimens. **§69** verification, **§77** design-first loop, **§78** decisions.
- [Overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7.

## Build

- **One row anatomy.** `.object-row` in `_controls.scss`: a grid of *control · title · meta ·
  tools* with one container, edge, radius and hover; `__control`, `__title`, `__meta`, `__context`,
  `__tools` parts; `--static` (no edge, no hover, default cursor) and `--finished`. The accent left
  rule exists only as `--high-priority` and `--overdue`. **No whole-row link overlay:** a row opens
  through its title link, so rows holding a checkbox, Delete or a history link never nest
  interactive content (axe `nested-interactive`).
- **Shared task meta.** One pure formatter in `features/tasks/task-meta.ts` gives the meta items in
  one order — status · priority when high · due (or completed) date · Overdue — and each surface
  passes what it has. Status shows when not `todo` by default; Todos passes `alwaysStatus`, so its
  `[data-todo-status]` stays one element whose text is exactly the label ("To do" included). The
  dashboard keeps its time-of-day for due-today rows and its completed date for Recent Progress,
  through the formatter's options. `.object-row__control` has a fixed token width, so rows without a
  checkbox (workstreams, cancelled tasks) keep the shared title column.
- **Task List and shortcuts render `TaskRow`** on the primitive. `TaskRow` gains an optional `link`
  input (`{ route, fragment }`): with it the title is a `routerLink` and the row never selects; it is
  used only by read-only shortcut rows. `TaskRow`'s own checkbox reset and Delete semantics are
  unchanged.
- **Todos keeps its own template and store**, redrawn on the anatomy: checkbox · title link ·
  meta on one line, the origin breadcrumb and history link in `__context`, Delete in `__tools`. Its
  `data-todo-*` hooks, `todos__row--finished`, native `disabled` under `writesBlocked()`, status
  label, cancelled-without-toggle rule and the two-phase checkbox reset stay as they are (L2-015,
  L1-016, L3-019). This is a deliberate choice over rendering `TaskRow` there (Revisions, round 1).
- **Dashboard task rows open their owner.** `DashboardTask` gains `origin`, typed as the exported
  `TodoTaskOriginSchema`. It is resolved by a pure domain helper, `task-origin.ts`, extracted from
  `ProjectTodosService`, and used by `task-windows.ts`'s `dashboardTaskFor`, so both
  `DashboardService` and `WorkspaceService.upcomingWork` (`get_upcoming_work`, which shares the
  schema) carry it. Today, Upcoming and Recent Progress draw the anatomy with a title link built as
  Todos builds its links, and keep the server's `overdue` flag, so the accent matches the Overdue
  group under a simulated clock. Emoji are `aria-hidden` across the dashboard (L5-023).
- **Active Projects shows the tree.** `DashboardProject` gains `breadcrumb` (ancestor names, root
  first, empty for a root); the row shows "Renovation / Kitchen" as `__context` (L7-017).
- **Timeline scans as a list.** Rows share column tracks through CSS subgrid on the `<ol>`. An
  optional `TimelineItem.link` (`projectId`, `pageKind`, `sectionId?`) makes a task row a title
  link to its section and a workstream row a link to its project; project and milestone rows are
  `--static`. The reversed-range note shows inline. Selection and the expanded detail are removed
  (L1-010, L3-015, note-2026-10-15-002).
- **Shortcut rows open their source.** `SectionContentInputs` gains `sourceLink` (`null` from the
  section frame, the source route from the shortcut frame), declared on every registered content
  component so `NgComponentOutlet` raises no NG0303. Task List rows in a shortcut use it as their
  `link`. The frame says "Read-only here. Open the source to change it." under its heading, and an
  empty shortcut Task List says "The source has no tasks yet." (L3-018 rest, L4-016, W1-042,
  W2-025).
- **The picker names what it adds.** `ShortcutSource` gains `section` (the canonical
  `ProjectSection`, as a resolved placement already carries). The picker groups sources under their
  location (owner path · page) and offers a per-source **Preview** disclosure rendering the
  registry's read-only content component with `readOnly: true`, so rows are read through the
  viewer's own content grants. Preview passes `sourceLink: null` and no-op callbacks, so nothing in
  it navigates away from the open create dialog. A refused or failed preview read stays inside its
  disclosure (W1-040, W2-024; Open question 2).
- **Task List stops pretending to reorder.** `cdkDropListSortingDisabled` on every Task List. While
  a row is dragged, its own list shows a polite line: "Drop on another Task List to move it. Order
  within a list can't be changed yet." Dropping on another Task List still moves it (L3-017).
- **Small object fixes.** Task titles wrap instead of truncating at 375 px (W2-023). The Settings
  archived-project card shows ancestors only, and "Top-level project" for a root (W4-035). Progress
  shows the active formula as the pressed, emphasised choice and has no lone primary
  (note-2026-10-15-003).

## Done when

- Every finding under Findings closed is closed on the before/after sheet, each by its named pair,
  ARIA snapshot or e2e assertion.
- Core tasks T01–T09 cost no more than their slice-76 counts. A new dashboard task, **T11 "Open an
  overdue task from the dashboard"** (overdue-chaos, `/app`), is recorded before and after; after
  is lower or the before is a dead end. T11 completes when the owner section of the first overdue
  task is the canvas target (the URL fragment names it, its heading is focused and its content is shown); a run that cannot
  reach that within the step budget is a dead end. T04 keeps its start route so it stays comparable.
- `pnpm test`, `pnpm lint`, `pnpm e2e` and `pnpm --filter web storybook:build` pass, and the
  production build is under 1150 kB initial.
- The user accepts the sheet at Gate 2.

## Do not

- Touch empty, loading, error or archived states, retry, the digest text, or the Markdown editor
  (slice 6b, TH10). The only TH10 findings here are the three shortcut-row ones (Scope check).
- Add task reordering, a sort order, subtasks or completed-task grouping (Slice 20; L4-023's count
  half goes to 6b).
- Select a task or open its drawer from a link, add a task-level fragment, or expand a collapsed
  target section persistently (Open question 1).
- Change navigation, header breadcrumbs or vocabulary (slices 7 and 9), or the agent card (slice 8;
  L1-027 moves there).
- Return task or reflection rows from shortcut discovery
  ([decision](../../decisions/2026-09-a-shortcut-resolves-identity-not-content.md)).

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

TH09 has sixteen findings (10 S2, 6 S3), all reproduced in
[reproduction.json](../70-ui-ux/reproduction.json). One moves out and six move in:

- **Out: L1-027** (S3, agent card permission layout) goes to the agent connections slice (8), whose
  first question is that page's design.
- **In, deferred to slice 6 by earlier records:** L3-015 and L3-019 (slice 72, row shape),
  L3-017 (slice 74's split, task drag), L3-018's remaining half (slice 76, inert shortcut rows),
  note-2026-10-15-002 (Timeline titles) and note-2026-10-15-003 (Progress formula).
- **In, from TH10:** L4-016, W1-042 and W2-025 are the same shortcut rows as L3-018.

Slice 74's split also gave L3-012 and W4-031 (Markdown Cancel and Preview) to slice 6; both are
editor *state*, so they go to 6b. L4-023's count half and W4-028 (the digest) stay with 6b.
Slice 72's remaining census exceptions for task-row titles and widget row links end here.

## Findings closed

| Finding | Sev | Closed by |
|---|---|---|
| L2-014 | S3 | `.object-row` across Task List, Todos, Timeline, dashboard widgets, Active Projects, Recent Activity, the activity feed and Archive entries; accent rule only for priority/overdue; Reflections entries stay prose and lose the decorative rule |
| L2-015 | S2 | Todos and Task List share anatomy and meta order; checkbox and Delete in the same places. One stated difference: a Task List title opens the drawer, a Todos title opens the owner (canonical navigation, recorded in the decision) |
| L1-016 | S2 | Todos row on one line, tools attached, shared title column |
| L3-019 | S2 | Breadcrumb plain text, title the link, checkbox attached |
| L1-010 | S2 | Timeline subgrid; 375 px stacks title over meta without fragments |
| L3-015 | S2 | Timeline rows that open are links and go somewhere; others are static |
| W1-031, W2-014, W3-013, W4-012, L3-024 | S2 | Dashboard task rows link to their owner section, by mouse, keyboard and touch |
| L5-023 | S3 | Dashboard emoji `aria-hidden` |
| L7-017 | S3 | Active Projects shows ancestor path |
| W2-023 | S3 | Titles wrap at 375 px |
| W4-035 | S3 | Archived-project card shows ancestors once |
| W1-040, W2-024 | S2 | Picker grouped by location, Preview disclosure |
| L3-017 | S2 | Sorting disabled within a list, and the list says why during a drag |
| L3-018 (rest), L4-016, W1-042, W2-025 | S3 | Shortcut rows open their source; read-only sentence; distinct empty text |
| note-2026-10-15-002, note-2026-10-15-003 | — | Timeline column; active formula reads first |

Twenty-two findings (13 S2, 9 S3) plus two notes.

## Acceptance check

1. `pnpm test`, then `pnpm lint` (with `docs:check`), sequentially.
2. `pnpm e2e` passes in full, including the new `objects.spec.ts`; `phone-layout.spec.ts` unedited.
3. `pnpm --filter web build` reports an initial bundle under 1150 kB.
4. **Before:** export the slice-76 closing commit (`e0e1467`) outside `apps/e2e/`, link
   `node_modules`, `ng build` it with output at `apps/e2e/ux-output/slice77-baseline-web/` (served
   from its `browser/` folder, as `slice76.config.ts:9` does), then
   `UX_BEFORE=1 pnpm --filter @cwm/e2e exec playwright test --config ux/slice77.config.ts`.
   **After:** the same config without `UX_BEFORE` on the slice's final build. Then
   `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs <before> <after> <output> <after> --profile 77`.
   Profile 77:
   - runs the full control census on every after cell, **without** slice 72's task-row-title and
     widget-row-link exceptions (its breadcrumb exception remains);
   - gates any axe violation node absent from the same cell before (`nested-interactive` included;
     `color-contrast` reported only);
   - reads `objects-verification.json` for Timeline and Todos title alignment and core-task counts;
   - treats the Lab's primitives panel and its live task-row, widget-frame and activity-feed panels
     as changing;
   - fails a Must-not-change cell that moved more than 1 px.
   Zero gate failures, and every Visual acceptance pair present.
5. `ux/objects-verification.ts` (in the same config) records T01–T09 and T11 before and after.
6. **MCP:** the `packages/mcp-tools` in-process contract tests and the host's stdio test assert
   `origin` on every task from `get_dashboard_context` and `get_upcoming_work`; `apps/e2e/mcp.spec.ts`
   checks the same over HTTP. The host route test checks `link` on Timeline items.
7. Real use on overdue-chaos and nested-projects (1440 mouse, 375 touch, keyboard only): open an
   overdue task from the dashboard, open a Todos row, open a Timeline task, open a shortcut row,
   preview and add a shortcut, drag a task within and between lists; friction in
   `.prototype/notes.json` (`CURRENT_SLICE` = 77).
8. The user accepts the sheet at Gate 2.

## Capture scope

**Must change:** dashboard (Demo, Alex, Sam; overdue-chaos, busy-week, nested-projects, agent-heavy)
at 1440, 1024 and 375, both themes; Todos; Home/Work canvas cells with a Task List, Timeline,
Progress or shortcut frame; Reflections section and page entries (accent rule only); the Add
shortcut picker; Settings › Archived projects; Archive entries; Recent Activity and the activity
feed; the Lab's primitives panel and its live task-row, widget-frame and activity-feed panels
(`live-panels.html`); the `TaskRow`, Todos, shortcut-frame and shortcut-picker stories.

**Gated within the change:** every link title passes the target census (24 px, 44 px on touch);
Timeline titles in one section, and Todos titles on one page, share their left edge within 1 px.

**Must not change** beyond 1 px: section frame headers and tools, insertion marks, the project
header, the sidebar and project column, the task drawer, the creation dialogs' chrome (the picker
inside the section-create dialog changes), the toast, Settings pages other than Archived projects,
and Lab panels other than those named above.

## Visual acceptance

| Pair (before → after) | Seed, size, theme | Findings |
|---|---|---|
| Six row treatments side by side → one | busy-week, 1440 dark | L2-014 |
| Task List row vs Todos row → same anatomy | nested-projects Kitchen + Renovation Todos, 1440 light, 375 dark | L2-015, L1-016, L3-019, W2-023 |
| Today overdue cards, inert → linked rows, hover and focus | overdue-chaos, 1440 dark, 375 light | W1-031, W2-014, W3-013, W4-012, L3-024 |
| After activating an overdue row → owner section targeted | overdue-chaos, 1440 dark | same |
| Active Projects flat → with path | nested-projects, 1440 light | L7-017 |
| ARIA snapshot of dashboard rows: "robot Work Manager" → "Work Manager" | agent-heavy, 1440 | L5-023 |
| Timeline slabs, ragged titles → aligned list, link rows vs static rows | busy-week, nested-projects, 1440 dark, 375 light | L1-010, L3-015, note-002 |
| Shortcut frame rows → link rows, read-only sentence, distinct empty | nested-projects Renovation Home, 1440 dark, 375 light | L3-018, L4-016, W1-042, W2-025 |
| Picker list → grouped, one Preview open | nested-projects Kitchen, 1440 dark, 375 light | W1-040, W2-024 |
| Mid-drag within a list: placeholder moves → stays, with the line | nested-projects Kitchen, 1440 dark | L3-017 |
| Archived-project card, nested and root | nested-projects Settings, 1440 light | W4-035 |
| Progress with Count active | nested-projects Kitchen, 1440 dark and light | note-003 |
| Reflections entry without the decorative rule | nested-projects Renovation Reflections, 1440 dark | L2-014 |

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: tests, implementation and docs change together.

- **Behaviour:** dashboard task rows and Timeline task/workstream rows become links; shortcut rows
  become links to their source; Timeline selection and its detail go; in-list drag no longer
  animates a reorder and says why; the picker gains Preview; the dashboard drops a task whose
  section or page cannot be resolved (integrity forbids it; it now fails safe rather than
  linking nowhere); three contract fields and a domain helper.
- **Not behaviour:** Todos writes, toggles, Delete, history links, toasts and errors are unchanged.
- **Appearance:** the anatomy, meta order, accent use, Active Projects path, wrapping, the archived
  card, Progress emphasis, the read-only sentence and empty text.
- **Specs that change with it** (Stage 0 re-greps every one before editing): `timeline-section.spec.ts`
  and `timeline-store.spec.ts` (selection removed), `task-row.spec.ts`, `todos-page.spec.ts` (DOM
  order only), `shortcut-frame.spec.ts`, `shortcut-picker.spec.ts`, `task-list-section.spec.ts`,
  `progress-section.spec.ts`, `dashboard-page.spec.ts`, `project-section-frame.spec.ts`
  (`sourceLink: null`), the archived-projects page spec, and any e2e Timeline locator
  (`[data-timeline-details]`, `aria-expanded`) the re-grep finds.
- **Stay green unedited:** `todos.spec.ts`, `task-interaction.spec.ts`, `web.spec.ts`,
  `row-history.spec.ts`, `project-history.spec.ts`, `feedback.spec.ts`, `phone-layout.spec.ts`,
  `task-lifts.spec.ts` and every other e2e spec — Todos keeps its hooks for exactly this reason.
  Frozen evidence scripts of completed slices (`ux/feedback-verification.ts` and the like) are not
  re-run and are left as they are.

## File-level change list

Paths are under `apps/web/src/app/` unless stated.

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/dashboard.ts` (+ test) | modify | `DashboardTask.origin: TodoTaskOriginSchema`; `DashboardProject.breadcrumb` |
| `packages/contracts/src/timeline.ts` (+ test) | modify | Optional `TimelineItem.link` |
| `packages/contracts/src/section-shortcut.ts` (+ test) | modify | `ShortcutSource.section: ProjectSectionSchema` |
| `packages/contracts/src/workspace.ts` | none expected | Reuses `DashboardTaskSchema`; listed so Stage 0 confirms |
| `packages/domain/src/task-origin.ts` (+ test) | create | Pure origin resolution: owner project, page, section, root-first breadcrumb walked to the true root |
| `packages/domain/src/project-todos-service.ts` | modify | Uses the helper; output unchanged |
| `packages/domain/src/task-windows.ts` | modify | `dashboardTaskFor` takes the resolved origin |
| `packages/domain/src/dashboard-service.ts` (+ test) | modify | Origins, breadcrumbs; `sections` and `pages` dependencies; unresolvable tasks filtered in the task selection, before the digest counts |
| `packages/domain/src/workspace-service.ts` (+ test) | modify | `upcomingWork` origins; `sections` and `pages` dependencies |
| `packages/domain/src/timeline-service.ts` (+ test) | modify | Links; `sections` and `pages` dependencies |
| `packages/domain/src/section-shortcut-service.ts` (+ test) | modify | Sources carry their section |
| `packages/domain/test/test-support.ts`, `packages/mcp-tools/test/harness.ts`, `apps/prototype-host/api/services.ts`, `apps/prototype-host/api/routes.test.ts` | modify | Wiring |
| `packages/mcp-tools/src/tools/workspace.ts` (both tools' descriptions), `packages/mcp-tools/src/contract.test.ts`, `apps/prototype-host/mcp/stdio.test.ts` | modify | Describe and assert `origin` |
| `core/gateway/prototype-work-manager-gateway.spec.ts`, `core/gateway/testing/fake-gateway.ts`, `features/projects/section-create-dialog.{spec,stories}.ts`, `features/projects/{project-canvas,project-page-store,project-workspace-shell}.spec.ts`, `features/dashboard/dashboard-store.spec.ts` | modify | Fixtures gain the required `section` and `origin` |
| `apps/web/src/styles/_controls.scss` | modify | `.object-row` and its parts and modifiers; fixed control width |
| `features/tasks/task-meta.ts` (+ spec) | create | Shared meta order and formatting |
| `features/tasks/task-row.{ts,html,scss}` (+ spec, stories) | modify | Anatomy, `link`, meta formatter, wrapping |
| `features/projects/pages/todos-page.{html,scss}` (+ spec, stories) | modify | Anatomy and meta formatter; hooks and semantics kept |
| `features/dashboard/widgets/{today,upcoming,recent-progress,active-projects,recent-agent-activity}/*`, `widget-content.scss` | modify | Anatomy, owner links, context, `aria-hidden` emoji |
| `features/dashboard/dashboard-page.spec.ts` | modify | Links, emoji, simulated-clock overdue accent |
| `features/projects/sections/section-contract.ts` | modify | `sourceLink` in `SectionContentInputs` and `SectionContentComponent` |
| `features/projects/sections/{markdown,progress,reflections,timeline,activity,tasks}/*-section.ts` | modify | Declare `sourceLink` |
| `features/projects/sections/section-frame/project-section-frame.ts` (+ spec) | modify | Pass `sourceLink: null` |
| `features/projects/sections/timeline/timeline-{section,store}.*` | modify | Subgrid, links, static rows, selection removed |
| `features/projects/sections/tasks/task-list-section.{html,ts,scss}` (+ spec) | modify | Sorting disabled, drag line, shortcut-row links and empty text |
| `features/projects/shortcuts/shortcut-frame.{ts,html,scss}` (+ spec, stories) | modify | Read-only sentence; `sourceLink` |
| `features/projects/shortcuts/shortcut-picker.{ts,html,scss}` (+ spec, stories) | modify | Location groups, Preview |
| `features/projects/sections/progress/progress-section.{html,scss}` (+ spec) | modify | Active formula emphasis |
| `features/projects/sections/reflections/reflections-section.scss`, `pages/reflections-page.scss`, `pages/archive-page.{html,scss}`, `sections/activity/recent-activity-section.{html,scss}`, `features/activity/activity-feed.{html,scss}` | modify | Drop decorative rule; anatomy where row-shaped |
| `features/settings/archived-projects/archived-projects-page.html` (+ spec) | modify | Ancestors only; root wording |
| `prototype/design-lab/panels/primitive-panels.{ts,html}` | modify | `.object-row` specimens: link title, static, high priority, overdue, finished, read-only |
| `prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 77` |
| `apps/web/angular.json` | modify | Initial `maximumError` 1150kB |
| `apps/e2e/objects.spec.ts` | create | Behaviour pins |
| `apps/e2e/mcp.spec.ts` | modify | `origin` over HTTP |
| `apps/e2e/ux/slice77.config.ts`, `ux/objects-verification.ts`, `ux/tasks.ts` | create / modify | Capture scope, census, T11 |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | Profile 77 as in Acceptance 4 |
| Spec §24, §27, §34, §38, §53 (grant wording) | modify | Amendments in place |
| `docs/decisions/2026-10-rows-open-their-canonical-owner.md` | create | A row outside its owner links to it; a row in its owner selects; a row with nowhere to go is static; no whole-row overlays |
| `docs/decisions/2026-08-initial-bundle-budget.md` | amend | 1150 kB |
| `docs/decisions/2026-09-a-shortcut-resolves-identity-not-content.md` | amend | Sources carry the canonical section (config included) under `projects.read`, as resolved placements already do; Preview reads rows through the viewer's grants |
| `docs/decisions/2026-09-todos-chronology-and-canonical-navigation.md` | amend | Dashboard and Timeline adopt the same link rule |
| `docs/decisions/2026-08-workspace-tools-need-their-own-service.md` | amend | `workspace.read`'s aggregate content now includes each task's page and section identity; workspace tool descriptions and §53's grant wording say so |
| `docs/decisions/README.md` | modify | Index |
| `docs/architecture/web/tasks/how.md` (rule 8 and the trap stay true; add `task-meta` and `link`), `web/{dashboard,projects,prototype-tooling}/*`, `web/what.md`, `docs/architecture/domain/{how,what}.md`, `docs/architecture/contracts/*`, `docs/architecture/mcp-tools/what.md`, `docs/architecture/testing/{how,what}.md` | modify | What is now true |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Handoff |

## Implementation sequence

0. Re-grep every spec named under Behaviour vs. appearance; build the "before" from `e0e1467`.
1. Contracts and the domain helper (tests first), then the four services, wiring, MCP.
2. `.object-row` and `task-meta` with Lab specimens and stories (foundations first, protocol §7.1).
3. `TaskRow`; Todos; dashboard; `sourceLink` and shortcut rows.
4. Timeline; picker; drag; small fixes.
5. Re-capture, sheet, reviews, Gate 2, real use.

## Test plan — tests first

| Test | Proves |
|---|---|
| `contracts/dashboard.test.ts`: task without `origin` refused; project `breadcrumb` root-first, empty for a root | Shape |
| `contracts/timeline.test.ts`: `link` optional; `sectionId` only on a task | Shape |
| `contracts/section-shortcut.test.ts`: source requires `section` | Shape |
| `domain/task-origin.test.ts`: root Home task, nested Work task, missing section or page → none, breadcrumb walks to the true root from a deep owner | Helper |
| `domain/project-todos-service.test.ts` (existing) green unedited | Extraction changed nothing |
| `domain/dashboard-service.test.ts`: every listed task has an origin naming its section; a nested workstream's task links to that workstream; a task with an unresolvable section is not listed; `workspace.read` alone suffices and no `projects.read`/`tasks.read` is newly asserted | Origins, grants |
| `domain/workspace-service.test.ts`: `upcomingWork` tasks carry the same origins; grant unchanged | Shared schema |
| `domain/timeline-service.test.ts`: task item links to its section, including under a descendant; workstream to itself; project and milestone none; `projects.read` alone still suffices | Links, grants |
| `domain/section-shortcut-service.test.ts`: sources carry the canonical section; `projects.read` alone still suffices | Picker data |
| `mcp-tools` contract tests (in process) and the host stdio test: `get_dashboard_context`, `get_upcoming_work` return `origin` | Agents see it |
| `task-meta.spec.ts`: order; due-today time option; completed date option; cancelled and done labels; `alwaysStatus` gives "To do" | Meta |
| `todos-page.spec.ts`: a `todo` task's `[data-todo-status]` reads exactly "To do" | Status label kept |
| `dashboard-service.test.ts`: with one unresolvable task, digest counts equal the listed rows | Digest agrees |
| `shortcut-picker.spec.ts`: Preview content receives `sourceLink: null`; its rows are not links | No navigation from the dialog |
| `task-row.spec.ts`: with `link`, title is an anchor to route + fragment; click and Enter never emit `selectedRequested`; read-only has no checkbox or Delete; without `link` behaviour is unchanged | Link mode |
| `todos-page.spec.ts`: checkbox precedes the title in DOM; breadcrumb is not a link; existing toggle, refusal and Delete cases unedited and green | Shape without semantic drift |
| `dashboard-page.spec.ts`: overdue row title links to `/projects/{owner}` (+ `/pages/home` for a root Home task) `#section-{id}`; emoji `aria-hidden`; the overdue accent follows `task.overdue` under a simulated `generatedAt` | Openable rows |
| `timeline-section.spec.ts`: task row title is a link; project row has no button or link; reversed-range note inline; no `aria-expanded` | Timeline |
| `project-section-frame.spec.ts`, `shortcut-frame.spec.ts`, `task-list-section.spec.ts`: every content component accepts `sourceLink`; shortcut rows link to the source section; read-only sentence; empty text | Shortcut rows |
| `shortcut-picker.spec.ts`: groups by location; Preview renders the registry component read-only; a refused (403) or failed Preview read stays in its disclosure and Add still works; an unavailable source previews its unavailable text | Picker |
| `task-list-section.spec.ts`: sorting disabled; drag line appears on drag start and clears on end; cross-list drop still calls `receive` | Drag |
| `progress-section.spec.ts`: active formula pressed and emphasised; no `button--primary` | Progress |
| archived-projects spec: nested shows ancestors once; root shows "Top-level project" | Card |
| `apps/e2e/objects.spec.ts`: overdue dashboard row by mouse, keyboard and touch lands on its section with the target highlight (a collapsed section is shown through the canvas's existing transient expansion, and nothing is written); Todos title opens; Timeline task under a descendant opens; shortcut row opens its source; in-list drag leaves DOM order unchanged and shows the line; cross-list drag moves | End-to-end |
| `build-sheet.test.mjs` profile 77: fails a task or widget title link under 24 px (44 px touch), a new `nested-interactive` node, a Must-not-change cell moved 2 px, a missing `objects-verification.json`; still applies slice 72's breadcrumb exception | The gate cannot pass falsely |

## Boundaries touched

- **Contracts once.** `origin` is `TodoTaskOriginSchema` itself; no row type is redeclared in the web.
- **Domain over repository interfaces only.** Four services gain `SectionRepository` and
  `ProjectPageRepository`; the helper is pure; no `Clock` change, no `new Date()`. Asserted grants
  are unchanged and pinned by tests. What they *return* grows: Timeline and shortcut sources stay
  within `projects.read`, which already returns section identity and config; the dashboard and
  `get_upcoming_work` now return page and section identity under `workspace.read`. That is a
  widening of `workspace.read`'s aggregate content, recorded as a decision amendment rather than
  claimed as no change.
- **MCP calls domain services.** Tool handlers are unchanged; only their output grows.
- **Components depend on gateway interfaces.** Preview reuses a registry component that reads
  through `WORK_MANAGER_GATEWAY`.
- **Shortcut discovery returns identity only.** It gains the canonical section record a resolved
  placement already carries; never rows. The amendment says so.
- **Tokens only** in every touched stylesheet; the token lint covers `_controls.scss`.
- **Routes are not contracts.** Origins carry ids and page kinds; the web builds URLs as Todos does.

## Explicit non-goals

- Everything under Do not.
- Rendering `TaskRow` on Todos or the dashboard (Revisions, round 1).
- Completing tasks from the dashboard or a shortcut.
- Reshaping Reflections entries beyond the accent rule.

## Open questions

1. **What does "open" land on?** *Chosen for this plan:* the owner section, as Todos does today
   (`#section-{id}` with the canvas's target highlight; a collapsed section opens through the
   canvas's existing `transientlyExpanded`, which writes nothing). *Alternative, deferred:* a task fragment that
   focuses the row or opens its drawer. Real use in Acceptance 7 decides whether it earns a slice.
2. **Picker content.** *Chosen:* `ShortcutSource.section` plus on-demand Preview through the
   registry component under the viewer's grants. *Rejected:* a `preview` string from the domain,
   which would read rows during discovery.
3. **Timeline selection goes.** The detail only repeats status and the range note moves inline, so
   selection has no job left. The decision entry records the reading of §38's "interactions".
4. **Todos keeps its kind label** as the first meta item, since the two kinds have different
   controls.

## Revisions

- **Round 1 (2026-10-21):** eighteen findings, ten substantive, all checked against the code.
  - The dashboard grant is `workspace.read`, not `projects.read`; the tests now pin it and the
    Timeline's and shortcut service's grants.
  - `get_upcoming_work` shares `DashboardTaskSchema` through `WorkspaceService` and
    `task-windows.ts`; both are now in scope.
  - **Todos no longer renders `TaskRow`.** That would have broken six e2e specs, lost the status
    label and the cancelled rule, and fought Todos' serialized write slot and two-phase checkbox
    reset. Todos and the dashboard now share the *anatomy* and a meta formatter instead; this also
    removes the browser-clock overdue mismatch and the widget-metadata mismatch. The `Pick<Task>`
    widening is dropped.
  - T02 was the wrong task; T04 keeps its route and a new T11 measures the dashboard path.
  - Preview had no section to render: `ShortcutSource.section` is added, with the decision amended.
  - The source link joins `SectionContentInputs` on every content component, avoiding NG0303.
  - Reflections moves to Must change (paint only).
  - Acceptance 4 now gives exact commands and profile 77's rules, and drops slice 72's row
    exceptions.
  - Minor: the unresolvable-task drop is stated as behaviour; tests added for descendants, collapsed
    targets, root cards, refused previews; shortcuts cited as §27; mcp-tools, domain and
    prototype-tooling docs added; stdio coverage named; no whole-row link overlays; L3-017 gains a
    stated reason during drag.
- **Round 2 (2026-10-21):** every round-1 finding confirmed resolved, the shortcut-section claim
  confirmed sound; two substantive and seven minor new findings, all checked against the code.
  - The meta formatter's "status when not todo" would have broken `task-interaction.spec.ts:143`
    ("To do"); Todos now passes `alwaysStatus`.
  - The Lab's live panels render `TaskRow`, the widget frame and the activity feed, so they move to
    Must change and into profile 77's rules.
  - Minor: fixed control width keeps Todos titles in one column, now measured; the `workspace.read`
    widening is stated and amended rather than denied; unresolvable tasks filter before the digest
    counts; Preview passes `sourceLink: null`; the dialog rule covers chrome only; the baseline's
    `browser/` path and T11's completion predicate are explicit (and the collapsed-target claim is
    corrected: the canvas already expands a target transiently without a write); eight fixture files are listed; the
    Task List/Todos title difference is stated.
- **Round 3 (2026-10-21):** every round-2 item confirmed resolved and the collapsed-target correction
  confirmed against `project-section-frame.ts` and `project-canvas.html`. No substantive findings remain.
