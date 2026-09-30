# Project creation belongs to the created project's history and can be recovered at its URL

**Question**

Slice 39 left `create_project` outside history. Slice 42 had to decide who owns a new project's
creation action, how Undo can remove the project without invalidating its Activity and history,
and how its creator reaches Redo after the project is absent (§§14, 26, 31, 57, 68).

**Options tested**

- *Record creation in the parent or root history*: rejected. A root has no parent, and a
  sub-project's action must remain reachable from that sub-project's own URL regardless of later
  hierarchy changes. The created project's history owns `project.add`.
- *Keep a tombstone or bump the document version*: rejected. The project and its canonical page
  can be removed together; two durable records already prove why their shared id may be absent.
  This is additive to schema version 5.
- *Make Activity integrity depend on the Undo history record*: rejected. Activity has its own
  durable lifecycle anchor, independent of history pruning and retention.
- *Record the Undo Activity event before checking permanent blockers*: rejected. A project history
  owned by another actor cannot be removed, so that refusal permanently retires creation Undo. Its
  complete preflight must pass before the audit event is written.
- *Add a retry cache for lost transitions*: rejected. The transition response and the creator's
  summary identify whether Undo or Redo landed; another actor cannot read that summary.

**What we learned**

Creation is the first action in the created project's history. Undo can remove only the unchanged
project and its canonical page after all content, hierarchy and reference checks pass. The
workspace Activity document's append order gives a durable lifecycle anchor even when a simulated
clock moves backward. A separate history anchor is required because history integrity must not
depend on Activity, and an absent project's own undone `project.add` cannot be pruned: recording a
later action requires that project to exist.

**Current decision**

`ProjectService.create` records `project.add` in the created project's exact actor history and
returns `{ project, operation }`. Undo removes the project and canonical page only when the
captured state is unchanged and no dependency refers to it; Redo recreates both with the same ids.
An absent project's Activity references are valid only when its workspace contains the creation
event and the last creation lifecycle event in document order is `project.creation_undone`; the
creation, Undo and Redo lifecycle events all keep that exact actor identity. The absent project's
history must belong to the actor named by `project.created` and retain the matching undone
`project.add`. A second actor's history, or one in another workspace, is an integrity failure, so
the same identity rule that scopes normal history reads also protects recovery at an absent id.

The preflight refuses any other actor's project history permanently and does so before writing
Activity; retirement moves the cursor but emits no Activity or live frame. Only the creator can read
the summary at the absent id. The project URL shows a creation recovery state with the normal
history controls, and a landed Undo or Redo frame reloads workspace context once for that history
revision. Creation results use `{ project, operation }` through HTTP and MCP. The transition retry
cache stays retired.

**Amended, 2026-09-23 — timestamps on creation Redo.** Redo preserves both records' ids and original
`createdAt` values, but stamps `updatedAt` with the current clock time because reapplying creation is
a new write. This resolves the original §26 wording about “captured timestamps”; the specification
now distinguishes stable creation time from the mutation time, and domain tests assert both.

**Confidence**

High. Integrity fixtures cover the valid anchors, missing anchors, clock reversal and unrelated
references; domain tests cover each Undo preflight and its write ordering; HTTP, both MCP transports
and the browser exercise same-id Redo and creator-only recovery.

**Revisit when**

The product adds project deletion outside creation Undo, changes Activity ordering/removal, or
allows a history to be pruned while its project is absent; or real use shows that the recovery URL
or summary is insufficient to reach the creator's Redo.
