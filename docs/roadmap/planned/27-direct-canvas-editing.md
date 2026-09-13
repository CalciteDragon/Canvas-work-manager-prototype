<!-- plan id="27" status="planned" summary="Contextual section creation, snapped resizing, inline naming and hover controls, plus sidebar and indicator fixes" -->
# Slice 27 — Direct canvas editing and navigation cleanup

## Goal

Make organizing sections available where the user is working, through contextual controls, while fixing navigation height and section indicators.

User-approved feature specification, 2026-09-13: all proposals and recommendations in the spec discussion are accepted. This slice is opened for future development; implementation planning and development have not started. The detailed behavior below is retained at the user's request before writing a plan.

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

- Write an implementation plan or start implementation as part of this specification capture.
- Introduce fixed grid cells, absolute X/Y positioning, arbitrary column spans, vertical resizing or an infinite canvas.
- Remove flow mode, pick an MVP layout default, or redesign dashboard widgets or derived root pages.
- Add new section types, shortcut aliases, embedded source editing, permanent section deletion or new archive semantics.
- Expand the scope to production infrastructure or unrelated cleanup. Removing the Duplicate button does not itself require removing backend capabilities.
