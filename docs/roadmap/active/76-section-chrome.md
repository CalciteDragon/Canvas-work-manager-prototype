<!-- plan id="76" status="active" summary="Redesign slice 5 (TH08 plus L3-016): quiet tools at rest, a persistent add-section affordance, the full insertion hit area, headings that name their section, and collapse that answers at once" -->
# Slice 76 — Section chrome

**State (2026-10-20):** plan reviewed (three rounds), all eight Open questions answered; implementation
in progress from step 3. Gate 2 remains open; no Outcome or completion until the user accepts the sheet.

Redesign slice 5 under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). Theme **TH08**,
"Section chrome is hidden yet heavy", in [themes.json](../70-ui-ux/themes.json), plus **L3-016**
(collapse waits on the server), which slice 74's split moved here. It also owns slice 72's two
remaining canvas census exceptions: the insertion points and the section title button.

## Goal

A section's tools are visible but quiet at rest on every device, adding a section is always on
the canvas, every painted insertion mark is clickable, each section is announced by its name and
reached in fewer Tab stops, and collapse answers within 100 ms (principles 5 and 7 of
[direction.md](../70-ui-ux/direction.md)).

## Spec sections

- **§21** visual design system. The at-rest emphasis is a token with a Lab knob; no literals.
  Motion stays transform/opacity, capped by `--motion-duration-cap` under reduced motion.
- **§26** project page. The Gate 1 bullet "Section tools stay visible at low emphasis at rest,
  and adding a section is a persistent affordance" is implemented here.
- **§27** Section Canvas. Insertion before placements, at the end and in grid gaps, keeping the
  placement-id anchor.
- **§31** Project Section Frame. The frame's list (drag handle, title with inline naming,
  collapse, configuration, resize, remove) keeps every item. "The title itself opens rename"
  holds for pointers (Open question 1). The sentence "Enter or Escape … returns focus to the
  title" changes to the Rename tool.
- **§32** Section Editing. "Revealed on hover or keyboard focus" becomes "quiet at rest, full on
  hover or focus", on pointer and touch alike; keyboard movement and resize keep working, through
  the shape Open question 2 decides.
- **§63** optimistic UI. Collapse becomes optimistic with a field-only revert and, after a
  transport or 5xx failure, the owed read.
