# The Sub-Projects section is retired; Work is the hierarchy surface

**Question**

After the project column gained its Work list and Add workstream control, should the canvas
keep a second hierarchy view and creation surface? (§26, §29, §30, §54.)

**Options tested**

- Keep both hierarchy surfaces: rejected; the column already provides navigation and creation.
- Replace the section with another hierarchy view: deferred; no observed need earns one.
- Retire the section and use Work: adopted (user, 2026-10-08 and 2026-10-09).

**What we learned**

The removed section also displayed status, due date and completion date per row. The Work list
shows icon, name, nesting and a completion tick. Losing the extra details and the ability to place
the hierarchy on a canvas is an accepted trade-off, rather than a reason to extend the column.

**Current decision**

The registered section types are Markdown, Task List, Progress, Reflections, Timeline and Recent
Activity. `sub-projects` joins `rich-text` in the contracts' retired-type record. Creation is
refused after actor/grant checks with surface-neutral workstream guidance; MCP descriptions name
`create_project` with a parent. Live and recreating-history records are refused on load.
Stored `kind: 'subproject'`, route/tool names, history labels and the retired identifier stay intact.

Workstreams are navigated and created through the project column. Timeline keeps the hierarchy
revision signal; the dead section-level hierarchy callback is removed. Archived projects remain
available through root Archive and workspace Settings.

Schema version stays 6. Following [the disposable-data policy](2026-10-prototype-data-is-disposable.md),
the old conversion pipeline and fixtures are removed; unreadable local files name reset or reseed.
Seed Activity capture remains in a seed-owned module. The spec's §14, §26, §29–31 and §54 are
corrected, and historical milestone/journey notes are marked as superseded in Slice 66.

**Confidence**

High that one navigation/creation surface is simpler. Medium on losing row details; real use
may justify a later addition.

**Revisit when**

People need status or dates while scanning Work, or need the hierarchy placed on a canvas.
