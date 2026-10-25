# Rows open their canonical owner

**Question**

Should a task change shape and navigation behavior on each surface that lists it (§21, §24,
§27, §34, §38)?

**Options tested**

The accepted Slice 77 plan compared shared component rendering with a shared row anatomy.
Todos keeps its own template because its serialized writes, cancelled-task rule and checkbox
reset differ from Task Lists. Dashboard rows need server-derived overdue state and date options.
Whole-row link overlays would put controls inside another interactive target.

**What we learned**

The same control/title/meta/tools anatomy can be applied without sharing each surface's store.
Canonical page and section identity already supplies the arrival behavior used by Todos:
the canvas targets the section, focuses its heading and expands it transiently without a write.
Timeline's selected detail repeated the status; its reversed-date warning can be shown inline.

**Current decision**

Rows outside their owner open that owner's section through the title link. Within a Task List,
the title selects the task and opens its drawer. Workstream Timeline titles open their project.
Project and milestone Timeline rows are static. There is no task fragment or whole-row overlay.
Checkboxes, Delete and history links remain siblings. Preview content stays in its disclosure
and receives no source navigation link. Task Lists disable sorting within one list and explain
cross-list movement while dragging; task reordering remains Slice 20.

The shared `.object-row` primitive owns the container and slots; the pure `taskMeta` formatter
orders status, high priority, date and Overdue. Only high priority and overdue use an accent edge.

**Confidence**

High in ownership and interaction consistency under the accepted plan and behavioral tests.
Visual acceptance and real-use findings remain subject to Slice 77 Gate 2.

**Revisit when**

Real use shows a section landing is insufficient, or task reordering reaches Slice 20.

**Amended, 2026-10-25 — Gate 2 accepted.** The user accepted Slice 77's before/after sheet. The
visual treatment and the real-use findings above stand as current; the drag explanation's layout
shift (`note-2026-10-22-002`) is a known follow-up, not a reversal.
