<!-- completed-record id="14" closed="2026-08-29" summary="The transport-free tool registry with §54's fourteen tools and in-process contract tests" -->
# Slice 14 — Tool registry + in-process contract tests

> **Completed record — frozen at closeout.** Status **done**, closed **2026-08-29**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.

## Outcome

**Status:** done — plan:
[14-tool-registry-contract-tests.md](14-tool-registry-contract-tests.md)
— §54's fourteen tools exist as §55 definitions over the domain services, and a 70-test
suite proves every one of them on both its success and its permission-denied path with no
socket open.

**No MCP SDK in this slice**
([decision](../../decisions/2026-08-tool-registry-is-transport-free.md)). The *Build* bullet
below says "calling the SDK handler in-process"; what settled it was Slice 15's own *Build*,
which owns the SDK version, the protocol target and `createMcpHandler()` — the *Do not*
forbids only **starting an endpoint**, and an in-process handler starts nothing, so it does
not decide the question. Three obligations move to Slice 15 as a result and are listed
there: `tools/list` as a protocol response, agent revocation, and §60's handler path itself.
`SPEC_TOOL_NAMES` is exported so both slices assert one list.

**The registry declares permissions; the domain enforces them.** A second check in the
registry would be a second source of truth, and the first to drift would be the one no test
covered. `contract.test.ts` pins the two together from both sides — and the load-bearing
half is that **success is asserted under `[tool.permission]` alone**. A "sufficient" grant
would prove each permission *necessary* and never *sufficient*, and would have passed a
design that was unusable in practice: composing the checked services inside
`search_workspace` makes it demand three grants where §53's grid offers one. Hence
**`WorkspaceService`** ([entry](../../decisions/2026-08-workspace-tools-need-their-own-service.md)),
which asserts `workspace.read` alone and reads the repositories as `DashboardService`
already did. All fourteen tools pass under their minimal grant.

That entry closes the "revisit when" Slice 13 left open, and the answer is uncomfortable:
`workspace.read` got **wider**. `search_workspace` covers reflections (§40 lists them), so
the grant is now a partial superset of three read permissions — and it produces a **dead
end**, handing an agent reflection hits it cannot open — no tool takes a reflection id at all, and `list_reflections` on the hit's project needs `reflections.read`. What leaks
is a substring oracle and a title rather than the text, which is a smaller and stranger leak
than expected. Recorded rather than designed around; Slice 15 is where a real client shows
whether it matters.

`task-windows.ts` ended a duplication rather than adding a third copy: `DashboardService`
defined the open-status set once and spelled the overdue condition out again a few lines
below its own helper. Both now share one definition, plus the dashboard row projection
`get_upcoming_work` reuses whole. Two things the build showed that the plan had not:
`complete_task` pointed at the seed's already-done task would have passed a "the entity is
there afterwards" assertion **having done nothing**, because completion is idempotent — so
the contract table pins inputs that genuinely change; and the `agent-heavy` seed has no
foreign-workspace project at all, so the harness injects one, or "a foreign id is not found,
not forbidden" would have silently tested the missing-id branch instead.

The **diff** review then found three things the tests as written did not: a reflection with
an empty-string title would have made `search_workspace` throw *permanently* — the hit
schema was stricter than the record it projects, so one blank title poisons every later
search matching that row; `limit` applied to a kind-ordered list could starve a whole kind,
which is the opposite of why §40 wants one combined search; and two tests were weaker than
their names — "orders deterministically" passed against no sort at all, and the archived
case archived the project, so it could not tell the two exclusion rules apart. All fixed and
pinned. The regex import lint was also replaced: review showed three bypasses, so
`packages/domain`'s AST allowlist walker moved to `scripts/check-package-imports.mjs`, took
`--allow`/`--label`, and now guards both packages from `lint`.

