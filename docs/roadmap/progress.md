# Progress

The status board. Everything between the two markers is **generated** by
`node scripts/roadmap.mjs sync` from the plan files in `active/`, `planned/` and
`completed/` and their first-line state markers; `pnpm docs:check` fails when it is stale.
Edit the plans, not the board. Direction and priority live in [`goals.md`](goals.md); this
file only says what state each slice is in.

Completed records are ordered by closing date. `U1`–`U3` are the three friction-chosen
phases between Slice 17 and the 25.x overhaul; `25 (repair)` and `16 (follow-up)` are
verification follow-ups rather than feature slices.

<!-- roadmap:begin -->
### Active

_Nothing is active. Start one with `node scripts/roadmap.mjs start docs/roadmap/planned/<file>`._

### Planned

| Slice | Title | Summary | Plan |
|---|---|---|---|
| 18 | Slice 18 — Calendar | Month and agenda views derived from existing task, milestone and project dates — no duplicated event rows | [18-calendar.md](planned/18-calendar.md) |
| 19 | Slice 19 — Milestones | Milestone as a distinct model with its own service and section type — and the finding of whether it deserves to be one | [19-milestones.md](planned/19-milestones.md) |
| 20 | Slice 20 — Subtasks and task ordering | Subtask rendering and progress roll-up, drag ordering within a list, and move-to-project — behind the subtasks flag | [20-subtasks-and-task-ordering.md](planned/20-subtasks-and-task-ordering.md) |
| 21 | Slice 21 — Command palette | Ctrl/Cmd+K palette over the existing operations, plus the search page §40 promised — evidence for which MCP tools should exist | [21-command-palette.md](planned/21-command-palette.md) |
| 22 | Slice 22 — Agent confirmations | Confirmation before an agent archives or bulk-edits, using MCP's input-required pattern, behind the agentConfirmations flag | [22-agent-confirmations.md](planned/22-agent-confirmations.md) |
| 23 | Slice 23 — Dashboard configuration | Add, remove, reorder, hide and resize dashboard widgets from the UI, persisted per persona | [23-dashboard-configuration.md](planned/23-dashboard-configuration.md) |
| 24 | Slice 24 — AI project summaries and tool experiments | AI Summary section behind aiSummarySections, and the §56 tool-shape experiments run against real clients | [24-ai-project-summaries-and-tool-experiments.md](planned/24-ai-project-summaries-and-tool-experiments.md) |
| 30 | Slice 30 — Atomic, placement-aware section removal Undo | Persist and execute one scoped inverse per section removal in the existing unit of work | [30-atomic-section-removal-undo.md](planned/30-atomic-section-removal-undo.md) |
| 31 | Slice 31 — Disposable removal and immediate Undo UI | Safely delete disposable sections and expose receipt-driven Undo through the gateway and canvas | [31-disposable-removal-and-undo-ui.md](planned/31-disposable-removal-and-undo-ui.md) |
| 32 | Slice 32 — Section creation, movement and settings Undo | Extend typed operation Undo to section add, move and settings updates | [32-section-edit-undo.md](planned/32-section-edit-undo.md) |
| 33 | Slice 33 — Recovery and Undo integrated acceptance | Verify recovery, Undo, permissions and migration through browser and MCP journeys | [33-recovery-undo-integrated-acceptance.md](planned/33-recovery-undo-integrated-acceptance.md) |

### Completed

