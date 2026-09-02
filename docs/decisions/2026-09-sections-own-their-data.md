# Container sections own their rows; view sections own nothing

**Question**

Sections have been pure views: a `task-list` stores `config: {}` and asks for *the
project's tasks* at render time. Two task lists on one project therefore render the same
query twice, and a project can hold tasks that no section shows at all — an agent that
creates a project over MCP and fills it with work produces a canvas that reads as empty,
because `ProjectService.createProject` makes no sections and the MCP surface has no section
tools.

Two things were wanted: a project should be able to hold several *different* instances of
the same data type, and no data should be able to exist in a project without being
rendered.

**Options tested**

- *Scoped configs — each section stores a filter over the project's rows*: rejected.
  It makes duplicate sections distinct (`{status: ['todo']}` vs `{status: ['done']}`) with
  no contract change, but it leaves the invariant unenforceable: filters can overlap, or
  miss rows entirely, so "is every task visible somewhere?" stays a coverage question the
  canvas has to keep answering. It also makes add and remove misleading — adding a section
  adds a lens, removing one removes a lens, and neither does what the words say.
- *Seed default sections at project creation*: rejected as the primary answer. It fixes the
  empty-canvas case and nothing else. A section deleted later re-orphans its rows, and it
  seeds containers for data that does not exist yet.
- *A computed "unrendered data" region at the foot of the canvas*: rejected once ownership
  was on the table. It holds the invariant by construction and needs no migration, but it
  treats orphaned data as a state to be surfaced rather than one to be prevented.
- *Sections own their rows*: chosen. A row belongs to a section, not merely to a project.
  The invariant stops being enforced and becomes structural — every row has a `sectionId`,
  every section renders, so no row can be invisible.

**What we learned**

Ownership does not generalise across the registry. Tracing what each of the seven types
reads splits them in two, and the split is not a matter of taste:

- **Containers** own rows of one kind: `task-list` (tasks), `reflections` (reflections),
  `rich-text` (its own text, already held in `config.text`).
- **Views** render data they do not own: `progress` is computed from tasks,
  `recent-activity` reads append-only workspace events, `sub-projects` reads projects owned
  by the workspace, and `timeline` is a merged view whose `TimelineItemKindSchema` spans
  `project`, `sub-project`, `task` and `milestone`.

`rich-text` is the worked example that the model already holds: it owns its content, two
instances differ, and deleting one deletes its text. Containers extend that to data too
large to sit in a config, which is why rows stay flat and gain a foreign key rather than
moving inside `config`.

Milestones have no container type. §35 keeps them distinct from tasks, and nothing renders
them but the timeline view, so they remain project-scoped until a container type earns them.

**Current decision**

`kind` joins the registry entry, alongside `type` and `createDefaultConfig` — one line per
section type, so §30's claim holds. `container` entries also name what they own.

Rows of an owned kind gain `sectionId`. `projectId` stays alongside it rather than being
derived through the section: the dashboard, upcoming-work and search all filter by project,
and a join on every read is not free when a unit of work already clones and validates the
whole document twice. The denormalisation is held by one assertion on the write path —
a row's section must belong to the row's project — and by a single move operation that
updates both keys together. Subtasks inherit their parent's section, one turn tighter than
today's same-project rule.

Creating a row with no section named does not get a mechanism of its own. It resolves to
the project's first container of the matching type, and when there is none it calls
`SectionService.add` — the same operation the Add Section button calls, producing an
ordinary section at the end of the canvas with an ordinary activity event behind it. A
default layout is the existing behaviour reached by a different door, not a second code
path to keep in step.

Removal follows ownership, and only ownership. Removing a container removes its rows;
removing a view touches no data at all. A container that still holds rows takes a policy
rather than a confirmation alone: `cascade` archives the rows (`archivedAt` already exists
and is deliberately distinct from `cancelled`, so this is undoable), or `reassign` moves
them to another container of the same type. An empty container goes without ceremony.

The MCP surface gains section tools — listing, creating, updating and removing — under
`projects.write`, the permission that already governs the canvas. Without them an agent can
write all three layers' worth of data and none of the layout, which is the gap that started
this.

**Confidence**

High for the container/view split, which follows from what the section types already read
rather than from a preference. High for removal semantics. Medium for keeping `projectId`
alongside `sectionId` — it is a performance judgement against a store whose costs may not
survive the JSON document. Low for the reassign policy, which has no UI behind it yet.

**Revisit when**

A view section wants scoping to a single container ("progress of the Backlog list"), which
would give views a config that points at a container and blur a split that is currently
clean. Or when milestones want a container of their own, which is the first test of whether
`kind` generalises past the three types that have it now.
