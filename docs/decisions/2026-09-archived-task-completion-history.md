# Completion history respects an archived task

**Question**

Should Undo or Redo enter `done` on a task another actor has archived since the recorded action?

**Options tested**

- Replay the status despite archive: rejected because ordinary completion refuses an archived task.
- Report every archived row and section separately: rejected when the section cascade itself archived the row, since one section Restore repairs both.
- Report the independently archived task, then any separately archived section: adopted.

**What we learned**

Completion Redo and reopen Undo could enter `done` on an archived task in a live section. A section-cascaded archive has `archivedWithSectionId`; an independently archived row does not. A parent-cascaded child has `archivedWithTaskId` and requires its parent restored first.

**Current decision**

If a `task.update` history direction would enter `done` from another status and the current task is archived, report `task archived-subject` after field and structural conflicts, before section conflicts. Suppress that task conflict only for a section-cascaded row, whose section conflict names the single repair. Report both task and section when the task was independently archived before its section. A parent-cascaded child reports its own task conflict; restore its parent to revive it. Leaving `done` remains reversible while the section is live. Refusals write nothing and leave the same action next.

**Confidence**

High for the rule and ordering, pinned by independent, section and parent cascades, combined blockers and recovery tests.

**Revisit when**

The prototype changes what archive or completion means for tasks.
