# What undo means for an archived row

**Question**

`2026-09-sections-own-their-data.md` justified cascade-on-remove with the claim that
`archivedAt` "is deliberately distinct from `cancelled`, so this is undoable." That was true
of the field and untrue of the application: a repo-wide search for `unarchive`, `restore`, or
a write clearing `archivedAt` returned only unrelated prose and test names. **Nothing had ever
performed the undo the decision promised**, and the spec mentioned restore nowhere.

Worse, removal was a hard delete, so a cascade left every archived row pointing at a section
that no longer existed. The ownership phase's browser pass caught one
(`.prototype/notes.json`, `note-2026-09-01-002`):

```
section-4f7e064c | Measure the hallway shelf | archivedAt= 2026-09-02T06:13:32.422Z
```

`settleRows` contained the argument against its own cascade branch — "unarchiving a row into
a section that no longer exists would be the worse outcome" — while doing exactly that. And a
container holding *only* already-archived rows was hard-deleted with no policy involved at
all, which no policy could ever have fixed.

So: where does an archived row come back **to**?

**Options tested**

- *Leave it. Archived rows are gone in practice*: rejected. It makes `archivedAt`
  indistinguishable from a delete, which is the exact conflation with `cancelled` that
  `2026-08-task-status-transitions-and-archive.md` refused, and it leaves the dangling
  `sectionId` unenforceable.
- *Pair a restored section with its rows by matching `archivedAt` exactly*: rejected. One
  cascade is one write, so it is precise — and it couples two records through a value that
  looks incidental, so the next person to touch either write path has no way to know the
  equality is load-bearing.
- *A boolean `archivedWithSection: true`*: rejected. It carries identical information, since
  `sectionId` already names the section. But the codebase's idiom is *optional presence
  carries the fact* (`archivedAt`, `completedAt`, `title`), and a flag that is only ever
  `true` or absent is that idiom wearing a worse type. Redundancy that can be **checked** is
  also not duplication: because `archivedWithSectionId` always equals `sectionId`, the
  integrity pass can assert the pair, and a bug that writes one without the other — or
  forgets to clear it on restore — fails at the next commit rather than surfacing weeks later
  as a section that restores the wrong rows.
- *Do not archive the rows at all — let the section's `archivedAt` hide them*: genuinely
  elegant, and rejected. Row visibility would then depend on the section's state, so every
  row query — dashboard, upcoming work, search, progress — would need a join to a second
  collection. That is precisely the join `2026-09-sections-own-their-data.md` refuses when it
  keeps `projectId` on rows alongside `sectionId`: "a join on every read is not free when a
  unit of work already clones and validates the whole document twice."
- *`restore` resolves a target — the row comes back to the project's first live container of
  its kind, or a new one*: the first draft's answer, and rejected by the user in favour of
  the one below. It works, but it needs a resolution mechanism, a subtask interaction with
  `resolveContainer`, and an answer to "what if there is no container at all" — a whole
  apparatus for a question the option below does not ask.
- *Removing a section **archives** it*: chosen, and widened at the user's direction from
  cascaded containers to **every** section. The row comes back to the section it names,
  because that section is still there.

**What we learned**

The resolution mechanism was answering a question that did not need to exist. Once a removal
archives the container, four things fall out rather than being built:

- **`sectionId` can never dangle**, so the integrity rule is strict for every row with no
  lenient branch. The invariant the ownership decision states is *strengthened* rather than
  narrowed: it now holds for archived rows too, with "renders" read as "exists and would
  render if restored".
- **The pre-archived-rows case closes for free.** A container holding only archived rows is
  archived rather than deleted, so those rows keep a section. That defect had no policy
  behind it and no policy could have reached it.
- **Undo is one operation.** Restoring the section brings back the section and the rows it
  archived — which is what a person means by undoing a removal.
- **No `SCHEMA_VERSION` bump.** Every new field is optional, so documents written before this
  phase still load.

Archiving is uniform; **ownership governs only the rows.** An earlier draft archived
containers and hard-deleted views, on the reasoning that a view owns nothing worth keeping.
That is true of `progress`, `timeline` and `recent-activity` — and false of `rich-text`,
whose prose lives in `config.text` and nowhere else, as `SECTION_OWNERSHIP`'s own comment has
said since the ownership phase. Carving `rich-text` out by type meant a second type-keyed
table, which is the §30 cost the sibling plan spent a round arguing down. Archiving every
section costs one field write and no table at all, and preserves `config` for free — a
Progress section's milestone selection and a Timeline's range survive too. "Removing a
section is undoable" fits in a sentence; "… unless it is a view, except `rich-text`" does not.

