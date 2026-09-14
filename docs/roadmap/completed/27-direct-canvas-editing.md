<!-- completed-record id="27" closed="2026-09-13" summary="Direct canvas editing, positioned creation, resizing, navigation cleanup and MCP acceptance are implemented and verified." -->
# Slice 27 — Direct canvas editing and navigation cleanup

> **Dated note, 2026-09-13 (after closure).** The Outcome below is left as recorded, but its
> claims that the browser acceptance and visual review passed did not hold. A later
> real-browser review found that hover and focus never revealed canvas chrome (inline custom
> properties outranked the reveal rules, and visibility assertions ignore opacity); that a grid
> section's end resize handle was covered by its neighbour's start handle; that resize buttons
> and the trailing insertion plus overflowed the workspace, unpinning the navigation column;
> that Escape could not cancel a pointer resize; and that unavailable grips trapped Tab. The
> sidebar scroll assertion scrolled the window rather than the workspace. All were fixed with
> regression tests. The same follow-up made the resize handle a real ARIA slider, replaced
> Chromium-only `field-sizing` in Rich Text with a script fit, and stopped renumbering from
> changing shifted siblings' `updatedAt`. What is true now lives in
> [the canvas chrome decision](../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)
> and [`docs/architecture/`](../../architecture/overview.md).

## Goal

Make organizing sections available where the user is working, through contextual controls, while fixing navigation height and section indicators.

User-approved feature specification, 2026-09-13: all proposals and recommendations in the spec discussion are accepted. The slice started on 2026-09-13; the implementation plan below was written from the repository and reviewed to closure before any code changed. The **Build** and **Done when** sections are the approved specification, kept verbatim.

## Spec sections

§21–§23 design tokens, themes and navigation; §27–§32 canvas layouts, registry, section frames and editing; §63 optimistic writes; §77 design verification.

This approved direction changes §27's sizing interaction, §31's frame controls and §32's separate editing mode when implemented. The current product spec and architecture still describe the running application. Record implementation-era amendments together with code and tests; do not describe the new behavior as shipped yet. Rationale: [direct canvas editing direction](../../decisions/2026-09-direct-canvas-editing-direction.md).

## Build

### 1. Navigation and section indicator fixes

- The secondary sidebar fills the available workspace height below the top bar, independently of project content length.
- Long navigation content scrolls within the sidebar. Scrolling the canvas keeps navigation accessible.
- Preserve collapsible navigation at narrow widths.
- Section move handles and expand/collapse indicators render as recognizable, consistently aligned icons in both themes.
- Expand/collapse indicators reflect the current state and have accessible labels.

### 2. Remove redundant controls and the separate editing mode

- Remove the secondary sidebar's **Open archive** button. Keep the regular Archive page link and the project menu's archive entry, including access when the Archive tab is disabled.
- Remove **Edit layout / Finish editing layout** and the separate editing mode.
- Remove **Quick add**, section **Size** dropdowns and section **Duplicate** buttons.
- Reveal layout controls on section hover and keyboard focus, without entering a mode.
- Keep type-specific settings through a compact settings icon where applicable. Renaming moves to the title.

### 3. Contextual section creation

- Between sections, hover reveals a horizontal insertion line with a plus button. Include insertion points before the first and after the last section.
- In grid layout, hover over unoccupied grid space reveals a plus button in the available area.
- An empty canvas has a visible add control for creating its first section.
- Clicking plus opens one creation popup with a section-type selector, section-name field, **Create** and **Cancel**.
- Offer the registered types allowed on the current page. Leaving the name blank uses the type's default name.
- Remember the insertion location while the popup is open. Insert at that location, not automatically at the end.
- Cancel or Escape creates nothing. Failed submissions preserve entered values and show an error. Repeated clicks cannot create duplicates.
- Root Home also offers **Add shortcut** in the popup. It replaces the new-section fields with the existing eligible-source picker and inserts the selected shortcut at the chosen location.
- Preserve shortcut rules: same root tree, read-only source content, no shortcut-to-shortcut or self-reference, and removal affects only the placement. Subproject work canvases do not offer shortcut creation.
- Empty grid areas are insertion opportunities within the existing ordered, wrapping grid, not permanently reserved cells. The new section initially fits the selected gap using a supported width; do not offer an in-gap target that cannot fit a supported width. No fixed-cell or absolute-position model is introduced.

### 4. Direct width resizing

- Show horizontal resize handles on section sides during hover or focus. Apply the same interaction to shortcut placements, replacing their size dropdowns too.
- Dragging previews width and the resulting arrangement. Snap to **4, 6, 8 or 12 columns**, retaining the current supported widths and both flow and grid modes.
- Release commits; Escape cancels. Failed saves restore the previous width and show an error.
- Change width only; height follows content. Keep section order while surrounding sections reflow, without overlap or canvas overflow.
- At narrow widths where items display full-width, hide inactive handles without changing saved desktop widths.

### 5. Inline section naming

- Hovering or focusing an editable section title highlights it. Clicking enters inline editing.
- Enter or clicking outside saves. Escape restores the previous name. Clearing the name restores the type's default name.
- Clicking a title must not drag or toggle collapse. Failed saves preserve entered text for correction or retry.
- Shortcut titles reflect their source and are not renamed in place; use **Open source** to rename the source section.

### 6. Contextual removal

- Show a removal icon in the section's top-right corner on hover or keyboard focus.
- Preserve archive-and-restore semantics: removing a section archives it rather than permanently deleting it.
- Containers with live contents retain the choice to archive their contents or move them to another compatible container. Preserve existing no-prompt behavior for views and containers without live contents.
- Removing a shortcut removes only the shortcut, never its source.
- Use accurate tooltips and accessible labels: **Archive section** or **Remove shortcut**.

### 7. Shared interaction requirements

- Hover controls are keyboard reachable and usable on touch devices. Provide keyboard alternatives for moving and resizing.
- Revealing controls does not shift content. Typing, selecting text, clicking content and renaming do not initiate dragging.
- Keep section collapse, content interactions and applicable type-specific configuration usable without an editing mode.
- Continue using design tokens, gateway interfaces and shared contracts. Existing ownership, permission, archive and shortcut rules still apply.

## Done when

- Empty, short and long projects have a full-height secondary sidebar; every navigation item remains reachable, including through the collapsed narrow-screen navigation.
- Move and collapse indicators display correctly in both themes and both collapse states.
- Users can add, move, resize, rename, configure and remove sections without entering an editing mode; the redundant controls listed above are absent.
- Sections and Home shortcuts can be inserted before, between and after existing items; a grid-gap insertion initially fits the selected gap. Position and width survive reload.
- Empty-canvas creation is discoverable; popup cancellation changes nothing; failed creation retains form values; repeated submit creates one item.
- Section and shortcut resizing previews and snaps to 4/6/8/12, preserves order, survives reload and rolls back visibly on failure. Escape cancels. Narrow-screen display preserves saved desktop widths.
- Inline rename saves on Enter or blur, cancels on Escape, restores the default when cleared, retains input on failure and survives reload after success.
- Section removal preserves archive/restore and live-content choices. Shortcut removal leaves its source intact. Archive remains reachable when its tab is disabled.
- Keyboard and touch users can perform the same operations; hover/focus controls do not shift content or conflict with ordinary content interactions.
- The eventual implementation demonstrates these behaviors in the actual app with realistic content, both layout modes, both themes, narrow and wide viewports, and failure injection. Appropriate automated checks, `pnpm docs:check` and `pnpm lint` pass before phase closure.

## Do not

- Start implementation before the plan's review rounds close (AGENTS.md step 2).
- Introduce fixed grid cells, absolute X/Y positioning, arbitrary column spans, vertical resizing or an infinite canvas.
- Remove flow mode, pick an MVP layout default, or redesign dashboard widgets or derived root pages.
- Add new section types, shortcut aliases, embedded source editing, permanent section deletion or new archive semantics.
- Expand the scope to production infrastructure or unrelated cleanup. Removing the Duplicate button does not itself require removing backend capabilities.

