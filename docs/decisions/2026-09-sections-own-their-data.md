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

Ownership also has to be known in two places, and that cost the registry its single-file
claim for one of the two kinds. `SECTION_REGISTRY` lives in the web app, but cascade-on-remove
and container resolution are domain decisions, so the ownership map — `SECTION_OWNERSHIP` in
`packages/contracts/src/section.ts` — had to sit below both. The registry now reads `kind`
back out of it rather than declaring it, which keeps one source of truth but means **adding a
*container* type touches two files** (the contracts map, plus the type's own folder and its
registry entry) rather than the one §30 promises. Adding a *view* type is unchanged: absence
from the map is what makes something a view, so an unregistered type can never cascade — the
failure mode of forgetting the map entry is a container that behaves as a view, which loses
ownership rather than data.

The naming phase that followed found a second, smaller §30 cost of the same shape and
recorded it beside this one: a section type also touches `packages/contracts` when its
display name is not derivable from its `type` string — one entry today, `sub-projects`
(`2026-09-a-section-has-a-name.md`). Unlike ownership's, this cost is *conditional*, and
`registry.spec.ts` fails at the moment a new type incurs it.

**Current decision**

`kind` joins the registry entry, alongside `type` and `createDefaultConfig` — one line per
section type, read from the contracts map rather than restated (see the two-file cost above).
`container` entries also name what they own.

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

Removal follows ownership for the **rows**, and only ownership. A container that still holds
live rows takes a policy rather than a confirmation alone: `cascade` archives them, or
`reassign` moves them to another container of the same type. A view has no rows to settle, so
no policy applies to it. An empty container goes without ceremony.

**Amended, 2026-09-04** (`2026-09-what-undo-means-for-an-archived-row.md`). Two claims above
were wrong, and the correction is worth recording rather than quietly editing away (§77).

The first: "`archivedAt` … is deliberately distinct from `cancelled`, so this is undoable"
was true of the field and untrue of the application. Nothing in the repository had ever
cleared `archivedAt`, so for a fortnight this decision justified a cascade with an undo that
did not exist. It exists now — `SectionService.restoreSection`, `TaskService.restore` and
`ReflectionService.restore` — and the sentence is finally true.

The second: "removing a container removes its rows; removing a view touches no data at all."
Removal now **archives the section itself**, on every branch, and nothing is deleted. A
cascade takes the container down with its rows, each stamped with `archivedWithSectionId`;
a reassign archives the emptied section and marks nothing. A *view* archives too, because
`rich-text` owns its data through `config.text` and deleting the record would lose prose that
exists nowhere else — so "removing a view touches no data" was never quite true either.

The invariant this decision states is **strengthened**, not narrowed. Under a hard delete a
cascaded row pointed at a section that no longer existed — the friction note
`note-2026-09-01-002` caught one — and rows archived *before* a cascade dangled with no
policy involved at all. Now every row's section exists, so "every row has a `sectionId`,
every section renders, so no row can be invisible" holds for archived rows too, with
"renders" read as "exists and would render if restored". `validateDocumentIntegrity` enforces
it rather than the write path merely maintaining it.

The rejected *computed "unrendered data" region* is not what the Archived region is. That
option was rejected as a way of **holding the invariant** by surfacing orphaned live data.
Archived shows deliberately archived work, and is the undo surface for an operation this
decision already called undoable.

Also worth recording, because it was already true and never written down: `TaskService` and
`ReflectionService` compose `SectionService`'s container operations on create and move, and
the edge is acyclic — `SectionService` holds repositories and never a row service. Container
creation stays on the one `addWithin` path for the reason above: a default layout is the
existing behaviour reached by a different door. Restore deliberately does **not** add a
second edge: `restoreSection` asserts `projects.write` while a task restore is gated on
`tasks.write`, so calling it from inside one would have failed for an agent granted
`tasks.write` alone.

The MCP surface gains section tools — listing, creating, updating and removing — under
`projects.write`, the permission that already governs the canvas. Without them an agent can
write all three layers' worth of data and none of the layout, which is the gap that started
this.

**Confidence**

High for the container/view split, which follows from what the section types already read
rather than from a preference. High for removal semantics **as amended** — the original
version's claim about views was wrong, and the undo it promised did not exist. Medium for
keeping `projectId` alongside `sectionId` — it is a performance judgement against a store
whose costs may not survive the JSON document. Reassign is no longer low-confidence for want
of a UI: the removal dialog offers it, and it now archives the emptied section as well.

**Revisit when**

A view section wants scoping to a single container ("progress of the Backlog list"), which
would give views a config that points at a container and blur a split that is currently
clean. Or when milestones want a container of their own, which is the first test of whether
`kind` generalises past the three types that have it now.

**Amended, 2026-09-14 — Slice 31's reference-safe removal.** The preceding removal amendment
records the behavior before Slice 31; its claim that every branch archives and nothing is
deleted no longer describes the current write path. Disposable views, empty prose and empty
containers may now be deleted after owned-row settlement and a canonical reference audit.
Meaningful or uncertain content remains archived for durable recovery. A shortcut-backed
disposable section stays as an internal tombstone so the shortcut and every row continue to
reference an existing section. Cascade retains a content-bearing container and archives its
owned rows; reassign moves all rows when live rows require reassignment and deletes the emptied
source only when it is safe. If only pre-archived rows remain, explicit reassign leaves their
container in place. Receipt-based Undo restores the removed section and reverses recorded moves;
Archive remains the recovery path for retained content. The full policy and matrix are recorded
in [disposable removal and immediate canvas Undo](2026-09-disposable-removal-and-immediate-undo.md).
