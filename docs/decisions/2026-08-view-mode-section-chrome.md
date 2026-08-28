# View Mode shows work; Edit Layout Mode shows canvas chrome

**Question**

Which section-frame controls belong in the normal workspace, and which should appear only
while editing the canvas?

**Options tested**

- *All controls always visible*: Slice 8's temporary state. It made every section header a
  row of layout and destructive actions.
- *Only §32's named controls are edit-only*: drag, size, remove, add-section, and settings
  would hide, while Duplicate stayed in View Mode.
- *All canvas-structure controls are edit-only*: chosen. Duplicate joins the §32 list because
  it changes canvas structure rather than section content.

**What we learned**

View Mode is materially easier to scan when section headers contain only title and collapse.
Quick Add now appears with the other canvas controls, and an empty View Mode canvas explicitly
instructs the user to enter Edit Layout Mode instead of pointing at a hidden control. Leaving
edit mode also closes Quick Add and section inspectors, so reopening it does not resurrect
stale chrome.

This does not answer Slice 8's separate question about whether every section type should be
duplicable. A Task List duplicate still shows the same project tasks twice; this decision
only says where the existing action lives.

**Current decision**

View Mode keeps collapse and all section-content interactions. Edit Layout Mode reveals drag
handles, size, settings, Duplicate, Remove, and Quick Add. The mode is transient and resets
when navigating to another project.

**Confidence**

High for separating work from layout chrome; low on Duplicate as a universal section action.

**Revisit when**

A user needs frequent section duplication during ordinary work, or Slice 10's new section
types demonstrate that duplication should be declared per registry definition.
