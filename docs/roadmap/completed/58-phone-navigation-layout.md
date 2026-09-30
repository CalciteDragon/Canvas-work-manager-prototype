<!-- completed-record id="58" closed="2026-09-29" summary="Below 48rem the global sidebar is an accessible modal drawer; narrow project-column choices re-collapse the column and focus its toggle; narrow Task Lists stack the details drawer" -->
# Slice 58 — Phone navigation layout

## Goal

Close [Slice 46 finding 11](../active/46-slice-34-closeout-follow-up.md#build): at 375 px the global sidebar becomes an accessible navigation drawer. The project column and the Task List details drawer stay usable, with correct focus, Escape and route behaviour, on desktop resize and in both themes.

## Spec sections

§§8, 19–20 keep the shell presentational, with its state in its own components and no feature edge. §21 requires token-only styling. §22 requires light and dark themes and the Design Lab sidebar width. §23 is the shell: global sidebar, the project column collapsing behind a labelled control, keyboard-reachable links. §34 covers the Task List details drawer. §§68–69 cover route behaviour and component/browser verification. §§77–79 require real use, friction notes, a decision for the UX answer and a spec correction.

## Build

- **Global drawer below one breakpoint.** At `max-width: 48rem` (the canvas's existing single-column breakpoint), `AppShell` drops the sidebar track: the workspace takes the full width and the top bar gains a labelled **Menu** button (`aria-expanded`, `aria-controls`). Opening it shows the existing single `app-sidebar` instance as a modal drawer over the workspace: a container with `role="dialog"`, `aria-modal="true"` and a label, a focus trap, a Close button and a backdrop button that closes it. The sidebar's own `<nav aria-label="Workspace">` stays inside, unchanged.
  - While the drawer is open, the whole `app-top-bar` and `<main>` are `inert`. Close replaces Menu as the way out. The dev panel is mounted by `App`, outside `AppShell`, and is unaffected.
  - When closed at narrow width the sidebar is `inert` and visually hidden, so its links leave the tab order.
  - Above the breakpoint nothing changes: no Menu, no Close, no dialog attributes, no `inert`.
  - The single `app-sidebar` instance and its create-form draft are kept. `sidebar.scss` gains a block, full-height `:host`, because the grid no longer blockifies it and `.sidebar`'s `height: 100%` and scroll depend on that.
- **Focus and dismissal.** Opening moves focus to the drawer container, explicitly after render as `DevPanel` does, because `cdkTrapFocusAutoCapture` never fires zoneless. `cdkTrapFocus` then keeps Tab inside. Escape inside the drawer, the backdrop and Close all close it and return focus to Menu.
  - Escape is handled on the drawer element, not on `document`, so the dev panel's `document:keydown` Escape does not close the drawer too.
  - Choosing a link in the drawer closes it, including the current route, where the router emits no navigation. The trigger is a delegated listener for a plain primary activation of an `a[href]` inside the drawer. The Projects toggle, "+" and the form buttons do not count, and neither do modifier-key or middle clicks.
  - After a link closes the drawer, focus moves to `<main>` (`tabindex="-1"`, token-based `:focus-visible` outline), because the chosen link is no longer visible.
  - Project creation follows the same rule. A successful create navigates, closes the drawer and focuses `main`. A failed create keeps the drawer open; `Sidebar` reopens its form with the draft and moves focus to the name input, since its optimistic close removed the focused Create button. That `Sidebar` rule applies at every width, which deliberately fixes the same lost focus on desktop; the decision entry records it.
- **Focus timing.** In this zoneless app, `inert` bindings and the Menu button itself only exist after the next render. Every programmatic focus move therefore runs in `afterNextRender` after the state change: into the drawer, back to Menu, to `main`, and to the create input. A synchronous `focus()` on a still-inert `main`, or on a Menu that isn't rendered yet, silently does nothing. Specs flush rendering before asserting focus.
- **Resize.** The open state lives in `AppShell` as a component signal, not in `ShellStore` (§20), combined with a `matchMedia` signal. This follows `ProjectWorkspaceShell`'s guarded pattern, since jsdom has no `matchMedia`, and removes the listener on destroy. The SCSS media query and the TypeScript constant carry the same literal and cross-reference each other.
  - **Widening** past the breakpoint resets the drawer to closed. Focus stays on its element, now in the inline sidebar, unless it was on Close or the drawer container, which don't exist on desktop; then it moves to the sidebar's first nav item.
  - **Narrowing:** the `matchMedia` handler records synchronously whether `document.activeElement` is inside the sidebar. If so, focus moves to Menu after the render that creates Menu and inerts the sidebar.
- **Top bar at 375 px.** Menu, the product name, the theme toggle and the avatar fit without horizontal overflow. The persona name stays in the accessibility tree but is visually hidden below the breakpoint. Controls meet `--size-hit-target` on coarse pointers.
- **Project column at 375 px.** The column already collapses at ≤60rem behind its labelled toggle, and each resize resets it to the new query result (`onNarrowChange`); that stays as it is. New: while narrow, choosing a page tab, root, breadcrumb or work link collapses the column again and moves focus to its toggle, so the chosen canvas is not pushed under an open list. At desktop width, choosing a link doesn't collapse the column.
  - `ProjectPageNavigation` reports a selection through one delegated click listener on its root, with the same plain-activation filter. That covers links rendered by `ProjectWorkItem` without changing that component.
  - Whether a selection reloads depends on `projectId`, not on the link type. A page tab from a work unit changes `projectId` too. When `projectId` changes, `ProjectWorkspaceStore.load()` sets `loading`, and the shell template renders only "Loading project…", which destroys the column and its toggle.
  - So the shell doesn't branch: it keeps a pending focus request holding the selected link's target URL. The request is honoured once `!store.loading()` and the target has rendered. A same-root selection therefore resolves on the next render.
  - The request is dropped unless `router.url` still matches its URL, ignoring the fragment, when it resolves. A browser Back, a global-drawer selection or a `#history-controls` "Open" link during the load therefore cannot take focus from `main` or from `focusHistoryFragment`. The exception is the shell's own §68 fallback redirect (`replaceUrl`, for a stale or disabled tab): it moves the request to the fallback URL, so focus still lands on the toggle.
  - If the load ends without a column, focus goes to whichever branch heading rendered: "Project unavailable" or "Creation undone", each with `tabindex="-1"`. The request then clears.
- **Task details drawer.** When the Task List section is too narrow for the list plus `--layout-drawer-width`, the details drawer stacks below the rows instead of forming a second track that overflows over them.
  - Use a size container query, not a media query, because a Grid-layout section can be narrow at desktop width too. The section's host becomes a named container (`container: task-list / inline-size`), since an element cannot query its own size.
  - Two stylesheets query that container under encapsulation. `task-list-section.scss` makes `.task-workspace--drawer-open` a single track, and `task-detail-drawer.scss` drops `.drawer`'s `position: sticky; top: 0` so it can't slide over rows. No style queries are used, because Firefox lacks them.
  - Both conditions use the same literal, about the list minimum plus 22rem. Each carries a comment cross-referencing `--layout-drawer-width` and the other file, because custom properties are not allowed in a query condition. The quick-create → drawer → Delete touch path must then work without closing the drawer first.
  - The trade-off goes in the decision entry: a stacked drawer opens below the rows and may be off-screen. It is not scrolled into view automatically in this slice.
- Record the breakpoint, the drawer semantics, focus after route selection, column re-collapse and details-drawer stacking in an indexed §78 decision. Correct §23 once the behaviour is verified.

## Done when

At 375 px on `nested-projects` data, all of these hold:

- A person can open the global drawer with pointer, touch, Enter and Space, and focus stays inside it.
- Escape, the backdrop or Close returns focus to Menu.
- Choosing Home, a project, Calendar, Search or Settings closes the drawer, navigates, and focuses the workspace. A failed create keeps the drawer, the draft and focus in the form.
- The project column collapses after a page or work selection, and focus lands on its toggle, which may have been re-rendered.
- A Task List row's Delete stays tappable while its details drawer is open.
- Widening to desktop restores the inline sidebar with no stale dialog state and no lost focus. Narrowing moves focus out of the hidden sidebar.
- Neither the document nor the `<main>` scroll region overflows horizontally, in light or dark theme.

Desktop layout and every existing journey are unchanged.

## Do not

- Build a bottom tab bar, a second sidebar instance, gesture/swipe navigation, route-level mobile components, or a responsive rework of every page renderer.
- Move shell drawer state into `ShellStore`, add a feature import to `core/`, or use a literal colour, spacing or radius.
- Do findings 12–14 (drift, living-documentation sweep, umbrella closure) or change history, archive, gateway, contract or domain behaviour.
- Reset personal `.prototype/data.json`.

## Acceptance check

1. Write the component specs below first. Watch each fail for the missing behaviour (no Menu, no dialog attributes, no `inert`, no route close, no focus move, no column collapse), not for a typo.
2. Add `apps/e2e/phone-layout.spec.ts` against isolated `nested-projects` data with Playwright's own servers. At 375 × 812 with `hasTouch`/`isMobile`, in both `colorScheme` values:
   - Open the drawer by tap, then by keyboard Enter and Space on Menu. Assert `role=dialog` and `aria-modal`, that Tab and Shift+Tab stay inside it, and that clicking the workspace behind the backdrop does nothing but close.
   - Close by Escape, backdrop tap and Close. Assert focus returns to Menu each time.
   - Choose a nested project, Settings, and the already-current Home. Assert the drawer closes, the URL is right and `document.activeElement` is `main`.
   - Create a project from the drawer. Success navigates, closes and focuses `main`. A routed `POST /api/projects` failure keeps the drawer open with the error, the typed name and focus in the name input.
   - On a root project, expand the project column and choose Todos (same root, no reload), then a work unit (reload), then a root page tab from that work unit (reload). Assert each time that the column collapses and focus is on the current toggle.
   - Quick-create a Task List row, then tap Delete without closing the details drawer. Assert the recovery cue appears.
   - On Home, a project canvas, Todos, Archive and Settings, assert `document.documentElement.scrollWidth <= 375`. Also assert `scrollWidth <= clientWidth + 1` for `main.workspace` and the project workspace's main track: the shell's `height: 100vh` plus `overflow: auto` means wide content scrolls inside `main` without widening the document.
   - In a separate non-mobile context, because `isMobile` emulation may not resize faithfully:
     - At 375, open the drawer and focus a sidebar link. Widen to 1280. Assert an inline sidebar, no dialog role, no `inert`, and focus still on that link.
     - Repeat with focus on Close. Assert focus lands on the first nav item.
     - Narrow back to 375 with focus on an inline sidebar link. Assert focus is on Menu.
3. Remove the drawer-close workaround from `row-history.spec.ts`'s coarse-pointer Delete test and run it green.
4. Run `pnpm test`, `pnpm lint`, `pnpm docs:check` and `pnpm build`. Record the initial bundle against the 1050 kB budget.
5. Iterate with `pnpm --filter @cwm/e2e exec playwright test phone-layout.spec.ts row-history.spec.ts`. Then run the full `pnpm e2e` once. This is a shell-wide change, and the existing 375 px journeys in `canvas-editing`, `removal-undo`, `project-history`, `todos`, `archived-projects` and `row-history` must stay green.
6. Start `pnpm dev:host` and `pnpm dev:web` separately against an isolated `nested-projects` file. Use the app in a real browser at 375 px and at desktop width, in both themes. Record genuine friction in `.prototype/notes.json`. No MCP tool changes, so no MCP journey is required. Report exact commands, results and limits in Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/core/shell/app-shell.ts` | modify | Guarded `matchMedia` signal and drawer open signal. Open, close and route-select focus rules via `afterNextRender`. Resize reset and focus rescue. Link-activation filter. `A11yModule` import. |
| `apps/web/src/app/core/shell/app-shell.html` | modify | Drawer container with dialog attributes only when narrow and open. Close, backdrop, `inert` bindings, and `main` with `tabindex="-1"`. |
| `apps/web/src/app/core/shell/app-shell.scss` | modify | Single-column grid below 48rem, off-canvas drawer and backdrop, `main` focus outline, all token-based for both themes. |
| `apps/web/src/app/core/shell/app-shell.spec.ts`, `apps/web/src/app/app.spec.ts` | modify | A `matchMedia` stub, using the `project-workspace-shell.spec.ts` pattern. Cases per the test plan. `app.spec.ts` changes only if the guard needs it. |
| `apps/web/src/app/core/shell/top-bar/top-bar.ts`, `top-bar.html`, `top-bar.scss` | modify | Optional Menu with inputs `menuAvailable` and `menuOpen` and output `menuRequested`. Phone-width fit and a visually hidden name. |
| `apps/web/src/app/core/shell/top-bar/top-bar.spec.ts` | modify | Menu is present only when available, with `aria-expanded`/`aria-controls`, and emits on activation. The name stays accessible. |
| `apps/web/src/app/core/shell/sidebar/sidebar.scss` | modify | Block, full-height `:host` inside the drawer container. Coarse-pointer hit targets. |
| `apps/web/src/app/core/shell/sidebar/sidebar.ts`, `sidebar.html`, `sidebar.spec.ts` | modify | When a failed create reopens the form, focus the name input after render. Still no store or gateway injection. |
| `apps/web/src/app/features/projects/project-page-navigation.ts` | modify | A delegated plain-activation listener emitting `linkSelected`, which also covers `ProjectWorkItem` links. |
| `apps/web/src/app/features/projects/project-workspace-shell.ts`, `project-workspace-shell.html` | modify | While narrow, collapse on selection and hold a URL-keyed focus request. Focus the rendered toggle once loading settles and the URL still matches, otherwise the rendered branch heading (`tabindex="-1"`). |
| `apps/web/src/app/features/projects/project-workspace-shell.spec.ts`, `project-page-navigation.spec.ts` | modify | Cases per the test plan. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.scss` | modify | Host `container-type: inline-size` and a container query that stacks the details drawer below the list. |
| `apps/web/src/app/features/tasks/task-detail-drawer.scss` | modify | A size `@container task-list` query that drops sticky positioning, with the literal cross-referenced to the section. |
| `apps/e2e/phone-layout.spec.ts` | create | The browser evidence in acceptance item 2. |
| `apps/e2e/row-history.spec.ts` | modify | Drop the drawer-close workaround from the touch Delete test. |
| `docs/decisions/2026-09-phone-navigation-drawer.md` | create on implementation | Breakpoint, drawer semantics, focus after route selection, column re-collapse, details-drawer stacking and its off-screen trade-off. |
| `docs/decisions/README.md`; `docs/architecture/web/core/why.md`, `docs/architecture/web/projects/why.md`, `docs/architecture/web/tasks/why.md` | modify on implementation | Index and link the decision. |
| `docs/architecture/web/core/overview.md`, `what.md`, `how.md` | modify on implementation | Replace "desktop-first" with the narrow drawer behaviour, its state owner, and the focus-timing and breakpoint traps. |
| `docs/architecture/web/projects/overview.md`, `what.md`, `how.md` | modify on implementation | Column re-collapse on narrow selection and focus across the loading branch. |
| `docs/architecture/web/tasks/how.md` | modify on implementation | The details drawer's container-query stacking rule. |
| `docs/architecture/testing/overview.md`, `what.md`, `how.md` | modify on implementation | Add `phone-layout.spec.ts` to the E2E inventory and locate its evidence. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify on implementation | A dated §23 correction for phone width. |
| `docs/roadmap/goals.md` | modify | Now: name this active phase, and change the 375 px friction line's mis-cited `note-2026-09-06-007` to `note-2026-09-06-008`. On closure: drop that line and name the next phase. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md` | modify on closure | Link finding 11's evidence. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify when implementation starts | `CURRENT_SLICE = 58`. |
| `.prototype/notes.json` | modify on real use | Record friction. Reference the notes this slice addresses (`note-2026-09-06-008`, `note-2026-09-29-004`) from the new entry, and leave the older entries unchanged. |

This active plan, `goals.md` and the generated `docs/roadmap/progress.md` are this planning phase's documentation changes.

## Test plan — tests first

| Test | Proves |
|---|---|
| `app-shell.spec.ts: desktop keeps the inline sidebar with no menu or dialog semantics` | The wide layout is untouched. |
| `app-shell.spec.ts: narrow opens the sidebar as a labelled modal drawer and inerts the workspace` | Menu's `aria-expanded` toggles, and `role=dialog`/`aria-modal` exist only while open. The `inert` attribute is on the closed sidebar, and on the top bar and `main` while open. Focus moves into the drawer after render. jsdom does not enforce `inert`, so the blocking itself is browser-only evidence. |
| `app-shell.spec.ts: Escape, backdrop and Close return focus to Menu` | All three dismissals work. A `document` Escape from outside the drawer (the dev panel's path) doesn't close it. |
| `app-shell.spec.ts: choosing a link closes the drawer and focuses main, including the current route` | Route selection and the same-URL case. |
| `app-shell.spec.ts: link activation filter` | A modifier-click, the Projects toggle and "+" don't close the drawer. |
| `app-shell.spec.ts: create success closes via navigation; create failure keeps the drawer and draft` | The interaction with `createError`; success focuses `main`. |
| `sidebar.spec.ts: a failed create reopens the form with focus in the name input` | Focus is restored after the optimistic close removed it, at desktop width as well as narrow. |
| `app-shell.spec.ts: widening resets an open drawer; narrowing rescues focus from the sidebar` | Resize both ways through the `matchMedia` stub, including widening with focus on Close. The listener is removed on destroy. |
| `top-bar.spec.ts: Menu is offered only when available and reflects open state` | Presentational inputs and outputs; the persona name remains accessible. |
| `project-page-navigation.spec.ts: link selection is reported` | Page, root, breadcrumb and nested work links emit. The toggle, the page manager and modifier-clicks do not. |
| `project-workspace-shell.spec.ts: a narrow selection collapses the column and focuses its toggle; a wide one does not` | Covers:<br>• a same-root selection, with no reload;<br>• a work link, and a root page tab chosen from a work unit, that each reload, so focus lands on the re-rendered toggle once loading settles;<br>• an unavailable target, which focuses its heading, and a creation-undone target, which focuses its heading;<br>• a column click followed by a `#history-controls` navigation before the load settles, which leaves focus on the history group;<br>• a tab choice that the §68 fallback redirects, which still focuses the toggle;<br>• a superseded load, which doesn't focus a stale toggle.<br>The existing resize tests keep passing. |
| `phone-layout.spec.ts` (Playwright) | Everything jsdom can't show: a real focus trap, touch, `inert` blocking, container-query stacking, document and `main` overflow, themes and resize. |

## Boundaries touched

- `core/` stays self-contained. `AppShell`, `TopBar` and `Sidebar` gain only component-local UI state. `ShellStore` is untouched (§20). Core imports `@angular/cdk/a11y` and neither `prototype/` nor a feature. `Sidebar` stays presentational: no injection of stores or gateways.
- The project column's collapse remains `ProjectWorkspaceShell` state in the projects feature. The feature doesn't reach into the global drawer, and the shell doesn't reach into the column; they share the breakpoint idea, not code.
- Styles use tokens only. Breakpoint literals in media and container queries follow the existing `60rem`/`48rem`/`40rem` idiom, with a comment naming the token each one mirrors, because custom properties can't be used in a query condition. There is no gateway, contract, domain, MCP or persistence change and no prototype-mode branch.

## Explicit non-goals

- Making every renderer phone-perfect: canvas editing, Grid resize and Settings rows get no work beyond "no horizontal overflow". Also out: swipe gestures, a persisted drawer preference, and a separate tablet layout.
- Auto-closing, or auto-scrolling to, the task details drawer after quick create. Stacking fixes the overlap without changing the §34 create flow.
- Changing the project column's existing reset on resize.
- Slice 46 findings 12–14 and Slice 34/46 closure.

## Open questions

None blocking. These are the defaults, and the decision entry will record what real use confirms:

- The breakpoint is 48rem, so a 768 px tablet keeps the inline sidebar.
- After a route selection, focus moves to `main`, not Menu.
- The column re-collapses only while narrow.
- A stacked task details drawer is not auto-scrolled into view.

## Revisions

- **Initial plan (2026-09-29):** Scoped finding 11 to three pieces, with browser evidence in both themes:
  - a global modal drawer below 48rem;
  - project-column re-collapse on narrow selection;
  - details-drawer stacking for `note-2026-09-29-004`.
- **Review round 1 (2026-09-29):** Each finding was checked against the code before revising. Three were blocking:
  - **Overflow evidence.** Overflow is now also asserted on `main` and on the project main track, because the shell's `100vh` `main` scrolls internally.
  - **Column focus after a reload.** After a reloading column link, focus now waits until the store's loading branch finishes and the new toggle has rendered. The unavailable and superseded-load cases are now specified.
  - **Focus timing.** Every focus move runs after render: in the zoneless app, `inert` and Menu exist only after a render.

  Smaller fixes:
  - focus goes to the name input after a failed create;
  - widening while focus is on Close is covered;
  - the wrapped sidebar gets a block `:host`;
  - the note id is corrected to `-008`, and `goals.md` is fixed;
  - the column's real resize behaviour is described;
  - container-query placement, the sticky drawer and the query's literal are specified;
  - the jsdom `matchMedia` and `inert` limits are stated;
  - the whole top bar is inert while the drawer is open;
  - route-close has a link-activation filter;
  - resize runs in a separate browser context;
  - the full `pnpm e2e` suite runs once.
- **Review round 2 (2026-09-29):** The reviewer confirmed that all round-1 findings are resolved. It checked two things and found them sound: the order in which `inert` is removed before focus returns to Menu, and the container query on a host whose width is set by its parent. Changes made:
  - The column's pending focus is now a request keyed to the selected URL. It is dropped when another navigation wins, which includes `focusHistoryFragment`'s `#history-controls` focus.
  - Whether a selection reloads now follows `projectId` rather than link type. A root page tab chosen from a work unit reloads.
  - Focus falls back to the heading of whichever branch rendered, including "Creation undone".
  - The drawer's stacking now uses a named size container queried from both stylesheets, with no style queries.
  - The decision records that the failed-create focus rule also changes desktop behaviour.
- **Review round 3 (2026-09-29):** The reviewer confirmed all round-2 fixes. One remaining minor gap: the shell's §68 `replaceUrl` fallback redirect would drop the URL-keyed focus request. The request now follows that redirect, and a spec case covers it. There are no further substantive findings, so the plan is ready for implementation.

## Outcome

**Deliverables.** Below 48rem the one `app-sidebar` is now a modal navigation drawer behind a
labelled **Menu** ([`app-shell.ts`](../../../apps/web/src/app/core/shell/app-shell.ts),
[`top-bar.ts`](../../../apps/web/src/app/core/shell/top-bar/top-bar.ts)). It has a dialog role
and label, a CDK focus trap, Close and a backdrop, and the top bar and `<main>` are inert behind
it. Escape, Close and the backdrop return focus to Menu. A link choice, including the current
route, and a successful create close it and focus `<main>`. A failed create keeps or reopens it,
with the draft and focus in the name input, at every width. A resize resets it and keeps or
rescues focus.

While ≤60rem, a chosen project-column link re-collapses the column and focuses its toggle once
any reload has rendered, or the "Project unavailable" / "Creation undone" heading. A §68
redirect carries the request; a navigation that wins elsewhere drops it
([`project-workspace-shell.ts`](../../../apps/web/src/app/features/projects/project-workspace-shell.ts),
[`project-page-navigation.ts`](../../../apps/web/src/app/features/projects/project-page-navigation.ts)).

A Task List narrower than 42rem stacks its details drawer below the rows, unsticky, so Delete
stays tappable ([`task-list-section.scss`](../../../apps/web/src/app/features/projects/sections/tasks/task-list-section.scss)).
Controls meet `--size-hit-target` on coarse pointers, and the persona name is visually hidden but
still read out. [`phone-layout.spec.ts`](../../../apps/e2e/phone-layout.spec.ts) is the browser
evidence, and `row-history.spec.ts` no longer closes the drawer before Delete.

**Deliberate choices.** The rules are in
[the phone drawer decision](../../decisions/2026-09-phone-navigation-drawer.md). Three were
forced by the browser rather than chosen:

- **The column reports links in the capture phase.** A link between `/projects/:id` and
  `/projects/:id/pages/:kind` makes the router replace the shell synchronously inside
  `RouterLink`'s click handler, before a bubbling listener runs.
- **The focus request is a root-scoped `ProjectColumnFocusRequest`, not shell state.** The shell
  instance it would live in is destroyed by that same replacement. It clears itself on any
  `NavigationEnd` elsewhere.
- **The closed drawer is hidden by a signal-bound class.** Chrome applies the media query before
  `matchMedia` reports it, so a query-only rule blurs the focused link before the shell can
  rescue it.

The URL match is exact rather than fragment-blind. A column link never has a fragment, so a
fragment means another navigation won.

**Deviations from the plan.**

- **Files outside the list.** `dev-panel.ts` and `app-shell.ts` import `CdkTrapFocus` instead of
  `A11yModule`: the slice's first build measured 1052.5 kB against the 1050 kB ceiling. The
  budget decision is amended with 1048.5 kB, and the ceiling was not raised.
  `project-tree-item.scss` gained the touch target. `shell-store.ts` passes a repeated
  no-workspace refusal through `null`.
- **Planned files unchanged.** `sidebar.html` already had the `#newName` ref, and `app.spec.ts`
  needed no change.
- **Real use added one rule.** Widening from a focused Menu now moves focus to the first sidebar
  item.
- **Diff review, three rounds, added four fixes:**
  - The root request clears on navigation elsewhere, so it can no longer fire on a later visit.
  - A dismissed drawer reopens when its pending create fails.
  - An identical repeat refusal reopens the form, through `Sidebar.reopenCreate()`, because an
    unchanged input value is not forwarded.
  - Every phone journey runs in both themes, with touch-target, hidden-name and Archive-ready
    assertions.

**Verification.**

| Check | Result |
|---|---|
| `pnpm test` | Green: web 856 tests, domain 802, host 284, contracts 355, repositories 191, MCP tools 173, prototype-data 122 |
| `pnpm lint`, `pnpm docs:check` | Green |
| `pnpm build` | Initial bundle 1048.5 kB, under the 1050 kB ceiling; the 850 kB warning still shows |
| `pnpm --filter @cwm/e2e exec playwright test phone-layout.spec.ts row-history.spec.ts --repeat-each 2` | 34/34 |
| `pnpm e2e` | 84/84 before the review fixes; 88/88 after them |

Real use ran against an isolated `nested-projects` file. The host was started with
`CWM_DATA_FILE`, the web app separately, and the app was used at 375 px and 1280 px in both
themes; see `note-2026-09-29-005`. The in-app browser pane was hidden, so it neither painted nor
dispatched `matchMedia` changes, and resize behaviour in real use rests on the Playwright context.
No MCP change, so no MCP journey was run.

**Deferred.**

- A stacked details drawer below the fold after quick create is not scrolled into view. The
  decision records this and `goals.md` lists it as known friction.
- The persona's stored theme overrides a session toggle whenever the shell re-applies the
  identity. This predates the slice, is outside it, and is offered as its own task.
- Slice 46 findings 12–14 remain.

**Open questions.** Whether 48rem and 42rem are the right lines is untested beyond this use.

**Documentation updated.**

- Architecture folders: `web/core`, `web/projects`, `web/tasks` and `testing`.
- The new decision, plus the bundle-budget amendment, both indexed.
- The dated §23 correction.
- `goals.md`, Slice 46's finding 11, and `.prototype/notes.json`.
