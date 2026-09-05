# A root project is a workspace with pages; a subproject is a unit of work

**Question**

One `Project` schema serves two jobs that turned out not to be the same job. A top-level
project is *a place to work* — it wants a task canvas, a journal, a chronology of what is
coming up, somewhere to find what was archived. A nested project is *a piece of work* — it
wants a description, a due date, a completion, and one canvas to hold its detail. Today both
get exactly one canvas and are told apart only by whether `parentProjectId` happens to be set
(`packages/contracts/src/project.ts`).

That conflation shows up as concrete friction. A project's single canvas has to hold
everything at once. Archived work is reachable only from the canvas it was removed from, so
there is no way to ask "what did I archive anywhere under this project?". Work nested three
deep has no chronological view. And a section that would be useful in two places has to be
duplicated, which duplicates its rows.

Three sub-questions had to be answered before any of it could be built, and all three were
put to the user rather than guessed.

**Options tested**

Evaluated by reading the existing contracts, services, repositories, routes and canvas
implementation — **not** browser-tested. Nothing below has been used in the running app,
because none of it exists yet.

*Distinguishing the two kinds:*

- *Keep one schema, branch on `parentProjectId`*: rejected. It is the status quo, and it
  makes every capability difference a convention. Nothing stops a nested project from being
  given pages, or a root from acquiring a parent, except every call site remembering to check.
  `ProjectService` already carries hierarchy and cycle validation that would grow a second,
  parallel set of rules with no type behind them.
- *Two separate entities, two repositories*: rejected. References between them are common —
  a subproject's breadcrumbs, a Sub-Projects section, a Timeline spanning both, a shortcut
  pointing across the tree — and splitting the ID space makes each of those a two-lookup
  branch. The cost lands on every reader to buy strictness at one writer.
- *A Zod discriminated union on `kind`, one ID space, one repository*: chosen. Roots and
  subprojects stay economical to reference, while `kind: 'root' | 'subproject'` makes the
  capability difference a type the compiler and the parser both enforce. Create and update
  operations are separately named, so "create a work unit" and "create a workspace" are
  distinct calls rather than one call with a meaningful absence.

*Pages:*

- *A page is a filter over one canvas*: rejected for the same reason section scoping was
  rejected in `2026-09-sections-own-their-data.md` — it makes ownership a coverage question.
  Two pages could show the same section, or none could.
- *Pages are persisted records owning their sections*: chosen. It extends the ownership chain
  that already exists rather than adding a parallel concept: `project → page → section → row`.
  Sections gain a required `pageId`; rows keep `projectId` and `sectionId` and derive their
  page, so there is nothing new to keep in step.
- *A generic user-defined page builder*: rejected outright (§80). Four kinds, each with an
  explicit capability entry and a renderer.

*Shortcuts:*

- *Copy the section and its rows*: rejected. It breaks the one invariant this project has
  been most careful about — data is singly owned.
- *A reference-only placement*: chosen. A stored pointer to a source section ID plus the
  placement's own position, span and collapse state. The source stays the only owner.

**What we learned**

Reading the code before planning changed the staging in three ways worth recording.

**The archive browser and the existing undo region are different features.** The current
`archived-region-store.ts` is deliberately direct-project-only and *suppresses* rows that an
ancestor took down, because those cannot be restored on their own. A whole-tree Archive page
has to show exactly those rows — with guidance naming the ancestor to restore instead. It is
a superset, not a relocation, so the region stays until the page can replace it.

**Progress is page-scoped state today.** `project-page.ts` provides one `ProgressStore` for
the whole page. A shortcut rendering a Progress section from a *different* source project
would silently read the destination's numbers through that shared store. Shortcuts therefore
require per-source provider isolation, which is implementation work the feature would
otherwise have hidden.

**Read models do not agree about descendants, and should not be made to.**
`timeline-service.ts` includes descendants; `progress-service.ts` measures direct tasks only.
Moving where these render must not quietly unify them.

The three open clarifications were resolved by the user on 2026-09-04:

