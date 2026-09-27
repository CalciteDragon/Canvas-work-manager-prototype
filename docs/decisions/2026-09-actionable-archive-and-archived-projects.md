# Actionable Archive and archived-project recovery

## Question

Which archived items should root Archive show now, and how does someone recover an archived
root when its own page is unavailable?

## Options tested

- Keep blocked descendants and live content hidden by an archived project in Archive with
  explanatory rows.
- Show only currently restorable archived items, highest ready owner first; recover archived
  roots and independently restorable subprojects from workspace Settings.
- Cascade project restoration or store a separate Archive collection.

## What we learned

The canonical records and restore writes already know ownership and current ancestry. A blocked
descendant is not an action the person can take, while its highest archived owner is. Restoring
that owner may expose independently archived children as the next actions without changing their
markers. An archived root cannot be recovered from its own optional Archive page alone. The
workspace needs a project recovery read that works regardless of page toggles.

## Current decision

Slice 44 makes root Archive a ready-only, parent-first projection. It lists archived projects,
sections, tasks and reflections only when their canonical Restore can run structurally now.
Archived projects suppress descendants, archived sections suppress owned rows, and archived tasks
suppress archived subtasks. It omits live content merely hidden beneath an archived project.
`sectionRecoveryOf` still decides whether a section holds meaningful content, including a
container holding only independently archived rows; the new structural test decides whether it
can be restored now. Listed entries keep their origin, cause, cascade and separate-restore
metadata. Canonical writes recheck blockers at commit time.

`GET /api/archived-projects` and `list_archived_projects` expose one workspace-scoped read under
`projects.read`: archived roots and archived subprojects whose ancestors are live. Settings at
`/settings/archived-projects` displays it independently of project navigation and the optional
Archive page. Restore requires an explicit non-archived status and calls the existing project
write under `projects.write`; there is no project cascade, new persistent collection or new
restore endpoint. Read and write refusals stay distinct.

## Confidence

High for the structural eligibility and no-cascade rule because the projection is based on
canonical records and the write still validates current state. UI discoverability depends on
continued browser use.

## Revisit when

Real use shows a ready action missing from either surface, recovery steps remaining unclear after
restoring an owner, or workspace Settings becoming too dense for many archived projects.
