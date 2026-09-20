# A disabled page refuses new content and keeps everything already on it

**Question**

§27 says two things about a page that has been switched off, and read literally they point in
opposite directions:

> A write never lands on a disabled page. Silent placement somewhere invisible is worse than a
> refusal, because the writer believes it worked.

and, of shortcuts:

> a source on a *disabled* page is still a valid source; hiding a page hides navigation, not
> data.

So which writes does a disabled page refuse — and does it hide what is already there?

**Options tested**

- *Refuse everything that touches a section on a disabled page*: rejected. It makes the toggle
  destructive in effect: a Reflections page turned off would freeze its journal, and removing a
  section from it — or restoring one — would be impossible, which puts undo behind a toggle, the
  thing §31 rules out in the same breath.
- *Refuse only a write that **names the page**, allow one that names a section on it*: tried
  and rejected on review. It sounds principled — "you asked for navigation that is off" — but it
  is not a rule about anything: `duplicate` creates a section on a disabled page while naming
  neither, `reassign` moves live rows onto one, and a subtask follows its parent there. Three
  placements the rule could not see, and the refusal ended up depending on which identifier the
  caller happened to use for the same destination.
- *Draw the line at **placement versus editing***: chosen.

**What we learned**

The two sentences are not in tension once you notice they are about different verbs. "A write
never lands on a disabled page" is about *arriving* — new content being put somewhere invisible
by a writer who thinks it worked. "Hiding a page hides navigation, not data" is about what is
already there, which stays readable, editable and reachable by id.

Enumerating the write paths was what settled it, and two of them are only visible from the code:
`TaskService.resolveSection`'s `parentTaskId` branch returns the parent's section before any
container check runs, and `TaskService.update`'s subtask branch re-derives `sectionId` from the
parent on *every* update of a task that has a parent, not only on a reparent. A refusal placed on
that branch as a whole would have refused renaming a subtask — an edit — so the check is on the
*change*: it fires only when the resulting `sectionId` differs from the current one.

**Current decision**

**Refused** when the destination page is disabled: `SectionService.add` and `duplicate`; a row
create naming a `pageId` or a `sectionId` on it; `TaskService.update` moving a row's `sectionId`
onto it; a subtask create or reparent that would follow its parent onto it; and `reassign` with a
target container on it.

**Allowed**: every read; `update`, `move` within the page, `remove` — cascade included — and
`restoreSection`, on a section already there; and every edit, completion, archive and restore of a
row already there. `restoreSection` is deliberately on this side: it returns a section to where it
already lived, which is undo.

Default resolution can never land on a disabled page, because a canonical page cannot be disabled.

The 25.8 browser journey confirmed the user-facing half of the rule: disabling Todos hid its tab,
the old URL fell back to Home with an exact **Enable Todos** action, and the setting returned after
save and fresh context reconciliation. Existing page data and references remained intact, and the
same manager was usable from a nested work route without exposing a work-page toggle.

**Confidence**

High. The placement/editing line is stated by §27 itself once the two sentences are read as being
about different things, the enumeration is exhaustive over the three services rather than a sample,
and the 25.8 browser/MCP and failure paths confirmed that disabling a page is non-destructive.

**Revisit when**

The next multiweek use pass. Slice 25.4's shortcut case is now confirmed in 25.8: a placement on
Home can point at a source on a disabled page, and the source remains available by identity. Keep
watching whether the destination/source distinction is understandable in practice and whether
people expect disabled-page editing to be discoverable elsewhere.

**Amended, 2026-09-18 — Slice 36.** History follows the same “editing, not new placement” side of
the boundary. Undo and Redo may return a captured task, reflection or compound implicit container
to the disabled page where it previously lived. They do not resolve a new destination there, and
ordinary create, move and reparent operations remain refused. This keeps history available when a
page toggle changes after the original write ([decision](2026-09-row-operation-history.md)).