**Deferred:** no milestone search — §40 lists milestones and Slice 19 owns them; and
reflection text matching sits in the service rather than the repository, because
`ReflectionQuery` has no `search` member and adding one would change three files for one
caller (Slice 21's to resolve).

## Slice definition

**Goal:** Tool semantics exist independently of MCP plumbing, and are tested without
opening a socket.

**Spec:** §54, §55, §60, §69

**Build**

- `packages/mcp-tools`: the `WorkManagerTool` interface (§55) — name, description,
  required permission, Zod input schema, `execute(input, context)`.
- The §54 tool set:
  - Projects: `list_projects`, `get_project`, `create_project`, `update_project`
  - Tasks: `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`
  - Reflections: `list_reflections`, `add_reflection`
  - Workspace: `search_workspace`, `get_upcoming_work`, `get_dashboard_context`
- Every tool calls domain services — never repositories directly.
- Contract tests calling the SDK handler in-process (§60): `tools/list`, input
  schemas, results, permission denials, errors, activity logging, revocation.
  **Built without the SDK** — input schemas, results, permission denials, errors and
  activity logging are covered against the registry directly; `tools/list`, revocation and
  §60's handler path are Slice 15's, and are listed there.

**Done when** contract tests cover every tool's success and permission-denied paths
and run without a listening port.

**Do not** start the HTTP endpoint yet — keeping the registry transport-free is the
point of this slice.

---

## Implementation plan — Slice 14 — Tool registry + in-process contract tests

### Goal

§54's fourteen tools exist as transport-free definitions calling domain services, and a
contract suite proves every one of them on both its success and its permission-denied path
without opening a socket.

### Spec sections

§54 (the initial tool set), §55 (the `WorkManagerTool` registry), §60 (MCP tests without a
running server — its *intent*, no listening port, is met here; its SDK-handler path is
Slice 15's, see below), §69 (what an MCP contract test covers), §40 (what search covers),
and — because they are what the workspace tools have to hold — §51/§53's permission model
as Slice 13 built it.

### Acceptance check

The slice's *Done when* is **"contract tests cover every tool's success and
permission-denied paths and run without a listening port."** Made concrete:

1. `pnpm --filter @cwm/mcp-tools test` passes. "Without a listening port" is checked, not
   asserted in prose: `grep -rn "listen(\|createServer\|node:http\|node:net" packages/mcp-tools/src packages/mcp-tools/test`
   returns nothing, and `import-lint.test.ts` (below) fails the suite if it ever would.
2. `contract.test.ts` is **table-driven off the registry itself**, not off a hand-written
   list. It iterates `registry.list()` and fails if any tool has no entry in the case table
   — so adding a fifteenth tool without a contract case is a red test, not a silent gap.
3. For each of the fourteen tools the table asserts:
   - **success under the minimal grant** — the call is made with a grant of *exactly*
     `[tool.permission]` and nothing else. This is the half that proves the declared
     permission is **sufficient**. A "sufficient grant" would not: a tool whose service also
     asserts a second permission would pass both halves of the table, which is precisely the
     failure the `WorkspaceService` below exists to prevent. The domain makes the minimal
     grant workable on purpose — every service's own lookups go through a private unchecked
     `require` (`task-service.ts:51`, `project-service.ts:51`).
   - **permission denied** — the same call with a grant of *everything except* the tool's
     declared `permission` throws `PermissionDeniedError` whose `.permission` equals that
     declared permission. This half proves it is **necessary**, and together the two pin the
     registry's declaration to what the domain actually enforces.
   - the **eight reads** leave `store.persistCalls` at zero; the **six writes** leave the
     **changed value** readable from the store afterwards — not merely the entity. Presence
     alone is vacuous for two of them: `TaskService.complete` returns early on an
     already-done task and `commit` short-circuits a no-op update (`task-service.ts:163`,
     `:192`), so a table that pointed `complete_task` at `task-agent-deployment` would pass
     having done nothing. `complete_task` runs against `task-agent-schema`; `update_task`
     changes a field to a value the fixture does not already hold.
   - **a fresh harness per case** (`beforeEach`). `persistCalls` is a running counter and
     the write cases leave entities behind, so a shared store would make the read
     assertions order-dependent.
4. `registry.test.ts` asserts the §54 tool set exactly — fourteen names, no more, no fewer —
   and that every tool's `inputSchema` survives `z.toJSONSchema` (Slice 15 needs that
   conversion, and a schema that cannot convert is a defect to find now, not then).
5. `errors.test.ts` asserts an unknown tool name, an input that fails its schema, a
   not-found id, a *foreign-workspace* id, and a rule violation each raise the right error.
6. `activity.test.ts` asserts that each of the **six** mutating tools records an activity
   event with `actor: "agent"` and the calling connection's id (§57, §69).

Run once, end to end: `pnpm test` and `pnpm lint` at the root stay green.

### The one question this plan had to answer

**Does Slice 14's contract suite go through the MCP SDK handler?**

The slice's *Build* says "contract tests calling the SDK handler in-process (§60)", and its
*Do not* says "do not start the HTTP endpoint yet — keeping the registry transport-free is
the point of this slice".

The *Do not* alone does **not** settle it — an in-process SDK handler starts no endpoint.
What settles it is Slice 15's *Build*, which explicitly owns "Official MCP TypeScript SDK
**v2**, protocol target **2026-07-28**" and `createMcpHandler()`. The SDK is not a workspace
dependency today (`@modelcontextprotocol/sdk` appears in `pnpm-lock.yaml` only as Angular
CLI's transitive dep, at v1.30.0). Adopting it here would mean choosing a major version, a
protocol constant and a handler factory inside the slice whose stated point is that none of
that exists yet — and Slice 14's *Done when* is satisfiable without any of it.

**Resolved: no SDK in this slice.** The contract suite calls `registry.call(name, input,
actor)` directly, and a `SPEC_TOOL_NAMES` export gives Slice 15 the seam to assert a real
`tools/list` response against the same list. Recorded in
`docs/decisions/2026-08-tool-registry-is-transport-free.md`.

Three obligations are therefore **deferred to Slice 15, not covered here**, and all three
are written into Slice 15's `development.md` entry as part of this change — otherwise
marking Slice 14 `done` beside a *Build* bullet reading "contract tests calling the SDK
handler in-process (§60)" would leave aspirational documentation standing (AGENTS.md §2
rule 6). The deferral is noted against that bullet too.

- **`tools/list`** — this slice asserts the registry's *name set*; the protocol response is
  the handler's, and the handler is Slice 15's.
- **agent revocation** — revocation is an authenticate-time refusal. The authenticator never
  mints an `ActorContext` for a revoked connection
  (`prototype-agent-authenticator.ts:73`), so there is nothing a registry-level test can
  observe that `prototype-agent-authenticator.test.ts` does not already prove. Slice 15 is
  where a token and a handler meet for the first time.
- **§60's in-process SDK-handler path** — the whole point of which is to test *the handler*
  without a socket. There is no handler yet.

### File-level change list

#### `packages/contracts`

| File | Change |
|---|---|
| `src/workspace.ts` (new) | Five schemas, all named here so the list reads as a checklist: **`SearchWorkspaceQuerySchema`** `{ query: string.min(1), limit?: int 1–50 (default 20) }`; **`SearchHitKindSchema`** = `z.enum(['project','task','reflection'])`; **`SearchHitSchema`** `{ kind, id, title?, projectId?, projectName?, status?, dueAt? }`; **`SearchWorkspaceResultSchema`** `{ query, hits: SearchHit[] }`; **`UpcomingWorkQuerySchema`** `{ days?: int 1–90 (default 7), limit?: int 1–200 (default 50) }`; **`UpcomingWorkResultSchema`** `{ days, throughDate, overdue: DashboardTask[], upcoming: DashboardTask[] }`. |
| `src/index.ts` | Export `./workspace`. |
| `src/workspace.test.ts` (new) | Schema tests in the package's existing idiom: defaults apply, bounds reject, `kind` is closed. |

Three things about `SearchHitSchema` a reader would otherwise have to guess:

- **`title` is optional.** `ReflectionSchema.title` is optional (`reflection.ts:13`), so a
  body-only reflection has none. A required `title` would ship green — `agent-heavy`'s one
  reflection is titled — and fail on the first untitled one. There is a test for it.
- **`status` is `z.union([ProjectStatusSchema, TaskStatusSchema])`**, not `z.string()`. A
  bare string would be a third status vocabulary, which is the drift §11 exists to stop.
  Reflections have no status and omit it.
- **`projectId`/`projectName` are omitted on a `kind: 'project'` hit** — its own id is `id`
  and its own name is `title`, and repeating them would make a hit disagree with itself.

**One flat `hits` array**, not three typed ones: §40 describes *global* search, and an agent
asking "what do we have on retries?" does not know which entity type holds the answer.

**`UpcomingWorkResultSchema` reuses `DashboardTaskSchema`** (`dashboard.ts:47`) rather than
declaring an `UpcomingTask`. That schema is already exactly the projection this tool wants —
id, title, project id/name/icon, status, priority, `dueAt`, `completedAt`, `overdue` — and a
second near-identical row type is the drift §11 exists to stop.

No change to `AgentPermissionSchema`. §54's fourteen tools map onto the seven grants that
already exist.

#### `packages/domain`

| File | Change |
|---|---|
| `src/task-windows.ts` (new, ~10 lines) | `OPEN_STATUSES` and `isOverdue(task, nowMs)`, extracted from `dashboard-service.ts:48` (the set) and `:96` (the expression, currently inline inside `row`). Two independent definitions of "overdue" would drift, and §69 lists "upcoming-work calculation" as **one** domain behaviour. |
| `src/dashboard-service.ts` | Imports both instead of defining them — **including the second, separately-written overdue predicate at `:103`**, which today duplicates `:96`'s condition inside the `overdue` filter. Leaving that one alone would meet half the rationale. No behaviour change; the existing dashboard tests are the regression check. |
| `src/workspace-service.ts` (new) | `WorkspaceService.search(actor, query)` and `.upcomingWork(actor, query)`. Both assert **`workspace.read` only**. Deps: `{ projects, tasks, reflections, clock }`. |
| `src/workspace-service.test.ts` (new) | See test plan. |
| `src/index.ts` | Export `WorkspaceService` and `task-windows`. |
| `test/test-support.ts` | `buildHarness` gains `workspaceService`. |

**How `WorkspaceService` scopes.** Projects by `workspaceId` on the repository query.
**Tasks and reflections carry no workspace and their queries have no `workspaceId` filter**
(`inputs.ts:127`, `:116`) — so, exactly as `DashboardService.load` does
(`dashboard-service.ts:74-81`), it resolves the actor's projects first and intersects on
`projectId`. Anything else type-checks and silently leaks.

**Why a new service rather than composing the checked ones.** `search_workspace` and
`get_upcoming_work` are backed by `workspace.read` (`contracts/src/agent.ts:7-9`). Composing
`ProjectService.list` + `TaskService.list` inside the tool would make both tools demand
`projects.read` *and* `tasks.read` as well, so a connection granted `workspace.read` alone —
the exact grant §53's grid offers — could call none of the three workspace tools.
`DashboardService` is the precedent: same repositories, same single
`assertPermitted(actor, 'workspace.read')` (`dashboard-service.ts:62`). It is not reducible
to `DashboardService.load`, which drags in `AIProvider` and `ActivityService`. Slice 13's
decision entry named these two tools as the thing that would test the superset grant; this
closes its "revisit when".

**How `upcomingWork` defines its window.** Stated here because it must not be copied from
`DashboardService`, whose `upcoming` is deliberately *disjoint* from `overdue`, `dueToday`
and `inProgress` (`dashboard-service.ts:104-129`) and starts at tomorrow. A two-bucket
result cannot equal that, and copying the expression would silently drop today's work.

- `overdue` = open ∧ `isOverdue(task, nowMs)`.
- `upcoming` = open ∧ not overdue ∧ `dueAt` present ∧ `dueAt < throughMs + DAY_MS` —
  **today included**, which is what an agent asking "what is coming up?" means.
- `throughMs = todayStart + (days - 1) * DAY_MS`, so `days: 7` spans seven calendar days
  including today. Same width as `DashboardService`'s `recentDays` going backwards
  (`dashboard-service.ts:131`). `throughDate = isoDayOf(throughMs)`.
- `limit` applies to each bucket after sorting by `dueAt`.

**What `search` covers.** §40 lists projects, tasks, milestones and reflections. This slice
does **projects, tasks and reflections**; milestones are Slice 19 and have no service yet.
Reflections are in because they exist and leaving them out would be arbitrary.

Matching for projects and tasks uses the repository query, whose semantics are already
settled (`docs/decisions/2026-08-repository-query-semantics.md`: trimmed, case-insensitive
substring over name/title and description). **Reflections are filtered in the service**,
because `ReflectionQuerySchema` has no `search` member (`inputs.ts:117`) and
`JsonReflectionRepository` implements no text filter — adding one would touch
`packages/contracts`, `packages/repositories` and its tests, three files this slice declares
untouched, for one caller. The inconsistency is deliberate and belongs to Slice 21, which
owns search as a feature; it is named in the decision entry rather than left to be
discovered.

**The finding this produces.** A connection holding only `workspace.read` can now search
reflections. `SearchHitSchema` carries no body, so what leaks is not the text — it is a
**substring oracle plus the title**. The sharper half is the dead end: the same connection
gets reflection ids it then cannot fetch, because `list_reflections` requires
`reflections.read`. Both halves go in the decision entry; neither is designed around, because
the standing question from `2026-08-permissions-live-on-the-actor.md` is answered better by
a real example than by making the example smaller.

No other domain change. Every other tool calls a service method that already exists.

#### `packages/mcp-tools`

The Slice 1 placeholder (`MCP_TOOLS_PACKAGE`) is deleted.

| File | Responsibility |
|---|---|
| `package.json` | Deps `@cwm/contracts`, `@cwm/domain`, `zod`; dev deps `@cwm/repositories`, `@cwm/prototype-data`, `@types/node`, `vitest`, `typescript`. Add `"test": "vitest run"`. |
| `tsconfig.json` | Include `test/**/*.ts`; `types: ["node"]`. |
| `src/tool.ts` | §55's interface, generic in its schema: `WorkManagerTool<TSchema extends ZodType = ZodType>` with `name`, `description`, `permission: AgentPermission`, `inputSchema: TSchema`, and **`execute(input: z.output<TSchema>, context)`** — parsed input, not `unknown`, because the registry parses before delegating; a tool re-parsing its own input would be the second validation §11 exists to prevent. **`context` is `{ actor: ActorContext; services: WorkManagerServices }`**. `WorkManagerServices` is the bundle of domain services a tool may reach: `projects`, `tasks`, `reflections`, `dashboard`, `workspace`. No repository, no store, no clock, no `Persistence`. |
| `src/errors.ts` | `UnknownToolError extends Error` with `readonly name: string`. **Not** `EntityNotFoundError` — that error means "an id that does not resolve *for this actor*" and is deliberately indistinguishable from a foreign id (`domain/src/errors.ts:6-18`); a tool name is registry metadata, `tools/list` is unfiltered, and nothing is being hidden. Slice 15 maps it to MCP's own unknown-tool response. |
| `src/registry.ts` | `createToolRegistry(services): ToolRegistry` with `list()`, `find(name)`, `call(name, input, actor)`. Services are closed over at construction; the actor is per call. `call` looks the tool up (unknown → `UnknownToolError`), parses the input with the tool's schema (a `ZodError` propagates unchanged), and delegates. **No permission check here** — see Boundaries. |
| `src/tools/projects.ts` | `list_projects`, `get_project`, `create_project`, `update_project`. |
| `src/tools/tasks.ts` | `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`. |
| `src/tools/reflections.ts` | `list_reflections`, `add_reflection`. |
| `src/tools/workspace.ts` | `search_workspace`, `get_upcoming_work`, `get_dashboard_context`. |
| `src/index.ts` | The interface, the registry factory, `UnknownToolError`, and `SPEC_TOOL_NAMES` — §54's list as a `readonly string[]`, asserted by this slice's `registry.test.ts` and by Slice 15's `tools/list` test. |
| `test/harness.ts` | `CountingDataStore` (copied — ~10 lines, and `errors.test.ts` needs `persistCalls`), the repository/service wiring, `createToolRegistry`, and `agent(permissions)` / `user()` actor helpers — `agent` names **`agent-claude`**, because `activity.test.ts` asserts `actorName: "Claude"` and that resolves through the connection record (`seeds.ts:507`). Built from `buildSeed('agent-heavy')` **plus one project inserted into a second persona's workspace**, because every seed project is hard-coded to the demo workspace (`seeds.ts:37-53`) and a merely-empty foreign workspace proves nothing (the lesson `domain/test/test-support.ts:60-64` records). |
| `src/registry.test.ts` | The §54 set, uniqueness, descriptions, JSON-schema convertibility, declared permissions. |
| `src/import-lint.test.ts` | Reads every file under `src/` except `*.test.ts` and fails if any **import or export specifier** — matched as `from '…'`, `import '…'`, `import('…')`, not as free text — names `@cwm/repositories`, `@cwm/prototype-data`, or a node builtin (prefixed or bare). Text matching would false-positive on `tool.ts`'s own doc comment, which says "no repository, no store, no clock". ~20 lines. The harness legitimately dev-depends on repositories, so a package-level ban cannot work — and "MCP tools call domain services, never repositories" is this slice's central claim, which the domain enforces mechanically rather than by inspection (`domain/src/import-lint.test.ts`). |
| `src/contract.test.ts` | The table-driven minimal-grant / denied suite (acceptance items 2–3). |
| `src/errors.test.ts` | Unknown tool, invalid input, unknown id, foreign id, rule violation. |
| `src/activity.test.ts` | §57 events from the six mutating tools. |

**§55's `AgentContext` is `ActorContext`.** No such type exists in the repository; the domain's
is `ActorContext` (`domain/src/actor.ts:12`), and §11 forbids a second definition of a shape.
The spec snippet is corrected in the same change (AGENTS.md §2 rule 5), with the rename noted
in the decision entry.

#### Tool-by-tool mapping

Reads: 8. Writes: 6.

| Tool | Permission | Calls | Input |
|---|---|---|---|
| `list_projects` | `projects.read` | `ProjectService.list` | `ProjectQuerySchema.omit({ workspaceId })` — the service overrides it with the actor's workspace anyway (`project-service.ts:61-64`) |
| `get_project` | `projects.read` | `ProjectService.get` | `z.object({ projectId: ProjectIdSchema })` |
| `create_project` | `projects.write` | `ProjectService.create` | `CreateProjectInputSchema.omit({ workspaceId })`; **executes `create(actor, { ...input, workspaceId: actor.workspaceId })`** — the field is required and the service rejects a foreign one (`project-service.ts:66-71`), so the tool injects it. An agent has no way to know its own workspace id, and no business naming another. |
| `update_project` | `projects.write` | `ProjectService.update` | `UpdateProjectInputSchema.extend({ projectId: ProjectIdSchema })`; unwraps `projectId` |
| `list_tasks` | `tasks.read` | `TaskService.list` | `TaskQuerySchema` unchanged — it has no `workspaceId` |
| `get_task` | `tasks.read` | `TaskService.get` | `z.object({ taskId: TaskIdSchema })` |
| `create_task` | `tasks.write` | `TaskService.create` | `CreateTaskInputSchema` |
| `update_task` | `tasks.write` | `TaskService.update` | `UpdateTaskInputSchema.extend({ taskId: TaskIdSchema })`; unwraps `taskId` |
| `complete_task` | `tasks.write` | `TaskService.complete` | `z.object({ taskId: TaskIdSchema })` |
| `list_reflections` | `reflections.read` | `ReflectionService.list` | `z.object({ projectId: ProjectIdSchema })`; **unwraps to the bare `projectId`** the service takes (`reflection-service.ts:29`) |
| `add_reflection` | `reflections.write` | `ReflectionService.create` | `CreateReflectionInputSchema` |
| `search_workspace` | `workspace.read` | `WorkspaceService.search` | `SearchWorkspaceQuerySchema` |
| `get_upcoming_work` | `workspace.read` | `WorkspaceService.upcomingWork` | `UpcomingWorkQuerySchema` |
| `get_dashboard_context` | `workspace.read` | `DashboardService.load` | `DashboardQuerySchema` — passed through; the service takes `unknown` and re-parses (`dashboard-service.ts:58`), and both members default, so `{}` is valid |

No id format is re-declared: `ProjectIdSchema` / `TaskIdSchema` come from `@cwm/contracts`.
The five composite inputs are `.omit`/`.extend`ed from the contracts schemas; the four
single-id inputs are one-line objects over the contracts' own id schemas.

#### Living documentation

| File | Change |
|---|---|
| `development.md` | Slice 14 → `done`, with the summary note the other slices carry, and the §60 deferral noted against its own *Build* bullet. **Slice 15's entry gains the three inherited obligations** — the real `tools/list` response, the revocation contract test, and §60's in-process SDK-handler path — so marking Slice 14 done never claims §69 coverage the repo does not have. |
| `docs/decisions/2026-08-tool-registry-is-transport-free.md` (new) | The SDK question; `tools/list` unfiltered by grant; both §55 divergences (`AgentContext` → `ActorContext`, and `execute` receiving parsed input rather than `unknown`). |
| `docs/decisions/2026-08-workspace-tools-need-their-own-service.md` (new) | Why `WorkspaceService` exists; why reflection search is filtered in the service rather than the repository; and the two-part `workspace.read` finding — the substring oracle, and the dead end where an agent gets reflection ids it cannot fetch. Closes the "revisit when" of `2026-08-permissions-live-on-the-actor.md`. |
| `docs/decisions/2026-08-permissions-live-on-the-actor.md` | Append a pointer to the new entry — the superset-grant question it left open is now answered, and widened. |
| The spec, §55 | `AgentContext` → `ActorContext`, and `input: unknown` → parsed input, per AGENTS.md §2 rule 5. |
| `README.md` | `:26` currently reads "The MCP server does not exist yet". Still true; it gains a clause — the §54 tool definitions now exist and are tested, but nothing serves them until Slice 15. |
| `.prototype/notes.json` | This slice has **no runnable surface** — no UI, and by its own non-goal no transport — so AGENTS.md §3 step 4's "use the feature" is done by driving the registry against the real `.prototype/data.json` from a throwaway script (see Step 4 below), not by clicking. Any friction that surfaces is noted; if none does, that is stated in the final summary rather than left implied. |

### Test plan

Written first, in this order.

#### `packages/contracts/src/workspace.test.ts`

Defaults apply on `{}`; `limit: 0` and `days: 91` reject; `kind` rejects an unknown value;
`SearchWorkspaceResultSchema` accepts a hit of each of the three kinds, **including one with
no `title`**; `status` accepts a project status and a task status and rejects a free string.

#### `packages/domain/src/workspace-service.test.ts`

| Test | Proves |
|---|---|
| `search matches projects by name, tasks by title, and reflections by body` | All three kinds populate; §40. |
| `search returns an untitled reflection as a hit with no title` | `SearchHitSchema.title` is optional for a reason (`reflection.ts:13`). |
| `search is case-insensitive and matches description substrings` | The repository's settled text semantics. |
| `search excludes archived projects and archived tasks` | Filed-away work is not workspace content. |
| `search never returns another workspace's project, task or reflection` | Scoping through the project intersection, against `twoPersonaDocument`'s real foreign workspace. |
| `search honours limit and orders deterministically` | A capped result is reproducible. |
| `search requires workspace.read and nothing else` | An agent holding **only** `workspace.read` succeeds — the whole reason this service exists. |
| `search denies an agent without workspace.read` | `PermissionDeniedError('workspace.read')`. |
| `upcomingWork splits overdue from upcoming against the injected clock` | §45 — moving the clock moves the split. |
| `upcomingWork's overdue set is identical to DashboardService's today.overdue` | The shared `task-windows.ts` helper is actually shared. Narrowed deliberately to `overdue`: the two `upcoming` buckets are **not** meant to agree — the dashboard's is disjoint from three other widgets and starts tomorrow, this one includes today — and asserting they match would pin a coincidence. |
| `upcomingWork includes a task due today and excludes one past the window's last day` | The window is `days` calendar days including today, not a copy of the dashboard's. |
| `upcomingWork honours days and excludes done, archived and foreign tasks` | The window means what it says. |
| `upcomingWork requires workspace.read` / `denies without it` | As above. |

#### `packages/mcp-tools/src/registry.test.ts`

| Test | Proves |
|---|---|
| `registers exactly §54's fourteen tools` | Asserted against `SPEC_TOOL_NAMES`, both directions. |
| `every tool has a unique name and a non-empty description` | §55's definition is complete enough for `tools/list`. |
| `every tool's inputSchema converts to JSON Schema` | Slice 15's transport can publish them. |
| `every declared permission is a member of AgentPermissionSchema` | No invented grant. |
| `find returns undefined for an unknown name` | |

#### `packages/mcp-tools/src/import-lint.test.ts`

`src/**` (excluding tests) mentions no repository, no seed package, no node builtin.

#### `packages/mcp-tools/src/contract.test.ts`

One `describe.each` over `registry.list()`, with a case table keyed by tool name providing
`input`, `mutates: boolean`, and an `expect` callback. A fresh harness per case in
`beforeEach`. Three assertions per tool: success under `[tool.permission]` alone;
`persistCalls` unchanged for reads / the **changed value** readable for writes; and denial
under `ALL_PERMISSIONS` minus the declared one. A tool present in `registry.list()` but
missing from the table fails the suite.

#### `packages/mcp-tools/src/errors.test.ts`

| Test | Proves |
|---|---|
| `an unknown tool name raises UnknownToolError` | |
| `an input that fails the schema raises ZodError before any service is called` | Asserted by `store.persistCalls` staying at zero. |
| `a well-formed input naming a missing task raises EntityNotFoundError` | |
| `a well-formed input naming another workspace's project raises EntityNotFoundError, not PermissionDeniedError` | Slice 13's "a 409 would confirm a foreign id exists" survives the tool layer. Needs the harness's injected foreign project. |
| `a domain rule violation surfaces as DomainRuleError` | `create_task` with a `parentTaskId` in another project (`task-service.ts:83-86`). |

#### `packages/mcp-tools/src/activity.test.ts`

For each of `create_project`, `update_project`, `create_task`, `update_task`,
`complete_task`, `add_reflection`: the newest entry from `ActivityService.list` — read back
with the harness's **`user()`** actor, since `list` asserts `workspace.read`
(`activity-service.ts:101`) — has `actor: "agent"`, `actorName: "Claude"`, the right
`action`, and the entity's id. `complete_task` runs against `task-agent-schema`, not the
already-done `task-agent-deployment`, because completing a done task is idempotent and
records nothing (`task-service.ts:157-170`).

### Boundaries touched

- **MCP tools call domain services, never repositories.** `WorkManagerServices` carries only
  services, and `import-lint.test.ts` enforces it mechanically rather than by inspection.
- **Domain services know no transport.** `WorkspaceService` imports `@cwm/contracts` and the
  repository *interfaces* only; `check-domain-imports.mjs`'s allowlist covers a new file in
  `packages/domain/src` with no edit.
- **Contracts defined once.** The two new result shapes live in `packages/contracts` and
  reuse `DashboardTaskSchema`; every tool input is composed from contracts schemas.
- **No `new Date()` in domain code.** `WorkspaceService` takes `Clock`;
  `check-no-direct-date.mjs` scans all of `packages/domain/src` by default.
- **Query semantics belong to the repository.** `docs/decisions/2026-08-repository-query-semantics.md`
  says so, and this plan puts `limit` and ordering in `WorkspaceService` instead. That is the
  same considered exception `ActivityService.list` already makes
  (`activity-service.ts:106,124`): a limit pushed into the repository truncates *before*
  workspace scoping, so it would silently return fewer rows than asked for. Project and task
  text matching is left to the repository query where it already lives; reflection text
  matching is the one place this plan knowingly departs, for the reason given above.
- **Permission checks live in the domain, not the transport or the registry.** The registry
  *declares* each tool's permission for `tools/list` and for humans, and `contract.test.ts`
  pins the declaration to what the service enforces from both sides — but the throw comes
  from `assertPermitted` inside the service, exactly as it does for the web API. A second
  check in the registry would be a second source of truth, and the first to drift would be
  the one nobody tested.

### Explicit non-goals

- **No HTTP endpoint, no stdio entry, no SDK dependency, no `createMcpHandler`.** Slice 15,
  along with the real `tools/list` response and the revocation contract test.
- **No milestone search.** §40 lists milestones; there is no milestone service and Slice 19
  owns them. Named in the decision entry so it is a deferral, not an omission.
- **No tool-variant experiments (§56).** `complete_task` and `update_task` both exist because
  §54 lists both; measuring which agents use more reliably is Slice 24.
- **No confirmation layer (§58).** Slice 22. **No live updates (§62).** Slice 16.
- **No section, milestone, timeline, progress or agent-connection tools.** §54 lists fourteen,
  and connection tools would re-open the escalation Slice 13 closed.
- **No `tools/list` filtering by grant.** A tool an agent may not call is still a tool it
  should see and be told it lacks the permission for — the 403 names the missing permission
  precisely so it can be asked for. Recorded as a decision.
- **No ranking in `search_workspace`.** §40 sketches one; the hits are ordered
  deterministically (kind, then title) and nothing more. Slice 21 owns search as a feature.
- **No changes to `apps/web` or `apps/prototype-host`.** Nothing serves a tool yet.

### Open questions

None blocking. Two things this slice is expected to surface for later, both to be written
into the decision entry with whatever the build actually shows:

1. Whether `workspace.read` is still comfortable as a superset grant now that three real
   tools hold it *and* it reaches reflection bodies. The standing question from
   `2026-08-permissions-live-on-the-actor.md`, now sharper.
2. Whether `search_workspace`'s flat projection is the right shape for an agent, or whether
   it should return whole entities. §56 says the prototype exists to answer that
   experimentally; Slice 24 is where it gets measured.

### Revisions

Two review subagents ran against the first draft — one on spec conformance, one on
boundaries and scope. They independently found the same three defects, which is the useful
signal: the read/write miscount, the missing foreign-workspace fixture, and the undefined
`context` type.

**Both reviewers, independently:**

- **`update_task` fell through both suites.** The draft said "five mutating tools" and "nine
  reads"; §54 has **six and eight**. `update_task` would have been asserted to persist
  nothing, and its §57 event never checked. Corrected throughout.
- **The foreign-workspace error case could not be written.** The draft seeded the harness
  from `agent-heavy`, whose every project is hard-coded to the demo workspace
  (`seeds.ts:37-53`) — so there was no foreign id to name, and the test would have exercised
  the missing-id branch instead. The harness now injects a second-persona project.
- **`execute`'s `context` was undefined** and contradicted the sentence beside it, which said
  services were the only thing a tool receives. Pinned to
  `{ actor: ActorContext; services: WorkManagerServices }`, with §55's `AgentContext` named
  as `ActorContext` and the spec snippet corrected in this change.

**Spec reviewer:**

- **The success half of the contract table proved nothing.** "A sufficient grant" pairs with
  the denial case to prove a permission is *necessary*, never *sufficient* — the exact
  failure `WorkspaceService` exists to prevent would have passed both halves. Success now
  runs under `[tool.permission]` alone.
- **`create_project` would have failed on every call.** `workspaceId` is required and the
  service rejects a mismatch; the draft omitted the field without saying the tool injects it.
- **`ReflectionService.list` takes a bare `projectId`**, not a query object. Noted as an
  unwrap in the table.
- **"Every input is `.omit`/`.extend`ed from a contracts schema" was false** for the four
  single-id tools. Restated honestly: no id *format* is re-declared.
- **The SDK argument rested on the wrong authority.** The *Do not* forbids starting an
  endpoint; an in-process handler starts nothing. Re-anchored on Slice 15's *Build*.
- **`tools/list` was being deferred silently** alongside revocation. Both are now written
  into Slice 15's `development.md` entry.

**Boundaries reviewer:**

- **The stated scoping mechanism does not exist for tasks.** `TaskQuery` has no
  `workspaceId` and `Task` carries none; scoping is a project intersection. A filter written
  as described would have type-checked and leaked.
- **`EntityNotFoundError('tool', name)` misused a domain error** whose whole point is that a
  foreign id is indistinguishable from a missing one. Replaced with a registry-local
  `UnknownToolError`.
- **The central boundary was left to inspection** while the package legitimately dev-depends
  on `@cwm/repositories`. Added `import-lint.test.ts`.
- **`UpcomingWorkResultSchema` re-declared `DashboardTaskSchema`.** Now reuses it.
- **`SearchHit` and `UpcomingTask` were referenced but never defined.** Both specified.
- **`upcomingWork` duplicated the overdue split** `DashboardService` owns. Extracted to
  `task-windows.ts`, with a test asserting the two agree.
- **The `limit`-in-the-service choice contradicted a standing decision** without citing the
  precedent that justifies it. Cited.
- **`.prototype/notes.json` and Step 4 were unaddressed.** Stated: no runnable surface, so
  the phase is exercised by driving the registry against the real data file.

#### Round 2

A third reviewer ran against the revised plan. It confirmed the round-1 fixes hold against
the code, and — the check worth having asked for — walked all fourteen tools to confirm
`[tool.permission]` alone is genuinely sufficient for every one: every service routes its
internal lookups through unchecked repository reads, `ActivityService.record` is
deliberately unchecked, and the only tool reaching a second `assertPermitted` is
`get_dashboard_context`, which reaches `workspace.read` — the permission it already
declares. Its remaining findings were precision, not architecture:

- **Reflection text search had no repository to delegate to.** The plan claimed matching
  "follows the repository's settled semantics"; `ReflectionQuerySchema` has no `search`
  member and `JsonReflectionRepository` implements no text filter. Now filtered in the
  service, with the inconsistency named and assigned to Slice 21.
- **`SearchHitSchema.title` could not be required** — reflection titles are optional, and
  the fixture's one reflection is titled, so it would have shipped green and failed later.
- **The dashboard-agreement test was not writable as stated.** The dashboard's `upcoming` is
  disjoint from three other widgets and starts tomorrow, so a two-bucket result can never
  equal it. `upcomingWork`'s window is now defined explicitly, and the agreement test is
  narrowed to `overdue` — the only thing the shared helper actually guarantees.
- **The write assertion was vacuous for `complete_task`.** Completing a done task is
  idempotent and a no-op update short-circuits, so "the entity is present afterwards" would
  pass having done nothing. The table now pins inputs and asserts the changed value.
- **`persistCalls` is a running counter** shared across a `describe.each`. Fresh harness per
  case.
- **§60 was being deferred without being recorded**, beside a *Build* bullet that names it.
  Now a third inherited obligation on Slice 15.
- **The reflections finding was overstated**: `SearchHitSchema` carries no body, so what
  leaks is a substring oracle and a title, not the text. The sharper, unnamed half was the
  dead end — ids an agent cannot then fetch. Both recorded.
- Smaller: `status` needed to be a union of the two existing status enums rather than a
  third vocabulary; `execute`'s input type needed pinning to parsed rather than `unknown`;
  the import lint had to match specifiers, not free text, or `tool.ts`'s own doc comment
  would trip it; the second overdue predicate at `dashboard-service.ts:103` had to be
  folded into the helper too, or the extraction met half its rationale; two line-number
  citations were wrong.

**Where a reviewer was not followed:** the spec reviewer suggested softening the reflections
question; instead `search_workspace` **includes** reflections (§40 lists them, they exist,
and omitting them would be arbitrary) and the resulting widening of `workspace.read` is
recorded as a finding. Excluding them would have made the standing open question easier to
answer by making it smaller, which is the opposite of what a prototype is for.
