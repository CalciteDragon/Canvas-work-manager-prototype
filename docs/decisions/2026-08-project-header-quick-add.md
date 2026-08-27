# The project header's Quick Add adds a section

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
specifically to avoid "permanently cluttering the normal workspace", so Slice 9 may well move
this control behind that toggle. And under this reading a project whose canvas has no Task
List section has **no way to add a task at all** — `project-cabinets` in `nested-projects` is
exactly that project, and it is a genuinely awkward state to sit in.

**Current decision**

Quick Add opens a list of `SECTION_REGISTRY` types and adds the chosen one to the end of the
canvas, with the definition's `createDefaultConfig()` as its config. The header's "More"
control is inert: project edit and archive arrive with the slice that builds them, and a menu
of disabled items is worse than a control that is honestly empty.

**Confidence**

Low. This is a defensible default, not a finding.

**Revisit when**

Slice 9 builds §32's Edit Layout Mode — that is the moment to decide whether Quick Add
belongs to the mode or to the header, and whether a canvas without a Task List needs its own
way to capture a task.