- **§67** Design Lab: section frame specimens at rest and focus; the knob.
- **§69** verification, **§77** design-first loop, **§78** decision log.
- [Overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7.

## Build

- **Quiet at rest.** Section and shortcut tools are visible at rest at a token emphasis on
  pointer and touch alike, and rise to full on hover, focus or press. Inside canvas frames,
  danger ink appears only on hover, focus or press.
- **A persistent add.** A labelled "Add a section" follows the canvas; gap insertion marks are
  faint at rest (Open question 4).
- **The whole plus is the target.** Every painted insertion mark hit-tests to its button.
- **Headings name sections.** The level-2 heading and the section region are named by the
  section's name; rename is a separate, visible tool (Open question 1).
- **Fewer Tab stops.** A section's tools are one toolbar stop (Open question 2).
- **Aligned headers.** The title starts at the content's left edge (Open question 3).
- **Collapse answers at once.** Optimistic, with a revert, the owed read and a message on the
  frame if refused.

## Done when

- The findings under Findings closed are closed on the before/after sheet, each by its named
  pair or measurement.
- Core tasks T03, T05 and T06 cost no more than their baselines.
- e2e pins the keyboard, pointer and touch paths.
- The user accepts the sheet at Gate 2.

## Do not

- Change task-row shape or the inert shortcut rows (slice 6, TH09), drag or the Markdown editor
  (slice 6), navigation, breadcrumbs or the project header (slice 7), or vocabulary (slice 9,
  TH14), including section default names (Open question 5).
- Bring back an editing mode, or move layout controls out of the frame.
- Touch contracts, domain, host, persistence, MCP or the gateway (unless Open question 5 is
  answered with its alternative, which reopens this line).
- Rebuild ScrollHold, the toast or the creation dialog. Slice 75's reveal, heading focus and
  `placementId` result stay as they are.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

All eighteen findings are reproduced in [reproduction.json](../70-ui-ux/reproduction.json): TH08's
seventeen (9 S2, 8 S3) plus L3-016 (S3). The umbrella's sequence gives TH08 to slice 5; slice 74's
split ("Section collapse waits on the server | L3-016 | 5") adds L3-016. Slice 72 lists
"insertion-point geometry, section title buttons and section-tool emphasis" as slice 5's; slice 73
gives "section chrome and the config disclosure" to slice 5. No registered type supplies an
inspector, so the config disclosure is unreachable; it joins the toolbar unchanged.

Under the recommended Open question 5, two findings (L6-010, W1-028: default titles are format
names) are **handed to slice 9** and not claimed here, so this slice closes sixteen in full and
two in part.

**Decisions reopened.**

- [Canvas chrome is revealed, not moded](../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md).
  Gate 1 reopened its at-rest emphasis "on pointer devices" and said "the reserved space, the
  no-mode rule and touch behaviour stand". This slice keeps the no-mode rule and the reserved
  slot (which now holds a visible tool), and **changes touch**: touch gets the same quiet rest
  state, following direction principle 5 ("Touch gets the same tools with no extra strength").
  The amendment names that change, the grip's keys, the title and rename shape, rename's focus
  return, and that a frame now takes a per-placement collapse error input (the decision chose
  result callbacks over per-section pending and error inputs for rename; rename keeps that).
- [A section has a name](../../decisions/2026-09-a-section-has-a-name.md). Its "Renaming is
  deliberately not optimistic … which is how `setCollapsed` … behave" is amended for collapse.
  Its "placeholder-driven" field is amended by Open question 8.

**Code read for this plan** (paths under `apps/web/src/app/features/projects/`):

- `sections/section-frame/project-section-frame.html`: header order is grip, collapse, `h2`
  (`[data-section-title]`, `tabindex="-1"`) containing the button `[data-section-title-edit]`
  (type icon and name) with `aria-label="Rename {name}"`, then `.section-frame__controls`
  (settings if an inspector exists, Remove). The `section` is `aria-labelledby` the `h2`, so the
  heading and region are both named "Rename {name}" (L6-009 cluster). The rename input's value
  is the override (`override()`, `.ts:66`), so an untitled section opens empty with the default
  only as placeholder (L3-003); `saveRename` (`.ts:127`) compares against `override()`.
- `project-section-frame.scss`: grip and controls take `opacity: var(--canvas-chrome-opacity, 1)`;
  the collapse chevron does not, so at rest only it shows, after an empty grip-sized slot
  (L3-002, W1-029, L1-006).
- `project-canvas.scss`: `.section-canvas__item` sets `--canvas-chrome-opacity` and
  `--canvas-overlay-opacity` to 0 at rest and 1 on `:hover`/`:focus-within` and under
  `(hover: none), (any-pointer: coarse)` (L1-015). `.cdk-drop-list-dragging` hides overlays by
  variables. `padding-block-end: var(--size-hit-target)` exists only to hold the trailing plus.
  The canvas gap is `--space-4` (16 px).
- `canvas-chrome/insertion-point.scss`: the host is a 16 px band (`before` above the item, `end`
  below the last item, `gap` beside it) at opacity 0 until its own hover or focus. The plus is a
  44 px (`--size-hit-target`) circle with `pointer-events: none` centred on the band, so 28 px of
  it overhangs the button and hits the neighbouring frame (W1-018). The end target lives inside
  the last `cdkDrag` item (`project-canvas.html:171–179`) and is equally invisible (W1-017,
  L3-001). Touch shows lines and pluses at full accent.
- `canvas-chrome/section-resize-handle.scss`: each edge straddles its border by
  `calc(var(--size-resize-handle) / -2)` with `--size-resize-handle: 0.75rem`; opacity is
  `var(--canvas-overlay-opacity, var(--canvas-chrome-opacity, 1))`. The end edge is the keyboard
  `slider`; the start edge is pointer-only.
- `canvas-chrome/move-keys.ts`: a grip moves on all four arrows.
- `project-page-store.ts`: `setCollapsed` (`:575`) and `setCollapsedShortcut` (`:648`) go
  through `updateSection` / `updateShortcut` (`:889`), which await the gateway and then replace
  the **whole** record. `resizeColumnSpan` (`:911`) is the field-only optimistic writer with
  per-key sequencing, and also replaces the whole record on success (`applySaved`).
- `project-canvas.ts`: `revealTarget` focuses `[data-section-title], [data-shortcut-title]`;
  `closeCreate` reveals `createdPlacementId`; `moveWithKeyboard` re-focuses the grip by selector
  after a move (`:374–377`); `attachScrollHold` watches `.section-canvas__item`. All stay.
- `shortcuts/shortcut-frame.html`: the same grip, collapse and controls; its `h2` is plain text
  and already named correctly; Remove is an un-dangered `unlink` tool; no rename
  (`canvas-editing.spec.ts:961` asserts none).
- `project-canvas.html` unknown-section header: grip, `h2`, Remove, with the comment "At-rest
  visibility stays the canvas's until slice 5".
- `.tool--danger` is a global primitive (`_controls.scss:88–101, 136–139`), also used by the Lab's
  Controls panel.
- `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`: profiles `71`–`75` only (`:11`); the control
  census runs only `if (profile === '72')` (`:160`); axe ids are gated only on lift and feedback
  cells (`:153–157`).

## Findings closed

| Finding | Sev | Closed by |
|---|---|---|
| W1-017, L3-001 | S2 | On a populated canvas at rest (pointer outside the canvas, nothing focused in it), "Add a section" is rendered after the canvas at rest emphasis or above, and every `before` and `gap` mark is rendered at rest emphasis, at 1440 and 375 (Open question 4). "Rendered" means effective opacity above 0, not inside the viewport |
| W1-018 | S2 | For every mark, in its hover/focus state, `elementFromPoint` at the plus's centre and at eight compass points at 0.8 of its radius returns that mark's button; the same at rest for the rest mark. 1440 mouse and 375 touch |
| L3-002 | S3 | At rest the grip, Remove and the end resize handle are visible at rest emphasis; the reserved slot holds a visible tool; the end handle's hit area is at least 24 px wide without reaching more than half the gap (Open question 7) |
| W1-029 | S3 | The heading's first painted box (the type icon) starts within 1 px of `[data-section-content]`'s left edge, Markdown and Task List frames, 1440 both themes (Open question 3) |
| L1-006 | S3 | **Partly.** Section titles share the content's left edge as in W1-029. The project header's own edge (its "third edge") belongs to the header and goes to slice 7; that half stays open |
| L1-015 | S3 | At 375 touch, at rest, no insertion line is drawn, marks and tools use rest emphasis, and Remove's ink is the tool's muted ink, not the danger colour |
| W3-011 | S2 | In each project's seeded layout, Tab from the canvas start passes at most 2 chrome stops before a section's first content control (baseline 5) and at most 3 per section (baseline 6), measured on overdue-chaos Client migration and nested-projects Kitchen (Open question 2). Grid gap marks are extra stops; they are counted and reported separately, not gated |
| L6-009, W1-021, W2-006, L5-002, W4-025 | S2 | Every owned section's region and level-2 heading have the accessible name "{name}" exactly in the ARIA snapshot, at 1440 and 375 (Open question 1) |
| L3-003 | S3 | A Rename tool is visible at rest; opening rename on an untitled section shows the current name as the value, selected, and saving it unchanged writes nothing (Open question 8) |
| L3-018 | S3 | **Partly.** The shortcut frame carries a visible read-only cue, and removing a shortcut looks different from removing a section. Its inert, openable-looking rows go to slice 6 (TH09); that half stays open |
| L3-016 | S3 | With PATCH delayed 2 s, the chevron and `aria-expanded` change and content hides within 100 ms of the click (gated); a refusal reverts them and says so on the frame |
| *L6-010, W1-028* | S3 | *Not claimed under the recommended Open question 5: handed to slice 9 (vocabulary)* |

## Acceptance check

**A. Foundations,** with stories and Lab specimens before the canvas adopts them (protocol §7.1).

1. Tokens in `_tokens.scss`: `--canvas-chrome-rest-opacity` (the at-rest emphasis), the rest
   mark's size and the end resize hit width. The Lab knob registry
   (`prototype/design-lab/design-lab-tokens.ts`) gains a knob for the rest emphasis, and its
   export and store specs include it. Tokens only; the token lint passes.
2. `canvas-chrome/toolbar-keys.ts`: a pure roving-focus helper for a `role="toolbar"`:
   Left/Right with wrap, Home/End; it leaves Up and Down alone. The active item follows **any**
   focus inside the toolbar (`focusin`), including programmatic focus, so the canvas re-focusing
   the grip after a move leaves exactly that item at `tabindex="0"`.
3. Frame stories (`project-section-frame.stories.ts`): rest, hover, focus within, renaming,
   collapse pending and collapse refused, in both themes. The Lab's live section-frames panel
   shows rest and focus. A canvas story shows marks and "Add a section" at rest.

**B. The frame.** Seeds nested-projects (Kitchen) and overdue-chaos (Client migration); 1440
dark and light, 375 touch light.

4. Section header: title, then one `role="toolbar"` named "{name} tools" containing, in order,
   Rename, Collapse, Move, Settings (only with an inspector) and Remove (Open questions 1–3). One
   Tab stop (roving `tabindex`); Left/Right/Home/End move within it. On the Move grip, ArrowUp
   and ArrowDown move the placement (earlier, later) in flow and grid alike, and Left/Right rove.
   After a keyboard move, and after a refused move that re-creates the item (the track key
   includes `canvasRevision`), focus is on the Move grip and it is the toolbar's active item.
5. `[data-section-title]` stays the `h2`, `tabindex="-1"`, holding the type icon
   (`aria-hidden`) and the plain name; the region is `aria-labelledby` it. The title records the
   `pointerType` of its `pointerdown`; a primary-button `click` opens rename only if that recorded
   type was `mouse` or `pen`, and never drags or collapses. Anything else, including a `click`
   with no preceding `pointerdown` or an engine that reports no type, does nothing, so the rule
   fails closed and a scrolling tap cannot start a rename. Enter or Escape in the field returns focus to the Rename tool; blur leaves focus where
   it went. While editing, the field replaces the name inside the `h2` and the Rename tool stays;
   pressing it focuses the field. The `[data-section-title-edit]` attribute moves to the Rename
   tool, named "Rename {name}".
6. Rename opens with the current name as the value, selected. Saving it unchanged writes
   nothing; on an untitled section, saving exactly the derived default also writes nothing;
   clearing it saves `null` (unchanged rule); a failed rename keeps the draft (unchanged).
7. At rest, every tool's **effective** opacity (the product of its own and its ancestors'
   computed opacity, measured on the tool element) equals `--canvas-chrome-rest-opacity`; on
   hover or focus-within, 1. The same at 375 touch. Both `--canvas-chrome-opacity` and
   `--canvas-overlay-opacity` carry the rest value, so the end resize handle follows; the start
   handle (`:host([data-edge='start'])`) has its own rule, 0 at rest and full on item hover or
   focus-within (Open question 7). Inside canvas
   frames only, Remove uses the tool's muted ink at rest and danger ink on hover, focus or press;
   the global `.tool--danger` is unchanged elsewhere (the Lab Controls panel does not change). The
   rest glyph's non-text contrast against the sheet is measured and reported per theme, not gated
   ([Depth decision](../../decisions/2026-10-frosted-glass-depth-direction.md), contrast
   amendment). A rest-to-full transition, if any, is opacity only and within
   `--motion-duration-cap` under reduced motion.
