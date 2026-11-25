# Surface inventory (Slice 82 comb)

The product's surface checklist, copied at step 0c from the overhaul's working notes with nothing
but this preamble added (its rows carried no finding or theme ids to strip). It was written before
the redesign began. Where a row's state list and the build at `C82` differ (for example, a toast
and menus now exist), the build is what you audit; name the row you were nearest in a finding's
`inventoryRow` (use the row's *Surface* text, e.g. `Task List section`, or `none` with a reason in
`surface` when no row fits). The Storybook row is out of scope (not captured, not served).

Paths in this checklist are relative to `apps/web/src/app/` unless stated otherwise.
States are code-supported coverage targets, not claims that captures have been completed.
Each HTML source has its corresponding component TypeScript file unless noted.

| Check | Surface | Source paths | States and reachability |
|---|---|---|---|
| [ ] | `/` redirect | `app.routes.ts` | Redirects to `/app`. |
| [ ] | Global shell, desktop sidebar, phone navigation drawer, top bar | `core/shell/app-shell.html`, `core/shell/sidebar/sidebar.html`, `core/shell/sidebar/project-tree-item.ts`, `core/shell/top-bar/top-bar.html` | Dark/light; identity present/absent; project group expanded/collapsed; empty/populated/error tree; active route; phone drawer open/closed; inline New project form and creation error. All routes. |
| [ ] | `/app` dashboard | `features/dashboard/dashboard-page.html` | Loading/error; populated; no visible widgets; unimplemented-widget fallback. Empty, personal, busy, overdue and agent seeds; no-widgets/fallback require configured persona fixture. |
| [ ] | Dashboard widgets | `features/dashboard/widgets/registry.ts`; child folders `today/`, `upcoming/`, `active-projects/`, `recent-progress/`, `daily-digest/`, `fun-fact/`, `recent-agent-activity/`; `widget-frame/dashboard-widget-frame.html` | Seven implementations: Today, Upcoming, Active Projects, Recent Progress, Daily Digest, Fun Fact, Recent Agent Activity. Empty/populated/dense content as applicable; widget size variants. Calendar and work-summary types render unavailable fallback. |
| [ ] | `/projects/:projectId` and `/projects/:projectId/pages/:pageKind` workspace | `features/projects/project-workspace-shell.html`, `features/projects/project-page-registry.ts` | Root defaults Home; workstream resolves sole Work canvas. Loading/error/missing; navigation lazy-load placeholder/failure; unknown/disabled page fallback notice; enable-disabled-page action; missing canonical page unavailable; workstream page URL redirect. |
| [ ] | Project header and More menu | `features/projects/project-header.html`, `features/projects/project-more-menu.html` | Root/workstream labels; optional description/date; progress absent/zero/positive; completed/archived; More open; rename/description/status/date editing; inline archive confirmation; write error; Archive opening retry. |
| [ ] | Navigation tree, pencil menu, page settings and breadcrumb (Slice 81) | `core/shell/sidebar/sidebar.html`, `core/shell/sidebar/edit-project-menu.html`, `features/projects/page-settings-popover.html`, `shared/components/breadcrumb/breadcrumb.html` | Top level and a root's level; current page/location marker; workstream disclosures and depth cap; archived current and archived ancestor; pencil menu and More's mirrored items; page settings open, saving/refusal/retry; Add workstream blocked on an archived root; breadcrumb path and inline origin variant. Nested seed supplies hierarchy. |
| [ ] | Project history controls and feedback | `features/projects/history/project-history-controls.html`, `features/projects/history/project-history-feedback.ts` | Nothing available; undo/redo/both; saving/loading/unavailable/retry; blocked archived ancestor; successful/refused transition; conflict lines; other-owner Open link; dismiss. Writes, undo/redo and `#history-controls`. |
| [ ] | Creation-undone recovery | `features/projects/project-workspace-shell.html` | Missing project with captured creation; Redo available/pending/blocked by ancestor; history retry/feedback. Create then undo, or story fixture. |
| [ ] | Home and workstream Work canvases | `features/projects/project-canvas.html` | Empty/populated/dense; flow/grid; loading/error; section write error; partial placement-order notice; missing deep-link target; selected/focused target; drag/drop, keyboard movement, resizing and insertion points; unknown section fallback. |
| [ ] | Canvas insertion and section chrome | `features/projects/canvas-chrome/insertion-point.ts`, `features/projects/canvas-chrome/section-resize-handle.ts`, `features/projects/sections/section-frame/project-section-frame.html` | Hover/focus chrome; expanded/collapsed; title edit; move/resize; full/half spans; drag preview/placeholder. Settings inspector branch exists but no registered section currently supplies an inspector component. |
| [ ] | Section creation dialog | `features/projects/section-create-dialog.html` | Section/shortcut modes; type and title; pending/error; insertion anchor gone. Canvas insertion point; shortcut option only canonical Home/Work. |
| [ ] | Workstream creation dialog | `features/projects/work-create-dialog.html` | Root/nested parent choices; draft; pending/refused; parent note. Add workstream in project navigation. |
| [ ] | Shortcut picker | `features/projects/shortcuts/shortcut-picker.html` | Available sources; empty; already placed; loading/unreadable; adding/error. Creation dialog's Add shortcut. |
| [ ] | Shortcut frame | `features/projects/shortcuts/shortcut-frame.html` | Read-only section projection; expanded/collapsed; movement/resize/removal; nested source breadcrumb; archived/hidden/permission-denied source; unsupported source fallback. Nested seed supplies shortcuts. |
| [ ] | Markdown section and source editor | `features/projects/sections/markdown/markdown-section-body.html`, `features/projects/sections/markdown/markdown-source-editor.html`, `shared/components/markdown-renderer/markdown-renderer.ts` | Rendered/empty/unreadable; edit/preview; saving/refused; changed elsewhere; read-only shortcut; long/narrow prose, tables, safe-link/HTML/image handling. |
| [ ] | Task List section | `features/projects/sections/tasks/task-list-section.html` | Empty/populated/dense; loading/error; add draft; read-only shortcut; selected task; drag reorder; pending completion/delete; committed deletion recovery. |
| [ ] | Task row | `features/tasks/task-row.html` | Normal/overdue/completed/cancelled/high priority; selected/compact; inline title editing/error; completing/reopening/deleting. Section and fixtures. |
| [ ] | Task detail drawer | `features/tasks/task-detail-drawer.html` | Selected task; description present/absent; title draft/validation; priority/due date/estimate editing. Open task row; Design Lab embeds fixture. |
| [ ] | Progress section | `features/projects/sections/progress/progress-section.html` | Loading/error; unavailable/zero/positive percentage; count/weighted/manual selection and input; read-only projection. |
| [ ] | Reflections section and composer | `features/projects/sections/reflections/reflections-section.html`, `features/projects/sections/reflections/reflection-composer.html` | Empty/populated/loading/error; compose idle/armed/subject-linked/read-only; pending/refused; inline edit/cancel; edited entry timestamp. |
| [ ] | Timeline section | `features/projects/sections/timeline/timeline-section.html` | Empty/populated/dense; loading/error; selected/expanded detail; point/range dates; reversed source-range warning. |
| [ ] | Recent Activity section and shared feed | `features/projects/sections/activity/recent-activity-section.html`, `features/activity/activity-feed.html` | Empty/populated/dense; loading/error; human/agent actors and retained removed-entity labels. Agent and nested seeds. |
| [ ] | `/projects/:root/pages/todos` | `features/projects/pages/todos-page.html` | Empty/mixed chronology/dense; loading/unreadable; completion pending/refused; write/refresh errors; task delete recovery; descendant owner history links; archived-root writes blocked. |
| [ ] | `/projects/:root/pages/reflections` | `features/projects/pages/reflections-page.html` | Journal empty/full/unlinked; no/multiple containers; container, picker and journal loading/errors; refresh failure; subject candidates empty/populated; retained reopened/archived subjects; composer/read-only. |
| [ ] | `/projects/:root/pages/archive` and archived items | `features/projects/pages/archive-page.html`, `features/projects/archived-region/archived-region.html` | Empty/populated/dense; loading/read error/lazy content loading; ready restore/restoring/refused; archived root blocked; parent-first recovery; workstream status choice; Markdown/unknown/container recovery descriptions; descendant history links. |
| [ ] | Section removal/recovery feedback | `features/projects/section-recovery-notice.html` | Removed-to-Archive; failed removal; committed removal with failed refresh; retry/dismiss/Open Archive. Inline canvas status. |
| [ ] | `/calendar` | `features/calendar/calendar-page.ts`, `shared/components/placeholder-page/placeholder-page.ts` | Current placeholder. |
| [ ] | `/search` | `features/search/search-page.ts`, `shared/components/placeholder-page/placeholder-page.ts` | Current placeholder. |
| [ ] | `/settings` | `features/settings/settings-page.ts` | Entry page with links to agents and archived projects. |
| [ ] | `/settings/agents` | `features/settings/agents/agent-connections-page.html` | Empty/loading/error; populated permissions; busy/disabled; revoked; last-used variants. Agent seed supplies connections. |
| [ ] | `/settings/archived-projects` | `features/settings/archived-projects/archived-projects-page.html` | Empty/loading/populated; chosen status; restoring; refused/read retry; success followed by refresh error; ready roots/workstreams. Nested seed has archived hierarchy; root archive can be induced. |
| [ ] | `/prototype/design` | `prototype/design-lab/design-lab-page.html`, `prototype/design-lab/panels/live-panels.html`, `prototype/design-lab/panels/primitive-panels.html`, `prototype/design-lab/design-lab-fixtures.ts` | Token controls/reset/CSS export; copied/clipboard-unavailable/partial result. Live TaskRow, section frame/states, dashboard widget, sidebar, drawer, activity. Representative buttons, inputs, cards, project cards, menus, empty/loading/error. Fixtures independent of seed content. |
| [ ] | `/prototype/state` | `prototype/dev-panel/state-inspector-page.ts` | Shared prototype controls; layout experiment flag off; no projects/loading/error; flow/grid per-project saving states. |
| [ ] | Global development dialog | `prototype/dev-panel/dev-panel.html`, `prototype/dev-panel/dev-panel-controls.html`, `prototype/dev-panel/project-layout-control.ts` | Ctrl/Cmd+Shift+D; open/closed/loading/import error; controls error/busy; persona/seed/date/theme/layout/AI/delay/failure/flags; note draft/saved; agent empty/populated/revoked/token copied; layout flag off/no current project/refused. |
| [ ] | `**` not-found | `shared/components/placeholder-page/not-found-page.ts` | Unknown route. |
| [ ] | Toast/popover reconciliation | Feedback, More menu and page-settings sources above | No dedicated toast/popover implementation found. Inline project/history/recovery/page notices and More/page-settings surfaces are the implemented equivalents; select/date/title browser UI remain native. |
| [ ] | Storybook | `apps/web/.storybook/main.ts`; story paths below | Nineteen files. Component fixtures cover rare pending/refused/read-only conditions; route integration requires separate capture. |

