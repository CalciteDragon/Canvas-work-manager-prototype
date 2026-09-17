# Applied-state checks and an archive generation replace supersession; unrepairable actions retire

**Question**

Slices 30–32 refused an older receipt whenever a newer record touched the same section
("supersession"), scanning the whole workspace's records. Under a per-actor cursor
([scope](2026-09-operation-history-scope.md)) that rule is both too strong — it would refuse the
Stage A gate's second Undo of one field — and too weak, because it was the only thing protecting two
cases applied state cannot see. And a cursor introduces a failure receipts never had: an action that
can never succeed again blocks every action below it forever
([Slice 35](../roadmap/completed/35-operation-history-foundation.md)).

**Options tested**

- *Keep supersession*: refuses A after B on one field, which is the one sequence Stage A exists to
  support. Rejected.
- *Pure applied-state checks*: correct for settings updates, but a move had no field check at all,
  and two removals of one retained section in a single clock instant leave identical `archivedAt`
  values, so one actor's Undo could reverse another actor's removal. Rejected on its own.
- *Skip past a failing action automatically*: a client would see a step it did not ask for. Rejected.
- *Retire only on refusals no user action could repair, as a committed, visible step*: kept.

**What we learned**

The case supersession really protected spans two actors' histories, so no per-history counter can
catch it; it has to live on the section. A generation that only removal advances, and that Undo,
Redo and Archive Restore never move backwards, tells every pair of removals apart regardless of the
clock. The one path that could move it backwards — recreating a deleted section from an older
snapshot — needs a floor from the stored removal actions.

**Current decision**

- **Update.** Undo requires each recorded field to still hold its `after` value; Redo, its `before`
  value. Otherwise `field-changed`, next step `change-by-hand`. Other fields are never touched.
- **Move.** The section must still sit where the other direction left it, judged by its recorded
  neighbours, never by index: a recorded neighbour that still survives on the page but is no longer
  adjacent on its recorded side is `moved`. A recorded neighbour that no longer survives is no
  evidence either way. When neither neighbour of the destination survives, the index decides and the
  result's `outcome` is `partial`.
- **Removal.** `ProjectSection.archiveGeneration` is bumped by every removal and by nothing else.
  A removal action captures the generation it wrote. Undo of a retained removal requires the section
  archived with that `archivedAt` **and** that generation, else `archived-differently`; Redo requires
  the section live at that generation. Redo replays `archivedAt`, row markers and the generation
  verbatim, stamping only `updatedAt`. Redo refuses a live row now in the section that was not
  recorded (every row, for a reassign or a deleted section) rather than absorbing it.
- **Recreation.** Undo of a deleted removal and Redo of an add recreate the section at the higher of
  its snapshot's generation and the highest any stored removal action captured for it.
- **Retirement.** A transition whose executor finds a permanent conflict commits exactly one change —
  the action becomes `retired`, the cursor steps past it if it was on the applied side, the revision
  advances — executes nothing, records no activity and publishes no frame, then refuses
  `history_retired` with the refreshed summary. The caller's next call reaches the action below. The
  permanent conflicts, all on the subject section, are:
  - removal Undo finding it `not-archived` (restored out of band), `archived-differently` (a later
    removal), or `missing` when the removal retained it;
  - removal Redo finding it `archived-differently`, or `missing` when the removal retained it;
  - `already-exists` — a deleted removal's Undo, or an add's Redo, finding its id held.
  Every other conflict — a changed field, a moved row, a new dependent, an archived subject or page
  change, a missing section an add or edit named — is repairable and blocks with the cursor and
  revision unchanged.

**Confidence**

Medium-high. Every permanent case is asserted in `operation-history-service.test.ts`, including the
same-instant cross-reversal under three clock shifts; the list itself is a judgement about what a
person could repair.

**Revisit when**

Stage B adds task, reflection or project families — each brings its own permanent-conflict list — or
someone finds a retirement they could in fact have repaired.
