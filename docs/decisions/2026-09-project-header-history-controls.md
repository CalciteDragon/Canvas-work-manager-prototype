# The project header offers Undo and Redo of the displayed project's history, and nothing else does

**Question**

Slices 35–40 made every explicit write reversible through a per-actor, per-project history, but
the browser offered Undo only through a canvas-local notice that held one receipt — for sections
on the canvas and the Reflections container, not for shortcuts, rows, pages or the project itself
(`note-2026-09-20-001`: a removed section offered Undo while a removed shortcut directly beneath it
did not). Slice 34 planned persistent header controls. Five things had to be decided: which history
a page's header shows, how a control knows a step is available, whether the notice keeps its Undo,
who reconciles content after a transition, and where a header archive leaves the person (§§26, 31,
54, 61–63).

**Options tested**

- *Header shows the displayed project's history*: kept. A root's pages all show the root's; a
  sub-project's work page shows the sub-project's. It matches the server key (exact actor + owning
  project, [scope](2026-09-operation-history-scope.md)) with no client merging.
- *A merged root-tree view on root pages*: rejected. It would make one control step through several
  histories, changing cursor ownership and revision semantics that the server defines per history.
- *Disable a control whenever the summary's `blockedBy` is set*: rejected. `blockedBy` describes the
  project; an archive's own Undo, a reactivation's Redo and an archived-throughout edit are allowed
  while their subject is archived ([project history](2026-09-project-update-operation-history.md)), so
  the header of an archived project could never undo its archive.
- *Each summary entry carries its own `blockedBy`*: kept. `summaryOf` computes it with the same
  `transitionBlocker` a transition runs, so the summary and the execution cannot disagree.
- *Keep the notice's Undo beside the header*: rejected. Two buttons for one step compete, and the
  notice only ever held the last receipt of one surface.
- *The header reconciles content after a transition*: rejected. Every open surface already re-reads
  on the transition's live frame (verified again in `project-history.spec.ts`), and reconnect
  re-reads what a dropped stream missed.
- *Archive navigates to the dashboard, as before*: rejected. The dashboard has no header, so the
  archive's Undo would be reachable only by typing a URL.

**What we learned**

- Ownership is not guessable at the write site — a task list inside a Home shortcut writes a row
  its source sub-project owns, a reactivation from root Archive records in the reactivated project,
  Open archive from a nested route records a `page.add` in the root — so the store decides from the
  receipt's `historyId`, and a writer only supplies the owning project from the response, which is
  used to word the cross-owner sentence and its link.
- Pending has to cover the re-read a write owes, not only the request: in the window between a
  write's `finally` and its summary read the controls would otherwise offer the pre-write step, and
  a click would earn a stale-revision refusal worded as if someone else had changed the history. A
  read already in flight before the report does not count.
- `aria-disabled` with a guarded click keeps an unavailable control focusable and its reason
  readable; the native `disabled` attribute would drop both from the keyboard.

**Current decision**

- `ProjectHeader` shows two always-present icon buttons, Undo and Redo, for the **displayed
  project's** history. `ProjectHistoryStore`, provided by `ProjectWorkspaceShell`, holds the summary;
  it is `loading`, `ready` or `unavailable` (Retry), drops reads from an earlier generation and older
  revisions of the held history, and re-reads on this project's frames, any project-record frame,
  `prototype.reloaded` and reconnect.
- A control is enabled only when the store is ready, no transition or write (including its owed
  re-read) is pending, the summary offers a step in that direction, and **that entry's** `blockedBy`
  is `null`. Its accessible name and `title` are one string: `Undo: <label>`, `Nothing to undo`,
  `Undoing…`, `Saving a change…`, `Loading history…`, `History unavailable`, or
  `Undo unavailable while <title> is archived`.
- Browser writers report through the core `OPERATION_HISTORY_REPORTER` token (`begin` / `committed` /
  end); a write recorded in another history shows "… was recorded in Kitchen's history." with an Open
  link. The dev panel's writers are outside the shell and reach the header by frame.
- Summary entries carry `blockedBy`; the top-level `blockedBy` stays project-level.
- The canvas notice becomes `SectionRecoveryNotice`: Open Archive after a removal Archive lists,
  Retry remove, Retry refresh. It offers no Undo. The Reflections page has no notice.
- A header archive stays on the archived project with "X is archived. Undo is available here.",
  and the More menu does not offer Archive on an archived project.
- Transition results, refusals and content are reconciled by the server's summary and live frames;
  the header holds no rows or receipts.

**Confidence**

Medium-high for the scope, the per-step blocker and header-only Undo: each is backed by the
acceptance journey and matches the server's model. Medium for the cross-owner sentence as the only
guidance: real use may want a way to reach a descendant's step without leaving the root.

**Revisit when**

Real use shows a person hunting for a descendant's step from a root page often enough to want a
combined view; project **creation** joins history (the next Stage C phase) and needs its
missing-project recovery route; keyboard shortcuts or a history list are asked for; or a surface is
found stale after a header click that its frame did not reconcile.