- **Data cutover — a converter, not a reset.** `.prototype/data.json` is schema v2 with
  stale-version rejection and no migration runner. One bounded v2→v3 converter preserves IDs,
  content, archive markers and order: roots gain a Home, old nested projects become
  subprojects with a work canvas, old sections land on that canvas. It validates before an
  atomic write, keeps a backup, is a no-op on already-converted input, and fails clearly on
  anything else. It is one file with an explicit CLI entry — not a migration framework, and
  not a licence to build one.
- **Archive means hidden everywhere ordinary, plus a real Archive page.** Archived work leaves
  ordinary pages, views and read models; the root's optional Archive page is where all of it
  is found, across the whole tree. Because undo must never sit behind a toggle, **Open
  archive** stays in project controls when the page is disabled.
- **Todos carries all work and keeps what is finished.** Root tasks plus every descendant
  subproject and task, due date ascending, undated last, deterministic ties by kind then ID.
  Completed and cancelled rows stay visible with their state — a chronology that erases what
  was done is a worse record than one that shows it. Archived entities, and anything beneath
  an archived ancestor, are excluded.

**Current decision**

Roots and subprojects are one discriminated `Project` union sharing an ID space and a
repository. A root cannot have a parent; a subproject requires one, may parent another to any
depth, and can never own pages. Neither converts into the other.

Subprojects carry description, an optional **due date** (the existing date-only `targetDate`,
relabelled), status and `completedAt`. Completion is explicit and does not cascade to
descendants; reopening clears the timestamp.

A root owns persisted `ProjectPage` records: exactly one enabled Home that cannot be disabled,
and at most one each of Todos, Archive and Reflections, defaulting to Home only. Disabling a
page destroys nothing.

A subproject owns exactly one page too — its work canvas — and no tab API at all. Making the
work canvas a page record rather than an exception is what keeps the ownership chain
unbranched: every section names a page, with no "unless its project is a subproject" clause in
every reader. It is a page in the model and not a tab in the product; only the four root kinds
are navigation.

Archiving gains no cascade from any of this. A project with live child subprojects still
refuses to archive, and archiving never propagates downward. The Archive page makes archived
work findable, which is a different thing from making archiving contagious.

Home and work canvases accept every registered section type. Reflections owns its own
container and aggregates the journal. Todos and Archive are **derived** — they own no rows.

A write with no section named resolves a container on Home (root) or the sole canvas
(subproject). A supplied page is honoured only if it accepts that data kind; a supplied
section is authoritative and must agree with anything else supplied. Nothing lands on a
disabled page.

Home may hold shortcut placements referencing canonical sections elsewhere in the same root
tree, at any depth, ordered together with its own sections. First pass renders source content
read-only with **Open source**; removing a placement never archives the source; an archived
source shows an unavailable placeholder and restoring revives the reference.

Reflections gain an optional subject — `{ kind: 'task' | 'subproject', id }` — validated
within the owning root tree and **separate from container ownership**. The completed-work
composer requires a currently-completed subject; general journal entries remain first-class.
A reflection survives its subject being reopened or archived and shows the current state.

The full staging is `docs/plans/25-multi-page-projects-overhaul.md`, Slices 25.0–25.8. A page
is never a permission bypass: layout access does not grant content, and a combined query needs
every grant it returns.

**Confidence**

High for the root/subproject split and for pages owning sections — both follow from what the
code already does rather than from taste, and both were reachable only by reading it.

Medium for the page *kinds*. Four is a guess. Todos and Archive in particular may turn out to
be one page, or to be better as filters on Home, and the capability-entry design is what keeps
that cheap to find out.

Medium-low for read-only shortcuts. It is the conservative first pass, and the honest risk is
that a read-only embed is a half-measure people route around by opening the source every time
— in which case the answer is either editable embedding or no shortcuts at all.

Low for retaining completed rows on Todos, which is a preference stated without use behind it.

None of this is browser-confidence. Nothing here has been used.

**Revisit when**

The first real week of use on a multi-page root. Specifically: whether any optional page gets
disabled after being enabled, whether shortcuts are created and then abandoned, whether
Todos's retained completed rows are read or scrolled past, and whether nesting past depth two
is ever wanted. Also when a fifth page kind is proposed — that is the test of whether the
capability table generalises or whether it has quietly become the page builder §80 forbids.
