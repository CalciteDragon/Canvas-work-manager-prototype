# Project nesting rules and what archiving a parent does

> **Extended since (noted 2026-09-10).** These rules still hold. The 25.x overhaul added on top
> of them: a root has no parent and a subproject must have one
> ([project workspaces and subproject work units](2026-09-project-workspaces-and-subproject-work-units.md));
> live work beneath an archived ancestor is hidden from ordinary reads and cannot be newly
> created or reactivated there
> ([reactivating under an archived ancestor](2026-09-reactivating-under-an-archived-ancestor.md));
> and recovery happens on a root-wide Archive page
> ([root Archive recovery guidance](2026-09-root-archive-recovery-guidance.md)).

**Question**

§26 gives projects a `parentProjectId` and §83 asks whether nesting is worth keeping at
all. Slice 5's `ProjectService` had to decide what a legal parent is, whether nesting has
a depth limit, and what happens when a project with sub-projects is archived — §81 lists
"archive project" in the first milestone and §58 flags it as needing confirmation.

**Options tested**

None in use. Considered:

- *A depth limit (two or three levels).* Rejected. §83 asks whether nesting earns its
  place; capping the depth before anyone has nested anything answers a question the
  prototype exists to ask, and a limit is trivially added later if the UI drowns.
- *Cascade the archive to descendants.* Rejected. It archives work the caller never
  named, and it is the operation §58 already singles out as deserving confirmation — a
  silent multi-entity write is the opposite of that. The rejected version is also
  irreversible in a prototype with no delete and no undo.
- *Allow archiving a parent and leave the children active.* Rejected: an active project
  whose parent is archived is invisible in every list that walks the tree, which is worse
  than a refusal because nothing tells you it happened.

**What we learned**

Nothing from use. One thing from implementation: a rule enforced only in `archive()` is
decorative, because `ProjectStatusSchema` includes `archived` and
`UpdateProjectInputSchema` accepts it, so `PATCH { status: 'archived' }` is the route
that actually reaches it. Both paths now enforce the rule and both emit
`project.archived` rather than `project.updated`.

**Current decision**

- A parent must **exist**, sit in the **same workspace**, not be **the project itself**,
  and not create a **cycle** (checked by walking the ancestor chain).
- **No depth limit.**
- **Archiving a project with any non-archived child is a `DomainRuleError`** (409). The
  caller archives the children first. Enforced identically on `archive()` and on a
  `PATCH` that transitions status into `archived`.
- Archiving is **idempotent** — archiving an archived project writes nothing and records
  nothing.
- A parent in another workspace raises `EntityNotFoundError` (404), not a rule error;
  see [2026-08-workspace-scoping-and-not-found](2026-08-workspace-scoping-and-not-found.md).

**Confidence**

Medium on the nesting rules — they are the minimum that keeps the document consistent, and
`validateDocumentIntegrity` already enforces the workspace half independently.
Low on the archive refusal: it is defensible but it may simply be annoying in practice,
and "archive this and everything under it, with a confirmation naming the count" is a
plausible better answer once there is a UI to confirm in.

**Revisit when**

- Slice 10, when `nested-projects` puts real sub-projects on screen — whether nesting is
  used at all, and whether the missing depth limit ever bites.
- Slice 22 (agent confirmations, §58), which is where a cascading archive would get the
  confirmation that makes it safe.

**Amended, 2026-11-04 — Slice 79 (the refusal comes first, L4-008, user's choice).** The rule
does not change and there is still no cascade; what changes is *when* the person hears it. The
header's archive confirmation computes the project's direct children that are not archived, the
same set `assertNoActiveChildren` checks (`liveChildrenOf`, over the workspace tree: a root's top
level, a workstream's node's children). When there are any, the confirmation is the blocked form,
"“Kitchen” can’t be archived yet" over "These workstreams aren’t archived. Archive them first:",
each child a link to its page with its status ("Garden · Completed": completed still blocks),
following one closing the dialog, and Close the only button. When the tree cannot say (a stale
read, an agent's new workstream, or children hidden under an archived ancestor) the commit form
stays and the domain decides; a `rule_violation` on that archive then reads "“X” still has live
workstreams. Archive them first." with the reason under Details, never "Try again", and the page
re-reads its context so the next confirmation shows the blocked form. Spec §31 carries a
*Slice 79* note.

**Amended, 2026-11-06 — Slice 80 (the refusal now applies only to what the caller did not name).**
The user reversed "no cascade". A project with live workstreams still refuses unless the caller names
the whole live subtree in `archiveWorkstreamIds`, in which case they come down together; this entry's
objection, work the caller never named, is met by the naming, and the confirmation this entry's
*Revisit when* anticipated exists. `assertNoActiveChildren` is now `assertNamedWorkstreams`, and walks
the subtree rather than one level. Everything else above stands. See
[a project archive can take its named workstreams down with it](2026-11-cascading-project-archive.md).
