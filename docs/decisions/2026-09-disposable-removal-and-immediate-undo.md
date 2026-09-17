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
[Slice 31 plan](../roadmap/completed/31-disposable-removal-and-undo-ui.md) specifies:

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

**Amended, 2026-09-14 — landed in Slice 31.** The implementation follows the reviewed choices
above. Disposable and empty sections are deleted only after owned-row settlement, recovery
classification and a canonical task/reflection/shortcut reference audit. Meaningful and uncertain
content stays in Archive, shortcut-backed sources remain hidden integrity tombstones, and older
tombstones are untouched. The optional inverse disposition preserves old records and lets Undo
recreate a deleted section without overwriting a reused id. The canvas-local notice captures the
receipt before refresh; exact-owner repeated removal recovers only the outstanding receipt and
stays a write-free refusal. Typed next steps and current titles make Undo conflicts repairable
without parsing transport text.

Evidence: `pnpm test` passed (including 691 web tests), `pnpm lint`, and `pnpm docs:check` passed;
`pnpm build` passed with a 995.34 kB initial bundle under the unchanged 1 MB error ceiling, and
`pnpm e2e` passed all 26 browser journeys. Both prototype-host acceptance scripts passed, including
MCP over stdio and Streamable HTTP with receipt recovery and persisted deletion/recreation. The
seeded `nested-projects` journeys removed disposable views and restored their config, layout and
order through Undo; they also exercised shortcut placeholders, reload/Archive restoration and
reassignment. The Slice 31 plan records the independent implementation review rounds and detailed
verification evidence.

**Amended, 2026-09-14 — archived-only reassignment and refusal guidance.** The sentence above
about pre-archived rows moving applies only when live rows make reassignment necessary. With only
pre-archived rows, an explicit `reassign` does not settle or move them; the section stays as their
Archive recovery path, matching the existing Slice 29 policy. The previous branch and its tests
had drifted from the reviewed Slice 31 matrix; `SectionService.settleRows`, the Archive projection
tests and the spec now preserve the no-op branch. An archived section with no eligible receipt
also directs the caller to restore it from Archive; an expiry-boundary domain test pins that
message. The Slice 31 plan records the review findings and their re-review status.

**Amended, 2026-09-14 — activity action and retry-state review.** Safely deleted disposable
sections emit `project.section_removed`; retained removals emit `project.section_archived`, and
both name the durable project. The earlier activity decision now records that distinction without
rewriting its historical Archive-only conclusion. The canvas also protects its single failed
removal retry descriptor: a different removal cannot replace it until the user dismisses it, and
its guard alert clears on dismissal. The correctness reviewer re-read the final guard and found no
remaining substantive issues; the boundary/documentation reviewer verifies the activity amendment
before closure.

**Amended, 2026-09-14 — Slice 32 keeps Archive removal-specific.** The shared notice now hides
Open Archive for add, move and settings receipts; edits are reversible in place but are not
recoverable Archive content. The removal notice and its failed-removal retry remain unchanged.

**Narrowed, 2026-09-15 — a removal offers Archive only when it put something there.** Being a
removal is no longer enough: the notice follows the result's own `archiveListed` verdict and
withdraws the button when the removal listed nothing, which is the case for a deleted disposable
view and for a section kept only by a shortcut or an archived row. An absent verdict — a receipt
recovered from a repeat removal — stays an offer
([decision](2026-09-recovery-routes-name-what-is-actually-there.md)).
The same page-local lifetime applies to all new explicit section receipts: navigation or reload
clears the browser action, while the server record retains its existing 24-hour scope.

**Amended, 2026-09-16 — Slice 35 moves the notice onto history transitions.** The notice, its
page-local lifetime, explicit retry and Archive offer are unchanged; it now holds an operation
receipt (`historyId`, `actionId`, `revision`) and runs Undo through
`POST /api/history/:historyId/transition`. A deleted disposable removal is redone by deleting the
section again, and undone by recreating it at a generation no lower than any stored removal
captured. The notice remains Undo-only in Stage A; persistent Undo/Redo controls are Stage C's
([Slice 34](../roadmap/planned/34-undo-redo-and-archive.md)).
