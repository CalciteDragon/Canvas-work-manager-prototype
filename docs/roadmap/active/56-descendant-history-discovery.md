<!-- plan id="56" status="active" summary="Root Todos and Archive link to each descendant owner's existing history controls" -->
# Slice 56 — Descendant history discovery

## Goal

Close [Slice 46 finding 9](../planned/46-slice-34-closeout-follow-up.md#build) by giving root Todos and Archive rows a durable route to their descendant owner's existing history controls.

## Spec sections

§§8–12 keep the gateway and contract boundaries; §26 places the only browser Undo/Redo controls in the displayed project's header; §31 scopes history to the exact actor and owning project; §34 makes Todos a root-tree projection with canonical origins; §§68–69 require routable, testable browser behavior; §§77–79 require living docs, real use and friction notes.

## Build

- On a root Todos row whose owner differs from the displayed root, show an **Open <owner> history** link. A task uses `item.origin.projectId`; a subproject row uses `item.project.id`. On root Archive, use `item.origin.projectId` for a descendant item, including an archived subproject. Keep the existing content/origin link and Restore action independent. Do not show a redundant link on a root-owned row.
- Link to the canonical owner route with `#history-controls`: root owner at `/projects/:id/pages/home`, subproject owner at `/projects/:id`. Derive route segments in the web feature from the existing discriminated projection and project kind; add no URL or history data to the contracts. The link names the owner using the existing breadcrumb or subproject record, and never promises an available Undo step.
- In `ProjectWorkspaceShell`, handle only the exact `history-controls` fragment after the asynchronous project/header render. Bring the existing history group into view and focus it, or its first button, without activating a transition. Repeat on a direct URL load or reload; at focus time recheck both the project and exact current fragment so a same-project switch to `#section-…` cannot steal focus back from the canvas.
- Keep `ProjectHistoryStore` scoped to the displayed project, and rely on its server read for the current actor. The root summary and descendant summary keep independent revisions/cursors; a link itself does not fetch or merge histories. A different browser persona cannot open a project in another workspace; a same-workspace agent connection reads only its own history through MCP.
- On implementation, record the route and wording choice in a small indexed §78 decision, correct the spec's §26/§31 discovery text, and update the web/projects architecture. Use a realistic seed and inspect the keyboard and reload journey before closing.

## Done when

From root Todos and Archive, a row owned by a descendant offers a named link to that owner's existing header history controls. Following or reloading its URL lands on and focuses those controls; root-owned rows do not add a second history link. Root and descendant cursors remain separate; another browser persona cannot reach the project, and a same-workspace agent connection cannot read the person's step. Content links, Archive Restore and `#section-…` still work, and no second Undo surface appears.

## Do not

- Do not add a merged root-tree history, history browser, new Undo button, receipt cache, new gateway call, persistence field or contract type.
- Do not implement Slice 46 finding 10's Delete feedback, finding 11's phone navigation, or the umbrella drift/closure work.
- Do not change a history grant, cursor, transition, Clock, UnitOfWork or retention rule; do not reset personal `.prototype/data.json`.

## Acceptance check

1. Run focused web component tests: a descendant task and unit-of-work row in Todos, and descendant subproject/section/task/reflection rows in Archive, render a named owner-history link with the canonical href and no extra Undo control; root-owned rows omit it. Existing content/origin links and Restore remain intact. An archived descendant project's own row still links to its header, and that header handles archived history availability.
2. Run an isolated `nested-projects` Playwright journey: create separate root and child actions as the same persona, open the child's history from both Todos and Archive, verify URL, scroll/focus and the child's exact Undo/Redo name; reload and verify focus and same actor's step. Return to root and verify its own action/revision is unchanged by child Undo/Redo. Switch browser persona at the child URL and verify Project unavailable with no history controls. Use a same-workspace agent connection and MCP `get_operation_history` to verify the agent's summary does not expose the person's action. Check keyboard activation and `#section-…` navigation.
3. Run `pnpm test`, `pnpm lint`, `pnpm docs:check`, and the focused Playwright files. Start the app with isolated `nested-projects` data, follow both links in a browser, exercise a descendant Undo and record genuine friction in `.prototype/notes.json`. Report commands, results and any limits in Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/features/projects/pages/todos-page.ts` | modify | Derive descendant owner, name and canonical history route from the existing projection. |
| `apps/web/src/app/features/projects/pages/todos-page.html` | modify | Render a separate owner-history link only for descendant rows. |
| `apps/web/src/app/features/projects/pages/todos-page.scss` | modify only if needed | Keep the added link readable in the chronology with design tokens. |
| `apps/web/src/app/features/projects/pages/todos-page.spec.ts` | modify | Test descendant/root link cases, accessible wording and preserved row actions. |
| `apps/web/src/app/features/projects/archived-region/archived-region.ts` | modify | Derive the owner-history destination from archive origin and breadcrumb. |
| `apps/web/src/app/features/projects/archived-region/archived-region.html` | modify | Render a separate owner-history link when the item owner is below the root. |
| `apps/web/src/app/features/projects/archived-region/archived-region.scss` | modify only if needed | Keep the added link readable beside origin and Restore using design tokens. |
| `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts` | modify | Test each archive item kind, archived-owner routing and root-owned omission. |
| `apps/web/src/app/features/projects/pages/archive-page.html` | modify | Pass the displayed root id to the shared archived list for the descendant test. |
| `apps/web/src/app/features/projects/archived-region/archived-region.stories.ts` | modify | Supply the new root id input in the existing story. |
| `apps/web/src/app/features/projects/project-workspace-shell.ts` | modify | Resolve the history fragment after header render, with navigation-generation and focus guards. |
| `apps/web/src/app/features/projects/project-workspace-shell.html` | modify | Give the one existing history-control group a stable in-page target. |
| `apps/web/src/app/features/projects/project-workspace-shell.spec.ts` | modify | Verify direct/reloaded fragment focus and stale-navigation behavior without a transition. |
| `apps/e2e/todos.spec.ts`, `apps/e2e/archive.spec.ts` | modify | Browser route, focus, reload, independent cursor and actor-isolation evidence. |
| `docs/decisions/2026-09-descendant-history-discovery.md` | create on implementation | Record why owner links target the existing header and how actor isolation is preserved. |
| `docs/decisions/README.md`, `docs/architecture/web/projects/why.md` | modify on implementation | Index and link the decision. |
| `docs/architecture/web/projects/overview.md`, `docs/architecture/web/projects/what.md`, `docs/architecture/web/projects/how.md` | modify on implementation | Describe the delivered route, its component inventory and fragment focus. |
| `docs/architecture/testing/how.md` | modify on implementation | Identify the new Todos/Archive browser acceptance evidence and actor-isolation limit. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify on implementation | Clarify §§26 and 31 with observed descendant discovery behavior. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md` | modify on closure | Link the completed finding-9 evidence and identify the next remaining finding. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify when implementation starts | Set `CURRENT_SLICE` to 56 for real-use notes. |
| `.prototype/notes.json` | modify only if real use finds friction | Record an observed issue. |

This active plan and generated `docs/roadmap/progress.md` are the planning changes; behavior and architecture changes land with implementation.

## Test plan — tests first

| Test | Proves |
|---|---|
| `todos-page.spec.ts: descendant rows link to their owner's history` | Task and subproject origins produce the correct owner route and label; root rows omit the link, and content/complete/Delete controls remain separate. |
| `archived-region.spec.ts: descendant items link to their owner's history` | Each item kind uses its true owner, including an archived subproject; root-owned rows omit the link and Restore remains unchanged. |
| `project-workspace-shell.spec.ts: history fragment focuses the one header control group` | Direct navigation and reload reach the existing controls after render, ignore a different project or same-project fragment that wins the race, and leave section fragments and transitions alone. |
| `todos.spec.ts` and `archive.spec.ts: descendant history is discoverable without merging cursors` | Real links survive reload and keyboard activation; root and child revisions stay distinct; another browser persona sees Project unavailable and a same-workspace MCP agent does not see the person's step. |

Write each test first and see it fail for the intended missing link/focus behavior. For an assertion that already passes, use a temporary targeted fault and revert it before treating it as evidence.

## Boundaries touched

- Angular components use existing typed projection values and router APIs, never HTTP or a concrete gateway. No change to `app.config.ts`, `core/`, domain or MCP is expected.
- The shared contracts remain the only definitions of Todos/Archive rows; route construction is a web concern. The server continues to authorize history reads/transitions for the exact actor and project.
- Header-only Undo/Redo remains intact. The history link navigates to that header and carries no action id, revision, actor id or transition request.
- Styling, if the link needs spacing, uses only existing design tokens. The centralized prototype flag and injected domain Clock are untouched.

## Explicit non-goals

- A tree-wide history summary, cross-project step navigation inside Undo, or any new server capability.
- A link for rows already owned by the displayed root, which already has that history in its header.
- Slice 46 findings 10–14 and the final Slice 34/46 umbrella closure.

## Open questions

None blocking. `#history-controls` is the URL-level affordance; the implementation decision will record the observed focus behavior and wording. The link offers access to the owner's current summary, not a promise that a particular row's past action remains the top Undo step.

## Revisions

- **Initial plan (2026-09-29):** Scoped finding 9 to owner links in root projections and one stable header fragment; included reload, keyboard, actor-isolation and separate-cursor evidence.
- **Review round 1 (2026-09-29):** The reviewer found that seeded browser personas belong to separate workspaces. Replaced the ambiguous actor assertion with Project unavailable for another browser persona and a same-workspace agent MCP history read for exact-actor isolation. A disabled optional page can only own root rows in current projections, so the descendant assertion now uses an archived subproject. Added testing and projects component-inventory docs, and a same-project fragment-race guard/test so section navigation cannot lose focus to a scheduled history callback.
- **Review round 2 (2026-09-29):** The reviewer confirmed the archived subproject route and same-workspace MCP agent read are feasible. Added the two conditional component styles to make the file list a complete checklist for visual QA.
