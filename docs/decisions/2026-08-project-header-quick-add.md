# The project header's Quick Add adds a section

> **Amended since (noted 2026-09-10).** "The header's More control is inert" stopped being true
> in Slice 17, when
> [the project create/edit/archive surface](2026-08-project-create-edit-archive-surface.md)
> gave More its Rename, Status, Target date and Archive controls.

> **Superseded in part, Slice 25.3.** *What* Quick Add adds is unchanged and still current: a
> section. *Where it lives* is not — a root now has several canvases and one header, so it moved
> to the canvas controls row beside Edit Layout, and §26's header list was amended to match. See
> [2026-09-where-the-project-navigation-column-lives.md](2026-09-where-the-project-navigation-column-lives.md).

**Question**

§26 lists "Quick Add" in the project header and does not say what it adds. A task? A
section? A sub-project?

**Options tested**

- *Quick-add a task*: the conventional reading, and rejected for this slice. Task
  quick-create already lives inside the Task List section, where it has the context it
  needs; a second one in the header would be the same control in two places.
- *Quick-add a section*: chosen. Slice 8's subject is the section canvas, `SectionService`
  gains `add`, and without this the only way to put a section on a canvas is to edit
  `data.json`.
- *Both, behind a menu*: rejected as premature. Nothing yet shows the header needs to be a
  menu, and §26 gives it one word.

**What we learned**

Adding a section from the header worked in the real canvas, and the empty-canvas state in
`nested-projects` is only escapable because of it.

The cost is real and worth recording. §32 assigns "add-section buttons" to Edit Layout Mode
specifically to avoid "permanently cluttering the normal workspace", and Slice 9 confirmed
that separation: Quick Add now appears only while editing the canvas. Under this reading a
project whose canvas has no Task List section still has **no way to add a task at all** —
`project-cabinets` in `nested-projects` is exactly that project, and it remains a genuinely
awkward state to sit in.

**Current decision**

In Edit Layout Mode, Quick Add opens a list of `SECTION_REGISTRY` types and adds the chosen
one to the end of the canvas, with the definition's `createDefaultConfig()` as its config.
View Mode hides it; an empty canvas tells the user to enter Edit Layout Mode. The header's
"More" control is inert: project edit and archive arrive with the slice that builds them,
and a menu of disabled items is worse than a control that is honestly empty.

**Confidence**

Medium for adding sections; low for the missing task-capture path.

**Revisit when**

The project page gains a general capture action, or a canvas without a Task List is tested
with real users. The unresolved question is now task capture, not where section addition
belongs.

**Amended, 2026-09-13.** Slice 27 removes Quick Add. Section creation now starts from a
contextual insertion point on the canvas, and root Home's creation dialog can add an eligible
shortcut at that same position. There is no Quick Add header or controls-row action; see
[the contextual chrome decision](2026-09-canvas-chrome-is-revealed-not-moded.md) and
[the positioned insertion decision](2026-09-contextual-insertion-names-its-position.md).
