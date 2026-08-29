# Where the agent permission model is enforced

**Question**

Slice 13's build list says "permission checks enforced in the domain/tool layer, not at the
transport." What does that mean concretely — where does the grant live, who checks it, and
what guards the connection records themselves?

**Options tested**

- *Check in the host route table.* Rejected: Slice 14's MCP tools and Slice 15's stdio
  transport would each need their own copy, and §60's in-process contract tests never touch
  a route. A rule enforced at three transports is a rule enforced nowhere.
- *Look the connection up inside every domain service.* Rejected: it would give `TaskService`
  an `AgentConnectionRepository` it has no other use for, and one call could then be judged
  against two different grants if the connection changed mid-request.
- *Carry the grant on `ActorContext`, check it in the service.* Adopted.
- *Add an `agents.write` permission to guard connection management.* Rejected — see below.

**What we learned**

Splitting the two questions makes both simple: **the caller asserts identity, the domain
asserts capability**. The host authenticates a token into an `ActorContext` carrying the
permission set; every public service method calls `assertPermitted(actor, permission)`. One
call is judged against one consistent grant, and the *authenticator* re-reads the connection
on every request, so §53's "changes take effect immediately" is true without the domain
knowing anything about tokens.

Two things only showed up once it was built:

- **Write paths look their own targets up.** `TaskService.complete` calls `get` for the task
  it is about to change. With the check on `get`, a grant of `tasks.write` alone was
  unusable — every write silently demanded `tasks.read` too. Each service now has a private,
  unchecked `require` for its own lookups; only reads a *caller* asked for are checked.
- **No permission can guard connection management.** Both plan reviewers found the same hole
  independently: an agent that could edit connections could grant itself the permission it
  had just been denied, or un-revoke itself. Adding `agents.write` only moves the hole one
  level up. So `AgentConnectionService` is **user-actors-only** (`assertUserActor`), and
  `AgentPermissionSchema` deliberately has no `agents.*` member.

**Current decision**

- The agent variant of `ActorContext` carries `permissions`. User and system actors are
  never permission-checked — a person in their own workspace holds no grant to check
  against, and workspace scoping is a separate rule every service already applies.
- One `assertPermitted` per public method. Reads → `*.read`, writes → `*.write`;
  `DashboardService.load` and `ActivityService.list` → `workspace.read`.
- Managing connections requires a user actor. Not a permission — the absence of one.
- `PermissionDeniedError` → **403 naming the missing permission**, distinct from the
  authenticator's **401**, which is deliberately identical for every cause so it is never an
  oracle about which tokens exist. The distinction is the product point: 401 means *this is
  not a connection*, 403 means *this connection was not given that*, and only the second is
  something a checkbox can fix.
- **`workspace.read` is a superset grant.** `DashboardResult` carries every open task's
  title, status, priority and due date, so an agent holding only `workspace.read` reads task
  content it has no `tasks.read` for. Requiring both would make `workspace.read` alone
  useless, and §54 pins it as what backs `get_dashboard_context`. So the grid **labels it
  honestly** — "Read workspace overview — includes task and project content in aggregate" —
  rather than implying it is narrower than it is.
- §53's mock shows five permission rows; the UI renders all **seven**. A grid that hid two
  grants a connection actually holds would be a permission UI that lies.

**Confidence**

High on the split and on user-actors-only — the escalation was real and is now covered by a
domain test and a route test. Medium on `workspace.read` being a superset: labelling is the
cheapest honest answer, but the right long-term shape may be for the dashboard tool to
require the read permissions for the content it actually returns.

**Revisit when**

Slice 14 builds §54's tools. `get_dashboard_context` and `search_workspace` are the first
callers that hold `workspace.read` for real, and they will show whether the superset grant
is comfortable or alarming. Also Slice 22, if §58's confirmations turn out to want a
per-action grant rather than a per-family one.