### Storybook files

Relative to `apps/web/src/app/`:

```text
shared/components/markdown-renderer/markdown-renderer.stories.ts
shared/components/breadcrumb/breadcrumb.stories.ts
core/shell/sidebar/sidebar.stories.ts
features/tasks/task-row.stories.ts
features/settings/archived-projects/archived-projects-page.stories.ts
features/projects/work-create-dialog.stories.ts
features/projects/shortcuts/shortcut-picker.stories.ts
features/projects/shortcuts/shortcut-frame.stories.ts
features/projects/project-canvas.stories.ts
features/projects/project-creation-recovery.stories.ts
features/projects/section-create-dialog.stories.ts
features/projects/section-recovery-notice.stories.ts
features/projects/archived-region/archived-region.stories.ts
features/projects/history/project-history-controls.stories.ts
features/projects/pages/archive-page.stories.ts
features/projects/pages/reflections-page.stories.ts
features/projects/pages/todos-page.stories.ts
features/projects/sections/markdown/markdown-section-body.stories.ts
features/projects/sections/reflections/reflection-composer.stories.ts
features/projects/sections/section-frame/project-section-frame.stories.ts
```

### Seed and state fixture anchors

Source: `packages/prototype-data/src/seeds.ts`.

- `empty`: no projects.
- `personal-workspace`: `project-personal`.
- `busy-week`: `project-launch`, `project-home`, `project-course`, nested `project-launch-comms`.
- `nested-projects`: `project-renovation` → `project-kitchen` → `project-cabinets`; sibling `project-garden`; archived `project-legacy` → `project-legacy-child`; separate-owner `project-alex-private`; shortcuts, reflection page container and archived Markdown.
- `overdue-chaos`: `project-client-migration`, `project-admin`.
- `agent-heavy`: `project-work-manager`, `project-agent-ops`, activity and agent connections.

Overloaded is a data-density condition, not a separate template branch. Busy/overdue/nested
seeds supply meaningful density; stronger overload requires deterministic fixture expansion.
Prototype delay/failure controls expose loading and error states. Domain-specific refusal,
malformed configuration, unknown section, and committed-write/failed-refresh states require
targeted fixtures or stories rather than an assumption that a seed reaches them.