| Slice | Title | Closed | Summary | Record |
|---|---|---|---|---|
| 1 | Slice 1 — Empty monorepo that starts | 2026-08-26 | pnpm workspace, the Angular 22 shell and the host with one health route; packages consumed as source | [01-empty-monorepo.md](completed/01-empty-monorepo.md) |
| 2 | Slice 2 — Contracts package | 2026-08-26 | Zod contracts for every entity, input and the data.json document, exported from one entrypoint | [02-contracts-package.md](completed/02-contracts-package.md) |
| 3 | Slice 3 — JSON persistence + repositories | 2026-08-26 | JSON data store with atomic temp-and-rename persistence, units of work and document integrity checks | [03-json-persistence-repositories.md](completed/03-json-persistence-repositories.md) |
| 4 | Slice 4 — Seeds, personas, clock, reset | 2026-08-26 | Five deterministic seeds, three personas, the settable domain clock and the reset/seed CLI | [04-seeds-personas-clock-reset.md](completed/04-seeds-personas-clock-reset.md) |
| 5 | Slice 5 — Domain services + first HTTP API | 2026-08-26 | Project, task and activity services over repository interfaces, exposed through the first §61 routes | [05-domain-services-http-api.md](completed/05-domain-services-http-api.md) |
| 6 | Slice 6 — Gateway boundary + Angular shell | 2026-08-27 | The gateway boundary, identity provider, design tokens, two themes and the app shell over HTTP | [06-gateway-boundary-angular-shell.md](completed/06-gateway-boundary-angular-shell.md) |
| 7 | Slice 7 — Tasks: the first real feature | 2026-08-27 | Task list store, the TaskRow variants, the detail drawer and optimistic completion with revert | [07-tasks-first-real-feature.md](completed/07-tasks-first-real-feature.md) |
| 8 | Slice 8 — Project page + section registry | 2026-08-27 | Project page, the section registry, ProjectSectionFrame, and the Rich Text and Task List sections | [08-project-page-and-section-registry.md](completed/08-project-page-and-section-registry.md) |
| 9 | Slice 9 — Layout modes: flow vs grid | 2026-08-28 | Flow and grid layouts with CDK drag-drop, View versus Edit Layout Mode, and the per-project layout flag | [09-layout-modes-flow-vs-grid.md](completed/09-layout-modes-flow-vs-grid.md) |
| 10 | Slice 10 — The remaining first-milestone sections | 2026-08-28 | Sub-Projects, Progress with three formulas, Reflections and the derived Timeline sections | [10-remaining-first-milestone-sections.md](completed/10-remaining-first-milestone-sections.md) |
| 11 | Slice 11 — Dashboard | 2026-08-28 | Dashboard widgets over one derived read, the AIProvider interface and the deterministic mock digest | [11-dashboard.md](completed/11-dashboard.md) |
| 12 | Slice 12 — Development panel | 2026-08-28 | The Ctrl/Cmd+Shift+D development panel, /prototype/state, the host rig endpoints, flags and friction notes | [12-development-panel.md](completed/12-development-panel.md) |
| 13 | Slice 13 — Agent connections, permissions, activity | 2026-08-29 | Agent connections, bearer tokens, domain-enforced permissions and the actor-aware activity feed | [13-agent-connections-permissions-activity.md](completed/13-agent-connections-permissions-activity.md) |
| 14 | Slice 14 — Tool registry + in-process contract tests | 2026-08-29 | The transport-free tool registry with §54's fourteen tools and in-process contract tests | [14-tool-registry-contract-tests.md](completed/14-tool-registry-contract-tests.md) |
| 15 | Slice 15 — MCP HTTP endpoint (and stdio) | 2026-08-29 | MCP over Streamable HTTP and stdio through the official SDK v2, with the client setup guide | [15-mcp-http-and-stdio.md](completed/15-mcp-http-and-stdio.md) |
| 16 | Slice 16 — Live updates | 2026-08-30 | One Server-Sent Event after every committed activity record; feature stores refresh without a reload | [16-live-updates.md](completed/16-live-updates.md) |
| 16 (follow-up) | Slice 16 follow-up — live-updates correctness | 2026-08-30 | Closed the derived-view propagation, reconnect recovery and quiet-read races found after Slice 16 | [16-live-updates-correctness-follow-up.md](completed/16-live-updates-correctness-follow-up.md) |
| 17 | Slice 17 — Design Lab, Storybook, and the end-to-end tests | 2026-08-31 | Design Lab knobs, Storybook on the Vite framework, project create/edit/archive UI and the two e2e tests | [17-design-lab-storybook-and-e2e.md](completed/17-design-lab-storybook-and-e2e.md) |
| U1 | Container sections own their rows | 2026-09-01 | Container sections own their rows and views own nothing; four section MCP tools; schema version 2 | [2026-09-section-ownership-implementation.md](completed/2026-09-section-ownership-implementation.md) |
| 25.0 | Slices 25.0–25.8 — Multi-page projects overhaul (roadmap and 25.0) | 2026-09-04 | Settled the root-workspace and subproject semantics, amended the spec and staged 25.1–25.8 | [25-multi-page-projects-overhaul.md](completed/25-multi-page-projects-overhaul.md) |
| U2 | A section has a name | 2026-09-04 | Sections have a derived name with an optional title override, and a typed non-empty removal refusal | [2026-09-section-names-implementation.md](completed/2026-09-section-names-implementation.md) |
| U3 | Archive keeps its promise | 2026-09-04 | Removing a section archives it; cascade and restore for sections, tasks and reflections; integrity rules | [2026-09-archive-restore-implementation.md](completed/2026-09-archive-restore-implementation.md) |
| 25.1 | Slice 25.1 — Root/subproject model and persistent pages | 2026-09-05 | Project kinds as a discriminated union, canonical pages, and schema version 3 with a bounded converter | [25.1-owner-kinds-and-persistent-pages.md](completed/25.1-owner-kinds-and-persistent-pages.md) |
| 25.2 | Slice 25.2 — Page ownership through domain, API and MCP | 2026-09-05 | Pages own sections end to end: page-scoped positions, optional-page toggles and the archived-ancestor rule | [25.2-page-aware-ownership.md](completed/25.2-page-aware-ownership.md) |
| 25.3 | Slice 25.3 — Secondary sidebar, Home and subproject canvas | 2026-09-06 | ProjectWorkspaceShell, the project navigation column, one header per project and a page-scoped canvas | [25.3-workspace-shell-and-subproject-canvas.md](completed/25.3-workspace-shell-and-subproject-canvas.md) |
| 25.4 | Slice 25.4 — Home shortcuts | 2026-09-06 | Read-only Home shortcuts to sections elsewhere in the root tree, over HTTP and MCP | [25.4-home-shortcuts.md](completed/25.4-home-shortcuts.md) |
| 25.5 | Slice 25.5 — Chronological Todos | 2026-09-06 | The chronological Todos projection across a root tree, with canonical navigation into containers | [25.5-chronological-todos.md](completed/25.5-chronological-todos.md) |
| 25.6 | Slice 25.6 — Root Archive and reachable undo | 2026-09-06 | The root-wide Archive page and projection, explicit reactivation, and the archive/restore MCP tools | [25.6-root-archive-and-reachable-undo.md](completed/25.6-root-archive-and-reachable-undo.md) |
| 25 (repair) | Slice 25 verification — local dependency repair | 2026-09-07 | Restored the locked pnpm install and fixed the runtime and test defects it exposed | [25-dependency-repair.md](completed/25-dependency-repair.md) |
| 25.7 | Slice 25.7 — Completed-work reflections | 2026-09-07 | Subject-linked reflections, the root journal feed, the completed-work picker and get_project_journal | [25.7-completed-work-reflections.md](completed/25.7-completed-work-reflections.md) |
| 25.8 | Slice 25.8 — Integrated acceptance and documentation closure | 2026-09-08 | Integrated browser and MCP acceptance on the nested-projects showcase, and documentation closure | [25.8-integrated-acceptance-and-documentation-closure.md](completed/25.8-integrated-acceptance-and-documentation-closure.md) |
| 26 | Slice 26 — Documentation overhaul | 2026-09-10 | Living documentation tree and roadmap; Compodoc links and completion guards verified | [26-documentation-overhaul.md](completed/26-documentation-overhaul.md) |
| 27 | Slice 27 — Direct canvas editing and navigation cleanup | 2026-09-13 | Direct canvas editing, positioned creation, resizing, navigation cleanup and MCP acceptance are implemented and verified. | [27-direct-canvas-editing.md](completed/27-direct-canvas-editing.md) |
| 28 | Slice 28 — Archive, removal and Undo planning | 2026-09-13 | Imported the proposed refactor spec and reviewed five dependency-ordered implementation candidates | [28-archive-removal-undo-planning.md](completed/28-archive-removal-undo-planning.md) |
| 29 | Slice 29 — Recovery policy and content-oriented Archive | 2026-09-14 | Archive projects recoverable content via one capability source and a pure domain policy, with recovery metadata and two-step guidance | [29-recovery-policy-and-archive.md](completed/29-recovery-policy-and-archive.md) |
<!-- roadmap:end -->
