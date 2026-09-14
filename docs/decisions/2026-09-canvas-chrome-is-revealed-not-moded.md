# Canvas chrome is revealed in place, not gated by an editing mode

**Question**

How can ordinary project work stay visually calm while section and shortcut organization is
available at the canvas, including for keyboard and touch users? §31–§32 previously put layout
controls behind Edit Layout Mode.

**Options tested**

- *Keep every control permanently visible*: rejected. It restores the crowded headers that
  motivated the approved direction.
- *Keep a separate Edit Layout Mode*: rejected. It makes creation and organization unavailable
  until a user changes modes and preserves redundant mode state in the page.
- *Reveal reserved controls on hover and keyboard focus*: chosen. The frame keeps space for
  controls so revealing them does not shift content.
- *Use hover-only controls everywhere*: rejected. Hoverless and coarse-pointer devices need the
  controls to stay visible and usable.

**What we learned**

The frame can reveal controls through inherited custom properties without changing its layout.
Hover and focus reveal them on pointer-capable desktop devices; `hover: none` and
`any-pointer: coarse` expose them by default. Insertion affordances, resize handles and grip
interactions become inert during a drag so overlays do not intercept the sorter. Keyboard
movement uses the grip; keyboard resize previews supported spans and commits on Enter or blur,
while Escape cancels.

Resize is optimistic because width is immediately visible and reflows the canvas. Failure restores
only `columnSpan`, leaving concurrent placement order, title and other state intact. Rename and
dialog writes use result-returning callbacks: the owning frame or dialog can preserve the typed
value, remain open and show the failure instead of treating a failed write as success.

**Current decision**

There is no separate Edit Layout Mode. Section and shortcut controls are reserved in their frames,
revealed on hover or focus, and remain visible on hoverless or coarse-pointer devices. Their
reveal does not shift content; overlays and handles are inert during a drag. Keyboard users can
move placements and resize them, with resize preview committed by Enter or blur and canceled by
Escape.

Resizing snaps to 4, 6, 8 or 12 columns and optimistically updates only the placement span. A
failed save restores only the previous span and reports the error. Rename is an inline title
control with a promise-returning callback; failure keeps the edit available for correction or
retry. Creation dialogs likewise consume result-returning callbacks, own pending and error state,
and preserve entered values on failure. Type-specific settings remain available through a compact
icon only when the section type declares an inspector.

Root Home offers shortcut creation in the contextual dialog. Shortcut removal affects its
placement only, and the source content remains read-only. Archive recovery stays outside canvas
chrome: **Open archive** is in the project More menu on root and nested work routes, even when the
Archive tab is disabled.

Three interaction details are deliberately fixed for this slice:

- Keyboard resize previews with arrow keys and commits on Enter or blur, matching inline rename;
  Escape cancels without a write.
- Grid insertion uses a before-item target plus targets in available gaps, rather than a
  row-spanning line that cannot represent an in-row position.
- Rename reports failure through a promise-returning frame callback, rather than adding separate
  per-section pending and error inputs.

**Confidence**

Medium-high. The design removes mode state while preserving discoverable controls across pointer
types and keyboard use. Browser, keyboard and touch verification with realistic mixed-width
content remains the evidence for whether the controls are discoverable enough.

**Revisit when**

A realistic Home canvas shows that hover-revealed insertion is not discoverable, or a keyboard or
touch user cannot complete the same organization tasks. Also revisit optimistic span rollback if
it overwrites unrelated state under concurrent writes.

**Amended, 2026-09-13.** A move also depends on the complete combined placement order: its
requested position is shared by sections and shortcuts. If Home cannot read its shortcuts, the
canvas withholds insertion, disables pointer movement and marks its keyboard grips unavailable
until the order is complete. That prevents a sections-only view from writing an incorrect combined
position.

**Amended, 2026-09-13.** A shortcut write is in flight after a person chooses a source, so the
create dialog stays in shortcut mode and disables Back, Cancel and Escape until the request settles.
Success closes the dialog; refusal leaves the picker and its error visible. This avoids implying
that a write was canceled when the host may already have committed it.
