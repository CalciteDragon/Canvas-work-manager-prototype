# A root's optional pages are created on first enable, and enabling one escapes the archive freeze

**Question**

§26 gives a root Home plus three optional pages — Todos, Archive and Reflections — and says
which it shows is "ordinary persisted product state, defaulting to **Home only** for a new
root". Slice 25.1 stored pages as records and created exactly one per project. So when does an
optional page's record come into existence: at project creation, disabled, or at the moment
someone turns it on?

And a second question the first one drags in: is the toggle a write, and therefore refused on
an archived project like every other write in this codebase?

**Options tested**

- *Four records per root, three of them `enabled: false`, written at create*: rejected. It
  makes "which pages does this root have" a fixed shape, which is tidy — but every root written
  by 25.1, every seed, and every document the converter produced has one record, so the rule
  would either need an integrity check those documents fail or would go unstated and leave
  existing roots with nothing to toggle. Slice 25.2's acceptance check is that a 25.1 document
  loads unchanged; this is the option that breaks it.
- *A page kind is a value on the project, and records appear only when a section does*:
  rejected. It reintroduces the branch §27's ownership chain exists to remove — a section on a
  page that has no record is a section belonging to nothing — and it cannot express a page that
  is enabled and empty, which is exactly what a new Todos page is.
- *Upsert on first enable*: chosen. `ProjectPageService.setEnabled` inserts the record the
  first time a kind is turned on and flips `enabled` on it every time after. Disabling never
  removes anything.

**What we learned**

The upsert makes §26's sentence literal rather than a display convention: a new root's stored
state *is* Home only. It also makes "toggle is nondestructive" structural instead of asserted —
disabling writes one boolean, so the page keeps its id, its sections, their positions and every
reference to it, and there is nothing in the operation that could lose them.

`validateDocumentIntegrity` needed no change to allow it. Its page rules are counting rules —
at most one page of each kind per project, exactly one canonical page, a canonical page never
disabled — and none of them requires an optional page to exist.

The archive question turned out to be settled by §31 rather than by consistency: *"Because undo
must never be behind a toggle, disabling the Archive page leaves **Open archive** in the project
controls, which enables and opens it."* If the toggle carried the freeze, the archive of an
archived root would be unreachable — the exact outcome that sentence legislates against. So
`setEnabled` is allowed on an archived project. It is the same exemption `SectionService.remove`
already carries, and for the same reason: the freeze stops work coming *back into* a project
someone has put away, and a toggle moves no work.

**Current decision**

Optional pages are created by their first enable. `setEnabled` is idempotent and records no
activity when the toggle is already where it is asked to be; it refuses to disable Home, refuses
every kind on a sub-project, and refuses to disable a page that was never enabled — "off" and
"never existed" look identical afterwards and only one of them was an operation. It is permitted
on an archived project. There is no create and no remove: enabling is the create, and a page is
never deleted.

**Confidence**

High on lazy creation — the alternative is ruled out by data that already exists, not by taste.
High on the archive exemption, which §31 states in so many words. Medium on refusing to disable
a page that does not exist: it is the honest answer, but a UI that renders four toggles from a
list of one will have to know the difference, and might prefer a silent no-op.

**Revisit when**

A fifth page kind arrives, or a page gains state that a disable would need to settle rather than
merely keep — at which point "disabling writes one boolean" stops being the whole story. Also
when Slice 25.6 builds **Open archive**: it is the first caller that enables a page as a side
effect of navigation, and if that reads badly the toggle may want to be two operations after all.


**Amended, 2026-09-22 — Slice 38.** "There is no remove" is now true of every caller but one.
`ProjectPageRepository.remove` exists for the **inverse of a first enable**: undoing the write that
created an optional page deletes exactly that record, after the executor has proved it is still the
one the enable created and that no section — live or archived — and no shortcut placement names it.
Ordinary disabling still writes one boolean and never reaches it, and no route or tool exposes it.
The reason it is a deletion rather than a disable is this decision's own distinction: "off" and
"never existed" are different states, so an inverse that left the record behind would leave the
person a tab they never made.

Every changed toggle now records one action in the owning root's history — `page.add` for the
creating enable, `page.update` for a later boolean — while the no-op above still records nothing and
returns a `null` receipt. The archive exemption is unchanged for the toggle and does **not** extend
to those transitions, which answer `history_blocked` on an archived root in both directions
([decision](2026-09-optional-page-operation-history.md)).
