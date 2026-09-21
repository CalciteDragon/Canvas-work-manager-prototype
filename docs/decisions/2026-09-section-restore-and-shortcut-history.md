# A recorded Restore is a new action, and a shortcut action owns only its placement

**Question**

Stage C had to make the three canvas operations that were still irreversible undoable: section
duplication, Archive Restore, and the four Home shortcut placement writes. Each raised its own
question. What kind of action is a duplicate? Can Restore be recorded without giving up the
durability that makes it the recovery path of last resort? And whose history does a placement
belong to, when the placement sits on one project's Home page and points at another's section?

**Options tested**

- *A `section.duplicate` operation kind*: rejected. Its inverse would do exactly what the
  `section.add` inverse already does, and Redo would be tempted to re-run duplication against a
  source that may have changed or gone since. Recording the `section.add` the copy actually is
  means Redo replays the **copy**, from stable ids and captured values.
- *Treating Restore as the removal reversed*: rejected. They are different operations with
  different results — Undo returns a section between its old neighbours and expires; Restore
  appends and never does — and collapsing them would make one step undo two writes.
- *Leaving Restore out of history, as Stage A did*: rejected now that it is the only canvas
  operation an actor could not take back. Recording it costs nothing it had: no receipt is needed
  to invoke it, it still survives every expiry, and a retry on a live section still writes nothing.
- *Capturing Restore's row set by recomputing the cascade at transition time*: rejected. The rows
  a Restore revived are a fact about that Restore. Recomputing would revive whatever happens to
  carry the marker later, which is how an inverse silently absorbs someone else's work.
- *Recording a placement action in the source project's history*: rejected. The write is to the
  destination root's Home canvas; the source was not touched at all, and an agent with write access
  to the destination should not be filling a sub-project's stack.
- *Refusing to recreate a placement whose source is now archived or hidden*: rejected. The product
  already renders that state as an unavailable placeholder. Recovery of a **reference** is not an
  ordinary Add, and it must not unarchive the source to succeed.

**What we learned**

Two live invariants needed widening, and both were found by reading the existing code rather than
by reasoning about the new one.

`generationFloor` counted only `section.remove` actions. Retention is per history, so another
actor's removal can be pruned while the Restore they made afterwards survives — and that Restore is
then the only stored evidence that the section ever reached that generation. An Add Redo that
recreated the section from an older snapshot would move the generation backwards past it.

Ordinary Restore assigned `position: live.length`, which is the right *order* only while the stored
positions are dense. On a hand-edited sparse page (§14) numbered 0, 5, 7 the returning section
sorted second, so "appended" was true of the intent and false of the canvas — and the placement the
action captured described the wrong place.

A third defect was in `SectionShortcutService.move`, which renumbered the page and then compared
`position` to discover whether anything had moved. That normalized a sparse page on a clamped no-op,
stamped the subject's `updatedAt`, and could not tell "did not move" from "moved and landed on the
same number". Comparing the combined index first, as `SectionService.move` already did, fixes all
three.

**Current decision**

Duplication records `section.add`, capturing the stored copy after renumbering. It still copies no
rows.

`section.restore` is its own versioned payload: the archived marker and generation before the
Restore, the tombstone's old position, the placement the Restore actually landed on, and exactly the
rows whose `archivedWithSectionId` named the section. Undo writes those back and nothing else — no
removal policy, no deletion, no generation change, no independently archived row. Undo refuses a
live row it would hide; Redo refuses a newly marked row it would absorb; Redo resolves the
**committed** placement rather than appending again. A subject whose generation has advanced retires,
because nothing can bring a generation back. An out-of-band Restore — one made by a different actor,
which never enters this stack — still retires the removal beneath it, exactly as before.

`generationFloor` now counts `section.restore` generations as well as `section.remove` ones, and
document integrity applies the same "a present section is never below a generation an action saw"
rule to both kinds.

The four shortcut payloads capture the canonical placement and the **destination** project id, and
nothing of the source. A source content edit is therefore never a conflict for a placement action;
a source that has gone, left the root tree or moved onto the destination page itself is, because
integrity would no longer allow the placement. Only an occupied placement id on a recreation is
permanent. `shortcut` is a fourth operation family sharing `projects.write` with `section`: the
families are the vocabulary discovery publishes, so a name of its own keeps a later grant split a
value change rather than a breaking one.

**Confidence**

High for the semantics: each rule above has a named regression, the two widened invariants were
mutation-checked against their tests, and both MCP transports plus the HTTP acceptance script drive
the full chains end to end. Lower for the **surface**: there is still no header Undo control, so a
person reaches these transitions through the history route rather than through the product. That is
deliberate Stage C work, not a gap this slice left behind.

**Revisit when**

Persistent Undo/Redo header controls arrive and have to choose which of these receipts to offer;
or when project and page lifecycle joins history, where a creation Undo must ship with its
authorized recovery route rather than an unreachable Redo.
