# Activity captures target identity so an audit line outlives its row

**Question**

Undoing `task.add` or `reflection.add` deletes the canonical row, but §57 requires its activity
line to remain readable and document integrity previously required every event target to resolve.
Where should the durable historical identity live?

**Options tested**

- *Keep a tombstone row*: rejected. The work would remain visible to ordinary queries or Archive,
  contradicting creation Undo's purpose.
- *Let an event name a missing id and render its stored `summary`*: rejected. It weakens integrity
  and loses the structured target and project identity the feed needs.
- *Resolve only from current state*: rejected. There is no current row after creation Undo, and a
  moved row would also rewrite the historical context of an old event.
- *Capture identity on the event when it is recorded*: adopted.

**What we learned**

The activity event is already the durable audit record and is written while the target is still
readable. Capturing there preserves the audit line without turning history payloads into feed data
or retaining deleted business rows. Version-4 data proved that making the context required without
a converter would strand an otherwise valid file at load time.

**Current decision**

Every `ActivityEvent` carries `context`: the target kind, id and non-blank label, plus its owning
project and root project when it has one. The context must agree with the event's own entity and
project fields. It is captured at record time and never follows later moves or renames.

`ActivityService.list` prefers the current entity and project names when they still resolve, and
falls back to captured labels when they do not. `summary` remains the frozen human-readable log
line; history inverse payloads remain private and never enter an event or live frame. Task and
reflection Undo/Redo events target the row itself, including creation Undo, so their captured
identity survives removal.

**Confidence**

High. Creation Undo, missing-target feeds, load integrity and version-4 backfill are all covered by
tests, including titleless reflections and invalid legacy targets.

**Revisit when**

A future operation deletes a project or user/connection identity, or the product needs a richer
historical breadcrumb than target, owning project and root.
