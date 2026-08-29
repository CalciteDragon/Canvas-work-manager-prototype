# Why `workspace.read` needed a service of its own

**Question**

`docs/decisions/2026-08-permissions-live-on-the-actor.md` left this open: is `workspace.read`
comfortable as a superset grant once §54's tools hold it for real? Slice 14 builds
`search_workspace` and `get_upcoming_work`, the first two callers that hold it — so how are
they implemented, and what does that show?

**Options tested**

- *Compose the checked services inside the tool* — `ProjectService.list` + `TaskService.list`.
  Rejected: `ProjectService.list` asserts `projects.read` and `TaskService.list` asserts
  `tasks.read`, so both tools would demand three grants where §53's grid offers one. A
  connection granted exactly `workspace.read` — the grant `packages/contracts/src/agent.ts`
  says backs these tools — could call **none** of the three workspace tools.
- *Give the services an unchecked internal variant.* Rejected: an unchecked public path is a
  hole waiting for a later caller to find, which is why `ActivityService.list` re-asserts
  rather than exposing one.
- *A `WorkspaceService` asserting `workspace.read` and reading the repositories.* Adopted.
  `DashboardService` had already settled this exact shape in Slice 11 — same repositories,
  same single `assertPermitted(actor, 'workspace.read')`.

**What we learned**

The minimal-grant test is what makes this provable rather than asserted. `contract.test.ts`
calls every tool with a grant of **exactly `[tool.permission]`** and nothing else. A
"sufficient grant" would have paired with the denial case to prove each permission
*necessary* and never *sufficient* — and the composed-services design would have passed both
halves of that weaker test while being unusable in practice.

Two implementation notes worth keeping:

- **Scoping is two steps for tasks and reflections.** They carry no `workspaceId` and their
  queries have no such filter, so the actor's visible projects are resolved first and
  everything else intersected against them — the same shape `TaskService.list` and
  `DashboardService.load` use. A one-step filter type-checks and silently leaks.
- **Reflection text matching lives in the service, not the repository.** This departs from
  `2026-08-repository-query-semantics.md` knowingly: `ReflectionQuery` has no `search` member
  and `JsonReflectionRepository` implements no text filter, so honouring the rule would mean
  changing contracts, repositories and their tests for one caller. Projects and tasks still
  match through the repository. Slice 21 owns search as a feature and should resolve the
  inconsistency in one direction or the other.

**The finding this produces — and it is the interesting output of the slice.**
`search_workspace` searches reflections, because §40 lists them and they exist. So a
connection holding only `workspace.read` can now search a person's written reflections. Two
halves, and the second is the sharper one:

1. **What leaks is not the text.** `SearchHitSchema` carries no body, so the connection gets
   a title and a *substring oracle* — it can confirm a phrase appears in a reflection without
   reading it. That is a smaller leak than "reads reflections" and a stranger one.
2. **What it gets is a dead end.** No tool in the registry takes a reflection id at all —
   §54's only reflection read is `list_reflections`, by *project* — and that one requires
   `reflections.read`. So the connection is handed a hit it has no route to open, by either
   id or project.

The second is a design smell in the grant, not in the tool. `workspace.read` is now a partial
superset of three read permissions, and the dead end is what a partial superset feels like
from the inside.

**Current decision**

- `WorkspaceService` exists, with `search` and `upcomingWork`. Both assert `workspace.read`
  alone; a test asserts that an agent holding only that grant succeeds.
- `search_workspace` covers projects, tasks and reflections. **Milestones are excluded** —
  §40 lists them, but there is no milestone service until Slice 19. A deferral, not an
  omission.
- `get_upcoming_work` returns `{ overdue, upcoming }` over `days` calendar days **including
  today**, deliberately *not* the dashboard's split: §24's `upcoming` is disjoint from three
  other widgets and starts tomorrow so no task appears twice on one screen. An agent has no
  screen to keep tidy and does mean today. The two share `task-windows.ts`'s definition of
  *overdue*, and a test asserts they agree on it.
- The superset stands for now, labelled honestly in §53's grid as it already is.
- **`limit` is shared across kinds, round-robin, not applied to a kind-ordered list.**
  Review caught the latter: with the default limit of 20, a workspace with twenty matching
  projects would have returned no tasks and no reflections — from the one tool §40 justifies
  *because* the caller does not know which kind holds the answer. Taking turns means a limit
  reached is a limit shared. There is still no ranking within a kind (title, then id).
- **`SearchHit.title` is not `min(1)`.** `ReflectionSchema.title` is not either, so `''` is
  storable and `add_reflection` can create one — and a projection stricter than the record
  it projects would have failed the *whole* search result, poisoning every later search
  whose term matched that one row. A projection may narrow which fields it carries, never
  which values. Blank titles are omitted from the hit rather than emitted as `""`.

**Confidence**

High that the service is the right shape — the alternative is demonstrably unusable. Low on
`workspace.read` itself, and lower than before this slice: the dead end is new evidence that
one coarse grant backing three tools of different sensitivities is the wrong model.

**Revisit when**

Slice 15 puts a real MCP client in front of these tools. Watch whether an agent granted only
`workspace.read` searches, finds a reflection, and then fails to open it — if it does, the
answer is probably either to split the grant or to have `search_workspace` return only the
kinds the connection can actually fetch. Also Slice 21, which owns search and inherits the
reflection-matching inconsistency.
