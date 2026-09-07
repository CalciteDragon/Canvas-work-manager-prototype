# What the Todos page decides for itself: ties, access, completion and arrival

**Question**

§34 gives Todos an order (*due date ascending, undated last, deterministic tie-break by kind
then ID*), a scope (*the root's own tasks plus every descendant*), and one promise — *"completing
one there and completing it here are the same operation."* Four things it does not settle had to
be settled to build it:

1. Two rows can be due at the *same instant* by different routes — a work unit's date-only due
   date at the end of its UTC day, and a task due at exactly that instant. How is the tie broken,
   and what counts as "the same instant" when the stored strings differ?
2. Is the chronology readable when the Todos **tab** is switched off, or does enabling the page
   gate the content?
3. Should the page be able to *reopen* finished work, or only finish it?
4. A row links to the container that owns it. What happens when that container is collapsed?

**Options tested**

- *Compare instants with `Date.parse`*: rejected after checking the installed schema.
  `IsoDateTimeSchema` is `z.iso.datetime()`, which accepts `10:00Z` with the seconds omitted and a
  fraction of any length — `…:00.0001Z` and `…:00.0009Z` both parse and collapse to one
  millisecond, so two genuinely different instants would sort by id instead of by time. Replaced
  with a lossless textual comparison: a fixed-width whole-second prefix (an omitted `:00` filled
  in) compared ordinally, then the fractional digits right-padded to equal length. `.1` equals
  `.100`, `.0001` precedes `.0009`, and no clock or timezone is read to order two stored strings.
- *Order equal instants by title, or by insertion*: rejected. A title changes, and insertion order
  is not a property of the data. Kind first (a unit of work before a task, so a container sorts
  above the work inside it), then the id, compared ordinally rather than by locale.
- *Require the Todos page record before answering the query*: rejected. Enabling a page is
  navigation state (`docs/decisions/2026-09-optional-pages-are-created-on-first-enable.md`), and a
  read that created or required a record would make an agent's question about the week depend on
  which tabs a person happens to have on. The query reads the tree; the tab decides whether a
  human can walk to it.
- *A status control that reopens as well as completes*: rejected for this slice. Todos owns no
  work, and "un-completing" has no canonical operation — a task would need its *previous* status
  guessed. Finished rows stay on the list, with no control; reopening is done on the canvas that
  owns the row, where the full status control already lives.
- *Persist an expansion when a link lands on a collapsed container*: rejected. Arrival is a read,
  and writing someone's layout because they followed a link is a change they did not ask for. The
  frame takes a `transientlyExpanded` input instead: the canonical record still says `collapsed`,
  and collapsing it releases the override through the ordinary canonical write.

**What we learned**

Watched in the running prototype against `nested-projects`, not only in tests. A Todos link to a
task in a **collapsed** root container opened that container, put focus on its heading and scrolled
it into view; re-reading the section through the API afterwards showed `collapsed: true` still —
arrival wrote nothing. A link to a nested task landed on that unit of work's own canvas rather than
on the root's Home.

Completing a task inline moved the root header's progress from 0% to 100% in the same interaction,
which is the canonical formula reacting, not a number the page maintains. Completing the *Kitchen*
unit of work left *Cabinets* beneath it Active — completion does not cascade — and marked Kitchen
in the work-tree column. With §46's failure injection at 25%, a completion that was refused rolled
the row back to `Active`, showed the host's message, and left the other rows untouched and
clickable.

The ordering rules are the part with the least evidence behind them. Nothing in real use has yet
produced two rows at the same instant by accident; the sub-millisecond case is a schema
possibility an agent could write, not something observed.

**Current decision**

`ProjectTodosService.derive` orders by lossless textual instant, then undated last, then kind
(`subproject` before `task`), then ordinal id. It requires **both** `projects.read` and
`tasks.read` before any content read and denies outright without either (§54), and it answers
whether or not a Todos page record exists or is enabled. The page completes but never reopens, and
links open the canonical owning canvas at the owning container, expanding it transiently for that
visit only.

**Confidence**

High for the scope, the permission pair and "arrival writes nothing" — all three are enforced by
tests that fail loudly and were watched in the app. Medium for the tie-break: it is deterministic
and defensible, but no real use has depended on it yet. Medium-low for one-way completion; the
first person who completes the wrong row will say whether that was right.

**Revisit when**

Slice 25.6 adds the Archive page (a second derived projection, and the second user of the
multi-grant tool metadata), or 25.8's integrated walkthrough puts a person in front of a full week
of work. Watch for: rows people expect to reorder, a wish to reopen from the list, and whether the
origin breadcrumb or the container name is what people actually navigate by.