8. The shortcut frame's toolbar holds Collapse, Move and Remove (no Rename, as today), with the
   same emphasis; its heading stays `[data-shortcut-title]`. It shows a "Read-only" cue next to
   its source line, and its Remove keeps the un-dangered `unlink` mark (Stage 0 records what slice
   72 already changed). The unknown-section header gets a toolbar with Move and Remove.

**C. Insertion.**

9. "Add a section" (ghost button, `plus` mark) is a sibling **after** the `cdkDropList`, inside
   the canvas host, never a drop-list child, rendered whenever placements exist and
   `orderComplete()`. It opens the dialog with `{ kind: 'end', beforeId: null, columnSpan: 12 }`
   and replaces the invisible "Insert at the end" overlay. As a child of the grid host it takes
   `justify-self: start`, so it is never full width. The canvas's
   `padding-block-end: var(--size-hit-target)` is removed. The empty canvas keeps its primary
   "Add a section". The end of the canvas stays reachable above the docked toast (slice 74's
   reserve), checked at 1440 and 375.
10. Each `before` and `gap` mark is visible at rest as a small plus at rest emphasis with no line;
    on hover or focus it shows the line and accent at full size (Open question 4). Its button's
    hit area covers the painted plus in both states (W1-018's check) and overhangs only the
    neighbours' padding: `elementFromPoint` at the centre of every header tool still returns that
    tool, and no rest mark overlaps `.project-controls` above the first placement.
11. While a CDK sort runs (`cdkDragStarted` to `cdkDragEnded`, a canvas `sorting` signal that also
    covers the sibling "Add a section"), every mark and "Add a section" are hidden and inert. A
    refused grid move with "Add a section" present still restores the canonical order. Narrow
    widths still hide grid gap marks and resize handles.
12. The end resize handle's hit area is `calc(var(--space-4) / 2)` into the gap and
    `var(--space-4)` over the frame's padding (24 px at the default knob), never its content box;
    both follow `--knob-space-scale`. The start handle keeps its width and straddle. Across a grid
    gap between two 6-span items, probes 1 px and 5 px inside each border return that border's own
    handle, and no point anywhere in the gap returns the **other** item's handle, so a section's
    edge never resizes its neighbour (the 2026-09-13 amendment's bug). A dead band between the
    two handles is allowed. This holds at the default space knob; the start handle's fixed
    straddle already overlaps below a 0.75 scale, which predates this slice and is recorded, not
    fixed. On coarse-pointer widths above the narrow breakpoint the start handle is no longer
    shown at rest; the end handle stays visible and keeps the keyboard path, and the chrome
    decision's amendment says so.
13. Slice 75 holds unchanged: after a dialog create from "Add a section" or a gap mark, the new
    placement is revealed with its `[data-section-title]` or `[data-shortcut-title]` focused;
    ScrollHold still holds a working Task List within 1 px. `placement.spec.ts` stays green with
    only its "Insert at the end" locator changed.

**D. Collapse.**

14. With PATCH `/api/sections/:id` (and `/api/shortcuts/:id` for a shortcut) delayed 2 s,
    clicking Collapse changes the chevron and `aria-expanded` and removes `[data-section-content]`
    (`[data-shortcut-content]`) within 100 ms, measured with a MutationObserver in the page, five
    runs; the worst run must be under 100 ms. While the write is pending the frame carries
    `aria-busy="true"`; there is no other pending cue, because the state change is the answer.
    A second click while pending expands it again; the final state is the last click's, and an
    older answer never overwrites a newer one.
15. The field writer that `resizeColumnSpan` generalises into owns `collapsed` and `columnSpan`.
    Pending fields are re-applied at one point, where records enter state (`replaceSection`,
    `replaceShortcut` and `setCanvas`), so every whole-record replace keeps them: a rename, config
    or resize answer, a live re-read, and the reconciles after move, create and remove. A
    concurrent write never repaints an old collapse or span.
16. The store branches on `GatewayError.code`, never on HTTP status (`gateway-error.ts`). A
    refusal (every other code: `rule_violation`, `invalid_request`, `conflict`, `busy`,
    `not_found`, `unauthorized`, `permission_denied`) reverts to the last server-confirmed value. `unreachable`,
    `internal_error` and `invalid_response` may have committed, so they revert and then owe one
    quiet read (§63), whose answer wins. Either way the frame shows "Couldn't collapse “{name}”.
    Try again." (or "expand") with the reason under its header, `role="alert"`, referenced by the
    Collapse tool's `aria-describedby` (Open question 6). It clears only on the next toggle,
    navigation or a generation change, or a read whose `collapsed` equals the value the person
    asked for (the write did commit, so nothing failed). An owed or live read that still holds the
    old value keeps it. Other placement fields are untouched by the revert. The same failure is
    reachable through the dev panel's failure injection, as `canvas-editing.spec.ts` already does.
17. The receipt is still reported to the header's history ("Collapsed …"), and a live frame during
    the write does not overwrite the paint.

**E. Evidence.**

18. Before: `ux:capture` and `chrome-verification.ts` from `e4ec0cb`, served from
    `apps/e2e/ux-output/slice76-baseline-web/`. After: the slice's final commit.
    `build-sheet.mjs --profile 76` produces the sheet with zero gate failures. Profile 76:
    - runs the full control census on every after cell, as profile 72 did, with slice 72's
      remaining exceptions (task-row titles, widget row links, breadcrumbs) and **without** the
      insertion-point and section-title-button exceptions; the two-button-heights rule applies
      ("Add a section" is the `md` height);
    - collects `[role=slider]`, so the resize handle is measured;
    - gates, on canvas cells, any axe violation **node** (rule id and target) absent from the
      same cell before, which covers `nested-interactive`, `aria-required-children`,
      `aria-allowed-role` and `button-name`; `color-contrast` is exempt and reported only, per
      the Depth decision's contrast amendment. Nodes are matched across builds by rule id plus
      their nearest stable anchor (the closest `data-*` attribute and the accessible name), not
      by axe's generated selector, because the header restructure changes selectors. A node that
      still reads as new after matching is either fixed or listed as an accepted exception in
      the Outcome;
    - gates each `[data-section-content]` left edge and width within 1 px;
    - reads `chrome-verification.json` and fails if it is missing or incomplete.
19. `ux/chrome-verification.ts` records W1-018's hit points, W3-011's Tab walk (stop list per
    section, gap marks separate), the ARIA names, effective opacities and rest contrast, the
    title-to-content offset, the resize midline check and step 14's timings.
20. T03 (≤ 10 clicks, 38 keystrokes), T05 (≤ 2 clicks) and T06 (≤ 2 clicks, 16 keystrokes)
    re-run through `ux/tasks.ts`. T07 completed in the baseline (3 clicks) and has been blocked
    in the harness since slice 73's run; it stays recorded as such, with its locator updated.
21. `pnpm test`, `pnpm lint` (including `docs:check`), the production build under the 1,100 kB
    initial ceiling (about 10 kB of headroom; the initial total is recorded before and after),
    Storybook build, and every e2e journey. e2e is Chromium only; WebKit is recorded as
    unverified.
22. Real use on nested-projects and busy-week at 1440 keyboard dark and 375 touch light, friction
    in `.prototype/notes.json`; `CURRENT_SLICE = 76` from Stage 0.

All evidence runs on the isolated rig, web **4253**, host **4353**, data
`.prototype/ux-slice76.json`. Never 4200/4310.

## Capture scope

**Must change:** every project Home and Work canvas cell (headers, tools at rest, marks, "Add a
section"), at 1440, 1024 and 375, both themes; the Lab's section-frames panel and the knob; the
canvas and section-frame stories.

**Gated within the change:** each `[data-section-content]` keeps its left edge and width within
1 px (headers and the canvas end move; content tops are reported). Every insertion and title
control passes the census.

**Must not change** beyond 1 px: the dashboard, sidebar, settings, Todos, Archive and Reflections
pages, the task drawer, the creation dialogs, and Design Lab panels other than section frames and
the knob (the Controls panel's `.tool--danger` included).

## Visual acceptance

| Pair (before → after) | Seed, size, theme | Findings |
|---|---|---|
| Populated canvas at rest: no add, invisible gaps → "Add a section" and faint marks | nested-projects Kitchen, 1440 dark, 375 light | W1-017, L3-001 |
| Plus hit map, rest and hover: lower half misses → all nine points hit | Kitchen, 1440 dark, 375 light (hit points overlaid) | W1-018 |
| Header at rest: only the chevron, blank slot, indented title → title at content edge, quiet toolbar with Rename | Kitchen and busy-week, 1440 dark and light | L3-002, W1-029, L1-006 (part), L3-003 |
| Phone at rest: accent lines and red trash → quiet marks and tools | busy-week, 375 light and dark | L1-015 |
| Tab walk: stop list per section | overdue-chaos, 1440 dark | W3-011 |
| ARIA snapshot: "Rename Markdown" headings and regions → "{name}" | Kitchen, 1440 light, 375 light | L6-009, W1-021, W2-006, L5-002, W4-025 |
| Shortcut frame like a section → read-only cue, distinct remove | nested-projects Renovation Home, 1440 dark | L3-018 (part) |
| 0.1 s after Collapse with a 2 s save: unchanged → collapsed | Kitchen, 1440 dark | L3-016 |

Behaviour findings are also e2e assertions in `apps/e2e/section-chrome.spec.ts`: hit points
(W1-018), the Tab walk (W3-011), accessible names (L6-009 cluster), resize midline, and collapse
timing, revert and owed read (L3-016).

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: tests, implementation and docs change together.

- **Behaviour:** optimistic collapse with its owed read and frame-level refusal; the toolbar's
  single Tab stop and roving keys; the grip's Left/Right no longer moving (Up/Down still do);
  rename through a tool, mouse-only title click, a prefilled field whose unchanged save writes
  nothing, and focus returning to the tool; the heading's and region's names; "Insert at the end"
  becoming "Add a section" outside the drop list; marks visible and clickable at rest; touch at
  rest emphasis.
- **Appearance:** rest emphasis, header order and alignment, marks, the resize hit width, the
  read-only cue.
- **Specs that change with it** (Stage 0 re-greps every one before editing; title edits move to
  role-based locators, `getByRole('button', { name: 'Rename …' })`, per protocol §7):
  - `apps/e2e/canvas-editing.spec.ts`: `:229` ("Rename Markdown" stays the tool's name),
    `:901–930`, `:1053`, `:1158–1162` (touch rename now through the tool), `:1376–1391`
    (at-rest opacity), grip arrow keys;
  - `section-edit-undo.spec.ts:162, 175, 404, 415` (title-edit `toContainText`);
  - `placement.spec.ts:217`, `feedback.spec.ts:214`, `lifts.spec.ts:69` (only the "Insert at the
    end" locator); `placement.spec.ts:253` ("Insert before …") is unchanged;
  - unit: `project-section-frame.spec.ts`, `project-canvas.spec.ts`, `project-page-store.spec.ts`,
    `shortcut-frame.spec.ts`, `insertion-point.spec.ts`, `section-resize-handle.spec.ts`,
    `progress-section.spec.ts:114–123` (and the `progress-section.ts:22` doc comment),
    `design-lab-store.spec.ts` and `design-lab-export.spec.ts`;
  - harness: `ux/tasks.ts:50, 54, 84` (region name, "Add a section"), `ux/capture.ts:36, 52`.
- **Frozen evidence.** `ux/depth-verification.ts:150`, `ux/feedback-verification.ts:200` and
  `ux/placement-verification.ts:94` belong to completed slices and will not re-run against this
  build; their "Insert at the end" locators are left as they are and that is recorded.
- `apps/e2e/phone-layout.spec.ts`, `project-history.spec.ts` and every other e2e spec stay green
  **unedited**.

## File-level change list

Paths are under `apps/web/src/app/` unless stated.

| File | Change | Responsibility |
|---|---|---|
| `../styles/_tokens.scss` | modify | `--canvas-chrome-rest-opacity`, rest mark size, end resize hit width |
| `prototype/design-lab/design-lab-tokens.ts`, `design-lab-store.spec.ts`, `design-lab-export.spec.ts` | modify | The rest-emphasis knob |
| `prototype/design-lab/panels/live-panels.html`, `.ts` | modify | Section frames at rest and focus |
| `features/projects/canvas-chrome/toolbar-keys.ts`, `.spec.ts` | create | Roving focus within a frame toolbar, following programmatic focus |
| `features/projects/canvas-chrome/move-keys.ts` | modify | Grip moves on Up/Down only |
| `features/projects/sections/section-frame/project-section-frame.html`, `.ts`, `.scss`, `.spec.ts`, `.stories.ts` | modify | Plain heading with icon, toolbar (Rename, Collapse, Move, Settings, Remove), mouse-only title click, prefilled field with no-op unchanged save, rest emphasis, scoped danger ink, `collapseError` alert and `aria-busy` |
| `features/projects/shortcuts/shortcut-frame.html`, `.ts`, `.scss`, `.spec.ts`, `.stories.ts` | modify | Toolbar (Collapse, Move, Remove), emphasis, read-only cue, collapse error |
| `features/projects/canvas-chrome/insertion-point.ts`, `.scss`, `.spec.ts` | modify | Rest mark, full-plus hit area, hover/focus line |
| `features/projects/canvas-chrome/section-resize-handle.scss`, `.spec.ts` | modify | Rest emphasis; asymmetric 24 px end hit area |
| `features/projects/project-canvas.html`, `.scss`, `.ts`, `.spec.ts`, `.stories.ts` | modify | "Add a section" after the drop list; `sorting` signal; rest custom properties; end padding removed; unknown-section toolbar; collapse errors routed to their frames |
| `features/projects/project-page-store.ts`, `.spec.ts` | modify | `resizeColumnSpan` generalised to a field writer for `collapsed` and `columnSpan` that re-applies pending fields after whole-record replaces; optimistic `setCollapsed` / `setCollapsedShortcut` with owed read; per-placement `collapseErrors` |
| `features/projects/sections/progress/progress-section.ts`, `.spec.ts` | modify | Comment and spec that cite the "Rename …" heading |
| `prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 76` at Stage 0 |
| `apps/e2e/section-chrome.spec.ts` | create | Acceptance 4–12, 14–16 at 1440 keyboard and mouse and 375 touch |
| `apps/e2e/canvas-editing.spec.ts`, `section-edit-undo.spec.ts`, `placement.spec.ts`, `feedback.spec.ts`, `lifts.spec.ts` | modify | §77, as listed above |
| `apps/e2e/ux/chrome-verification.ts`, `ux/slice76.config.ts`, `ux/slice76-behavior.config.ts` | create | Measurements and supplemental captures on 4253/4353 |
| `apps/e2e/ux/layout.mjs`, `ux/harness.test.mjs` | modify | The census collects `[role=slider]`, with a test |
| `apps/e2e/ux/tasks.ts`, `ux/capture.ts` | modify | Locators for the region name and "Add a section" |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | `--profile 76` as in Acceptance 18 |
| `Canvas Work Manager — … Specification.md` | modify | §21 (token), §26, §31, §32, §63, §67 |
| `docs/decisions/2026-10-section-chrome-is-quiet-at-rest.md` | create | Rest emphasis on every device, persistent add, full hit area, heading and rename shape, toolbar keys, optimistic collapse, the Open question answers |
| `docs/decisions/2026-09-canvas-chrome-is-revealed-not-moded.md`, `2026-09-a-section-has-a-name.md` | modify | Dated amendments: touch, rest emphasis, grip keys, title click, rename focus return (superseding the 2026-09-13 sentence), per-frame collapse error; collapse optimism; the prefilled field |
| `docs/decisions/README.md` | modify | Index the new entry and amendments |
| `docs/roadmap/70-ui-ux/direction.md` | modify | Note under principle 5 that it is implemented, with the decision link |
| `docs/architecture/web/projects/{overview,how,what,why}.md` | modify | Toolbar, heading (including `how.md:211`'s "Rename …" heading text), insertion, resize geometry, optimistic collapse |
| `docs/architecture/web/prototype-tooling/{how,what}.md` | modify | The knob and specimens; `CURRENT_SLICE` |
| `docs/architecture/testing/how.md`, `what.md` | modify | `section-chrome.spec.ts`, the slice-76 rig, the census slider, profile 76; `how.md:258`'s "Rename Markdown" control |
| `docs/roadmap/goals.md`, `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Handoff at close; L6-010, W1-028 and the open halves of L1-006 and L3-018 named for their slices |
| `.prototype/notes.json` | modify | Real-use friction only |

## Implementation sequence

0. **Stage 0.** Bump `CURRENT_SLICE`. Re-grep every spec and decision named above. Build
   `e4ec0cb` into `apps/e2e/ux-output/slice76-baseline-web/` (export outside `apps/e2e/`, link
   `node_modules`, `ng build`), capture "before" with `slice76.config.ts`, and run
   `chrome-verification.ts` against it. Record here the baseline Tab walk, hit map, shortcut
   Remove mark, rest contrast and initial bundle total.
1. **Foundations.** Tokens, knob, `toolbar-keys`, stories and Lab specimens.
2. **Store.** The field writer, optimistic collapse, owed read and refusal state.
3. **Frames.** Section, shortcut and unknown headers; rename; emphasis.
4. **Canvas.** "Add a section", `sorting`, rest marks, hit areas, resize geometry.
5. **Evidence.** Verification script, T03/T05/T06, sheet profile 76, real use; then the step 4
   reviews of the diff.

## Test plan — tests first

| Test | Proves |
|---|---|
| `toolbar-keys.spec.ts`: Left/Right move focus with wrap, Home/End jump, Up/Down are ignored; exactly one item has `tabindex="0"`; programmatic focus on another item makes it the active one | A.2, A.4 |
| `project-section-frame.spec.ts`: the heading's and region's accessible names are exactly the section name; the icon is `aria-hidden` | L6-009 cluster |
| `project-section-frame.spec.ts`: the toolbar is named "{name} tools", contains Rename, Collapse, Move, Remove in order, has one tab stop; Settings only with an inspector | W3-011, A.4 |
| `project-section-frame.spec.ts`: ArrowUp/Down on Move emit `moveRequested`; Left/Right rove and emit nothing; a disabled grip still lets Tab leave | A.4 |
| `project-section-frame.spec.ts`: a `pointerdown` (mouse) then `click` on the title opens rename and emits no collapse; a touch `pointerdown` then `click`, and a `click` with no `pointerdown`, do not; Rename opens it too; while editing, Rename focuses the field | A.5 |
| `project-section-frame.spec.ts`: the field opens with the current name (the default when untitled) selected; unchanged Enter and blur call no `rename`; typing exactly the default on an untitled section calls no `rename`; clearing calls `rename(id, null)`; Enter and Escape return focus to Rename | L3-003, A.5–6 |
| `project-section-frame.spec.ts`: a `collapseError` renders an alert under the header, linked from Collapse by `aria-describedby`; `aria-busy` while pending | A.14, A.16 |
| `shortcut-frame.spec.ts`: toolbar of Collapse, Move, Remove, no rename; read-only cue; `unlink` Remove without danger ink; heading named by `shortcutNameOf` | L3-018 (part), A.8 |
| `project-page-store.spec.ts`: `setCollapsed` paints before the gateway resolves; a `rule_violation` restores the last confirmed value only; `unreachable`, `internal_error` and `invalid_response` restore and make one quiet read whose answer wins; an owed read still holding the old value keeps the error, one holding the requested value clears it; the receipt is reported | L3-016, A.14, A.16–17 |
| `project-page-store.spec.ts`: toggles in sequence: first fails and second succeeds ends on the second; first succeeds and second fails ends on the first's confirmed value | A.14 |
| `project-page-store.spec.ts`: a rename answer, a resize answer and a live re-read each landing while a collapse is pending keep the pending collapse; a collapse answer landing while a resize is pending keeps the pending span | A.15 |
| `project-page-store.spec.ts`: the same paint and revert for `setCollapsedShortcut`; `collapseErrors` clear on the next toggle, a read holding the requested value, `load` of another page and a generation change, and survive an unrelated live re-read; a move reconcile landing while a collapse is pending keeps it; `resizeColumnSpan`'s existing specs stay green unedited | A.15–16, no regression |
| `insertion-point.spec.ts`: the painted plus lies inside the button's box in rest and active states | W1-018 |
| `section-resize-handle.spec.ts`: the end handle's hit width and gap reach follow `--space-4`; the start handle's width is unchanged and its opacity is 0 at rest, full on item hover or focus | A.7, A.12 |
| `project-canvas.spec.ts`: "Add a section" renders after the drop list when placements exist and `orderComplete()`, not otherwise, and is not a drop-list child; it opens the dialog at the end; after a create from it the new heading has focus | W1-017, A.9, A.13 |
| `project-canvas.spec.ts`: while `sorting`, marks and "Add a section" are inert; a refused move with "Add a section" present re-renders the canonical order; after a keyboard move the grip has focus and is the toolbar's active item | A.4, A.11 |
| `project-canvas.spec.ts`: a refused collapse sets that frame's `collapseError`, not the canvas banner | A.16 |
| `build-sheet.test.mjs`: profile 76 fails an insertion button or title control under 24 px (44 px touch), a third button height, a content box moved 2 px, a new axe node on a canvas cell even when its rule id was already present, and a missing `chrome-verification.json`; it reports a new `color-contrast` node without failing; it passes listed changes; the remaining slice 72 exceptions still pass | The gate cannot pass falsely |
| `harness.test.mjs`: `collectControls` returns a `div[role=slider]` with its box | Census sees the resize handle |
| `section-chrome.spec.ts` (e2e) | Acceptance 4–12, 14–16 in the browser: hit points at rest and hover, Tab walk in flow and grid, names, effective opacity at rest, resize midline, grid keyboard move with Up/Down, touch tap on a title, collapse timing, revert and owed read through route stubs and the dev panel's failure injection, 1440 and 375 touch |

Appearance (emphasis, alignment, marks) is judged on the sheet, not by snapshot tests. Write each
test, watch it fail for the right reason, then implement.

## Boundaries touched

- **Gateway interfaces only.** Frames emit intent; the store's optimistic collapse still calls
  `WORK_MANAGER_GATEWAY` through `reportedWrite`. No new gateway member.
- **Contracts once.** Not touched under the recommended Open question 5. `nameOf` stays the one
  derivation; the "unchanged default writes nothing" check compares with the frame's own `name()`,
  which already comes from `nameOf`, so no default is redefined in the web app.
- **No domain, host or persistence change.** Optimism is browser-side; the server's answer still
  wins, including after the owed read.
- **Tokens only.** The rest emphasis, mark size and hit width are tokens; the token lint covers
  them. The muted danger ink at rest is scoped to the canvas frames, not a change to the global
  primitive.
- **Dependency direction.** `toolbar-keys.ts` lives in `features/projects/canvas-chrome/`; nothing
  in `core/` imports it; `features/tasks` is untouched.
- **No scattered prototype flag.** None is added; the Lab knob uses the existing token knobs.

## Explicit non-goals

- Inert shortcut rows and task-row shape (slice 6); the project header's left edge (slice 7).
- Default section names and the doubled Markdown labels (slice 9, under the recommended Open
  question 5).
- A redesigned config inspector (no type supplies one).
- New section types, dialog changes, or creating a section without the dialog.
- Animation of marks beyond a transform/opacity fade within existing duration tokens.
- Pending or saved cues for rename, resize or move.

## Open questions

**All eight answered by the user on 2026-10-20: every recommendation accepted.** So: a plain
heading with a Rename tool and a mouse-or-pen title click (1); one toolbar Tab stop, with the grip
moving on Up/Down (2); the title first at the content edge and the toolbar trailing (3); a
persistent "Add a section" and faint gap marks at rest, on touch too (4); default names handed to
slice 9, so L6-010 and W1-028 are not claimed and the slice stays browser-only (5); a refused
collapse said on its frame (6); the end resize handle at rest with a 24 px hit area, the start
handle on hover (7); a prefilled rename field whose unchanged or exact-default save writes
nothing (8). The questions are kept below as they were asked.

1. **Heading and rename (L6-009 cluster, L3-003).** *Recommended:* the `h2` holds the icon and the
   plain name and stays the focus target; a pencil "Rename {name}" tool in the toolbar starts
   rename; a mouse or pen click on the title still does (§31), a touch tap does not. The rename is
   visible at rest and the heading is never a command. *Alternative:* keep a button inside the
   heading, named by its visible text with "Rename" as its description; the heading reads right,
   but rename stays invisible at rest and costs a Tab stop.
2. **Tab stops (W3-011).** *Recommended:* the tools are one toolbar stop with roving focus; the
   Move grip moves on Up/Down only, since Left/Right rove. With question 1's recommendation a
   section costs insert, toolbar and resize: 3 stops, 2 before its content (from 6 and 5). The
   resize slider keeps its own stop because it carries a value. *Alternative:* keep separate stops
   and only drop the heading button: 5 and 4.
3. **Header layout (W1-029, L1-006).** *Recommended:* title first, its icon on the content edge;
   the toolbar trails on the right, collapse included. *Alternative:* keep the chevron before the
   title, leaving the title indented by one tool width (about 32 px) instead of today's gap.
4. **Insertion at rest (W1-017, L3-001, L1-015).** *Recommended:* a labelled "Add a section" after
   the canvas, and a small plus at rest emphasis in every gap, with the line only on hover or
   focus; touch the same. This matches the Gate 1 amendment ("insertion stay visible at low
   emphasis at rest"). *Alternative:* only "Add a section" persists and gaps stay revealed on hover
   or focus; that needs a further dated amendment.
5. **Default names (L6-010, W1-028).** *Recommended:* hand both to slice 9 (vocabulary).
   Renaming Markdown's default, for example to "Notes", goes through `displayNameOf`, which feeds
   activity, history and refusal text that agents read over MCP, shortcut names ("Markdown
   (Garden)"), host tests (`routes.test.ts`), `project-history.spec.ts` ("Removed the Markdown
   section"), §30, dashboard activity and Archive cells, the history noun `PROSE_NOUN`, and would
   collide with the Reflections page's "Notes from this project's canvases". That is a
   vocabulary decision across systems, and this slice stays browser-only. *Alternative:* take it
   here with that whole list added to the change list and the Must-not-change exceptions.
6. **Where a refused collapse is said (L3-016).** *Recommended:* on its frame, under the header,
   linked from Collapse, as slice 75's feedback decision places failures on the object.
   *Alternative:* the existing canvas-level `[data-section-error]` banner.
7. **The resize handle at rest (L3-002).** *Recommended:* the end handle shows at rest emphasis
   like the tools, with the asymmetric 24 px hit area; the start handle stays as it is, revealed on
   hover. *Alternative:* both stay revealed on hover or focus only, with the wider end hit area;
   L3-002's "can be resized" hint then stays open.
8. **The prefilled rename field (L3-003).** The name decision kept the field "placeholder-driven,
   so the case is rare" that someone types the default as a literal. Prefilling makes the default
   the starting value. *Recommended:* prefill and select it, and treat an unchanged save, or on an
   untitled section a save of exactly the derived default, as no write. A titled section renamed
   to the default still stores it. This reverses one case the decision allowed: an untitled
   section can no longer be given its own default as a stored literal (naming an untitled list
   "Task List" is a no-op), and the amendment says so. *Alternative:* keep the empty field
   with the default as placeholder, and close L3-003 only by the visible Rename tool, leaving its
   "looks like the name was erased" half open.

## Revisions

**Execution notes (2026-10-20).**

- Stage 0 re-grepped the named browser/unit specs, harness locators and both amended decisions.
  `CURRENT_SLICE` is 76. Baseline `e4ec0cb` is exported outside `apps/e2e/` into
  `.prototype/slice76-baseline-source`, with dependency junctions, and built into
  `apps/e2e/ux-output/slice76-baseline-web/browser`. Initial total: **1,089.72 kB**,
  leaving 10.28 kB below the unchanged 1,100 kB ceiling.
- Baseline Tab walk (Kitchen and Client migration): Insert before Markdown → Move Markdown →
  Collapse Markdown → Rename Markdown → Remove section Markdown → Edit Markdown → Resize
  Markdown, with five chrome stops before content and six per section (phone has no resize).
  The heading button is named “Rename Markdown”; title icon offset is 80 px from content.
  Shortcut Remove already uses `unlink`, with muted ink. At desktop rest, Move/Remove/Resize
  effective opacity is 0 (glyph contrast 1:1); Collapse is 1. Touch tools are full strength;
  section Remove is danger ink (`rgb(165,31,21)` light), shortcut Remove is muted
  (`rgb(76,84,100)` light). Final scrolled hit maps and theme contrast are in the runtime file.
- The shared `ux/isolation.ts` used `route.continue()`; it changes to `route.fallback()` to
  satisfy this run's explicit isolation requirement. Earlier frozen verification scripts stay untouched.
- The knob also requires `design-lab-export.ts`, and the Lab/story wrapper
  `section-canvas-frame.ts` must replace its hardcoded zero/coarse-one reveal properties.
  These dependency files extend the file-level list without changing scope.
- Browser geometry is verified by the runtime hit maps and browser journeys: jsdom has no
  layout engine and cannot prove a painted plus's box or a resize midline.
- The shared icon set needed a `rename` pencil mark; its icon census test changes with it.
  The knob's page census also changes (`design-lab-page.spec.ts`), and the tooling overview
  now names nineteen controls.
- Runtime TDD: the unified red run recorded 22 expected failures and 205 passes. The next
  run recorded 271 passes and three failures (two test setup issues, plus the new Rename
  pointerdown guard). Separate frame tests then proved both missing frame `aria-busy`
  bindings red before adding them. Store tests found two extra stale-response cases: an old
  owed read after a newer committed toggle, and a resize's stale whole record after collapse
  committed. Confirmed fields now survive the concurrent write batch, and owed reads check
  the write epoch. The store's 101 tests pass, including existing resize cases unedited.
- Existing e2e journeys create contexts directly and cannot be changed just to inject routes.
  The slice-76 behavior rig therefore uses a launch-level browser proxy on 4253, forwarding
  the virtual host origin to 4353. No listener or physical request uses the developer ports.
  A config-scoped fetch rewrite isolates the legacy Node-side host fetch as well. New file:
  `apps/e2e/ux/slice76-server.mjs`; no production adapter or gateway changes.
- Step 4's independent correctness and boundaries/documentation passes found no boundary
  violations. Verified findings being repaired before Gate 2: preserve an owed-read-confirmed
  collapse against an older concurrent resize answer; assert sorting's hidden/inert semantics;
  require complete runtime measurements rather than a `complete` flag alone; include the
  collapse-at-0.1-second and hit-map visual pairs; constrain Lab geometry exceptions; and
  correct the remaining “eighteen controls” reference. The generated API was rebuilt for the
  new toolbar helper links before re-running documentation checks.
- The review race was reproduced first for both placement kinds (two new failures, 101 existing
  store tests passing). An owed read now updates the retained field's confirmed value through
  the concurrent batch; all 103 store tests pass. Re-review found no further substantive
  correctness or boundary findings. The final production build is **1,098.12 kB**, leaving
  **1.88 kB** below the initial ceiling; baseline was 1,089.72 kB.
- The unedited `canvas-history.spec.ts` still locates the end `InsertionPoint` host. The
  native-button-only implementation removed that host and failed this journey. Keep the
  host as the static sibling after the drop list, projecting the labelled ghost button
  instead of an overlay. This preserves the new interaction and the existing journey;
  the canvas regression is written before that compatibility repair. The earlier spec's
  rest-opacity assertion also compares numbers because CSS serializes `.55` as `0.55`.
  `project-history.spec.ts` additionally requires the end button's stable
  `data-insertion-point-button` attribute; its absence was proved red before restoring it
  on the labelled button. Runtime gap measurements exclude this separately measured Add control.
- The corrected, scrolled baseline hit map records **21/63** successful probes (three of nine
  per plus) in Kitchen at 1440 dark/light and 375 light, at rest and active. Five delayed-collapse
  runs per context have worst times **2,055.5 / 2,076.3 / 2,059.1 ms** respectively. The icon's
  painted box is **85 px** from content on desktop and 109 px on phone; the earlier 80 px reading
  was the heading box, not the icon. Desktop rest grip contrast is 1:1 because invisible;
  phone light is 7.61:1 over the solid-sheet token. Contrast is reported, not gated.
- The persistent-host repair passed 63 canvas/insertion tests and a fresh review without
  substantive findings. Its production initial total is **1,098.83 kB** (1.17 kB headroom).
  Four realistic-seed walkthroughs passed on nested-projects and busy-week: 1440 keyboard dark
  and 375 touch light. The observations and screenshots are recorded in `.prototype/notes.json`
  and `apps/e2e/ux-output/slice76-real-use/`.

**Round 1 (2026-10-20).** An independent reviewer read the plan against the code, spec, findings,
decisions and slices 72 and 75, and returned thirteen substantive and nine minor findings. Each was
checked against the repository before acting (the resize geometry, the profile-72-only census, the
`displayNameOf` blast radius in host and history tests); all held. Changes:

- A prefilled field would store the default as a literal through `saveRename`'s comparison with
  `override()`; an unchanged or exact-default save now writes nothing, with tests, and Open
  question 8 asks the user.
- Optimistic collapse could be repainted by any whole-record answer; the field writer now
  re-applies pending fields, with tests for each order and both toggle sequences.
- A 24 px hit area on both resize edges would overlap across a 16 px gap and bring back the
  neighbour-resize bug; only the end edge widens, asymmetrically, with a midline check.
- The touch change is named as a change to the chrome decision, not hidden under "touch stands".
- Open question 5 now recommends deferring default names to slice 9, given its reach into MCP
  text, host and history tests, shortcuts and Archive; L6-010 and W1-028 are not claimed.
- Profile 76 now states that it runs the full census, which exceptions remain, the button-height
  rule, and which axe ids it gates on canvas cells.
- "Add a section" is a sibling after the drop list, inert through a `sorting` signal; the end
  padding is removed; the toast reserve and a refused grid move are checked.
- A transport or 5xx collapse failure owes a read (§63); the message is linked from Collapse;
  `aria-busy` is the pending vocabulary.
- Verifiability: effective opacity, hit points in both states at 0.8 radius, a gated 100 ms, gap
  stops reported separately, "rendered" rather than "in view", and the icon at the content edge.
- Tests added for mouse-only title click, the Rename tool while editing, roving focus after a
  programmatic or re-created focus, grid keyboard moves, and error clearing.
- Missing locators and frozen evidence scripts listed; title edits move to role-based locators.
- Documentation: `how.md:211`, `testing/how.md:258`, §31's focus sentence and the chrome
  decision's 2026-09-13 sentence, and `design-lab-tokens.ts` with its specs.
- Minor: both opacity variables, danger ink scoped to canvas frames, the first mark above the
  canvas, reduced motion, the per-frame error input noted for the amendment, L1-006 and L3-018
  claimed only in part, T07's locator.

**Round 2 (2026-10-20).** The reviewer confirmed every round-1 finding resolved and raised five
substantive and six minor findings; each was checked against the code and all held. Changes:

- The collapse error no longer clears on any successful read, which would have wiped it the moment
  the owed read landed. It clears on the next toggle, navigation, a generation change, or a read
  holding the value the person asked for, with a test.
- The resize check probes 1 px and 5 px inside each border and asserts no point in the gap hits
  the other item's handle; the 2 px dead band between the handles is allowed.
- The start resize handle gets its own rest rule (0 at rest), so Acceptance 7 and Open question 7
  agree.
- The title click fails closed: rename opens only when the preceding `pointerdown` was `mouse` or
  `pen`, so an engine with no `pointerType` on `click` cannot start a rename from a tap.
- Profile 76 gates axe by node (rule and target), not by rule id, exempts `color-contrast` as
  reported only, and drops the non-existent `aria-toolbar` id.
- Minor: failures branch on `GatewayError.code`; "Add a section" takes `justify-self: start`; the
  end hit area derives from `--space-4`; Open question 8 states exactly which case it reverses;
  pending fields are re-applied at `replaceSection`, `replaceShortcut` and `setCanvas`; T07's
  history is worded correctly.

**Round 3 (2026-10-20).** The reviewer confirmed all round-2 findings resolved, checked that the
Acceptance, Test plan, Findings closed and Open questions agree, and returned **no substantive
findings**. Its four minors were applied: the resize gap check is stated at the default space
knob (the start straddle's overlap below 0.75 predates this slice); axe nodes are matched across
builds by rule id and a stable anchor, with any remainder listed as accepted exceptions; the
start handle's loss of rest visibility on coarse-pointer tablets is named for the chrome
amendment; and the refusal codes are listed. The plan is ready for the user's answers to the
Open questions; implementation has not begun.
