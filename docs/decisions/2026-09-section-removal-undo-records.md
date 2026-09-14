# A section removal commits one scoped, expiring Undo record beside its canonical writes

**Question**

Slice 30 must make one section removal reversible as one operation, with its historical
placement, before Slice 31 starts hard-deleting disposable views (Refactor §§10–13, 17–21,
25–27; main §§14–15, 31, 53–54, 57, 62). The candidate left seven gates open: how the stored
document gains undo data without losing existing version-3 files; how long a record lives; what
consuming and retrying return; whose record it is; which grants execute it; what counts as a
conflicting later write; and what happens when the original page is disabled or missing.

**Options tested**

Planning review of the refactor specification, `SectionService.remove`/`settleRows`/
`restoreSection`, `page-placements.ts`, `validateDocumentIntegrity`, `ActivityService.record`,
the host's `LiveEventHub`, the MCP registry and the version-2 converter. No implementation or
browser experiment is claimed yet.

- *Storage:* bump `SCHEMA_VERSION` to 4 with a second one-off converter, versus a defaulted
  `undoRecords` collection inside version 3. A bump would make every existing file "wrong" for a
  change that adds data and alters nothing existing; §14 reserves converters for cutovers that do.
- *Where inverse data lives:* on `ActivityEvent` or in live frames, versus a separate record.
  The refactor (§10, §27.1) and the live-events decision both keep activity as audit only.
- *Integrity:* validate a record's section/row/page ids like live references, versus validating
  only its owner scope. Live-reference checks would make Slice 31's hard delete fail every
  commit that deletes a section some retained record names.
- *Conflicts:* compare every row's `updatedAt`, versus comparing only the structural fields the
  inverse writes. The first refuses Undo after any title edit to a reassigned task, although
  Undo would never touch that title.
- *Retry:* a second Undo as a silent success (like Archive Restore), versus a typed refusal.
- *Ownership:* anyone in the workspace with `projects.write`, versus the exact actor that removed.
- *Missing page:* refuse always, versus a deterministic canonical-page fallback reported partial.

**What we learned**

Removal already runs in one caller-owned unit of work, and `unitOfWorkFor` joins nested calls,
so a recorder that never opens its own unit commits or rolls back with the mutation exactly as
`ActivityService.record` does; `LiveEventHub` already drops frames of a rolled-back unit.
`renumberPlacements` already preserves shifted siblings' `updatedAt`. Pages have no repository
`remove` and integrity rejects a section on a missing page, so a retained section's original page
cannot be missing until sections themselves can be deleted and recreated (Slice 31) — and a
fallback onto Home can then collide with the integrity rule that a shortcut may not reference a
section on its own destination page, so that case must be refused before writing. Plan review
also found that the removal input's `policy` is not what `settleRows` applies (an empty container
or view accepts `reassign` with no target), that a restore must read placements before making the
section live, and that MCP clients see refusal messages but not their typed details.

**Current decision**

**Planning choice, 2026-09-14 — pending Slice 30 implementation.** The
[plan](../roadmap/active/30-atomic-section-removal-undo.md) specifies:

1. **Storage.** `SCHEMA_VERSION` stays 3. `PrototypeDocumentSchema` gains
   `undoRecords: UndoRecord[]`, defaulted to `[]`, so an existing version-3 file loads with every
   collection unchanged and its next commit writes the empty collection. No converter. Integrity
   checks a record's id, workspace, project and actor attribution only — never its snapshot's
   section, page, shortcut or row ids. Loading a seed replaces the document and therefore
   discards every receipt.
2. **Separation.** One versioned, typed record per successful removal (`section.remove`,
   `version: 1`). `ActivityEvent`, live frames and receipts never contain snapshot data; no
   read route or tool lists records.
