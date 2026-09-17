# One explicit write is one history action, kept for 24 hours and at most 50 per history

**Question**

A bidirectional history needs answers the single-use receipt never did: what one step is, when a
redo branch disappears, how the cursor moves past gaps, and how long anything is kept
([Slice 35](../roadmap/completed/35-operation-history-foundation.md), §31). Two implementers would
otherwise build two different state machines.

**Options tested**

- *Keep the 24-hour, 50-record workspace bound of the receipts*: 50 across a whole workspace would
  let one busy project push another's only action out. Moved to per history.
- *Prune by `createdAt` wherever an action expires*: the dev-panel clock is settable, so expiry
  order is not stack order, and a hole in the middle of a stack makes "the next action" undefined.
  Rejected in favour of contiguous pruning.
- *Let pruning bump the revision*: a background prune would then refuse an innocent caller holding
  a revision it had just read. Rejected.
- *Make the cursor reference an action id*: undoing to the bottom, or pruning the referenced
  action, would leave an invalid cursor. Rejected in favour of an order value.

**What we learned**

Once the cursor is an order value, every invariant a single document snapshot can check follows:
`0 ≤ cursor ≤ orderHighWaterMark`, and every stored action's positive order is unique within its
history and no higher than that mark. The Stage A gate — A → B → Undo B → Undo A → Redo A → Redo B
on one field — passes through the domain, HTTP and both MCP transports with exactly these rules.

**Current decision**

- **Granularity.** One committed explicit section add, move, settings update or removal is one
  action. A normalized no-op, a refusal and a failed write record nothing and leave any redo branch
  standing.
- **Cursor.** Undo selects the highest `applied` action at or below the cursor and moves the cursor
  just below it; Redo selects the lowest `undone` action above the cursor and moves the cursor to
  it. Both skip `retired` actions (see
  [retired actions](2026-09-operation-history-retired-actions.md)). Only the next action is
  executable; naming any other is `history_not_next`.
- **Branch.** Recording a new action discards everything above the cursor — undone and retired —
  from storage. A discarded or pruned action is never the next step again.
- **Revision.** Increments on every committed mutation — record, transition, retirement — and
  never on pruning. A transition cites it as `expectedRevision`; a mismatch is
  `history_revision_stale`, a 409 carrying the current summary, which is also how a caller whose
  response was lost learns its first call landed.
- **Retention.** An action lives 24 hours from the write that recorded it. Each history keeps at
  most 50 actions. The recorder records first, then prunes: an expired action at or below the cursor
  discards itself and everything below it; an expired action above the cursor discards the whole
  redo branch; past 50, the lowest orders go. Expiry is lazy — an expired action stays until the next
  record prunes it, refuses `history_expired` meanwhile, and is not offered by the summary.
- The high-water mark never moves backwards, so an order is never reused.

**Confidence**

Medium. The numbers are the receipts' numbers, unchanged; the per-history cap is untested against
a long working session.

**Revisit when**

A person hits the 50-action cap in one session, or Stage B's text edits make "one write" too fine a
step (the editor-commit question the Slice 35 plan leaves for Stage B).
