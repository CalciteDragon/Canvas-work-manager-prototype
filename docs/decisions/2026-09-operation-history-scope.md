# Undo and Redo follow one history per exact actor, per owning project

**Question**

Slice 34 replaces the single-use, section-scoped Undo receipt with a bidirectional history
(§31, [Slice 35](../roadmap/completed/35-operation-history-foundation.md)). Before a line of it could
be written, the history's *scope* had to be fixed, because the scope decides who owns the cursor,
what the summary route is keyed by and what an agent can ever reach. The candidates were one
history per workspace, per root tree, per project, or per page, each per actor or shared.

**Options tested**

- *One workspace history per actor*: a person's edits in two unrelated projects would interleave,
  so Undo on one project's canvas could be blocked by a change on another's. Rejected.
- *One history per root tree*: a sub-project's edits would stack under its root's, so the work
  canvas of a unit of work would offer Undo for Home edits it cannot show. It would also change the
  summary route's key from a project to a tree, a shape Stage C could not narrow later. Rejected.
- *One history per page*: moving between a root's Home and its Reflections page would split one
  mental sequence of edits. Rejected, and reversible later if it proves wrong.
- *A shared history per project*: one actor could undo another's change, and an agent's edits
  would enter a person's stack — §80 lists cross-actor Undo as a non-goal. Rejected.
- *One history per exact actor, workspace and owning project*: kept.

**What we learned**

The existing receipts already had the exact-actor rule (a user, one agent connection, or the
system), so keeping it cost nothing and kept every "not yours is not found" test meaningful. The
owning project is the project of the *subject* section, which is what makes a sub-project's
canvas and its root's Home independent: a write records into the history of the project that owns
what it changed. Section writes on one page therefore always share one history, which is what lets
a page order receipts by that history's `revision` instead of the old workspace `sequence`.

**Current decision**

- A history is keyed by (workspace, owning project, exact actor). `validateDocumentIntegrity`
  refuses a second history for the same key, and a history's project must be stored in its
  workspace — strictly, because no Stage A operation deletes a project.
- `RepositoryOperationRecorder` creates the history on the actor's first recorded write in that
  project; before then `GET /api/projects/:id/history` and `get_operation_history` answer an empty
  summary with `historyId: null` rather than inventing one.
- The summary is always the **caller's own**. Another actor's history is invisible to the summary
  and answers not-found to a transition, with the same message as an unknown id.
- Reading the summary needs `projects.read`; a transition needs the write grant of the action's
  family, which for every Stage A family (the four section operations) is `projects.write`. The
  grant is checked before any read, so a connection without it learns nothing, and a 403 names the
  missing permission (§53).
- `OperationHistoryService` composes repository interfaces, `ActivityService` and `Clock` only; it
  never calls a section, task or reflection service, so it can never record the inverse of its own
  inverse.

**Confidence**

Medium. Per-project is the smallest scope that keeps one canvas's edits together; whether a root's
Todos page should see a sub-project's actions is untested until Stage C puts controls in the shell.

**Revisit when**

A root Todos or Home action's history "feels lost" because the change it made recorded into a
sub-project's history, or Stage C's header controls need a tree-wide view.

**Amended, 2026-09-18 — Slice 36.** The scope is unchanged, but task and reflection writes now join
the same exact-actor, owning-project history as section writes. A transition asserts the stored
action family's grant — `projects.write`, `tasks.write` or `reflections.write` — while the optional
summary read remains `projects.read`. A write-only agent starts from its receipt and chains through
the summary returned by every transition result or refusal; it does not gain a project read
([row history](2026-09-row-operation-history.md),
[family permissions](2026-09-operation-family-permissions.md)).
