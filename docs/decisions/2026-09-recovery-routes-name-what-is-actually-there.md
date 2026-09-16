# A recovery route is offered only when it leads somewhere

## Question

After a section operation, three surfaces tell a person how to get their work back: the Undo
notice's **Open Archive** button, the typed repair advice on an Undo refusal, and the Archive
row's **Restore saved content** button. Real use in Slice 33 found all three naming a route that
was not actually available. What should each offer instead?

## Options tested

Real use of the prototype against an isolated nested-projects copy, recorded as
`note-2026-09-15-005`, `-006` and `-007`, then a reading of the code each note implicates.

For **Open Archive**: offering it on the operation being a removal (the shipped behavior);
offering it on the removal's `disposition`; offering it on the Archive projection itself; and
leaving it alone and explaining the gap on the Archive page instead.

For **"use the later Undo receipt"**: rewording the string so it promises nothing; carrying the
superseding record's actor so the copy can name who changed it; and additionally replacing the
raw `undo_conflict:` server text the notice leads with.

For the **Restore placement**: a meta line on the Archive row; putting it in the button label;
and navigating to the restored section afterwards so the new position is self-evident.

## What we learned

**Retained is not the same question as listed.** `SectionService.remove` computed one verdict,
`disposition`, from two different things: `sectionRecoveryOf(...).include` — is there content
worth recovering — *or* a canonical reference, a shortcut or a row still naming the section. An
empty Reflections container that a Home shortcut points at is `retained` for the second reason
alone. The recovery policy correctly kept it out of Archive; the notice, which knew only that the
operation was a removal, sent the person there anyway (`note-2026-09-15-006`).

**An Undo receipt belongs to one exact actor.** `undoRecordBelongsToActor` scopes every record to
its user or agent connection. The `superseded` conflict knew a newer record existed but not whose
it was, so `use-later-receipt` named a repair the person could not perform when the later change
came from an MCP agent (`note-2026-09-15-005`). The refusal itself was right.

**Archive Restore appends; Undo places.** `restoreSection` returns a section at the end of its
page because its old index needs positions the canvas has since reused — that is the documented
split from Undo, which restores between the recorded neighbours. The Archive row said nothing
about it, so a prose brief silently moved from first to last (`note-2026-09-15-007`).

## Current decision

**Adopted, 2026-09-15.**

**A removal states its own Archive verdict.** `SectionRemovalResult` gains a required
`archiveListed: boolean`, filled from the same `sectionRecoveryOf` call that decides the
disposition, and carried over HTTP and MCP. The Undo notice offers **Open Archive** unless the
removal said `false`; an *absent* verdict is unknown, not false, so a receipt recovered from a
repeat removal keeps the offer. Rejected: deriving it from `disposition`, which does not separate
the two questions and would have left this exact case broken; and explaining the empty page after
the fact, which still spends the person's trip.

**A superseded conflict names who superseded it.** `UndoConflict` gains `supersededBy`
(`self` | `user` | `agent` | `system`), present exactly for a `superseded` problem, taken from the
*latest* superseding record. Two next steps join the enum — `redo-by-hand` and
`redo-by-hand-or-archive` — chosen whenever the later change is not the caller's own, so MCP text
and browser copy both stop promising an unreachable receipt. The browser prefixes that line with
"An agent changed it after you." and collapses duplicate lines on what they *say* rather than on
the raw problem. Rejected: copy-only vagueness, which never tells the person what happened.
Out of scope, and still recorded friction: the notice still leads with the raw `undo_conflict:`
message text.

**The Archive row says where the section lands.** An archived section's row carries
"Returns at the end of its page, not its old position." beside its other recovery meta lines — a
live section hidden beneath an archived project is not moved by anything here and gets none.
Rejected: crowding the button label, which would make section Restore read as a different
operation from every other Restore in the list; and post-restore navigation, which sets the
expectation only after the surprise and pulls the person off Archive mid-cleanup.

No stored shape changes and `SCHEMA_VERSION` is untouched: `archiveListed` and `supersededBy` are
result and refusal data, never persisted.

## Confidence

High that the Archive offer should follow the projection rather than the operation, and that a
receipt scoped to one actor must not be named as another's repair: both are mechanical facts
about code that already existed, now covered by domain, contract and browser tests.

Medium on the copy itself — "An agent changed it after you." and the placement line are one
person's reading of three notes, not evidence from sustained use.

## Revisit when

Real use shows people wanting Archive from a notice that withdrew it, the `redo-by-hand` copy
still leaving someone stuck, or the placement line proving too weak to prevent the surprise — at
which point post-restore focus becomes the next thing to try.
