<!-- plan id="73" status="active" summary="Redesign slice 3 (TH06): the task drawer, More and page settings become lifts that take focus, close on Escape and return it; focus survives route changes" -->
# Slice 73 — Lifts and focus

Redesign slice 3 under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). Theme **TH06**,
"Overlays and focus do not follow the user", in [themes.json](../70-ui-ux/themes.json).

## Goal

Make the task drawer, the project **More** actions and the page settings into **lifts** (principle
1). Each one opens where the user is looking, takes focus, closes on Escape and returns focus to the
control that opened it. Focus also lands somewhere meaningful after a route change.

## Spec sections

- **§21** visual design system. Lifts use the slice-71 lift tokens (`--plane-lift-*`,
  `--lift-shadow`, durations, easings). No literals.
- **§23** application shell. The project navigation gear's page settings become a popover lift.
  Focus lands after route changes from in-page controls (W3-003).
- **§26** project page design.
  - More becomes a menu. Name, description and date move to a Project details dialog with one
    commit.
  - The Gate 1 correction "adding a task keeps focus in the add field and does not open its
    details" is implemented here (Scope check).
- **§34** task interactions. The detail drawer becomes a side lift. This amends Slice 61's "opening
  keeps focus where it was".
- **§67** Design Lab. The lift specimens become the real lifts.
- **§68** route map. Hiding the current page from the popover still redirects as it does today.
- **§69** verification. Behaviour is tested first, appearance by capture.
- **§77** design-first loop. The e2e journeys that pin the inline drawer and the inline More panel
  change together with the implementation and the docs.
