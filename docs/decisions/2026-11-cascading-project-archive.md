# A project archive can take its named workstreams down with it

**Question**

Slice 25.0 and §31 said archiving never cascades, and Slice 79 said so before the write, with a
blocked confirmation listing each live child. In use, that makes archiving a project with nested work
a walk: every leaf first, then each parent. The user decided on 2026-11-05 that a project should be
archivable together with what is beneath it, explicitly and with a confirmation, and that its restore
should bring back only what came down with it. So how does a cascade keep the property the old rule
protected, that nothing is archived that the caller never named?

**Options tested**

- *Direct children only:* rejected, and it is wrong rather than merely smaller. A live grandchild
  under a child archived with its parent is the "live, hidden and refused by every write" trap
  ([reactivating under an archived ancestor](2026-09-reactivating-under-an-archived-ancestor.md)).
- *An implicit cascade on `archive_project` and a bare `PATCH`:* rejected. It is the thing the old
  rule exists to prevent. It also changes what existing calls do.
- *The caller names the whole live subtree, compared as an exact set:* chosen. A person names what
  the confirmation shows; an agent is refused with every name and id, then names them in a second,
  deliberate call. A call without the list refuses exactly as it did.

**What we learned**

Nothing from sustained use yet. From the plan's five review rounds: a restore needs no receipt, while
history is per actor and can expire, so what a workstream was has to live on the workstream, not only
in an action. That is why the marker records status and completion time. And a recorded workstream can
legitimately disappear (its creation undone after a restore), so a history step skips it rather than
stranding every step beneath it for up to a day.

**Current decision**

- `archiveWorkstreamIds` on `UpdateProjectInput` and `archive_project` must equal the project's live
  subtree: any status but `archived`, at any depth, so a Completed workstream comes down too. The walk
  stops at an archived node, which keeps its own state along with anything beneath it. Anything else
  refuses and writes nothing. Absent or empty, a project with live workstreams refuses, naming each.
- Each workstream that comes down carries `archivedWithProject`: the **owner** (the project the caller
  archived, as `archivedWithTaskId` holds a cascade's root) and its own status and completion time.
  `validateDocumentIntegrity` enforces it: a marked project is archived, its parent is the owner or
  carries the same owner, and the owner is archived and unmarked. No migration: every field is
  optional, and an older archive is correctly archived in its own right.
- **Every restore of the owner brings back exactly the marked**, in `ProjectService.update`, so no
  entry point needs code to make it true. Each returns to its **recorded** status, and the status the
  restore names is the owner's alone. Anything unmarked stays archived and becomes the next listed owner.
- **A marked project does not leave alone.** It refuses a status change or a reparent, naming the
  owner, though rename and other fields stay allowed. This narrows the "reactivate and move in one
  call" escape hatch for API callers only; the web has no move control. Agents wanting one workstream
  back restore the owner, move it, and archive the owner again naming what remains.
- **One gesture is one event:** one action in the owner's history and one Activity line on the owner,
  naming the count. A workstream's own Recent Activity is silent about it, and its banner explains.
- **A history step moves exactly its recorded group.** Bringing back refuses `field-changed` if the
  group changed, because only the owner's Restore by hand can repair that. Taking down refuses on a
  status drift, a move out of the subtree, or a live workstream added since. Neither sweeps in new work.
- **Agents may cascade by naming ids**, the same rule the web uses (§54). Naming ids is an API
  precondition, not a person's confirmation: §58's confirmation stays with
  [Slice 22](../roadmap/planned/22-agent-confirmations.md).

The user chose each of these on 2026-11-06, taking every recommendation in
[Slice 80's plan](../roadmap/completed/80-cascading-project-archive.md#open-questions).

**Confidence**

High that the set-comparison keeps the old rule's point. Medium on the recorded-status restore: an
owner and its workstreams can differ afterwards (Home On hold, Kitchen Active), and real use has to
show that reads as "as they were" and not as a mistake. Low on whether agents should keep this without
a person's confirmation; that is what Slice 22 would test.

**Revisit when**

An agent wants one workstream back often enough that R5's three steps hurt; Slice 22 builds agent
confirmation; or real use shows people expecting the chosen status to apply to the whole group.