`SectionKind` therefore keeps meaning exactly what it meant — *owns rows or does not* — and
stops being overloaded to mean *survives removal or does not*, which was never the same
question.

**The cost, stated plainly:** every read of sections must now exclude archived ones, and
there are more of those than the rejected alternative touched — `ordered`/`list`,
`resolveContainer`, `requireContainer`, `duplicate`, `move`, `update`, `settleRows`' reassign
target, `SectionQuery`, the sections route, `list_sections` and the canvas. Missing one shows
an archived section on the canvas, or lets a new row be created into one. `get` is the
deliberate exception: it resolves through the unchecked lookup, and restore depends on it.

**The subtask rule turned out to already have an answer in the codebase.** Archiving a task
now cascades to its live descendants, marked with `archivedWithTaskId` — the same shape as
the section marker rather than a second mechanism — which buys the invariant the rest rests
on: *a live row's ancestors are live*. That, plus promoting the parent/child same-section rule
into document integrity, is what makes a section's live rows whole subtrees, so a section
cascade is never a partial archive and a row never carries two markers.

Restoring a row therefore refuses in exactly two cases, both naming what to restore instead:
its section is archived, or its parent is. The second is reachable despite the cascade —
archive a child on its own, then its parent, and the cascade skips the child. Both refusals
keep the undo semantics honest: **archiving something and restoring it changes no other
state.** A row archived before a cascade stays archived after the section returns.

**Current decision**

§31's remove archives, on every branch, and nothing is deleted. `SectionRepository.remove`
survives with no caller, documented as the seam permanent deletion will use.

A container holding live rows still needs a policy, because the question is what happens to
the *rows*: `cascade` archives them with the section and stamps each with
`archivedWithSectionId`; `reassign` moves them to another live container of the same type and
archives the emptied section, marking nothing — the rows left under their own policy, so they
are not "archived with" anything. A view, an empty container, and a container holding only
archived rows archive silently, because there is nothing to ask about.

`restoreSection` is the canonical undo, under `projects.write`: it clears the section's
`archivedAt`, appends it at the **end** of the canvas (its old index needs positions the
canvas has since reused), and restores exactly the rows naming it. `TaskService.restore` and
`ReflectionService.restore` are the row-level mirrors. Every restore is idempotent, so a
public route's retry cannot reorder the canvas or invent history.

Removing an **already-archived** section is refused rather than archived twice. Removing
something already removed is not a second archive, and a silent success would answer two
identical calls with two successes and two activity events.

**An archived project is frozen against work coming back in** — section add/update/move/
duplicate, row create/update/complete, and every state-changing restore are refused — while
removal and archiving stay allowed, because tidying a project you have put away is not the
same as reopening it. The freeze is escapable: reactivating the project lifts it.

**An archived section is frozen the same way, one level down.** Its own `update`, `move` and
`duplicate` are refused — a `config` replacement most of all, since that is the prose
archiving a view exists to keep — and so is creating, moving, editing or restoring a row
inside it. That last one is the easiest to leave out and the one that matters: an archived row
edited or moved out of an archived container would carry `archivedWithSectionId` to a section
it no longer names, and the integrity clause would reject it at commit, so the caller would
see a rolled-back write instead of a refusal it could read. Archiving a row stays allowed, so
hidden work can still be tidied.

An **Archived** region at the foot of the project canvas is the undo surface. It is content
rather than layout chrome, so it shows in View Mode (§32); hiding it behind Edit Layout Mode
would hide it exactly when someone needs it. It offers only restores the domain will accept.

**Confidence**

High for archiving as the removal semantics, and for the two markers — the integrity clauses
that check them are what makes the redundancy pay. High for the row-restore refusals, which
follow from the invariant rather than from preference. Medium for appending a restored
section at the end of the canvas: it is the only answer that needs no reserved positions, but
someone restoring a section they removed a minute ago may expect it back where it was.
Medium for the archived-project freeze, which no UI can currently reach except by direct URL.

**Revisit when**

