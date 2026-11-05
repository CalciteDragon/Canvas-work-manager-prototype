# Archived pages are read-only, with a banner that restores in place

**Question**

A project that is archived, or sits under an archived ancestor, still opened as a fully editable
canvas: Add a section, insertion marks, drag, resize, rename, settings, remove, quick-add,
Complete and Delete were all on screen, and every one of them was refused by the domain
(`section-service.ts` refuses writes under an archived project). The archived state was said
nowhere on the page itself (L4-007, L1-028; Slice 79, §26, §31).

**Options tested**

- *Leave the controls and let the domain refuse*: rejected. Every control is a refusal waiting to
  happen, and the page never says why.
- *Disable the controls*: rejected. A disabled control still promises a write the page cannot
  make; the slice's rule is that read-only controls are absent, not disabled.
- *Absent controls under a banner that names the archived owner and restores it in place*:
  chosen.

**What we learned**

The read-only owner is the *outermost* archived project among the ancestors and the project
itself, because restoring an inner one under an archived ancestor is refused anyway
([reactivating under an archived ancestor](2026-09-reactivating-under-an-archived-ancestor.md)).
When the project and an ancestor are both archived the banner says so and offers the ancestor
first. Only a work page can be under an archived ancestor: Todos, Archive and the Reflections page
render only for a root.

Two questions needed the user:

- **Collapse (Open question 4).** Collapse is a persisted section write, also refused on an
  archived project, but a section stored collapsed would be unreadable if the control simply went.
  The user chose **(a)**: collapse stays and toggles locally, unsaved. It starts from the stored
  state, and a fresh read of the section (a reload, a live refresh) resets it.
- **Task rows (Open question 5).** A row on an archived Task List used to open the drawer, whose
  edits were all refused. The user chose **(a)**: static rows (title, status where it is not
  To do, and the due or completed date) with no drawer, as slice 77's rule that rows link or stay
  static has it. A task's description is unreadable on an archived page until it is restored;
  a read-only drawer would be a new surface.

**Current decision**

- The shell shows `ArchivedBanner` on every page of a read-only project, behind `@defer` to hold
  the bundle ceiling, naming the owner and restoring it through the shared restore choice
  (Active preselected).
- On the canvas, insertion marks, the end and empty-canvas "Add a section", drag, resize, section
  rename, section settings and remove are absent, on section, shortcut and unknown-section frames.
  An archived empty canvas says "This page has no sections." Going read-only closes an open
  section settings panel and a rename (one already saving closes when its answer arrives).
- Inside sections, the existing `readOnly` content input hides quick-add, Complete, Delete,
  Markdown Edit and the other content writes. The canonical Task List's rows are static with no
  drawer and say "No tasks." when empty; a shortcut's rows still link to their source.
- Collapse stays on section and shortcut frames and toggles locally, unsaved.
- **What stays:** the header's Rename, Parent and the project's own status (More › Edit
  details…), Undo/Redo, More, Open archive and Page settings. Rename and reparent-away are the
  escape hatch from an archived ancestor, and the own-status exception lets an archive's Undo run.

**Confidence**

High for the canvas: unit specs cover each absent control, the local collapse and the static
rows. Medium for the local collapse resetting on a quiet refresh, which is the intended "resets
on reload" but also fires on any fresh read of the section during the visit.

**Revisit when**

Real use finds a drawer-only detail people need on an archived page (then a read-only drawer,
Open question 5 (b)), or the local collapse resetting under a live refresh is felt as lost state.

**Amended, 2026-11-04 — Slice 79 step 6a: what an archived root's Todos and Reflections pages
count (user decision, Open question 7; not the recommendation).** The recommendation was a web-only
"Its todos come back when … is restored." The user chose instead: when work is hidden, the pages say
"Restore to view N hidden todos." / "Restore to view N hidden reflections." (singular for one); when
nothing is hidden, they keep the ordinary empty sentence, because it is true. The web cannot count
what the domain does not answer, so `ProjectTodosResultSchema` and `ProjectJournalResultSchema`
gain an optional `hiddenItemCount`, set by `ProjectTodosService.derive` and
`ProjectJournalService.journal` only for an archived root: the rows the same derivation would answer
once the root is restored, computed over an in-memory view in which the root is live, nothing
written. Work archived in its own right, or under a workstream archived separately, is not counted.
The items stay empty, so the count says how much is hidden, never what. *The plan's own choice:*
agents see the same count through `get_project_todos` and `get_project_journal`, whose descriptions
say so. It reveals no more than §31 already shows, since an archived project's own page keeps
rendering its sections, and one answer for every caller is simpler than an HTTP-only field.

**Amended, 2026-11-04 — Slice 79 step 6: Todos and the Reflections page.** On a read-only root,
Todos renders no task checkbox, workstream Complete or Delete (row links stay), and the Reflections
page no composer or Add reflections container. While a Todos write is pending, the other rows'
Complete and Delete are `aria-disabled` with a guarded click, never `disabled`, as the checkbox
already was. Their empty elements say "Restore to view N hidden todos." / "Restore to view N hidden
reflections." (singular for one) from the domain's `hiddenItemCount`, and the ordinary sentence when
it is 0 or absent. Since the domain answers an archived root with no rows, the absent controls are
proved by component tests with rows supplied, not by a capture.


**Amended, 2026-11-04 — Slice 79 review: the Reflections page's writing regions.** The sheet showed
an archived root's Reflections page still holding an empty "Write a reflection" region and the
completed-work subject picker, which only feeds the composer. A read-only Reflections page now
renders neither region, only its header and the journal with its hidden-count sentence.
