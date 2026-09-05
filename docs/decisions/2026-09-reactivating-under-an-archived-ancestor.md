# Live work under an archived ancestor is hidden, and cannot be newly created

**Question**

Archiving a project does not cascade — §31 is explicit that "archiving a project never archives
anything beneath it", because an implicit cascade would archive work the caller never named. But
§31 also says "a project whose own status is `archived` hides its live contents from ordinary
reads too". Put together, those allow a project that is *live* underneath something archived.

Two questions followed. Which reads hide it? And should the states that produce it be allowed at
all?

**Options tested**

- *Hide it from reads and leave the writes alone*: rejected once it was written down. It
  manufactures a project that is live, absent from every list a person navigates, and — because
  the write freeze walks ancestors too — refused by every write. Nothing can find it and nothing
  can change it. A read filter without matching write refusals is a trap, not a rule.
- *Cascade after all — archiving a project archives what is beneath it*: rejected. It is the
  thing §31 rules out by name, and Slice 25.0 settled it with the user.
- *Hide it, and refuse the two operations that create it*: chosen.

**What we learned**

`assertNoActiveChildren` already refuses archiving a project with non-archived **direct
children**, which is why an ordinary archive leaves every descendant archived in its own right —
and therefore *not* hidden by this rule. That is inductive over a document whose archives all went
through the guard, not structural: the guard looks one level down, so a seed or a hand-edited
`data.json` (§14) can arrive already holding a live grandchild under an archived child, and
archiving its root produces the state directly. The fixtures for it are written straight to the
repositories for that reason.

On a clean document there were exactly two ways in: **reparenting** a live sub-project under an
archived one, and **reactivating** a sub-project whose ancestor is archived. Both are closed.

The reactivation refusal has to be a *transition*, `current.status === 'archived' && next.status
!== 'archived'`, not a state. A project already live under an archived ancestor has
`next.status !== 'archived'` on every update, so a state predicate would refuse renaming it — and
renaming, along with reparenting it away to a live parent, is the way out. For the same reason the
check reads `next.parentProjectId`, after the reparent has been applied, so reactivating and moving
out in one call succeeds rather than being refused against the parent being left behind.

The predicate that hides is narrow on purpose: `hasArchivedAncestor && !isArchived`. A project
archived in its own right is *not* hidden by it, so `status: ['archived']` queries keep working and
an archived project's own Sub-Projects section still lists what is under it. `TaskService`'s
unscoped list is the one place that needs both halves, because it has no `status` filter of its own
— and its exclusion is keyed on the query naming no project, no section *and* no parent task, since
the canvas's own Task List reads by `sectionId` with no project and §31 requires an archived
project's page to keep rendering.

**Current decision**

`archivedAncestry` and `assertProjectWritable` in `packages/domain/src/project-visibility.ts` are
the one statement of the rule. Ordinary aggregate reads — the dashboard, workspace search, upcoming
work, the project list and the unscoped task list — drop hidden projects; reads that named a project
or a section still answer. Content writes beneath an archived ancestor are refused, naming the
ancestor to reactivate. Creating a sub-project under an archived ancestor, reparenting under one,
and reactivating beneath one are all refused. `ProjectService.update` as a whole is **not** frozen:
rename and reparent-away are the escape hatch, and `ProjectService.get` still resolves a hidden
project so an id already in hand reaches it.

Reactivating stays an explicit status choice (§31) — the prototype still does not guess a prior
status. This only constrains the order the choices happen in.

**Confidence**

High that the trap had to be closed at both ends. Medium on the escape hatch being *enough*
between now and Slice 25.6: a hidden project that arrived in a document is reachable only by an id
someone already has, because the Archive page that would list it does not exist yet.

**Revisit when**

Slice 25.6 builds the Archive page. It is the surface that should list hidden work under its
archived owner, distinguishing *hidden because an ancestor is archived* from *archived in its own
right* — the two states this entry separates — and it is where a `ProjectQuery` member for reading
them would earn its place, with a caller. Also worth revisiting whether `assertNoActiveChildren`
should walk the whole subtree rather than one level.