<!-- ───────────── Written when the slice starts ───────────── -->

## Repository grounding

Read before writing this plan: §21–§23, §26–§32, §63, §77; `docs/architecture/web/projects/*`;
the decisions on [View/Edit Layout Mode](../../decisions/2026-08-view-mode-section-chrome.md),
[Quick Add](../../decisions/2026-08-project-header-quick-add.md),
[section names](../../decisions/2026-09-a-section-has-a-name.md),
[the navigation column](../../decisions/2026-09-where-the-project-navigation-column-lives.md) and
[the direction](../../decisions/2026-09-direct-canvas-editing-direction.md); and the code below.
What the code says, where it changes the shape of the work:

- **The broken indicators are an encoding defect, not a style one.**
  `sections/section-frame/project-section-frame.html` starts with a UTF-8 BOM and its drag handle
  and collapse glyphs are double-encoded (`â ¿`, `â–¸`, `â–¾` — bytes `c3 a2 c2 a0 c2 bf` where
  `⠿` belongs). `shortcuts/shortcut-frame.html` has the correct glyphs. The fix replaces all of
  them with SVG icons, and a test asserts no frame renders text glyphs for chrome.
- **The sidebar's height is content-dependent by construction.** `project-workspace-shell.scss`
  gives `.project-workspace__nav` `align-self: start` plus `max-height: calc(100vh -
  var(--layout-top-bar-height))`; with short content the column is only as tall as its links.
  `project-page-navigation.scss` already scrolls `.project-nav` with `overflow-y: auto`.
- **Creation always appends.** `SectionService.addWithin` sets `position: siblings.length` over
  the combined section/shortcut order (`placementsOnPage`), and `SectionShortcutService.create`
  sets `position: placements.length`. Neither `CreateSectionInputSchema` nor
  `CreateSectionShortcutInputSchema` (`packages/contracts/src/inputs.ts`) has a `position`.
  `packages/domain/src/page-placements.ts` already provides `listPlacements` and
  `renumberPlacements` for a dense combined order, which both `move` operations use. HTTP
  (`apps/prototype-host/api/routes.ts`) and MCP (`create_section`, `add_section_shortcut`) parse
  those same schemas, so an optional field flows through both without route or tool code.
- **Edit Layout Mode is one signal with many readers.** `ProjectPageStore.editMode`/`setEditMode`,
  `ProjectCanvas.toggleEditMode`, the `editMode` inputs on `ProjectSectionFrame` and
  `ShortcutFrame`, `[cdkDropListDisabled]`/`[cdkDragDisabled]`, the Design Lab's
  `live-panels.html`, three story sets, `apps/e2e/web.spec.ts`, and the walkthrough guide.
- **No registered type has an `inspectorComponent`.** The frame's Settings panel holds only the
  Name field today; once naming moves to the title, a settings icon renders only for a definition
  that declares an inspector.
- **Renames are deliberately not optimistic, and resizes share the same non-optimistic
  `updateSection`.** §63 and the definition's "failed saves restore the previous width" make
  resize the one write this slice turns optimistic.
- **Open archive exists twice**: `ProjectPageNavigation`'s `data-project-nav-open-archive` (to
  remove) and `ProjectMoreMenu`'s `data-project-open-archive` (kept). The header — and so the More
  menu — renders on root and nested routes alike.
- **Mixed-orientation CDK sorting moves DOM nodes directly** (`ProjectCanvas.drop`,
  `canvasRevision`). Anything added as a sibling of the `cdkDrag` wrappers inside the drop list
  risks that reconciliation, so this plan adds none.

## Design

### Canvas chrome without a mode

- Every placement wrapper renders its chrome at all times in **reserved space**: the header keeps
  fixed slots for the grip (start), the collapse chevron, the title, the settings icon (only when
  the definition has an inspector) and the archive/remove icon (end). Visibility toggles
  `opacity`, never `display` or `visibility`, so revealing shifts nothing and hidden controls stay
  in the tab order. The collapse chevron is always visible.
- **Reveal crosses component style scoping through inherited custom properties**, because the grip
  and icons live in `ProjectSectionFrame`/`ShortcutFrame` templates that `project-canvas.scss`
  cannot select. The canvas wrapper sets `--canvas-chrome-opacity: 0` and, on `:hover`,
  `:focus-within`, and under `@media (hover: none), (any-pointer: coarse)`, `1`. The frames'
  own SCSS reads `opacity: var(--canvas-chrome-opacity, 1)` — the fallback keeps a standalone
  frame (Storybook, the Design Lab) fully visible. `design-lab/section-canvas-frame.ts`, which
  mirrors the canvas wrapper, mirrors the new rules too.
- **Nothing inside a `cdkDrag` wrapper may catch the pointer during a drag.** CDK's mixed sorter
  (`_getItemIndexFromPointerPosition`) resolves the item by `elementFromPoint` + `contains`, so an
  overlay extending into a gap would be read as "over that item". `.section-canvas.cdk-drop-list-dragging`
  and `.cdk-drag-preview` set an inherited `--canvas-overlay-pointer-events: none` and
  `--canvas-overlay-opacity: 0`; every overlay and handle (in the canvas template and in
  `InsertionPoint`'s own SCSS) reads both. `InsertionPoint` and `SectionResizeHandle` also show
  themselves under `@media (hover: none), (any-pointer: coarse)` in their own SCSS, and the grip
  `<button>` keeps today's `touch-action: none` and `user-select: none` so a touch drag is not a
  scroll. A grid drag across a row with a gap overlay is an e2e
  assertion.
- CDK stays the pointer sorter (§32). `cdkDropListDisabled`/`cdkDragDisabled` go; dragging starts
  only from the `cdkDragHandle` grip, so typing, selecting and clicking titles or content cannot
  drag. The grip becomes a `<button>` so it is keyboard reachable: ArrowUp/ArrowLeft move one place
  earlier, ArrowDown/ArrowRight one later, through the existing `moveSection`/`moveShortcut`;
  at the first or last place the key does nothing (no request). While a move is pending the grip
  is `aria-disabled` (not `disabled`, which would drop focus) and ignores keys; focus returns to
  the moved item's grip after render — located by `data-section-id`/`data-shortcut-id`, since a
  rejected move changes the `@for` track key and remounts the wrapper — and a polite live region
  announces "Moved *name* to position *n* of *m*".
- Icons are inline SVG with `currentColor`, in one small `CanvasIcon` component (grip, chevron,
  plus, archive, remove, settings, resize). Every length the token lint checks goes through a
  token: new `--size-icon-sm`, `--size-hit-target` and `--size-resize-handle` in `_tokens.scss`;
  the insertion line reuses `--border-focus`; overlay offsets are `calc()` over `--space-*`.

### Insertion

- **Between and around items:** each wrapper carries an absolutely positioned insertion overlay at
  its block-start edge, sitting inside the canvas `gap` and spanning the wrapper's width. Its hit
  area is clamped to the gap (`--space-4`) — the visible plus may be larger but only the part
  inside the gap takes the pointer — so at any density it never covers a header control; it means "insert before this item". One trailing insertion control after the
  drop list means "insert at the end". Hovering or focusing the overlay reveals a horizontal line
  and a plus button labelled "Add section before *name*" / "Add section at the end". In grid,
  items sharing a row each show their own "before" plus on their own hover.
- **Grid gaps:** a pure `gridInsertionGaps(spans)` replays sparse 12-column auto-placement over
  the ordered spans and returns `{ index, availableColumns, columnSpan }` for every row that ends
  with unused columns — including the last row — where `columnSpan` is the largest of 4/6/8 that
  fits. A remainder too narrow for 4 (two columns) yields no target. The plus renders as an
  overlay anchored to the **last item of that row**, positioned into the empty columns with
  `calc()` over `--span`/`--gap-columns` custom properties, so the drop list still contains only
  `cdkDrag` wrappers; the canvas turns each gap's `index` into an anchor (the placement at that
  index, or `null` after the last). Computed only for rendered grid layout; hidden at the ≤ 48rem breakpoint
  where items go full width, and inert during a drag (above). Hovering a gap overlay also reveals
  its anchor item's chrome; that is accepted, since the overlay belongs to that row.