Archived sections accumulate enough to want clearing out. Permanent deletion is **wanted and
deliberately deferred**, not rejected: the shape is open — a second `remove`, a distinct
`delete` guarded on the section already being archived, a region-level *Empty archive*, or a
retention rule. Two things make it tractable whenever it comes: `SectionRepository.remove` is
kept for exactly this, and `archivedWithSectionId` turns "delete this section and everything
that came down with it" into a query on one column rather than a graph walk.

Or when an agent gains an undo surface of its own, which is what would justify archive and
restore tools (§54 lists none today) or `includeArchived` on the three list tools.

Or when restoring a section wants its old position back, which would mean the canvas
reserving positions it currently reuses.

**Amended, 2026-09-13 (planning only).** The [content-oriented Archive policy](2026-09-content-oriented-archive-policy.md)
records Slice 29's reviewed direction: separate visible recovery content from retained
tombstones, while preserving exact cascade membership, append placement and idempotency.
The implementation plan keeps owner containers visible for pre-archived-only rows. Runtime
still follows this entry's existing removal/restore rules; the projection change and the
distinction from future operation-level Undo will be documented as landed only after implementation.

**Amended, 2026-09-13 — landed.** Slice 29 implemented the
[content-oriented Archive policy](2026-09-content-oriented-archive-policy.md). This entry's rules
are unchanged and re-tested: every removal branch keeps its tombstone, cascade stamps only live
rows, reassign with live rows moves archived subtrees whole, `restoreSection` appends to the
page's current combined order, revives exactly its cascade and is a no-op on retry. What changed
is only what Archive *lists*: disposable view tombstones are retained but unlisted. The section
service's comments now call its restore **Archive Restore**, distinct from the operation-level
Undo that later slices plan.

**Amended, 2026-09-14 — Slice 30.** `restoreSection` is no longer "the canonical undo". It is
**Archive Restore**: durable, receipt-free, appended to the page's current order, and unchanged in
every rule above. Reversing one removal *as an operation* — back between the neighbours it left,
with exactly the rows it changed — is now receipt-based Undo, which a removal records in the same
unit and `UndoService` executes once for the same actor within 24 hours
([section removal Undo records](2026-09-section-removal-undo-records.md)). The medium-confidence
note above ("someone restoring a section they removed a minute ago may expect it back where it
was") is what Undo answers; Archive Restore keeps appending because it has no placement snapshot.

**Amended, 2026-09-14 — landed in Slice 31.** The earlier statement that every removal keeps a
section tombstone is narrowed by the [reference-safe disposable-removal decision](2026-09-disposable-removal-and-immediate-undo.md).
After row settlement, a section excluded from recovery is deleted only when no canonical task,
reflection or shortcut still references it. Content-bearing or uncertain sections remain
recoverable through Archive; shortcut-backed sources retain an unlisted integrity tombstone.
Existing tombstones are not purged. Archive Restore remains durable and append-placed, while
receipt-based Undo can recreate a safely deleted section at its prior placement. A deletion
result's archived-shaped `section` is an operation snapshot, not evidence that it remains stored.

**Amended, 2026-09-16 — Slice 35.** Archive Restore is still durable, receipt-free, append-placed
and outside every history, and it deliberately does not advance a section's `archiveGeneration`:
restoring is not removing. What changed is the thing it is distinguished from — receipt-based Undo
became per-actor history Undo and Redo — and one consequence is new: an Undo of a removal that
Archive Restore already reversed can never succeed, so that action **retires** rather than blocking
the actions beneath it ([retired actions](2026-09-operation-history-retired-actions.md)).

**Amended, 2026-09-18 — Slice 36.** “Outside every history” is now split by kind. **Section**
Archive Restore remains outside history until Stage C. A successful **task or reflection** Restore
is still durable, receipt-free to invoke and available after the archive action expires, but it now
records its own `task.restore` or `reflection.restore` action and therefore clears the caller's redo
branch. Its response is `{ task|reflection, operation }`; an already-live row is a no-op with a null
operation ([decision](2026-09-row-operation-history.md)).


**Amended, 2026-09-20 — Slice 37.** The split above closes: **section** Archive Restore now records
a `section.restore` action too, on the same terms the row families got — durable, receipt-free to
invoke, available long after every action has expired, and clearing the caller's redo branch when it
changes something. Its response is `{ section, operation }`, and a repeat on a live section is a
no-op with a null operation. Undoing a recorded Restore re-archives exactly what that Restore
revived; it is not the removal beneath it, which remains its own step
([decision](2026-09-section-restore-and-shortcut-history.md)).
