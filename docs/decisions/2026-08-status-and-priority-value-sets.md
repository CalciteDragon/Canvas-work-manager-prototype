# Project statuses, milestone statuses, task priorities

**Question**

The spec fixes only one of these value sets. §33 names the five task statuses; §35 gives
milestones a `status` with no values; §26 shows a project `Status` with no values, and
§83 asks outright "What project statuses exist?"; §33 names `priority` with no values.
Slice 2 could not define the schemas without choosing.

**Options tested**

None yet — nothing has been used. Considered, on paper:

- *Borrow the task statuses for projects* (`todo`/`in_progress`/`done`…): rejected;
  a project that is `blocked` and a task that is `blocked` are not the same claim, and
  §26's header treats status as a lifecycle label, not a work state.
- *No status at all until the UI needs one*: rejected; the dashboard's "Active Projects"
  widget (§24) needs a way to say which projects are active before Slice 11.
- *Five priorities (add `urgent`, `none`)*: rejected for now; §4's task-row variants name
  exactly one priority state, "High Priority", so a third value is already speculative.

**What we learned**

Nothing from use. This entry records a guess, not a finding — it exists so that the guess
is visible when the finding arrives.

**Current decision**

- `ProjectStatus`: `planning | active | on_hold | completed | archived`
- `MilestoneStatus`: `upcoming | achieved | missed`
- `TaskPriority`: `low | medium | high`

**Confidence**

Low for all three. Highest for `TaskPriority` (three levels is a well-worn default),
lowest for `MilestoneStatus`, whose model may not survive at all (§35, Slice 19).

**Revisit when**

- Project statuses: after Slice 10, when the `nested-projects` and `busy-week` seeds put
  real project pages on screen — specifically whether `planning` and `on_hold` are ever
  chosen, and whether `archived` is a status or a separate flag.
- Milestone statuses: with Slice 19, alongside §35's larger question of whether milestones
  deserve their own model.
- Task priorities: after Slice 7, once task rows have been used for a week — whether
  `low` is ever set deliberately, and whether anything is missing above `high`.