- **Empty canvas:** the empty-state sentence gains a visible "Add a section" button
  (`data-canvas-add-first`).
- **The remembered location is an anchor, not an index.** A target is
  `{ beforeId: SectionId | SectionShortcutId | null, columnSpan }` — `null` meaning "at the end" —
  resolved to an index against the canvas's current placements **when Create is pressed**. A live
  frame (§62) that adds or removes placements while the popup is open therefore cannot move the
  insertion. If the anchor has left the canvas, the dialog keeps its values and says "That place
  changed while you were choosing — close and pick it again", and creates nothing. The popup
  closes on page change, beside `addOpen`'s old reset in the load effect.
- **Positioned insertion needs the whole order.** When the shortcut read failed on a page that
  allows shortcuts (the store keeps sections only), insertion affordances are hidden — the
  canvas's index would disagree with the domain's combined order — and the existing section
  error explains why. The store exposes this as `orderComplete`, set on **every** read path —
  `load`, `refreshSections`, `refreshShortcuts` and `reconcileSections`: false whenever the
  shortcut read of a shortcut-allowed page fails (even if older shortcuts are still held), true
  again on the next successful shortcut read. While it is false the canvas shows its own
  persistent notice (`data-insertion-unavailable`), because `sectionError` is cleared by the next
  unrelated write.
- **One popup:** `SectionCreateDialog`, written for this slice rather than borrowed from
  `SectionRemovalDialog`, which has no focus or Escape handling. `role="dialog"`,
  `aria-modal="true"`, labelled; focus moves to the type list on open, Tab cycles within, Escape
  and Cancel close, and focus returns to the element that opened it. Switching to shortcut mode
  focuses the persistent mode-switch control while sources load; Tab also recovers when focus is
  not on a currently rendered control. Once shortcut creation starts, focus moves to the dialog
  while every action is disabled, and Tab / Shift+Tab stay there until the write settles. Inputs: `types`
  (`SECTION_REGISTRY` — Home and a work canvas accept every registered type, §30, and the domain
  still refuses anything else), `shortcutsAllowed`, `projectId`, `pageId`, `targetLabel`,
  `columnSpan`, and `create = input.required<(draft: { type: string; title: string | null }) =>
  Promise<string | null>>()` resolving to an error message or `null`; output `closed`. The dialog
  owns its `pending` and `error` signals, so neither a later live re-read nor `sectionError`
  clearing can wipe the message while the typed values remain. The Name field's placeholder is the
  selected type's `displayName`; blank sends `null`, so the default name applies. **Create** is
  disabled and the submit handler returns early while pending, so repeated clicks and Enter make
  one request. A failure keeps type and name and shows the message.
- **Shortcuts in the popup:** when `shortcutsAllowed` (root Home only), the dialog offers
  **New section | Add shortcut**. Add shortcut swaps the fields for the existing `ShortcutPicker`
  rendered inside the dialog — its own heading and Close go, since it has no standalone use left and
  the dialog's Cancel closes — with a `create` callback of the same result shape taking `sourceSectionId`. The picker owns a pending
  state that disables every Add button and an inline error that keeps the list open. It reports
  pending state to the dialog, which disables Back and Cancel and ignores Escape until the write
  settles; success closes the dialog and refusal leaves the picker error visible. The standalone
  **Add shortcut** button in the controls row goes.
- **Atomic placement:** `CreateSectionInputSchema` and `CreateSectionShortcutInputSchema` gain an
  optional `position` (`PositionSchema`). Both services insert at `clamp(position, 0, n)` in the
  combined order and renumber with `renumberPlacements`, inside the unit of work they already run,
  recording only `project.section_added` / `project.shortcut_added`. Absent, they append exactly as
  today — which keeps `resolveContainer`'s default-layout path unchanged. Rejected: create then
  `move` from the client — two writes, two activity events, and a failure between them leaves a
  section at the end with an error that invites a duplicate retry.
- `ProjectPageStore.addSection(definition, { position, columnSpan, title })` and
  `addShortcut({ pageId, sourceSectionId, position, columnSpan })` insert the returned record into
  the render order at `position` and reconcile, as `duplicateSection` does today. Both resolve to
  `CanvasWriteResult = { ok: true } | { ok: false; message: string }` — carrying the caught
  error's message, or "The canvas has not finished loading" for the `!loaded` early return — and
  report through that result rather than `sectionError`, so the popup is the one place the failure
  is said. They do not go through `mutate`, whose contract (clear `sectionError`, set it on
  failure, return a boolean) the other writes keep: a sibling `mutateWithResult` shares its
  `loaded`/generation/`track`/`whileWriting` scaffolding, returns the caught message, and leaves
  `sectionError` alone. A write whose page changed mid-flight resolves `{ ok: true }` — the popup
  has already closed.

### Resizing

- The handles live in the **canvas wrapper** (`project-canvas.html`), not in the frames, so one
  implementation serves sections, shortcuts and the unrecognised-section fallback. Each wrapper
  shows start and end handles on hover/focus. A pure
  `snapColumnSpan({ mode, trackWidth, columnGap, startSpan, deltaPx, edge })` converts pointer
  travel into the nearest supported span (grid: `s·col + (s−1)·gap` with `col = (W − 11·gap)/12`;
  flow: `s/12 · W`; the start edge inverts the delta; ties go to the wider span; clamped to 4..12).
  `stepColumnSpan(span, ±1)` walks 4→6→8→12.
- Handle hit areas sit **outside** the frame's content box (in the wrapper's inline padding and
  the canvas gap), so a text selection that starts near a section's edge is never captured.
