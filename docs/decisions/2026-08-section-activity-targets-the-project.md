# A section's activity event names its project, not the section

**Question**

§57 requires every mutation to produce one attributable event, and §31 gives the section
frame a remove control. What should an event about a section point at, once sections can be
deleted?

**Options tested**

- *`entityType: 'section'`, pointing at the section*: the obvious choice, and **it does not
  work**. `validateDocumentIntegrity` resolves every event's target at the close of every
  unit of work and again when the document loads. Deleting a section makes its own removal
  event dangle, so the delete fails the validation that runs as its unit of work commits —
  rolling back the very write doing the removing. Worse, any earlier `section.created` event
  would fail that check on **every subsequent boot**, so the file would be permanently
  unloadable. A domain test now pins this: `removes a section without orphaning its activity
  events` fails against this option.
- *Cascade-delete the section's events with the section*: rejected. §57 exists so a workspace
  can say what happened; erasing the record that a section ever existed is the opposite of an
  activity log, and it would make removal the one mutation that destroys history.
- *Soft-delete the section instead*: rejected. It needs a new field in
  `packages/contracts`, which §30 argues against, to avoid a problem the option below does
  not have.
- *`entityType: 'project'`, pointing at the owning project*: chosen. The event names an
  entity that outlives the section, so nothing dangles and nothing is destroyed.

**What we learned**

The constraint is structural, not stylistic — the document's own integrity rules decide this,
and any design that keeps a reference to a deleted entity is unavailable regardless of taste.

The actions are spelled `project.section_added`, `project.section_updated`,
`project.section_moved` and `project.section_removed`, which keeps `ActivityActionSchema`'s
documented `entity.verb` convention: the first segment still matches the event's
`entityType`. The section is named in `summary`.

Two consequences worth stating rather than discovering. `ActivityEntityType`'s `'section'`
member and the matching branch of `validateDocumentIntegrity` are now unreachable from
`SectionService`; both stay, because MCP writes and hand-edited fixtures can still produce
them, and that validator branch is the reason this entry exists. And the feed can no longer
be filtered to one section — nothing in §57 or any planned slice asks for that.

**Current decision**

Section mutations record against the owning project, with `entityId` and `projectId` both set
to `section.projectId`. Section removal stays a hard delete.

**Confidence**

High. The alternative is not a worse design, it is a document that fails to load.

**Revisit when**

Any entity gains a delete. The same trap applies to tasks, milestones and reflections, and
the same answer will not always be available — a task's events legitimately name the task.
