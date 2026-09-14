# Disposable removal keeps required references and offers immediate canvas Undo

## Question

Which sections can Slice 31 delete safely, where should its immediate Undo action live,
and how can a caller recover a lost removal receipt or understand an Undo refusal?

## Options tested

Planning review of the current recovery policy, document integrity, Slice 30 inverse,
gateway, page store and persona reload. No runtime experiment is claimed. Compared
removing source shortcuts with retaining their integrity tombstone; a canvas-local action
with cross-navigation receipt discovery; and generic retry instructions with guidance
derived from the actual conflicting state.

## What we learned

`sectionRecoveryOf` answers whether content belongs in Archive, not whether deleting its
owner preserves references. Shortcuts require an existing source, and keeping that source
preserves their existing unavailable-placeholder behavior without a new inverse format.
Rows archived before reassignment move too; their subtree and archive provenance cannot
be discarded. Slice 30 records need an absent disposition to keep meaning retained.

The browser discards removal receipts today. A page-scoped action fits its existing store,
but a lost response needs a separate retry control: live refresh can remove the original
frame before the caller retries. Archive-state conflicts sometimes name a historical
timestamp/provenance that no public command can reproduce; a blanket “restore and retry”
instruction would be false.

## Current decision

**Planning choice, 2026-09-14 — pending Slice 31 implementation.** The
[active plan](../roadmap/active/31-disposable-removal-and-undo-ui.md) specifies:

- Evaluate recovery after row settlement; hard-delete excluded sections only when no
  canonical row or shortcut still references them. Retain shortcut-backed tombstones,
  meaningful content and uncertain content. Preserve current Archive projection and all
  integrity checks; do not purge old tombstones.
- Extend the version-1 removal inverse with optional retained/deleted disposition, absent
  meaning retained. Only a recorded deletion permits recreating an absent section; an id
  collision or later structural change still refuses.
- Offer one in-memory immediate Undo action in the current canvas. Clear it on leaving
  that page/project/session, dismissal or success; a newer successful removal replaces it.
  No cross-navigation receipt list, persistence or new tool. Existing server retention
  remains 24 hours/50 records with exact-actor ownership.
- Recover a repeat removal's receipt only for the exact actor owning the highest-sequence
  outstanding record, including after deletion. It remains a refusal with no second
  mutation/event. Non-owners cannot distinguish a deleted id from not-found. A separate
  failed-request descriptor enables explicit Retry removal after live refresh removes
  the frame; it carries the original id/input, never an invented receipt.
- Use typed conflict next steps and available current titles, with bounded grouped MCP
  text retaining the reason prefix. Offer only repairs achievable through existing
  operations; historical archive-state mismatches point to durable recovery. Archive is
  always offered for retained content, never promised to recreate a deleted view.

The main specification and old decisions remain true of the runtime until implementation
lands. Their amendments, public comments and acceptance evidence are part of Slice 31,
not claims made by this planning decision.

## Confidence

High in the reference and ownership constraints from code inspection. Medium in the
canvas-local lifetime and repair copy until keyboard, touch, failure and real-use checks.

## Revisit when

Users need Undo after navigation, want to undo an agent's removal from the browser, or
shortcut placeholders create unacceptable friction. Revise and review the plan before
changing those choices; append implementation evidence after acceptance.