- `SectionResizeHandle` uses pointer events with pointer capture (mouse, pen and touch alike;
  `touch-action: none`), measuring the canvas through a `measure` function the canvas passes in,
  so jsdom specs inject geometry. It emits `preview(span)`, `commit(span)` and `cancel()`. Escape
  during a drag cancels. The **end** handle is the keyboard stop (`aria-label` "Resize *name*, *n*
  of 12 columns"): ArrowRight/ArrowUp widen, ArrowLeft/ArrowDown narrow, Home/End jump to 4/12 —
  all as preview — Enter or blur commits, Escape cancels. The start handle is pointer-only.
- `ProjectCanvas` holds one `resizePreview = signal<{ id, columnSpan } | null>`; the span classes
  read preview-or-record. In grid the following items reflow around the preview. Flow remains a
  single left-aligned column: the Rich Text editor sizes its height to wrapped content, so
  narrowing it can move later items down as the content grows. Order never changes. Both edges resize
  in both modes: the item stays anchored at its start, and dragging
  the start edge outward widens it, which the preview shows before release. Commit with an
  unchanged span writes nothing.
- `ProjectPageStore.setColumnSpan`/`setColumnSpanShortcut` become optimistic: paint the new span
  inside `whileWriting` (holding live re-reads), replace with the host's record on success. On
  failure restore **only `columnSpan`** to its previous value on whatever record is current — a
  collapse or rename that landed meanwhile survives — and set `sectionError`. Each placement keeps
  a resize sequence number; a response or rollback from an older resize of the same placement is
  ignored, so a failed first resize cannot clobber a second one's paint.
- Below 48rem every item already renders full width; resize handles are hidden there and saved
  spans are untouched.

### Inline naming

- The section title becomes a `<button data-section-title-edit>` inside the existing
  `<h2 data-section-title tabindex="-1">`, highlighted on hover/focus. Activating it swaps in an
  `<input data-section-title-input>` of the same typography, prefilled with the override and
  placeholdered with the type's `displayName`. Enter or blur saves; Escape restores and exits; an
  empty value sends `null`. The title is neither the drag handle nor the collapse control.
- Failure must keep the typed text, which an output cannot report back. `ProjectSectionFrame`
  therefore takes `rename = input.required<(id: SectionId, title: string | null) =>
  Promise<boolean>>()` — one class-property arrow on `ProjectCanvas` shared by every frame, the
  stable-identity idiom this feature already uses for callback inputs — and stays in editing with
  its draft when the promise resolves `false`; the canvas error line carries the reason.
  `ProjectPageStore.renameSection` stays non-optimistic.
- **Exactly one outcome per edit.** The draft is a frame signal, independent of the `section`
  input, so a live re-read replacing the record does not reset what is being typed. A `settling`
  flag is set by Enter, Escape and blur before anything else happens; the input's removal fires a
  `blur` that sees the flag and does nothing. Enter then blur writes once; Escape writes nothing;
  an unchanged value writes nothing.
- `ShortcutFrame`'s title stays static text; **Open source** remains the way to rename the source.
- The inspector loses its Name field and renders only a definition's `inspectorComponent`.

### Removal

- An icon button in the header's end slot: **Archive section** (`data-section-archive`) calls the
  existing `store.removeSection` — `SectionRemovalDialog` still opens only on the host's typed
  `section_not_empty` refusal; **Remove shortcut** (`data-shortcut-remove`) calls
  `store.removeShortcut`. Both carry `title` and `aria-label` with the accurate verb and the name.
  The unrecognised-section fallback gets the same grip and archive icon.

### Removed

Edit layout / Finish editing layout, `ProjectPageStore.editMode`/`setEditMode`, the `editMode`
inputs, Quick add and its menu, the standalone Add shortcut button, the Size selects, the
Duplicate button and `ProjectPageStore.duplicateSection` (the gateway member, HTTP route, domain
operation and MCP surface stay — the slice's *Do not*), the frame's Name field, and the navigation
column's Open archive button with its `openArchiveRequested` output. The controls row keeps its
layout name and development-panel hint.

### Navigation

- `.project-workspace__nav` gets `height: calc(100vh - var(--layout-top-bar-height))` instead of
  `max-height`, keeping `position: sticky; top: 0` and the column's internal scroll. The ≤ 60rem
  media query, which today resets only `max-height`, adds `height: auto` so the static, collapsible
  column is not viewport-tall when collapsed.

## Acceptance check

Run from a clean checkout: `pnpm install`, then `pnpm test`, `pnpm lint` (includes the token lint
and `docs:check`), and `pnpm e2e` (dev servers stopped). Then the §77 pass by hand with
`pnpm dev:host` and `pnpm dev:web`, seed `nested-projects`, at 1440×900 and 375×812, in both
themes, in flow and grid (`gridProjectLayout` is on by default; the development panel's project
layout control switches a project), keeping screenshots for the Outcome.

Items 1–12 are assertions in `apps/e2e/canvas-editing.spec.ts`. `nested-projects` has no empty
root, no long work tree, only flow projects and only 12/8 spans on Home, so the spec builds what it
needs through helpers added to `apps/e2e/seed.ts` over the host API: `createRoot(name)`,
`createSubprojects(rootId, n)`, `addSection(projectId, { type, columnSpan, position? })`, and
`setLayout(projectId, 'grid')` (`PATCH /api/projects/:id` with `projectLayoutMode`, the field the
development panel writes). Failure injection is client-side and fails reads too
([decision](../../decisions/2026-08-latency-and-failure-live-in-the-client.md)), so every
failure step loads the page first, raises the rate, performs one write, asserts, and lowers the
rate in a `finally` — the pattern `web.spec.ts` already uses. Request counts come from
`page.on('request')` filtered by method and path.

1. **Sidebar height.** For an empty root, a root with one section, Home renovation, and a root with
   40 subprojects: the `app-project-page-navigation` box height equals `innerHeight` minus the top
   bar's height (±1px). After scrolling the canvas to the bottom, the column's top is still at the
   top bar's bottom edge. On the 40-subproject root the last work link can be scrolled into view
   inside the column. At 375px the collapsed column is no taller than its toggle, and "Show project
   navigation" reveals every page tab and work link.
2. **Indicators.** Every `[data-section-frame]` and `[data-shortcut-frame]` renders its grip and
   chevron as `svg` with empty text content; the chevron's `aria-expanded` and label flip on toggle.
   Screenshots in dark and light, collapsed and expanded, are reviewed for alignment *(manual)*.
3. **Removed controls.** On Home and Kitchen none of `[data-layout-edit-toggle]`,
   `[data-project-quick-add]`, `[data-project-add-shortcut]`, `[data-section-size]`,
   `[data-shortcut-size]`, `[data-section-duplicate]`, `[data-project-nav-open-archive]` or
   `[data-section-name]` exists. With the Archive page disabled, More → **Open archive** reaches
   `/projects/project-renovation/pages/archive` from Home and from Kitchen.
4. **Insertion, flow.** On Home renovation, the plus before the 3rd placement → Rich Text named
   "Inserted notes" → Create: it is the 3rd placement, and after reload still the 3rd; the section
   and shortcut API lists show dense combined positions. The before-first and at-the-end controls
   insert at 0 and n. **Add shortcut** from the plus before the 2nd placement lands a shortcut 2nd,
   surviving reload.
5. **Insertion, grid.** On a grid root built with spans `[8, 6]`, the gap plus beside the 8 creates a
   4-column section at index 1, and the 8's bounding box is unchanged; after reload it is still at
   index 1 with span 4. A root built with `[4, 6, 12]` (a 2-column remainder) shows no gap plus in
   its first row. On a root built with `[8, 6, 12]`, dragging the 12 by its grip along a path
   outside the other placement boxes, holding the pointer over the empty columns beside the 8
   (where its gap overlay sits) and releasing there does not swap with the 8: the API order is still
   the 8 first. During the drag the gap overlay has `pointer-events: none`; before the drag, the
   test asserts `document.elementFromPoint` at that point returns an element inside the 8's wrapper,
   so the inertness check cannot pass vacuously. Intermediate mouse moves are dispatched because
   CDK sorts only on moves. At 375px, the gap target is hidden after items become full width.
6. **Popup behaviour.** Cancel and Escape create nothing (API list unchanged). With failure rate 1,
   Create shows the injected error inside the popup and keeps type and name; at rate 0 a second
   Create succeeds and exactly one new section exists. A double-click on Create issues exactly one
   `POST /api/projects/:id/sections`. The empty root shows `[data-canvas-add-first]`, which creates
   at position 0. With the popup open, a section added through the API (a live frame) does not move
   the chosen insertion point.
7. **Resize.** In grid, dragging a 12-wide section's end handle left previews 8 then 6 while the
   next item moves up beside it; release commits 6 and reload keeps 6. In flow, resizing a long
   Rich Text section narrower grows the editor to its wrapped content and moves the following
   section down, without changing order. Escape mid-drag restores the previous layout and issues
   no `PATCH`. With failure rate 1, release shows the error and the span returns to its saved value.
   The start handle and keyboard path (item 10) reach the same result. A Home shortcut resizes and
   persists the same way. At 375px no resize handle is visible, and the API span is unchanged.
8. **Rename.** Title click → input; Enter saves (one `PATCH`); blur saves; Escape restores and issues
   no `PATCH`; clearing shows the type's default name and the API `title` is `null`; with failure
   rate 1 the input stays open holding the typed text; every success survives reload. Clicking a
   title starts no drag and does not collapse. A shortcut title is not editable and **Open source**
   still navigates to the source page.
9. **Removal and configuration.** The archive icon on a Rich Text view archives it at once, and it
   appears on the Archive page. After adding a second Task List to Home, archiving the first (with
   live tasks) opens the removal dialog offering cascade and move, and move reassigns the rows.
   Remove shortcut leaves the source section and its rows in place (API). Tooltips read "Archive
   section" and "Remove shortcut". Progress's Count/Weighted/Manual controls and Rich Text editing
   work with no mode.
10. **Keyboard only.** Using the keyboard alone: create at a chosen insertion point, move a section
    down two places with the grip (announcement text present) and a shortcut up one, resize to 8
    with arrows and Enter, rename with Enter, archive — each verified through the API.
11. **Touch.** In a context with `hasTouch: true`, `isMobile: true` and a 1024×1366 viewport (the test
    first asserts `matchMedia('(hover: none), (any-pointer: coarse)').matches`): grip, resize handle,
    insertion plus and archive icon are visible without hover; tapping creates, renames and
    archives; touch drags of the resize handle and grip, dispatched through a CDP session's
    `Input.dispatchTouchEvent` (Playwright's `touchscreen` only taps), persist a new span and a new
    order.
12. **No layout shift and no conflicts.** Hovering and focusing a section changes no placement's
    bounding box. Typing in a Rich Text section, selecting text in a task row, and clicking within
    8px of a section's side or top edge start no drag and write nothing; a text selection dragged
    within 8px inside a frame's side edge is non-empty. At the Design Lab's lowest spacing density,
    under touch emulation, `elementFromPoint` at the centre of each header grip and collapse button
    returns that control, not an insertion plus.
13. **MCP:** `apps/e2e/mcp.spec.ts` connects a real `@modelcontextprotocol/client`, creates a
    section and a shortcut at explicit combined positions, verifies the open canvas repaints
    without a reload, then verifies both placements and their order after reload.
14. **Friction:** findings from the real-app and MCP pass are recorded in `.prototype/notes.json`.

## File-level change list

Paths under `apps/web/src/app/features/projects/` are abbreviated `projects/`.

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/inputs.ts` | modify | Optional `position` on `CreateSectionInputSchema` and `CreateSectionShortcutInputSchema`, with doc comments. |
| `packages/contracts/src/inputs.test.ts` | modify | Position accepted and refused on both inputs. |
| `packages/domain/src/section-service.ts` | modify | `addWithin` inserts at a clamped position and renumbers the combined order; appends when absent. |
| `packages/domain/src/section-service.test.ts` | modify | Positioned insertion tests. |
| `packages/domain/src/section-shortcut-service.ts` | modify | `create` inserts at a clamped position; appends when absent. |
| `packages/domain/src/section-shortcut-service.test.ts` | modify | Positioned placement tests. |
| `packages/mcp-tools/src/tools/sections.ts`, `packages/mcp-tools/src/tools/shortcuts.ts` | modify | `create_section` / `add_section_shortcut` descriptions: "at `position`, else at the end". |
| `packages/mcp-tools/src/contract.test.ts` | modify | Both tools honour `position`. |
| `apps/web/src/styles/_tokens.scss` | modify | `--size-icon-sm`, `--size-hit-target`, `--size-resize-handle`. |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | modify | `sections.create`/`shortcuts.create` answers honour `position` and appear in later `list` answers, so store and canvas specs can assert insert-then-reconcile. |
| `projects/canvas-chrome/canvas-icon.ts` | create | Inline SVG icon set with `currentColor`. |
| `projects/canvas-chrome/canvas-icon.spec.ts` | create | Every name renders an `aria-hidden` `svg`. |
| `projects/canvas-chrome/column-span.ts` | create | `snapColumnSpan`, `stepColumnSpan` — pure. |
| `projects/canvas-chrome/column-span.spec.ts` | create | Snapping and stepping. |
| `projects/canvas-chrome/grid-insertion-gaps.ts` | create | `gridInsertionGaps` — pure replay of sparse 12-column placement. |
| `projects/canvas-chrome/grid-insertion-gaps.spec.ts` | create | Gap targets. |
| `projects/canvas-chrome/section-resize-handle.ts`, `.scss` | create | Pointer and keyboard resize; emits preview/commit/cancel; reads the overlay custom properties. |
| `projects/canvas-chrome/section-resize-handle.spec.ts` | create | Pointer, Escape, keyboard, injected geometry. |
| `projects/canvas-chrome/insertion-point.ts`, `.scss` | create | Line-and-plus overlay, `before` / `end` / `gap` variants; reads the overlay custom properties. |
| `projects/canvas-chrome/insertion-point.spec.ts` | create | Label per variant; emits its anchor. |
| `projects/section-create-dialog.ts`, `.html`, `.scss` | create | The one creation popup; focus, Escape, pending and error of its own; shortcut mode hosts `ShortcutPicker`. |
| `projects/section-create-dialog.spec.ts` | create | See the test plan. |
| `projects/section-create-dialog.stories.ts` | create | Default, HomeWithShortcuts, Pending, Failed, AnchorGone. |
| `projects/project-canvas.ts`, `.html`, `.scss` | modify | Remove mode, Quick Add and Add shortcut; wrapper reveal and drag-inert custom properties; insertion and gap overlays; resize handles and preview; empty-canvas add; create dialog with anchor resolution; keyboard move with focus restore and announcement; shared `rename` arrow; page-change closes the popup; class doc comment. |
| `projects/project-canvas.spec.ts` | modify | Replace edit-mode and Quick Add tests; add the canvas tests below. |
| `projects/project-canvas.stories.ts` | modify | Drop `EditLayout`; add `GridWithGaps` and `EmptyWithAdd`. |
| `projects/project-page-store.ts` | modify | Remove `editMode`, `setEditMode`, `duplicateSection`; positioned `addSection`/`addShortcut` returning `CanvasWriteResult`; `orderComplete`; optimistic, sequence-guarded `setColumnSpan`/`setColumnSpanShortcut`; class doc comment (§32 paragraph). |
| `projects/project-page-store.spec.ts` | modify | Tests below; delete edit-mode and duplicate tests. |
| `projects/sections/section-frame/project-section-frame.ts`, `.html`, `.scss` | modify | Template rewritten as UTF-8 without a BOM; SVG grip button and chevron; inline title editing with a draft and settle guard; settings icon only with an inspector; archive icon; reads `--canvas-chrome-opacity`; drop `editMode`, `resized`, `duplicateRequested`, `renamed`, the Size select and the Name field; class doc comment. |
| `projects/sections/section-frame/project-section-frame.spec.ts` | modify | Tests below; remove edit-mode tests. |
| `projects/sections/section-frame/project-section-frame.stories.ts` | modify | Drop `Editing`; add `WithInspector` and `RenamingTitle`. |
| `projects/sections/rich-text/rich-text-section.ts`, `.scss` | modify | Make the editor height follow wrapped content so Flow resize reflows later sections; remove manual vertical resizing. |
| `projects/shortcuts/shortcut-frame.ts`, `.html`, `.scss` | modify | SVG grip button and chevron, remove icon, reads `--canvas-chrome-opacity`; drop `editMode`, `resized` and the Size select. |
| `projects/shortcuts/shortcut-frame.spec.ts`, `.stories.ts` | modify | Remove edit-mode cases; controls present without a mode; title not editable. |
| `projects/shortcuts/shortcut-picker.ts`, `.html`, `.scss` | modify | Heading and Close removed; `create` input; pending disables Add; inline write error. |
| `projects/shortcuts/shortcut-picker.spec.ts`, `.stories.ts` | modify | Positioned add, one request on repeated clicks, failure keeps the list; `Pending` and `WriteFailed` stories. |
| `projects/project-page-navigation.ts`, `.html`, `.scss` | modify | Remove the Open archive button, its output and styles. |
| `projects/project-page-navigation.spec.ts`, `.stories.ts` | modify | The column has no Open archive; stories drop its handler if bound. |
| `projects/project-workspace-shell.html`, `.scss` | modify | Drop the column's `openArchiveRequested` binding; full-height sticky column; `height: auto` at ≤ 60rem. |
| `projects/project-workspace-shell.spec.ts` | modify | Open archive through the More menu (currently the column, ~line 470). |
| `apps/web/src/app/prototype/design-lab/panels/live-panels.html`, `live-panels.ts` | modify | Remove `[editMode]` bindings and the edit-mode frame; pass a stable no-op `rename`. |
| `apps/web/src/app/prototype/design-lab/section-canvas-frame.ts` | modify | Mirror the canvas wrapper's reveal custom properties. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 27`. |
| `apps/e2e/seed.ts` | modify | `createRoot`, `createSubprojects`, `addSection`, `setLayout` API helpers. |
| `apps/e2e/canvas-editing.spec.ts` | create | Acceptance items 1–12, including rendered Flow content-height reflow during resize as well as Grid placement reflow. |
| `apps/e2e/mcp.spec.ts` | modify | Real Streamable HTTP MCP client inserts a section and shortcut at explicit combined positions, checks the live canvas without a reload, then reloads to verify persistence. |
| `apps/e2e/web.spec.ts` | modify | Replace Edit layout, Quick add and column Open archive steps with the insertion popup, the archive icon and More → Open archive. |
| `apps/e2e/archive.spec.ts` | modify | Open archive through the More menu. |
| `.prototype/notes.json` | modify | Record Slice 27 friction (or the absence of new friction) after using the UI and MCP acceptance path. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | §23: the column fills the workspace height and Archive's control is the More menu; §26: the Quick Add paragraph; §27: the flow "Supports" list, section creation and agent `create_task` resolution, and a *Landed in Slice 27* note that adds may insert at a position; §31: the frame list and Open archive placement; §32: rewritten from two modes to contextual controls, including the 25.4 shortcut note — each change with a *Landed in Slice 27* note. |
| `docs/decisions/2026-09-contextual-insertion-names-its-position.md` | create | Optional `position` on create, atomic in the domain; create-then-move rejected; anchors not indices in the UI; grid gaps are targets, not cells, fitted when chosen — a neighbour's live span change while the popup is open does not re-fit the remembered span. |
| `docs/decisions/2026-09-canvas-chrome-is-revealed-not-moded.md` | create | Reserved-space reveal through inherited custom properties, `hover: none`/`any-pointer: coarse`, drag-inert overlays, keyboard move and resize, optimistic resize with column-only rollback, callback rename and dialog results, the three defaulted questions below. |
| `docs/decisions/2026-08-view-mode-section-chrome.md` | modify | `Superseded by` banner. |
| `docs/decisions/2026-08-project-header-quick-add.md` | modify | Dated amendment: Quick Add removed. |
| `docs/decisions/2026-09-a-section-has-a-name.md` | modify | Dated amendment: the control is the inline title. |
| `docs/decisions/2026-09-where-the-project-navigation-column-lives.md` | modify | Dated amendment: Quick Add no longer exists; the column has no Open archive and now fills the height. |
| `docs/decisions/2026-09-root-archive-recovery-guidance.md` | modify | Dated amendment: Open archive lives in the More menu on root and nested routes. |
| `docs/decisions/2026-09-direct-canvas-editing-direction.md` | modify | Link to `active/` (done at start); dated amendment at close naming the two new entries. |
| `docs/decisions/README.md` | modify | Index the new entries; statuses of the amended and superseded ones. |
| `docs/architecture/contracts/why.md`, `how.md` | modify | Link the insertion decision; document optional `position` on the two create inputs and its shared HTTP/MCP contract. |
| `docs/architecture/domain/why.md`, `how.md` | modify | Link the insertion decision; document clamped insertion and dense combined-order renumbering inside the existing unit of work. |
| `docs/architecture/mcp-tools/why.md`, `how.md` | modify | Link the insertion decision; document that `create_section` and `add_section_shortcut` accept an optional position. |
| `docs/architecture/web/projects/overview.md`, `why.md`, `what.md`, `how.md` | modify | Canvas responsibilities; frame label in the structure diagram; `canvas-chrome/` and `SectionCreateDialog` in the inventory and key symbols; runtime-flow step 4; *Changing it* (a new canvas write returns a result where a popup reports it); the e2e command list; decisions list. |
| `docs/architecture/web/prototype-tooling/what.md` | modify | `SectionCanvasFrame` mirrors the canvas wrapper's reveal rules. |
| `docs/architecture/testing/what.md` | modify | `canvas-editing.spec.ts` in the e2e inventory. |
| `docs/architecture/testing/overview.md`, `how.md` | modify | E2E responsibilities and journeys; `pnpm e2e` and the §77 real-app acceptance steps. |
| `docs/guides/first-milestone-walkthrough.md` | modify | §3 steps 10–15 rewritten for contextual controls; step 17's "Edit Layout Mode exposes" corrected. |
| `docs/guides/mcp-setup.md` | modify | Optional `position` on `create_section` and `add_section_shortcut`. |
| `docs/roadmap/goals.md` | modify | *Now* points at `active/` (done at start); updated again at close. |
| `docs/roadmap/active/27-direct-canvas-editing.md` | modify | Revisions, then Outcome. |

Checked and unchanged: `apps/prototype-host/api/routes.ts` (parses the contract schemas);
`docs/architecture/{contracts,domain,mcp-tools}/what.md` (their diagrams and inventories stay
accurate); `README.md` (no command or URL changes).

## Test plan — tests first

| Test | Proves |
|---|---|
| `contracts/inputs.test.ts: create inputs accept an optional non-negative integer position` | Both schemas; `-1` and `1.5` refused; the shortcut input stays strict. |
| `domain/section-service.test.ts: add inserts at a position in the combined section and shortcut order` | Dense renumbering across both record kinds. |
| `…: add clamps a position past the end, and appends when none is given` | The default path, including `resolveContainer`, is unchanged. |
| `…: a positioned add records one section_added and no move activity` | §57 activity unchanged. |
| `…: a refused positioned add (disabled page, archived project, actor without projects.write) renumbers nothing` | Failure and permission paths. |
| `domain/section-shortcut-service.test.ts: create inserts a placement at a position among sections` | Combined order. |
| `…: a refused positioned create (non-Home page, cross-root source, missing permission) leaves every position untouched` | Source and permission rules still refuse first. |
| `mcp-tools/contract.test.ts: create_section and add_section_shortcut honour position` | Agents get the same seam; `projects.write` still required. |
| `canvas-chrome/column-span.spec.ts: snaps pointer travel to the nearest of 4/6/8/12 in grid and flow` | Geometry for both modes; start edge inverts; ties widen; clamps. |
| `…: stepColumnSpan walks the supported spans and stops at the ends` | Keyboard stepping. |
| `canvas-chrome/grid-insertion-gaps.spec.ts: returns a gap per short row with the widest span that fits` | `[8,6]`, `[6,8]`, `[4,4,6]`, the trailing row. |
| `…: offers nothing for full rows, a 2-column remainder, or an empty list` | No unfittable targets. |
| `canvas-chrome/section-resize-handle.spec.ts: previews on pointer move and commits on release` | Pointer-capture path with injected measurements. |
| `…: Escape during a drag cancels and commits nothing` | Cancel. |
| `…: arrows and Home/End preview, Enter and blur commit, Escape cancels` | Keyboard alternative. |
| `canvas-chrome/insertion-point.spec.ts: labels before, end and gap targets and emits its anchor` | Accessible names; anchor identity. |
| `section-create-dialog.spec.ts: lists the given types and sends a null title when the name is blank` | Default-name rule. |
| `…: Cancel and Escape emit closed without calling create` | No creation. |
| `…: Create is disabled while pending, so a double click and Enter call create once` | No duplicates. |
| `…: a failure result keeps the chosen type and typed name and shows the message` | Failed submission. |
| `…: on root Home it switches to Add shortcut and hosts the picker; elsewhere it offers no shortcut mode` | Shortcut mode and its rule. |
| `…: a pending shortcut write disables Back and Cancel, traps Tab and Shift+Tab in the dialog, ignores Escape and preserves the picker failure` | The parent dialog cannot imply that an in-flight placement was canceled or let focus leave while all controls are disabled. |
| `…: focuses the type list on open, keeps Tab inside, and returns focus to the opener on close` | Keyboard. |
| `…: while shortcut sources load, focus stays on the persistent mode switch and Tab recovers from an unlisted active element` | Loading does not move keyboard focus outside the modal. |
| `shortcuts/shortcut-picker.spec.ts: it calls create with the source once and disables every Add while pending` | Positioned shortcut; pending guard. |
| `…: a failed create keeps the list open and shows the message` | Shortcut-mode failure. |
| `project-page-store.spec.ts: addSection sends position, span and title and inserts at that index before reconciling` | Positioned create. |
| `…: addSection resolves a failure result with the message and leaves the canvas and sectionError unchanged` | Failure path reported once. |
| `…: addShortcut sends position and span, and resolves a failure result on refusal` | Positioned placement and its failure. |
| `…: orderComplete is false when the shortcut read failed on a shortcut-allowed page` | Insertion is withheld when indices would lie. |
| `…: orderComplete stays false when a later refresh fails the shortcut read again, and recovers to true after a successful one` | Every read path, both directions. |
| `…: refuses section and shortcut moves while Home has an incomplete combined order` | Position-based writes cannot corrupt an order the canvas could not fully read. |
| `…: setColumnSpan paints immediately and a live frame during the write does not overwrite the paint` | `pendingWrites` guard. |
| `…: a failed setColumnSpan restores only columnSpan, keeping a collapse that landed meanwhile, and sets sectionError` | Column-only rollback. |
| `…: an older failed resize does not clobber a newer resize of the same section` | Sequence guard. |
| `…: setColumnSpanShortcut paints and rolls back a placement the same way` | Shortcut resize rollback. |
| `project-section-frame.spec.ts: renders grip and chevron as SVG icons with no text glyphs` | Encoding regression. |
| `…: renders the grip and archive icon with no mode input` | No mode. |
| `…: offers a settings icon only when the definition has an inspector` | Type-specific settings retained. |
| `…: clicking the title edits it; Enter calls rename(id, title) once even though the input's removal blurs` | Inline naming; one write. |
| `…: Escape restores the name and calls nothing; an unchanged value calls nothing; blank calls rename(id, null)` | Cancel and default. |
| `…: blur saves, and a false result keeps the typed text in the input` | Failure path through the callback. |
| `…: a new section input while editing keeps the draft` | Live re-read does not reset typing. |
| `…: pointerdown on the title starts no CDK drag and toggles no collapse` | Interaction conflicts. |
| `…: the archive icon emits removeRequested and is labelled Archive section` | Removal label. |
| `shortcut-frame.spec.ts: the remove icon is labelled Remove shortcut and the title is not editable` | Shortcut rules. |
| `project-canvas.spec.ts: inserts before the first item, between items and at the end at the resolved index` | Remembered location. |
| `…: a live frame adding a placement while the popup is open still inserts before the chosen anchor` | Anchor, not index. |
| `…: a removed anchor keeps the popup open with its message and creates nothing` | Anchor gone. |
| `…: changing page closes the popup` | No stale popup. |
| `…: renders a gap plus for an [8, 6] grid, none for [6, 6], and none in flow` | Grid-gap wiring. |
| `…: a grid-gap creation sends the gap's span` | Initial fit. |
| `…: an empty canvas offers Add a section, which creates at position 0` | Empty state. |
| `…: hides insertion affordances when orderComplete is false` | Partial read failure. |
| `…: disables movement and marks the grip unavailable when orderComplete is false` | The visible keyboard and pointer controls agree with the store guard. |
| `…: resize preview changes the rendered span without changing order, and an unchanged commit writes nothing` | Preview state. |
| `…: renders resize handles for sections, shortcuts and an unrecognised section` | One implementation. |
| `…: grip ArrowDown moves a section one place, announces it, and keeps focus on the moved grip` | Keyboard move. |
| `…: grip ArrowUp moves a shortcut; at the first place it issues no request` | Shortcut move; clamping. |
| `…: a rejected keyboard move remounts and restores focus to the grip` | Failure path. |
| `…: renders none of the removed controls` | Edit layout, Quick add, Add shortcut button, Size and Duplicate absent. |
| `…: archiving a container with live rows still opens the removal dialog` | Existing semantics without a mode. |
| `project-page-navigation.spec.ts: the column has no Open archive button` | Redundant control removed. |
| `project-workspace-shell.spec.ts: More → Open archive enables and opens Archive from a nested route` | Archive reachable with its tab disabled. |
| `apps/e2e/canvas-editing.spec.ts` | Acceptance items 1–12 in the real app, including what jsdom cannot see: sidebar height, CDK hit-testing, no shift, touch, pixel snapping. |

Existing tests that assert the removed behaviour are deleted or rewritten in the same commit as
the change that removes it (§77: the intent changed), and each is named in that commit message.

## Boundaries touched

- **Contracts once.** `position` is added to the existing Zod input schemas only; the web store,
  HTTP and MCP consume those types. No local input types.
- **Domain.** The positioned insert uses `listPlacements`/`renumberPlacements` and the injected
  `Clock` the services already hold; no new service edge, no HTTP or MCP knowledge, no `new
  Date()`.
- **MCP tools call services.** The two tools change descriptions only; their schemas come from
  contracts.
- **Components depend on gateway interfaces.** Every new component is chrome that emits intent;
  only `ProjectPageStore` and `ShortcutStore` touch `WORK_MANAGER_GATEWAY`. `app.config.ts` is
  untouched.
- **Tokens only.** Icon sizes and hit targets become tokens; SVG geometry lives in `viewBox` and
  path data, which the token lint deliberately does not scan. Overlay offsets use `calc()` over
  tokens and custom properties.
- **The UI never decides a rule.** The popup lists the registry on canvases that accept every
  type; refusals (disabled page, archived project, source rules, permission) are shown as
  returned. Removal still asks only on the host's typed refusal.
- **No mega-store; `core/` never depends on `prototype/`.** `ShellStore` and `AppShell` are
  untouched; the sidebar fix is one rule in the project feature.
- **Disposable host (§71).** Routes need no change and get no new tests; the positioned seam is
  covered in the domain, the MCP contract tests and e2e.

## Explicit non-goals

- Everything in the slice's *Do not*: fixed cells, X/Y, arbitrary spans, vertical resize, an
  infinite canvas; removing flow or choosing a layout; new section types, aliases, embedded source
  editing, hard delete, new archive semantics; production infrastructure or unrelated cleanup.
- Removing `sections.duplicate` from the gateway, HTTP, domain or MCP.
- Filtering section types in the popup by page capability beyond "this canvas accepts every
  registered type" — the Reflections page is its own renderer and gets no insertion UI.
- Dropping a dragged section into a grid gap (CDK's ordered drop is unchanged), multi-select, and
  bulk collapse or resize.
- The shell columns at 375px (`note-2026-09-06-007`), §46 read-failure injection
  (`note-2026-09-06-009`), and extracting a shared component library — `CanvasIcon` stays inside
  the projects feature.
- A repository-wide template-encoding lint; the frame spec covers the defect found.

## Open questions

Resolved by defaults and recorded in the chrome decision entry rather than escalated, because
none changes the shape of the work:

- *Keyboard resize commit* — preview on arrows, commit on Enter or blur (matching inline rename),
  rather than a write per keypress.
- *Grid "between" insertion* — a per-item "before" overlay plus gap targets, rather than a
  row-spanning line that cannot express in-row positions.
- *Rename failure reporting* — a promise-returning callback input on the frame, rather than
  per-section pending and error inputs driving a state machine.

Escalate to the user only if the §77 pass shows hover-revealed insertion is undiscoverable on a
realistic Home — the direction decision's own *Revisit when*.

## Revisions

- **Round 0 (2026-09-13):** plan written from the repository. `roadmap.mjs start` moved the file,
  so `goals.md` and the direction decision's link now point at `active/`; the definition's
  capture-era Goal sentence and first *Do not* bullet were updated to the started state.
- **Round 1 (2026-09-13):** 8 substantive, 10 minor findings, all checked against the code and
  accepted. Substantive: the `rename` callback now carries the section id; chrome reveal crosses
  component style scoping through inherited custom properties (and `section-canvas-frame.ts`
  mirrors it); every overlay and handle is pointer-inert during a drag, because CDK's mixed sorter
  hit-tests with `elementFromPoint` + `contains`; the ≤ 60rem query gains `height: auto`; the
  popup remembers an anchor id resolved at submit, not an index a live frame can shift, and closes
  on page change; the popup and picker own their pending/error state through result-returning
  callbacks instead of reading `sectionError`; inline rename has a settle guard and a draft that
  survives a live re-read; the acceptance check builds its fixtures through new `seed.ts` API
  helpers (the seed has no empty, long, grid or `[8,6]` projects), adds a second Task List before
  expecting "move", and dispatches touch drags through CDP. Minor: `aria-disabled` grip and
  end-of-list clamping with a keyboard shortcut-move test; resize handles located in the canvas
  wrapper; flow resize described honestly (no neighbour reflow); column-only, sequence-guarded
  resize rollback; insertion withheld when the shortcut read failed (`orderComplete`); a dialog
  with its own focus and Escape handling and an embedded picker mode; a third size token;
  `any-pointer: coarse`; edge-click and configuration acceptance; an MCP step; spec §23/§27/§32
  passages, walkthrough step 17, `mcp-setup.md`'s shortcut tool, `prototype-tooling/what.md`,
  `testing/what.md`, `fake-gateway.ts` and the picker stories added to the change list. Checked and
  unchanged: `mcp-tools` and `domain` docs describe no create positioning.
- **Round 2 (2026-09-13):** every round-1 finding confirmed resolved against the code (CDK 22.1.4's
  drag preview keeps the scoping attribute; the drop-list dragging class binds zoneless; the host
  routes support the `seed.ts` helpers; CDP touch events drive CDK and pointer capture). No
  substantive findings. Eight minor ones, all applied: a `mutateWithResult` sibling so the create
  result does not break `mutate`'s contract; `orderComplete` defined on every read path with a
  persistent notice and recovery tests; the drag-inertness e2e made non-vacuous; insertion hit areas
  clamped to the gap and resize hit areas kept outside the content box, with top-edge, selection and
  low-density touch checks; hover-none rules and `touch-action: none` stated for overlays and the
  grip; the picker's unused standalone mode dropped; and the gap-refit limit recorded for the
  insertion decision. The plan is closed for implementation.
- **Round 3 (2026-09-13):** the independent review found two gaps: architecture documentation for
  the new contract, domain behavior and MCP inputs was omitted, and resize verification covered
  only Grid despite the approved Build requiring both modes. Added the contracts/domain/MCP-tools
  `why.md` and `how.md` files to the change list, and specified/added Flow verification for
  content-driven vertical reflow while preserving the single-column order. The approved Build and
  Done-when text remain unchanged.
- **Round 4 (2026-09-13):** review found that the planned Flow fixture used a Rich Text textarea
  with fixed rows, so wrapped text could not grow its height. Added Rich Text intrinsic-height
  behavior and real-browser verification to the plan, and removed the textarea's manual vertical
  resizing to preserve the slice's width-only sizing rule.
- **Implementation review (2026-09-13):** the partial-read state already withheld insertion, but
  code review showed moves also send a combined-order position. Added a store guard for section and
  shortcut moves, disabled CDK drag and keyboard movement while the order is incomplete, and
  covered both paths. The notice now says those operations are unavailable rather than claiming
  every control is hidden.
- **Diff review follow-up (2026-09-13):** independent review found three implementation gaps and
  one test-path ambiguity. Grid gap targets are now hidden when the 48rem breakpoint makes every
  item full width. `ShortcutPicker` reports pending state so Back, Cancel, mode changes and Escape
  cannot dismiss an in-flight placement; a browser and unit regression verify that behavior. The
  dialog focuses its persistent mode switch while shortcut sources load and recovers Tab when focus
  is not on a rendered control. The mixed-grid drag assertion now routes around other placement
  boxes and verifies active-drag `pointer-events: none`, rather than attributing a legitimate CDK
  reorder to the gap overlay. A final keyboard review found that disabling the currently focused
  Add button during its write could move focus outside the dialog; a failing regression drove focus
  to the dialog and traps both Tab directions while its controls are disabled. The token lint also
  caught a color-mix expression in the dialog backdrop; it now uses the existing theme background
  token on a separate translucent backdrop layer. The browser keyboard journey now waits for the
  grip's pending state to clear before sending its next move, matching the explicit input guard.
- **Living-documentation review (2026-09-13):** linked the positioned-insertion decision from the
  contracts, domain and MCP-tools rationale; corrected the Quick Add implementation note to mark
  it as historical; updated the Storybook inventory and the spec file-list description; and added
  the real-MCP e2e case and `.prototype/notes.json` to the plan's change list. Follow-up review
  added the testing architecture overview and how-to pages that document the browser-acceptance
  responsibilities and command.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables.** Home and work canvases now create sections at a chosen position, and root Home
can place a shortcut in the same combined order. People can rename sections inline, resize section
and shortcut widths by pointer or keyboard in Flow and Grid, collapse and archive from the canvas,
and reach Archive from the project menu. The navigation column fills the viewport; Rich Text grows
with its contents in Flow. The gateway seam remains in `ProjectPageStore` and `ShortcutStore`, and
the MCP path uses the same domain operation. The browser acceptance suite passes 20/20, including
the real-MCP insert-and-reload journey. The canvas and write behavior live in
[ProjectCanvas](../../../apps/web/src/app/features/projects/project-canvas.ts) and
[ProjectPageStore](../../../apps/web/src/app/features/projects/project-page-store.ts), with the
browser journey in [canvas-editing.spec.ts](../../../apps/e2e/canvas-editing.spec.ts).

**Deliberate choices.** Creation stores one position across sections and shortcuts; the popup
retains an anchor identity until submit, while a removed anchor refuses the write. Grid gaps are
insertion targets rather than cells, and their span is fitted when selected. Canvas controls
appear on hover or focus without shifting content or entering an editing mode. These choices are
recorded in [contextual insertion](../../decisions/2026-09-contextual-insertion-names-its-position.md)
and [revealed canvas chrome](../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md).

**Deviations from the plan.** The Flow resize acceptance exposed that fixed-row Rich Text could not
grow vertically, so the textarea now measures its content and no longer offers manual vertical
resize. Diff review added guards for incomplete section-plus-shortcut reads, hid grid-gap controls
at the full-width breakpoint, and kept keyboard focus inside the shortcut dialog while a write
disables its controls. The keyboard browser journey waits for the grip's pending state to clear
between moves.

**Deferred and open questions.** Fixed cells, vertical resizing, new section types, broader
infrastructure and other explicit non-goals remain out of scope. The prototype run across the
nested-projects seed, light and dark themes, touch and keyboard paths, and the MCP create flow
surfaced no new friction. Sustained use should still test whether contextual controls are
discoverable; choose the next slice from `.prototype/notes.json` and the open §83 questions.

**Documentation and verification.** Updated the product specification; web, contract, domain,
MCP and testing architecture pages; decisions and index; walkthrough and MCP guide; roadmap goals;
and `.prototype/notes.json`. `pnpm test`, `pnpm e2e` (20/20), `pnpm lint`, `pnpm docs:api`, and
`pnpm docs:check` passed. Visual review covered section and shortcut headers in both themes and
expanded/collapsed states.
