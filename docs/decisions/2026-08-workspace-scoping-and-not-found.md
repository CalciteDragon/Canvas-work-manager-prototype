# Workspace scoping, and why a foreign id is 404 rather than 409

**Question**

§17's personas each own a workspace, and every seed contains all three. Slice 5 put the
first real reads and writes on top of that, so it had to decide where scoping is enforced,
what a caller sees when they name an entity in someone else's workspace, and what happens
to a query filter that names one.

**Options tested**

None in use. Considered:

- *Trust the caller's `ProjectQuery.workspaceId`.* Rejected during plan review, where it
  was found as a live hole: the field is caller-supplied and `JsonProjectRepository` filters
  on it, so merging the caller's query with the actor's would have served another persona's
  projects to a single curl.
- *Answer 403 or 409 for a foreign id.* Rejected: it confirms the id exists. 404 is
  indistinguishable from "no such thing", which is both safer and simpler for Slice 6's
  gateway to handle — one not-found path instead of two.
- *Return `[]` for a filter naming an invisible project.* Rejected for tasks: a typo'd or
  foreign `projectId` would render an empty task list that looks like a real empty list,
  which is the kind of bug that costs an afternoon.

**What we learned**

`Task` carries no workspace and `TaskQuery` no workspace filter, so task scoping cannot be
delegated to the repository the way project scoping can. `TaskService.list` resolves the
actor's projects and intersects. Cost is a clone of the projects and tasks arrays per list;
the largest seed has 4 projects and 8 tasks, so it is a non-issue at prototype scale and a
real one to revisit at MVP.

**Current decision**

- Every service read and write is scoped by `ActorContext.workspaceId`.
- `ProjectService.list` applies the actor's workspace **last**, overriding any
  caller-supplied `workspaceId` rather than merging with it.
- An entity in another workspace raises `EntityNotFoundError` → **404**, on `get`,
  `update`, `complete`, `archive` and as a create target.
- A create naming another workspace outright is a `DomainRuleError` → **409**; nothing is
  being looked up, so there is nothing to avoid confirming.
- An explicit `TaskQuery.projectId` or `parentTaskId` that does not resolve for the actor
  raises **404** rather than answering `[]`.
- `ProjectQuery.parentProjectId` deliberately does *not* get that treatment — it answers
  `[]`. The workspace override already makes a leak impossible, and projects are what the
  sidebar lists on every load, so a 404 there is a worse failure mode than an empty list.
- The domain trusts the `{ workspaceId, userId }` pair it is handed. HTTP callers cannot
  forge it: `api/context.ts` derives the workspace from the resolved user.

**Confidence**

High on 404-over-409 and on the override — both are standard, and the override is covered
by a test that a merge would fail. Medium on the asymmetry between task and project
filters, which is a judgement call that will look arbitrary until a UI exercises both.

**Revisit when**

Slice 13, when MCP gives the domain an in-process caller that constructs its own
`ActorContext`. A mismatched pair is currently caught only at commit, by
`validateDocumentIntegrity`, as a 500. If that becomes reachable, a `UserRepository` moves
into the domain and `ActorContext` shrinks to a user id.