- **§78** decision log.
- [Overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7.

## Build

- **Lift foundations.** A global `_lifts.scss` with `.lift`, `.lift--side`, `.lift--sheet`,
  `.lift--popover`, `.lift--dialog`, `.menu`, `.menu__item` and `.menu__separator`, following the
  [global-classes decision](../../decisions/2026-10-control-primitives-are-global-classes.md).
  Motion uses `transform` and `opacity` only, and reduced motion falls back to a crossfade. The Lab
  gets specimens and Storybook gets a story.
- **Mechanism: the browser's top layer** (Open question 4):
  - `popover="auto"`, opened by a declarative invoker, for the menu and the page settings;
  - `popover="manual"` for the desktop side drawer;
  - `<dialog>` opened with `showModal()` for dialogs and the phone task sheet.
- **One focus helper**, `shared/lifts/lift-focus.ts`. It records the real opener, moves focus in
  after render, and overrides native focus restoration on close: to the opener, or to a named
  fallback when the opener has gone.
- **Task drawer.** On desktop it is a top-layer side lift; the canvas reserves its width while it
  is open. On a phone it is a modal sheet. Selecting a task moves focus into it. Quick-add no
  longer opens it.
- **More.** A menu with these items:
  - Edit details…;
  - a Status radio group;
  - Open archive;
  - a separator, then Archive project….

  Edit details opens a Project details dialog with one **Save**. Archive opens a confirm dialog.
- **Page settings.** A popover. Focus moves into it, toggles keep focus while saving, and Escape
  returns focus to the gear.
- **Route focus.** After a navigation the user started, and only if focus was lost to `body`,
  focus waits for the new page's landing heading (bounded) and moves there, or to `main`.
- **Creation dialogs** adopt the lift paint. Their behaviour does not change.

## Done when

All 13 TH06 findings still open, and L2-006, are closed and demonstrated on the before/after
sheet. The keyboard and touch paths are pinned by e2e. Core tasks T03, T04 and T08 cost no more than
their baseline. The user accepts the sheet at Gate 2.

## Do not

- Build the toast, the inline Undo, the pending indicator, or scroll new items into view (slice 4).
- Change section chrome or the section config disclosure (`configOpen`) (slice 5).
- Change the phone navigation drawer, breadcrumbs, document titles or the skip link (slice 7).
- Touch domain, contracts, host, persistence or the gateway. Every write uses the existing
  `projects.update` and page endpoints.
- Re-plan W1-004 or W3-007. Slice 72 closed them.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

TH06 lists 15 findings. W1-004 and W3-007 were closed by slice 72 and are excluded. This slice
claims the other 13. It also closes **L2-006** (TH05), the More panel's primary action, which slice
72 advanced and handed here. The theme's `decisionsReopened` entry,
[task checkbox reopen and selection](../../decisions/2026-09-task-checkbox-reopen-and-selection.md),
is amended, not rewritten.

**Pulled forward from slice 4: quick-add no longer opens the drawer.** Slice 72 deferred this to
slice 4, and spec §26 already says it, corrected at Gate 1
([decision](../../decisions/2026-10-creation-defaults-follow-the-open-work.md)). It must land
here. Once the phone drawer is a modal sheet, every quick-add on a phone would cover the list and
take focus from the add field. The change is one line, `TaskListStore.create` no longer selects,
plus its tests. Slice 4 keeps the scroll-into-view and feedback parts of TH15.

**Carried from slice 72:**

- **Muted text on a lift** measures 3.52:1 dark and 4.29:1 light over busy content. It is
  reported on the sheet, not tuned or gated, per the
  [contrast amendment](../../decisions/2026-10-frosted-glass-depth-direction.md).
- **More stops being the named exception to "one primary per surface".**

**Partly stale evidence.** L5-010 says neither panel responds to Escape. Today the drawer's
`aside` closes on Escape, and the gear panel handles Escape with focus return (`settingsKeydown`),
but only when focus is already inside. What stays true is that neither panel takes focus. The
sheet's evidence for L5-010 says so.

## Findings closed

All are reproduced in [reproduction.json](../70-ui-ux/reproduction.json); W2-016 is reproduced in
part.

| Finding | Sev | Closed by |
|---|---|---|
| W1-032 | S3 | The drawer is a top-layer side lift, fixed to the viewport. Its fields are on screen when it opens, whatever the scroll position |
| W2-016 | S2 | On a phone, the drawer is a modal sheet over the viewport, not a block after the list |
| W3-014 | S2 | Selecting a task moves focus to the drawer heading. The next Tab reaches Title |
| L5-010 | S2 | The drawer and the page popover take focus when they open (the part still open; see Scope check). Escape closes each and returns focus |
| W1-045, W2-027, W4-018 | S3 | ⋯ opens a short `role="menu"` lift in the top layer. The header does not grow and the canvas does not move |
| L3-025 | S2 | One commit model per surface: menu items act when chosen; the details dialog commits once, on Save. A close with unsaved edits asks "Discard changes?" |
| L1-021 | S3 | The details dialog sets labels and fields on two shared column edges |
| L5-009, W3-006 | S2 | Escape in the menu, or a close of the details dialog or the confirm, returns focus to ⋯ |
| W3-005 | S2 | Page toggles use `aria-disabled` while saving, so focus stays on the toggle that was pressed |
| W3-003 | S2 | The route-focus rule, plus explicit landings for Open archive (Acceptance 5 and 7) |
| L2-006 | S3 | The details dialog has one primary action, Save. The menu has none, and the confirm's danger button stays |

## Acceptance check

**A. Foundations.** These land before any surface adopts them.

1. `apps/web/src/styles/_lifts.scss` is new and imported after `_controls.scss`, with no literal
   values (the token lint covers it).
   - `.lift` paints `--plane-lift-background`, `--plane-lift-filter` and `--lift-shadow`, with the
     `--radius-lg` corner.
   - `.lift--side` is fixed to the inline-end edge, below the top bar, at `--layout-drawer-width`.
   - `.lift--sheet` covers the viewport on a phone.
   - `.lift--popover` is anchored to its opener. It uses CSS anchor positioning inside
     `@supports (anchor-name: --a)`, with a fixed fallback.
   - `.lift--dialog` is centred, with `::backdrop` on `--opacity-scrim`.
   - Menu items reach 24 px with a pointer and `--size-hit-target` on touch.
   - **Enter** animates `opacity` and a small `transform` over `--duration-base` with `--ease-out`.
     **Leave** uses `--duration-fast` with `--ease-in`, via `@starting-style` and
     `transition-behavior: allow-discrete`. Where these are unsupported, the lift opens without
     motion; there is no other fallback.
   - Reduced transparency, no `backdrop-filter`, and forced colours resolve to
     `--plane-lift-solid` with a border.
   - New values are tokens in `_tokens.scss`: `--z-lift` and the enter offset. The drawer's
     canvas reservation reuses `--layout-drawer-width`.
2. **Blur.** **Persistent** `backdrop-filter` layers are reported against the "before" capture.
   Project routes already have three: the top bar, the sidebar and the project navigation. This
   slice adds none. **Transient** layers are gated at one, because only one lift is open at a time
   (Acceptance 12).
3. **Lab.** The lift specimens in
   [plane-panels](../../../apps/web/src/app/prototype/design-lab/panels/plane-panels.html) use the
   real classes, over the busy backing, in both themes: side drawer, menu, popover and dialog. The
   live Drawer panel shows the real `TaskDetailDrawer` in a `lift--contained` modifier that is not
   fixed and not in the top layer.
4. **Storybook.** `shared/lifts/lifts.stories.ts` has one story per lift kind. Each interaction
   test opens the lift, presses Escape, and checks that focus is back on the opener.
   Storybook runs in a real browser, so it is the native-behaviour proof below e2e.

**B. Behaviour.** Every step below has a failing test before it is implemented. Native top-layer
behaviour (light dismiss, `showModal` inertness, focus restoration, `cancel`) is proved in e2e or
Storybook. Unit specs test component logic with the native calls stubbed, because jsdom has no top
layer.

5. **Route focus (W3-003).**
   - `core/a11y/route-focus.ts` is a root service started from `app.config.ts` with
     `provideAppInitializer`.
   - **It ignores the initial navigation.** A fresh load, a reload or a `page.goto` moves nothing.
     Closed-state captures and Tab-from-top scripts therefore do not change.
   - After each later `NavigationEnd`, it acts only if `document.activeElement` is `body` or
     `null`. The `body` check covers removed nodes too, because the browser drops focus to
     `body`.
   - If so, it watches renders with `afterEveryRender`, bounded to about 2 s, for the first
     `[data-route-focus]` inside `main`. Project routes load asynchronously, so the heading does
     not exist one render after `NavigationEnd`.
   - Just before it focuses, it checks again that focus is still on `body`. This keeps it from
     racing the shell's `focusColumnTarget`, the history fragment, the canvas removal hand-off or
     the phone navigation drawer's `main` focus.
   - When the bound runs out, it focuses `main`.
   - Landing headings get `tabindex="-1"` and `data-route-focus`. These are the project header
     `h1`, the Archive, Todos and Reflections page headings, the Settings sub-page `h1`, and the
     Dashboard `h1`. Stage 0 lists the files.
   - **What counts as a user navigation.** The service acts only when a trusted `pointerdown` or
     `keydown` happened after the previous `NavigationEnd`.
     - This covers link activation, Back by key or mouse button, and `router.navigate` after a
       click.
     - It skips the first load, reloads, `page.goto`, and a §68 redirect that follows a fresh load
       with no input (web.spec.ts around line 284). A unit test and an e2e test cover the
       redirect-after-load case.
     - Known imprecision, recorded in the decision: a §68 redirect caused by a live update after
       an earlier click counts as a user navigation. It acts only if focus was lost, and landing on
       the heading is then acceptable.
   - **Proof (e2e):**
     - New project Create lands on the new project's `h1`.
     - Settings › AI & Agents lands on its `h1`.
     - A project-navigation page link that re-creates the shell lands on the page heading.
     - The section-removal notice's Open archive lands on the Archive heading, through the shell
       (Acceptance 7).
   - **Narrow column links.** Route focus may land on the `h1` before the shell's
     `focusColumnTarget` (which has no `body` check) moves focus to the column toggle. That is two
     focus moves, but the end state is the one Slice 58 intended. `core/` cannot read the
     projects feature's pending request, so this is accepted and recorded in the decision. The
     e2e asserts only the end state.
   - **Phone:** a phone navigation drawer link still focuses `main` (app-shell.ts:142). Route focus
     does not override that. Phone and desktop differ on purpose, recorded in the decision.
6. **Page settings popover (L5-010, W3-005).**
   - The gear becomes a declarative invoker: `popovertarget="project-page-settings"`.
   - The panel is `popover="auto"` with `.lift--popover`. `settingsOpen` follows the panel's
     `toggle` event, so light dismiss never desyncs it.
   - The gear keeps its `[attr.aria-expanded]` binding to `settingsOpen`. A native invoker's
     implicit expanded state exists only in the accessibility tree, and existing tests read the
     attribute (`work-navigation.spec.ts:30`, `project-page-navigation.spec.ts:111`). An author
     attribute overrides the implicit one, so nothing is announced twice. ⋯ follows the same rule.
   - The existing reset-on-root-change effect calls `hidePopover()`.
   - Opening moves focus to the first enabled toggle.
   - Escape, the gear and an outside click all close the popover. After Escape or the gear, focus
     returns to the gear. After an outside click, focus stays where the user clicked. A named e2e
     step pins this by clicking a sidebar link and checking that the link is focused.
   - While a write is pending, toggles use `aria-disabled="true"`, not `disabled`. A second
     toggle is refused and its native state reset, following the Slice 61 pattern. The pressed
     toggle keeps focus through pending, success and failure.
   - Hiding the page the user is on still redirects (§68). The popover closes on navigation, and
     focus lands on the gear when the gear is still connected; route focus covers the case when it
     is not.
   - `work-navigation.spec.ts`'s gear journey, including click-to-close, stays green **unedited**.
     That test is the proof that the invoker does not reopen the popover on pointerdown.
7. **More menu (W1-045, W2-027, W4-018, L5-009, W3-006).**
   - ⋯ is the declarative invoker of a `popover="auto"` `role="menu"` lift and has
     `aria-haspopup="menu"`. `moreOpen` follows the `toggle` event.
   - Items, in order:
     - **Edit details…** (`menuitem`);
     - a **Status** `group` of four `menuitemradio`s (planning, active, on hold, completed), each
       with `aria-checked`;
     - **Open archive** (`menuitem`);
     - a separator;
     - **Archive project…** or **Archive workstream…** (`menuitem`, danger), absent when the
       project is already archived.
   - Opening focuses the first item. Arrow keys wrap, Home and End jump, and Tab closes (the APG
     menu-button pattern).
   - Escape closes the menu and returns focus to ⋯.
   - A status item writes through `setStatus`, closes the menu and returns focus to ⋯. The
     already-current status emits nothing.
   - **Open archive** does not restore focus to ⋯.
     - The shell is reused between `/pages/*` routes, so route focus would not fire.
       `ProjectWorkspaceShell.openArchive(returnTo)` therefore focuses the Archive heading itself,
       after a successful navigation.
     - The method has three callers, each with its own failure focus:
       - More returns to ⋯;
       - the section-removal notice's Open archive returns to `[data-open-archive]`;
       - the Todos page link returns to `[data-todo-open-archive]`.
     - The page callers reach it through `ProjectPageContext.onOpenArchive`
       (project-page-contract.ts:31). That type becomes `(returnTo: HTMLElement) => void`, and
       every page input typed from it changes too: the canvas, Todos, Archive and Reflections.
     - The notice path has no landing today; this is the W3-003 bug. It now lands on the Archive
       heading too.
   - With the menu open, the header's bounding box is unchanged (e2e).
8. **Project details dialog (L3-025, L1-021, L2-006).**
   - `project-details-dialog.ts` is a modal `<dialog>` with `closedby="none"`. Escape is handled
     on `keydown` with `preventDefault`. This avoids Chrome ignoring `preventDefault` on a repeated
     `cancel`; a double-Escape test pins it. A click on the backdrop has its own handler, because a
     native dialog ignores backdrop clicks.
   - Fields: Name, Description, and Target date (Due date on a unit of work) with Clear. Actions:
     **Save** (primary) and **Cancel** (secondary).
   - The draft base is captured when the dialog opens. "Changed" means changed from that base. A
     live refresh while the dialog is open does not overwrite a dirty field; a clean field follows
     the refresh (the drawer's base-title rule).
   - **Save** sends **one** `projects.update` PATCH, with only the changed fields, through a new
     `ProjectWorkspaceStore.saveDetails(patch)` on the existing optimistic `writeProject`.
     - One PATCH records one history step; `ProjectService.update` records once per call (Test
       plan).
     - A single-field save keeps today's history label, such as `Renamed…`. A multi-field save
       reads `Edited "X"` (project-history.ts:313). e2e asserts each where it occurs.
   - A blank name is refused inline. An unchanged form closes without a request.
   - With unsaved edits, Cancel, Escape and a backdrop click show an inline "Discard changes?" with
     **Discard** and **Keep editing**. Without unsaved edits they close at once.
   - A failed write keeps the dialog open with the draft and shows the error inside the dialog.
     - While the dialog is open, the store's header `writeError` alert is not rendered, so there
       are never two alerts; the dialog owns the error.
     - Discarding after a failure clears `writeError`, so the stale error does not reappear in the
       header.
   - Closing returns focus to ⋯, overriding native restoration, which would target the hidden menu
     item.
   - The two-column grid stacks below 40rem.
9. **Archive confirm.**
   - Archive project… opens a small modal confirm with today's copy, **Archive it** (danger) and
     **Cancel**.
   - Confirming archives as today: the page stays and the header's Undo is enabled. Focus returns
     to ⋯.
   - A refused archive (for example, active workstreams) closes the confirm, shows the header
     alert and returns focus to ⋯.
   - Cancel writes nothing.
10. **Task drawer (W1-032, W2-016, W3-014, L5-010).**
    - **Desktop.** `TaskDetailDrawer` renders in a `popover="manual"` `.lift--side` element. It is
      in the top layer, so the section's size container cannot capture `position: fixed`. It is
      non-modal: rows stay usable, and selecting another row switches the drawer.
    - **Room for the page.** While the drawer is open, the shell's `.project-workspace` track
      reserves `--layout-drawer-width` of inline-end padding. The track holds the header and the
      canvas, so neither the rows nor the header's Undo, Redo and ⋯ sit under the drawer.
    - **Fixed elements are not moved by the track padding.** `.project-workspace--drawer-open`
      sets `--lift-side-offset: var(--layout-drawer-width)`. Its default is a zero token. The
      section-removal notice (`section-recovery-notice.scss`, `position: fixed`) adds it to its
      `inset-inline-end`, so Open archive, Retry and Dismiss stay reachable beside an open drawer.
    - **The measure.** At 1440, on overdue-chaos and on busy-week's Grid-layout sections, no box of
      a `[data-task-row]` control, `.project-header__actions` or `[data-recovery-notice]`
      intersects the drawer's box (e2e). This includes removing another section while the drawer
      is open.
    - **Closed-state geometry.** Deleting the section's size container also removes its
      inline-size containment, and a Task List in an auto-sized Grid track could then widen.
      At B5, compare the closed cells. If any box moves more than 1 px, keep `contain: inline-size`
      on the host (with no container name).
    - `task-interaction.spec.ts` clicks Delete on another row and drags a title while the drawer
      is open. That part stays unedited as proof. The e2e also clicks ⋯ and Undo with the drawer
      open.
    - **Narrow** (`SHELL_NARROW_QUERY`). The same component renders in a modal `<dialog>`
      `.lift--sheet`.
      - The section's `task-list` size container, `$task-list-narrow` and both
        `@container task-list` rules are deleted.
      - Rationale: the drawer no longer lives inside the section, so the section's width no longer
        decides anything. This reverses the phone-navigation-drawer decision's rejected
        media-query option, so that decision is amended.
      - Switching between narrow and wide with the drawer open closes it. It closes as Close
        does: the selection clears and focus returns to the title (unit and e2e).
    - The drawer's role becomes `dialog`, with `aria-modal` matching the mode. It is named by its
      title heading, which has `tabindex="-1"`.
    - **Focus on open.** Every selection made with the title button or the row background moves
      focus to the drawer heading, so Tab reaches Title next. A checkbox, Delete or a drag never
      selects, as today.
    - **Quick-add does not select** (Scope check). The drawer does not open, and focus stays in
      the add field.
    - **Escape.** On a dirty Title draft, Escape discards the draft; a second Escape closes. Close
      also closes. On close, focus goes to the selected row's title, or to quick-create when the
      row has gone (today's `closeDrawer` rule).
    - **The selected task vanishes on a live refresh** (an agent archived it, for example) while
      focus is in the drawer. `TaskListStore.sync` clears the selection; focus then goes to
      quick-create, never `body`.
    - **Section removal** keeps `ProjectCanvas.focusAfterRemoval` as the owner of focus. The
      drawer closes with its section.
    - **One drawer per page.** `TaskDrawerCoordinator` is provided by `ProjectWorkspaceShell`, so
      the shell's track can reserve room. The Task List injects it optionally, like
      `ProjectPageStore`, so a section can still render alone (§66). It records which section owns
      the selection and whether a drawer is open. Selecting in a second list clears the first.
11. **Creation dialogs: paint and LiftStack registration.**
    - `section-create-dialog` and `work-create-dialog` replace their own surface paint with
      `.lift .lift--dialog`.
    - Their openers, `ProjectCanvas`'s insertion points and `ProjectWorkspaceShell.openWorkCreate`,
      call `LiftStack.open` first, so an open drawer, menu or popover closes before the dialog
      renders. Without this, the top-layer drawer would paint over a `--z-dialog` dialog and its
      backdrop.
    - Their own focus trap, Escape and focus-return behaviour is unchanged, and their existing
      tests stay untouched. One new e2e step opens an insertion point with the drawer open.
12. **One lift at a time.**
    - Opening any lift closes any other open lift. That includes the drawer: opening ⋯, the gear or
      a creation dialog closes the drawer first, as Close does. The selection clears, so clicking
      the same row reopens it. A test pins "close by ⋯, then click the same row, and the drawer
      reopens". A second test checks that after ⋯ opens over an open drawer, focus is on the first
      menu item, not the row title. `closeDrawer` returns focus only from `body` or from inside
      the drawer, so the order of the two render callbacks matters.
    - Between popovers, `popover="auto"` already does this. The drawer and the dialogs go through
      one `LiftStack` in `shared/lifts`, provided at the root, which holds a single "close the
      current lift" callback.
    - e2e asserts after each step of the journeys that at most one of `.lift:popover-open` or
      `dialog.lift[open]` exists. Only `.lift` is counted, so a CDK drag preview cannot inflate
      the count.

**C. Evidence.**

13. **Core tasks.** The `ux:capture` task scripts for T03, T04 and T08 run on their new paths.
    Each costs no more than its [baseline](../70-ui-ux/baseline.json): T03 at most 10 clicks and
    38 keystrokes, T04 at most 1 click and 0 keystrokes, and T08 at most 3 clicks and 0
    keystrokes. T03 adds tasks, and quick-add no longer opens the drawer. None has a dead end.
14. **Sheet.** `build-sheet.mjs --profile 73` against `e56c7d7` reports 0 gate failures.
    - Closed-state cells are gated at 1 px. Open-lift cells are listed.
    - In the open-lift cells, axe reports no `aria-allowed-role`, `aria-required-children`,
      `aria-dialog-name` or `nested-interactive` violation.
    - No 375 cell overflows sideways.
15. **Lift verification.** `apps/e2e/ux/lifts-verification.ts` (`UX_LIFTS=1`) records for each
    lift and theme:
    - the computed `backdrop-filter`, and the persistent and transient layer counts (Acceptance 2);
    - the solid fallbacks under forced colours and reduced transparency;
    - a focus log for each W3-003, W3-005, W3-006, L5-009 and L5-010 path;
    - muted-text contrast on the lift, reported only.
16. **Checks.** `pnpm test`, `pnpm lint` (with `docs:check`), `storybook:build` and the full
    `pnpm e2e` all pass.
17. **Bundle.** The initial bundle stays under the 1050 kB ceiling; today it is 1040.09 kB.
    Record the figure. If it would cross the ceiling, stop and raise it.
18. **Real use (§77).**
    - **Seeds and sizes.** busy-week and overdue-chaos, at 1440 and at 375 touch.
    - **Do:**
      - open a task from a long list, edit it, close it;
      - quick-add three tasks;
      - rename a project and set its status;
      - toggle Reflections by keyboard.
    - **Failed write.** A modal lift makes the dev panel inert. Set failure injection before
      opening the details dialog.
    - **Record.** Friction goes in `.prototype/notes.json`, with `CURRENT_SLICE = 73`.

## Capture scope

- **Must change.**
  - Cells with an open lift: `kitchen-task-drawer-*`, `kitchen-more-*`, `kitchen-page-settings-*`.
  - The section-create and work-create dialog cells.
  - The Lab plane and drawer panels.
  - New cells:
    - `kitchen-project-details-{dark,light}-1440`;
    - `kitchen-project-details-light-375`;
    - `kitchen-archive-confirm-dark-1440`;
    - `overdue-chaos-task-drawer-dark-1440`, opened from a row scrolled below the fold;
    - `overdue-chaos-task-drawer-light-375`.
- **Must not change.**
  - Every closed-state cell keeps its boxes within 1 px. Profile 73 restores slice 71's gate for
    those cells. That holds because route focus ignores the initial load, so no heading ring is
    added.
  - Route content, control order and the phone navigation drawer.
- **Intended geometry, listed rather than gated.**
  - A canvas with a selected task: the drawer column is gone, and the canvas reserves the
    drawer's width.
  - The header with More open: it no longer grows.
- **Visual acceptance pairs (one screen).**

  | Surface | Seed and setting | Shows |
  |---|---|---|
  | `overdue-chaos-task-drawer-dark-1440` (scrolled) | Drawer opened from a row below the fold | W1-032, W3-014 |
  | `overdue-chaos-task-drawer-light-375` | Phone task sheet | W2-016 |
  | `kitchen-more-dark-1440`, `kitchen-more-light-375` | More menu | W1-045, W2-027, W4-018 |
  | `kitchen-project-details-dark-1440`, `-light-375` | Details dialog | L3-025, L1-021, L2-006 |
  | `kitchen-archive-confirm-dark-1440` | Archive confirm | L2-006 (danger apart) |
  | `kitchen-page-settings-light-1440`, `-light-375` | Page popover | L5-010 |
  | `kitchen-section-create-light-1440` | Creation dialog on the lift | Paint only |
  | `prototype-design-dark-1440`, `-light-1440` | Lab lifts | Foundations |

  The focus findings (W3-003, W3-005, W3-006, L5-009, L5-010) are behaviour. The sheet links their
  e2e test names and the focus log in place of images.

## Behaviour vs. appearance

This slice **changes behaviour**, so §77 applies: each changed expectation moves in the same
commit as its implementation.

- **`task-interaction.spec.ts`, "title and background selection…".** After Enter on a title,
  focus is in the drawer. The Delete and drag steps with the drawer open stay unedited, as proof of
  the canvas reservation.
- **`phone-layout.spec.ts`.**
  - The two "stacked below the rows" drawer tests now assert a viewport sheet.
  - Delete is tapped after Close.
  - The quick-add test no longer expects the drawer.
  - The gear test is unchanged, except for its visibility locator if needed.
- **`primitives.spec.ts:80` (phone drawer Close).** It already opens the drawer by title. What
  changes is that the drawer is now a modal sheet, so its locators and its Close assertion follow
  the sheet.
- **`row-history.spec.ts`.** Drawer Escape and Enter are unchanged. The `[data-project-name]` blur
  click sits at the header's inline start and is not covered by the drawer, so it is expected
  unedited. Its quick-create focus assertions stay.
- **More flows** in `project-history.spec.ts`, `archive.spec.ts`, `canvas-editing.spec.ts`,
  `page-history.spec.ts` and `web.spec.ts` (rename, description and date at 306–313 and 379–382;
  Open archive at 93–94; the menu, archive and confirm at 397–400):
  - "⋯ → field → Rename or Set" becomes "⋯ → Edit details → field → Save";
  - a status chip becomes a status menu item;
  - the archive confirm becomes the dialog.

  Data assertions are unchanged. History labels change only where a test saves several fields at
  once.
- **Gear journey.** `work-navigation.spec.ts` and `web.spec.ts` 255–341 are expected unchanged.
  Any edit to them is reported in Deviations.
- **Rig.** `ux/depth-verification.ts` and `ux/report.ts` (More) follow the new markup.
- **Quick-add tests.** Every e2e or unit test that relied on quick-add opening the drawer changes
  with the store. Known so far: `project-history.spec.ts:97-102`, `web.spec.ts:67` and the
  phone-layout "Delete stays tappable while its drawer is open" test, which now opens the drawer
  by title. Stage 0 greps for the rest.
- **Unit specs:** `project-header.spec.ts`, `project-page-navigation.spec.ts`,
  `task-detail-drawer.spec.ts`, `task-list-section.spec.ts`, `task-list-store.spec.ts`,
  `project-workspace-shell.spec.ts`, `project-workspace-store.spec.ts`.

The appearance-only parts (dialog paint and lift paint) leave their tests untouched.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/styles/_lifts.scss` | create | Lift, menu and motion classes; tokens only |
| `apps/web/src/styles/_tokens.scss` | modify | `--z-lift`, the enter offset, and `--lift-side-offset` (zero by default) |
| `apps/web/src/styles/_breakpoints.scss` | modify | Delete `$task-list-narrow` |
| `apps/web/src/styles.scss` | modify | Import `lifts` after `controls` |
| `apps/web/src/app/shared/lifts/lift-focus.ts` (+ spec) | create | Record the opener, focus in after render, override native restoration |
| `apps/web/src/app/shared/lifts/lift-stack.ts` (+ spec) | create | One open lift: a single close-current callback |
| `apps/web/src/app/shared/lifts/menu-keys.ts` (+ spec) | create | APG menu keys |
| `apps/web/src/app/shared/lifts/lifts.stories.ts` | create | One story per lift kind, with interaction tests |
| `apps/web/src/app/core/a11y/route-focus.ts` (+ spec) | create | Skip the initial navigation; land lost focus, bounded |
| `apps/web/src/app/app.config.ts` | modify | Start `RouteFocus` (an initializer, not an adapter) |
| Landing headings (`project-header.html`; the Archive, Todos and Reflections pages; Settings; Dashboard) | modify | `tabindex="-1"` and `data-route-focus`; Stage 0 lists the exact files |
| `apps/web/src/app/features/projects/project-more-menu.{ts,html,scss}` | rewrite | `role="menu"` popover: items, status radios, separator, danger item |
| `apps/web/src/app/features/projects/project-details-dialog.{ts,html,scss}` (+ spec) | create | Modal form: one Save, dirty guard, opening base, error inside |
| `apps/web/src/app/features/projects/project-archive-confirm.{ts,html}` (+ spec) | create | Modal confirm |
| `apps/web/src/app/features/projects/project-header.{ts,html,scss}` (+ spec) | modify | Invoker, menu and dialogs; focus to ⋯; no header alert while the dialog owns it |
| `apps/web/src/app/features/projects/project-workspace-store.ts` (+ spec) | modify | `saveDetails(patch)` |
| `apps/web/src/app/features/projects/project-workspace-shell.{ts,html,scss}` (+ spec) | modify | Wire `saveDetails`; `openArchive(returnTo)` lands on the heading, or returns to its caller on failure; provide `TaskDrawerCoordinator`; reserve the drawer width on the track; `openWorkCreate` calls `LiftStack` |
| `apps/web/src/app/features/projects/project-page-navigation.{ts,html,scss}` (+ spec) | modify | Popover settings: `toggle` sync, focus in and back, `aria-disabled` pending |
| `apps/web/src/app/features/projects/project-canvas.ts` | modify | The insertion point's opener calls `LiftStack` before the section-create dialog; pass `[data-open-archive]` as `returnTo` |
| `apps/web/src/app/features/projects/project-page-contract.ts` | modify | `onOpenArchive(returnTo)` |
| `apps/web/src/app/features/projects/pages/` (Todos, Archive and Reflections pages, + `todos-page.spec.ts`) | modify | The new `onOpenArchive` type; Todos passes its own link |
| `apps/web/src/app/features/projects/section-recovery-notice.scss` | modify | Offset by `--lift-side-offset` |
| `apps/web/src/app/features/tasks/task-detail-drawer.{ts,html,scss}` (+ spec) | modify | Dialog role, focusable heading, contained mode; container rule deleted |
| `apps/web/src/app/features/tasks/task-drawer-coordinator.ts` (+ spec) | create | Which section owns the selection; canvas-scoped |
| `apps/web/src/app/features/tasks/task-list-store.ts` (+ spec) | modify | `create` no longer selects |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.{ts,html,scss}` (+ spec) | modify | Manual popover or sheet; focus on select; vanished-task fallback; container and drawer column deleted |
| `apps/web/src/app/features/projects/section-create-dialog.scss`, `work-create-dialog.scss` | modify | Lift paint |
| `apps/web/src/app/prototype/design-lab/panels/plane-panels.{html,scss}`, `live-panels.html` | modify | Real lift specimens; contained drawer |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 73` |
| `apps/e2e/lifts.spec.ts` | create | Every lift by keyboard and by touch; one lift at a time; route focus |
| §77 e2e files (Behaviour vs. appearance) | modify | Re-pinned journeys |
| `apps/e2e/ux/tasks.ts`, `matrix.ts` (+ test), `capture.ts`, `depth-verification.ts`, `report.ts` | modify | New paths, open-lift states and cells |
| `apps/e2e/ux/lifts-verification.ts` | create | Blur counts, fallbacks, focus log, reported contrast |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs` (+ test) | modify | `--profile 73` |
| `docs/decisions/2026-10-lifts-use-the-top-layer.md` | create | Native popover and dialog over CDK Overlay; one lift at a time; the dialog Escape and backdrop handling; browser floor (`closedby`, Chromium 134+; anchor positioning falls back) |
| `docs/decisions/2026-10-route-focus-lands-lost-focus.md` | create | Act only after user input; bounded landing; never move connected focus; the phone difference; the accepted double move on narrow column links |
| `docs/decisions/2026-10-more-is-a-menu-with-a-details-dialog.md` | create | Menu plus one-commit dialog; status as menu radios |
| `docs/decisions/2026-09-task-checkbox-reopen-and-selection.md` | amend | Focus moves into the drawer; the phone drawer is a sheet |
| `docs/decisions/2026-09-phone-navigation-drawer.md` | amend | The task drawer now uses the shell media query; the container rationale is retired |
| `docs/decisions/2026-08-project-create-edit-archive-surface.md` | amend | More's per-field commits become a menu and a dialog |
| `docs/decisions/2026-10-creation-defaults-follow-the-open-work.md` | amend | The quick-add part landed in slice 73 |
| `docs/decisions/README.md` | modify | Index the new entries and the amendments |
| Spec §23, §26, §34 | modify | "Corrected at Slice 73" notes |
| `docs/architecture/web/{overview,how,why}.md` | modify | The lift layer, `shared/lifts`, the top layer |
| `docs/architecture/web/core/{how,what,why}.md` | modify | `RouteFocus` |
| `docs/architecture/web/projects/{how,what,why}.md` | modify | Menu, dialogs, popover, canvas reservation |
| `docs/architecture/web/tasks/{how,what,why}.md` | modify | Side lift, sheet, coordinator, focus rules, quick-add |
| `docs/architecture/web/prototype-tooling/how.md` | modify | Lab lifts |
| `docs/architecture/testing/how.md` | modify | `lifts.spec.ts`, `--profile 73`, `UX_LIFTS`, unit and e2e split for native behaviour |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Handoff; remove quick-add from slice 4's list |

## Implementation sequence

- **Stage 0 — baseline.**
  1. The matrix change for the open-lift states gets its own commit.
  2. Capture the "before" set at `e56c7d7`, with its own data file.
  3. Record T03, T04 and T08.
  4. List the landing-heading files and the tests that rely on quick-add opening the drawer.
- **Stage A — foundations.** `_lifts.scss`, the tokens, `lift-focus`, `lift-stack`, `menu-keys`,
  the Lab specimens and the stories. **Checkpoint:** show the user the Lab lifts at 1440, dark and
  light, and at 375 light, before any surface adopts them (protocol §7.1).
- **Stage B — adoption.** One surface per commit, tests first:
  - B1 route focus;
  - B2 page popover;
  - B3 More menu, details dialog and confirm;
  - B4 quick-add no longer selects;
  - B5 drawer, coordinator and canvas reservation;
  - B6 dialog paint.
- **Stage C — evidence.** Re-capture, the profile-73 sheet, lift verification, the full e2e run,
  the diff review, real use, then Gate 2.

## Test plan — tests first

| Test | Proves |
|---|---|
| `lift-focus.spec.ts`: returns to the recorded opener, not the element focused just before; falls back when the opener has gone; does not move focus that has moved elsewhere since | The shared rule, including the native-restoration override |
| `lift-stack.spec.ts`: opening B calls A's close | One lift at a time |
| `menu-keys.spec.ts`: wrap, Home, End, Tab requests close | APG keys |
| `route-focus.spec.ts`: the initial navigation moves nothing; focus on body plus a heading that appears later is focused within the bound; a connected focus never moves; a missing heading falls back to `main`; focus taken by another hand-off during the wait is left alone | W3-003 and its no-regression cases |
| `project-page-navigation.spec.ts` (stubbed popover): `toggle` syncs `settingsOpen`; open focuses the first toggle; pending sets `aria-disabled`, refuses and resets, and keeps focus; a root change hides it | L5-010, W3-005 |
| `project-header.spec.ts` (menu): item roles and order; the current status emits nothing; no archive item when archived; Escape returns to ⋯; Open archive does not return to ⋯ | W1-045, L5-009, W3-006 |
| `project-details-dialog.spec.ts`: only changed fields are emitted; blank name refused; an unchanged form closes silently; dirty Cancel, Escape or backdrop asks; Keep editing keeps the draft; a refresh does not overwrite a dirty field but updates a clean one; a failure keeps the dialog open with the error inside | L3-025, L2-006 |
| `project-workspace-store.spec.ts`: `saveDetails` sends one PATCH and reverts on failure | One write |
| `packages/domain/src/project-service.test.ts` / `project-history.test.ts`: find the existing proof that a multi-field update records one entry labelled `Edited "X"`; if there is none, add an assertion-only test (no domain code change) | The assumption behind `saveDetails` |
| `project-workspace-shell.spec.ts`: Open archive focuses the Archive heading after navigation, and ⋯ on failure; the header alert is suppressed while the dialog is open | W3-003 for Open archive |
| `project-archive-confirm.spec.ts`: confirm emits; Cancel emits nothing | Archive path |
| `task-list-store.spec.ts`: `create` leaves the selection unchanged | Quick-add does not open the drawer |
| `task-detail-drawer.spec.ts`: focusable heading; dialog role; dirty Escape discards, a second Escape closes | L5-010, Slice 61 kept |
| `task-list-section.spec.ts`: a title selection focuses the heading; Close returns to the title, or to quick-create when the row has gone; a vanished selection while focus is inside goes to quick-create; a narrow/wide switch closes the drawer and focuses the title; no drawer column or container | W3-014, focus edges |
| `task-drawer-coordinator.spec.ts`: selecting in list B clears list A; a section rendered alone works without it | One drawer per page; §66 |
| `route-focus.spec.ts` (more cases): a redirect after load with no input moves nothing; a keydown and then a navigation lands | The user-navigation rule |
| `project-workspace-shell.spec.ts` and `todos-page.spec.ts` (more cases): an Open archive failure returns focus to the caller's control: ⋯, `[data-open-archive]` or `[data-todo-open-archive]`; `openWorkCreate` closes the open lift | Failure focus for each caller; Acceptance 11 |
| `project-details-dialog.spec.ts` (more cases): Discard after a failure clears `writeError` | No stale header error |
| `task-list-section.spec.ts` (more cases): a lift-stack close clears the selection, and the same row then reopens the drawer | Re-selection after a forced close |
| `apps/e2e/lifts.spec.ts`, both themes, 1440 and 375 touch: drawer from a row below the fold inside the viewport; row Delete clickable beside an open drawer at 1440; phone sheet covers the viewport and quick-add does not open it; Tab from the drawer reaches Title; More by keyboard; details Save writes once and Undo reverts in one step; dirty Escape asks and a double Escape does not lose the draft; backdrop click asks; archive refused returns to ⋯; page popover by keyboard; at most one lift open; W3-003 routes land on headings; a fresh load moves no focus | All findings end to end |
| §77 changed e2e (Behaviour vs. appearance) | Today's journeys, re-pinned |

## Boundaries touched

- **Components use gateway interfaces only.** `saveDetails` lives in the existing store, which
  already holds the gateway interface. No component gains a gateway import.
- **`core/` never depends on `prototype/`.** `RouteFocus` is in `core/a11y` and imports only the
  Angular router and core rendering APIs.
- **Domain, contracts and MCP are untouched.** The one-history-step claim is verified, not
  changed. If it fails, raise it as a finding; do not edit the domain in this slice.
- **Tokens.** Every value is a token. The token lint, which reads TypeScript strings since slice
  72.1, covers the new files.
- **One central flag.** No `prototypeMode` checks. Narrow uses the existing `SHELL_NARROW_QUERY`.
- **§66, a section renders alone.** The coordinator is injected optionally, so a Task List works
  without it.
- **Bundle.** Native top layer, no new dependency. There is about 10 kB of headroom.

## Explicit non-goals

- Toast, inline Undo, pending indicator, and scrolling new items into view (slice 4).
- Section config disclosure, section tools and insertion points (slice 5).
- Row shape, and the drawer's raw `projectId` fact (slices 6 and 9). The id is listed on the sheet.
- The phone navigation drawer as a lift, the skip link, document titles and breadcrumbs (slice 7).
- Converting the creation dialogs to native `<dialog>`. They keep their custom traps; only their
  paint changes.
- Menu typeahead, a resizable drawer, or putting the dev panel in the top layer. While a modal
  lift is open the dev panel is inert, and that is noted for real use.

## Open questions

Questions 1–3 change the shape of the work. They go to the user with the reviewed plan, before
Stage A. Questions 4 and 5 have defaults that the plan proceeds on unless the user objects.

1. **Drawer shape (recommended: a side lift on desktop that reserves its width on the canvas, and
   a modal sheet on a phone).**
   - **Alternatives:**
     - a modal dialog everywhere. It hides the list, against §34;
     - an overlaying side lift with no reservation. Rows under it become unreachable;
     - keep it inline but scroll it into view and focus it. This is the smallest change, but it is
       not a lift, and W2-016 stays awkward.
   - **Consequence of the one-lift rule:** opening More, the gear or a creation dialog closes the
     drawer and clears the selection.
   - **Consequence of the reservation:** the header and canvas narrow by the drawer's width while
     it is open.
2. **Focus on open (recommended: every selection moves focus to the drawer heading).** This
   reverses Slice 61's choice, which kept focus on the title. The alternative moves focus only on
   the first open, and leaves it on the clicked title when switching tasks.
3. **Status in More (recommended: a radio group in the menu that commits when chosen).** This
   keeps status two clicks away. The alternative puts status in the details dialog only: strictly
   one commit model, but four clicks.
4. **Mechanism (default: native `popover` and `<dialog>`).** CDK Overlay and CDK Menu cost bundle
   size against about 10 kB of headroom. Native gives light dismiss, inertness and the top layer
   for free. Firefox falls back to fixed placement in place of anchor positioning.
5. **Route focus target (default: the page heading, then `main`, after user navigations only).**

## Revisions

- **Round 1 (2026-10-15).** A cold reviewer returned 12 substantive and 5 minor findings. Each was
  checked against the code and all held.
  - **The drawer was not really fixed.** The section's `container: task-list` captures
    `position: fixed`. The desktop drawer is now a `popover="manual"` in the top layer, and the
    container, the breakpoint and both container rules are deleted. The phone-navigation-drawer
    decision is now a required amendment.
  - **Route focus would have fired on every load,** breaking the closed-cell gate and Tab scripts.
    It now skips the initial navigation.
  - **The landing heading did not exist yet.** Project routes load asynchronously, so route focus
    now waits for the heading, with a bound, and re-checks before it moves.
  - **Open archive contradicted route focus.** The shell is reused between pages, so the shell now
    focuses the Archive heading, or ⋯ on failure.
  - **Section removal was misattributed** to route focus. It stays with `focusAfterRemoval`. A
    vanished-task rule was added for live refresh.
  - **Quick-add would pop the phone sheet.** "Adding a task does not open details" is pulled
    forward from slice 4; spec §26 already says it.
  - **Popover and dialog mechanics were added:**
    - declarative invokers;
    - `toggle` sync;
    - an override for native focus restoration;
    - Escape handled on `keydown` with `closedby="none"`, because Chrome's repeated `cancel`
      ignores `preventDefault`;
    - a backdrop-click handler.
  - **One lift at a time now includes the drawer.**
  - **The canvas reserves the drawer's width,** so no row control sits under it.
  - **The e2e list was completed:** `web.spec.ts`, `work-navigation.spec.ts`,
    `row-history.spec.ts`, `primitives.spec.ts` and the rig files.
  - **The `2026-08-project-create-edit-archive-surface` and creation-defaults amendments were
    added.**
  - **The blur gate now matches reality.** Persistent blur is reported against the three panes
    that exist today; transient blur is gated at one.
  - **Native behaviour is proved in e2e or Storybook**, not in jsdom.
  - **New tests:** archive refused, a refresh while the dialog is dirty, the error owned by the
    dialog, the current status emitting nothing, a narrow/wide switch, hiding the current page.
  - **Facts corrected:**
    - `main` already has `tabindex`;
    - no "disconnected" branch is needed;
    - L5-010 is partly stale;
    - the phone navigation drawer lands on `main`;
    - a multi-field save is labelled `Edited "X"`.
  - **The coordinator is canvas-scoped and optional.**
  - **Dev panel inertness is noted** for real use.
- **Round 2 (2026-10-15).** The same reviewer, resumed, confirmed 14 of the 17 round-1 findings
  resolved and found 5 substantive and 5 minor problems. All held against the code.
  - **The invoker would drop the DOM `aria-expanded`** that two tests read. The gear and ⋯ keep
    the binding, synced from `toggle`.
  - **An idempotent selection could not reopen** a force-closed drawer. Every forced close now
    clears the selection, as Close does, and a test pins reopening the same row.
  - **The drawer covered the header's Undo, Redo and ⋯.** The reservation moves to the shell's
    track, the coordinator moves to the shell, and a no-intersection measure is added.
  - **`openArchive` has two callers.** It now takes `returnTo` for its failure focus, and the
    removal notice is recognised as the W3-003 bug, now fixed.
  - **Acceptance 11 contradicted 12.** The creation dialogs' openers call `LiftStack`, and are
    listed and tested.
  - **Minor fixes:**
    - the lift count is scoped to `.lift`;
    - a user navigation is defined as one preceded by input;
    - the double focus move on narrow column links is accepted and recorded;
    - Discard clears the stale `writeError`;
    - the T03 baseline is stated (10 clicks, 38 keystrokes);
    - the known quick-add tests are named;
    - the `primitives.spec.ts` and `row-history.spec.ts` notes are corrected;
    - `closedby`'s browser floor goes in the decision.
- **Round 3 (2026-10-15).** The reviewer confirmed the round-2 fixes and found no boundary
  violation. Two substantive findings remained, and both were fixed:
  - **`openArchive` has a third caller,** the Todos page. The page-context contract and the
    three page inputs are now in the change list, with the Todos failure focus defined and tested.
  - **The fixed removal notice sat under the drawer.** It is now offset by `--lift-side-offset`
    and included in the no-intersection measure.

  Three minor items were also folded in:
  - a closed-geometry check for the deleted size container;
  - a focus-order assertion for the forced close;
  - the live-update redirect imprecision, now recorded.

  No substantive finding remains.
