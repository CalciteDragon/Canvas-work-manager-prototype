# Ghost buttons have a faint edge at rest

**Question**

Slice 72's ghost rank was borderless and unfilled until hovered. In use, the Markdown section's
"Edit" and More's "Clear" and "Open archive" read as labels, not buttons
(`note-2026-10-15-001`). Should a ghost button gain a resting boundary, against principle 2's
"a border appears only where a control needs a 3:1 boundary"?

**Options tested**

- *Keep ghost borderless.* Principle 2 holds literally; the buttons keep reading as text.
  Rejected by the user.
- *A faint resting edge on ghost text buttons only*, from the faintest line the system has
  (`--color-border`, 10 % alpha in both themes), with secondary's hover edge. Ghost stays
  unfilled, so it is still quieter than secondary, which has a fill. Icon buttons and tools keep
  no edge: they carry a mark, and chrome is quiet at rest (principle 5). **Kept.**
- *Secondary-strength edge and fill.* That would erase the difference between the two ranks.

**What we learned**

Measured in the app at 1440 on busy-week (slice 72.1), the edge against the plane it sits on is
1.33–1.36:1 in dark and 1.23–1.24:1 in light. That is a hint, not a 3:1 boundary. The user's
contrast amendment reports such numbers and does not gate them. The words and the edge together
are what make the control read as a button.

**Current decision**

`.button--ghost` takes `--control-ghost-edge: var(--color-border)` at rest and
`--control-secondary-edge-hover` on hover, in `_controls.scss`. Its fill stays transparent.
`.icon-button` and `.tool` are unchanged. This is a named exception to principle 2, recorded as
an amendment to the [Depth direction](2026-10-frosted-glass-depth-direction.md).

**Confidence**

High for the prototype: the user asked for it after using slice 72.

**Revisit when**

A ghost button has to meet a 3:1 boundary, or a later slice (slice 5's section tools, slice 6's
rows) finds the edge adds noise where ghost buttons repeat in a list.