3. **Retention.** A record expires 24 hours after creation by the injected `Clock`, and a
   workspace keeps at most 50 records. Every record carries a per-workspace `sequence` (one more than
   the highest present, computed before pruning), the only order used between records — `createdAt` can move backwards with
   the dev panel's clock and production ids are random. The recorder prunes expired and lowest-sequence records
   of the acting workspace inside the recording unit of work (with every lower-sequence record for
   the same section, so no record outlives the one that supersedes it), keeping 49 before inserting so the
   cap is exact; consumed records count toward it. A pruned id is not found. An older build, whose
   document schema is not strict, strips `undoRecords` on its next commit: undo history is lost,
   user data is not. Later operation versions must keep executing retained `version: 1` records.
4. **Consumption.** A successful Undo stamps `consumedAt` in the same unit as its inverse writes
   and one `project.section_removal_undone` activity event. Any refusal writes nothing and keeps
   the record usable. A repeat answers a typed `undo_consumed` refusal rather than succeeding again.
   Every refusal's message starts with its reason token, because MCP clients receive message text
   only; HTTP clients also receive the typed details.
5. **Ownership and grants.** Only the exact actor that removed may undo — the same user, the same
   agent connection, or system — in the same workspace; anyone else gets not-found. Execution
   requires `projects.write` on the caller's current grant, asserted before any read, matching
   `remove` and Archive Restore. Revoked connections and removed grants are re-read per call by the
   authenticator, so revocation after a receipt was issued is refused at the transport.
6. **Conflicts.** A record stores each touched row's before and after structural state
   (`sectionId`, archive markers, and a task's `parentTaskId`) plus the section's post-removal
   `archivedAt` and page. Undo refuses with `undo_conflict`, writing nothing, when the section is
   missing, live, archived differently or on another page; a record with a higher `sequence` (any
   actor, consumed or not) names the same section
   (an Archive Restore and re-removal can reproduce identical timestamps under a frozen or set
   clock, so timestamps alone cannot tell the two removals apart); a snapshot row is missing or its
   structural state differs; or a
   row outside the snapshot now names the section's archive marker or a moved task as parent or
   archive root. Non-structural later edits (title, status, body) are preserved, not overwritten.
   A project or ancestor that is archived refuses with `undo_blocked` — including a removal made
   inside an archived project, which is allowed and still issues a receipt usable after reactivation.
7. **Placement.** Before mutating, capture the page's combined section/shortcut order: previous
   and next neighbors and the index. Undo inserts after the surviving previous neighbor, else
   before the surviving next, else at the clamped index; only the restored section's `updatedAt`
   changes. A disabled original page is restored to (recovery is not behind a toggle, as Archive
   Restore). A missing original page falls back to the project's canonical page, appended, with
   outcome `partial`; if that page cannot hold the type or holds a shortcut to the section, Undo
   refuses with `undo_unavailable`. In a valid version-3 document a retained section's page always
   exists, so this rule is implemented as a pure, directly tested resolver that Slice 31's
   recreation of deleted sections will reach.
8. **Dependency edges.** `SectionService` gains an `UndoRecorder` — an interface over one
   repository that never opens a unit, used exactly as `ActivityService.record` is. `UndoService`
   composes only `ActivityService` (the existing writing-service edge) and repository interfaces;
   it depends on no section, task or reflection service, and shares mutation logic with removal
   through function modules (`owned-rows.ts`, `section-removal-undo.ts`, `page-placements.ts`,
   `project-visibility.ts`). The graph stays acyclic, and AGENTS.md's composition sentence names
   the recorder edge.

Archive Restore (`restoreSection`) is unchanged and remains the durable, append-placed recovery.

**Confidence**

Medium. Atomicity, separation and scope follow existing seams and are testable. The 24-hour and
50-record bounds and exact-actor ownership were confirmed by the user on 2026-09-14 after plan
review; they remain untested by use, and whether a person wants to undo their agent's removal from
the browser is still a Slice 31 question.

**Revisit when**

Slice 31 deliberately deletes sections: it must relax the missing-section conflict for them before
the canonical-page fallback (proven only as a pure resolver here) can run end to end. Or when
Slice 31 shows the Undo action and needs a different visible lifetime, or a person wants to undo
an agent's removal; Slice 31's hard delete adds a `deleted` section disposition; Slice 32 adds
operation types with other grants; or real use shows records expiring or pruning before use.
