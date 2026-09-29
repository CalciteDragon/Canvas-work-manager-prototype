# A section update's history label names its recorded edit

**Question**

The header called every section setting change "Updated the … section", so a person could not tell a rename, prose edit, collapse or resize apart before using Undo (Slice 46 finding 8; §§26, 31–32).

**Options tested**

- *Derive the label in the browser*: rejected because the server already owns the captured action and its stable label, and MCP writes must read the same summary.
- *Name a single recognized field change from the recorded footprint*: kept. For a config replacement, call it prose only when `config.text` is the sole changed key of a Rich Text section.
- *Name every field in a combined update*: rejected because one call is one action and a general label is shorter and accurate for mixed edits.

**What we learned**

The existing `SectionFieldChange[]` already distinguishes title, collapse and width. A config footprint records the entire object, so checking its changed keys avoids calling a tone or mixed config edit a prose edit. The browser header reads the stored summary label through its existing gateway; no new UI mapping is needed.

**Current decision**

A newly recorded single-field title change says `Renamed the <old name> section to <new name>`; clearing the override uses the resulting type default. A Rich Text `config.text`-only change says `Edited prose in the <name> section`. Collapse and expand name their direction; resize names the resulting column count. Combined changes and other config changes say `Updated the <old name> section`. The label is captured once with the action and remains unchanged through Undo, Redo and reload. Normalized no-ops record nothing. Older stored labels, Activity wording and action payloads are unchanged.

**Confidence**

Medium. Domain tests cover the footprint and summary, and the nested-projects browser journey covers header names for ordinary controls. Sustained use may favor different wording.

**Revisit when**

Real use shows a label is ambiguous for an inspector setting, or localization becomes a product requirement.
