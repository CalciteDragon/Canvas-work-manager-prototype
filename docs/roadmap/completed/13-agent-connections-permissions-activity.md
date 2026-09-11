<!-- completed-record id="13" closed="2026-08-29" summary="Agent connections, bearer tokens, domain-enforced permissions and the actor-aware activity feed" -->
# Slice 13 — Agent connections, permissions, activity

> **Completed record — frozen at closeout.** Status **done**, closed **2026-08-29**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.

## Outcome

**Status:** done — plan:
[13-agent-connections-permissions-activity.md](13-agent-connections-permissions-activity.md)
— §51's tokens resolve to `ActorContext`s, the domain enforces §53's grants, and §57's feed
tells the three actors apart on both the project canvas and the dashboard.

**Permissions live on the actor, and connection management is not a permission**
([decision](../../decisions/2026-08-permissions-live-on-the-actor.md)). The caller asserts
identity, the domain asserts capability: `ActorContext`'s agent variant carries the grant and
every public service method calls `assertPermitted`. Both plan reviewers independently found
the same hole in the first draft — an agent able to edit connections could grant itself the
permission it had just been denied — so `AgentConnectionService` is **user-actors-only** and
`AgentPermissionSchema` deliberately has no `agents.*` member. A second thing only the build
showed: write paths look their own targets up, so with the check on `get` a grant of
`tasks.write` alone was silently unusable. Each service now has a private unchecked `require`
for its own lookups, pinned by a test.

**Tokens are fixtures, not records**
([entry](../../decisions/2026-08-agent-tokens-are-fixtures-not-records.md)): §52's shape has no
token field, so `prototype-user-a-readwrite` lives beside the seeds and is only a *pointer* —
the live connection is re-read on every request, which is what makes §53's "immediately"
true. It rides on `/prototype/state` and is asserted absent from `GET /api/agent-connections`.
§53's "Last used" is a **throttled** write
([entry](../../decisions/2026-08-last-used-is-a-throttled-write.md)): unthrottled it would make
every agent *read* clone, twice-validate and rewrite the whole data file on one lock. The
comparison is on distance rather than elapsed time, or §46's backwards date control strands
the stamp in the future and freezes the label for the session.

The feed **composes** from structured parts with a live `entityTitle`
([entry](../../decisions/2026-08-activity-feed-composes-from-parts.md)), which answers the open
question Slice 5's summary-ownership entry left for this slice: `summary` is kept as the
human-readable line in `data.json`, and nothing in `apps/web` reads it. §46's Agent Connection
control is a **read-only roster** with copyable tokens
([entry](../../decisions/2026-08-agent-connection-panel-control-is-a-roster.md)) — a second
permission grid would break Slice 12's "no control exists twice".

Verified in the browser against `agent-heavy`: unticking **Modify tasks** in Settings → AI &
Agents made the agent's very next `POST /api/tasks` answer
`403 {"error":"permission_denied","message":"connection \"agent-claude\" is missing permission \"tasks.write\""}`
with nothing restarted, and revoking the connection turned the same token into a 401.
`scripts/agent-acceptance.mjs` walks that path against a real host. Completing a task in the
Task List put a new row at the top of Recent Activity beside it with no refresh (the section
reloads on `projectDataRevision` — one line, and easy to have missed). Two defects the new
component specs caught: a refused permission toggle left the checkbox visually moved, because
the browser owns that state and `[checked]` will not put it back; and a failed load rendered
"no agent has been connected" over the error. §53's grid renders **all seven** permissions
rather than the mock's five, with `workspace.read` labelled as the superset grant it is.

**Deferred:** §53's page has no link from a roster row to its connection, and the panel's
timestamps and the dashboard tile's row height both drew friction notes (§79, six entries).
Slice 12's `PORT` finding **bit again** during this slice's own browser verification, which
was the fourth time it had cost someone time — so it was fixed rather than noted again: the
host reads `CWM_HOST_PORT` and ignores `PORT` entirely
([entry](../../decisions/2026-08-host-port-is-not-the-generic-port.md)).

## Slice definition

**Goal:** The permission model exists and is visible, before any MCP wiring.

**Spec:** §51, §52, §53, §57

**Build**

- `AgentConnection` records in the store; the `agent-heavy` seed (§16).
- `PrototypeAgentAuthenticator` (§51): resolves
  `Authorization: Bearer prototype-user-a-readwrite` to
  `{ userId, connectionId, permissions }`. **Bind the listener to localhost only** —
  these tokens have no security value and must not be reachable off-machine.
- Permission checks enforced in the domain/tool layer, not at the transport.
- Settings → AI & Agents UI (§53): per-connection permission grid, last-used
  timestamp, Revoke. Changes take effect on the next call, immediately.
- Activity feed distinguishing user / agent / system actions visually (§57), plus a
  **Recent Agent Activity** dashboard widget and a **Recent Activity** section type.

**Done when** revoking `tasks.write` in the UI causes the next write attempt to fail
with a clear permission error.

**Do not** implement OAuth (§51, §80).

---

## Implementation plan — Slice 13 — Agent connections, permissions, activity

### Goal

The agent permission model exists, is enforced in the domain, and is visible in the UI —
before any MCP wiring.

### Spec sections

§51 (prototype MCP authentication), §52 (agent connections), §53 (permission UI),
§57 (activity events), plus §16 (the `agent-heavy` seed), §24/§25 (Recent Agent Activity
widget), §29/§30 (Recent Activity section type), §46 (the panel's Agent Connection control).

### Acceptance check

The slice's *Done when* is **"revoking `tasks.write` in the UI causes the next write attempt
to fail with a clear permission error."** It has two halves, and the plan is explicit about
which is automated and which is watched.

#### Automated — `apps/prototype-host/scripts/agent-acceptance.mjs`

Run like the Slice 5 script: a real host on `PORT=4398`, `CWM_DATA_FILE` pointed at a temp
copy of `prototype/seeds/agent-heavy.json`, no restart between steps.

1. `POST /api/tasks` `{ projectId: "project-work-manager", title: "Configure deployment" }`
   with `Authorization: Bearer prototype-user-a-readwrite` → **201**, and the created task's
   `id` is remembered.
2. `PATCH /api/agent-connections/agent-claude` with header `x-prototype-user: user-demo` and
   body `{ permissions: ["projects.read", "tasks.read", "workspace.read"] }` → **200**; the
   response's `permissions` does not contain `tasks.write`. (`workspace.read` is kept so
   step 4's "reads still work" means something. The exact two-element array §53's UI sends
   is pinned by `agent-connections-page.spec.ts` instead.)
3. The same `POST /api/tasks` with the same token → **403**, body
   `{ "error": "permission_denied", "message": "connection \"agent-claude\" is missing permission \"tasks.write\"" }`.
   Then `GET /api/tasks?projectId=project-work-manager` **as the user persona** returns the
   same task count as after step 1 — asserted on the count, not on file bytes, because
   `lastUsedAt` is a deliberate write (see "The cost of `lastUsedAt`" below).
4. `POST /api/agent-connections/agent-claude/revoke` (user persona) → 200; the same token's
   next call → **401** `{ "error": "unauthorized" }`.
5. `GET /api/activity` (user persona) contains `agent_connection.updated` and
   `agent_connection.revoked`, both with `actor: "user"`, and the agent's own
   `task.created` with `actor: "agent"` and `actorName: "Claude"`.

#### Automated — the UI half

`agent-connections-page.spec.ts` asserts that unchecking **Modify tasks** calls
`gateway.agents.setPermissions` with the exact array `['projects.read', 'tasks.read']`. That
is the component-level stand-in for "in the UI"; it proves the reduced set is what leaves
the page.

#### Watched, not automated

Step 4 of the AGENTS.md protocol: load `agent-heavy` in the browser, uncheck Modify tasks in
Settings → AI & Agents, then run the acceptance script's step-1 `curl` and watch it 403.
Recorded in `.prototype/notes.json`, not in a test.

### File-level change list

#### `packages/contracts`

| File | Change |
|---|---|
| `src/activity.ts` | **Export `ActivityEventShape`** (currently module-private at `:30`) and build both `ActivityEventSchema` and the new `ActivityFeedEntrySchema` from it — `ActivityEventSchema` is a `superRefine` wrapper and cannot be `.extend()`ed. `ActivityFeedEntrySchema` = the shape + the same `superRefine` + `actorName` (required), `entityTitle` (optional), `projectName` (**optional** — `agent_connection.*` events have no project). |
| `src/agent.ts` | Add `UpdateAgentPermissionsInputSchema` (`{ permissions: AgentPermission[] }`) and `AgentConnectionViewSchema` (connection + `token`). The view is **only** for `/prototype/state`; `GET /api/agent-connections` returns bare `AgentConnection`s, so §71's disposable tokens stay out of the product-shaped API. |
| `src/dashboard.ts` | `DashboardResultSchema` gains `recentAgentActivity: ActivityFeedEntry[]`. |
| `src/prototype.ts` | `PrototypeStateSchema` gains `agentConnections: AgentConnectionView[]`. |

`ActivityQuerySchema` is **not** given an `actor` filter — see non-goals.

#### `packages/domain`

| File | Change |
|---|---|
| `src/errors.ts` | New `PermissionDeniedError(connectionId, permission)`, message `connection "X" is missing permission "Y"`. |
| `src/actor.ts` | The agent variant of `ActorContext` gains `permissions: readonly AgentPermission[]`. New `assertPermitted(actor, permission)`: user and system actors pass unconditionally; an agent actor without the permission throws. New `assertUserActor(actor)` for the connection service. |
| `src/agent-connection-service.ts` (new) | `list`, `get`, `updatePermissions`, `revoke`, `touch`. **Every method calls `assertUserActor` first**: an agent must not be able to widen its own grant or un-revoke itself, and `AgentPermissionSchema` has no `agents.*` member to check against. `touch` is the one exception — it is called by the authenticator with the resolved agent actor, so it takes a bare `connectionId`, not an actor. Writes run in the unit of work and record `agent_connection.updated` / `agent_connection.revoked`. Scoped by `connection.userId === actor.userId`; anything else is `EntityNotFoundError`. |
| `src/activity-service.ts` | `list` now returns `ActivityFeedEntry[]` — one verb across domain, gateway and store. Gains `projects`, `agents`, `users` repositories (required deps) to resolve `actorName` / `entityTitle` / `projectName`. `record` is unchanged and still returns the raw event. **The feed composes from the structured parts, not from `summary`** — see decision 3. |
| `src/dashboard-service.ts` | Gains `activity: ActivityService`; `load` fills `recentAgentActivity` with the actor's agent events, newest first, capped at 8. |
| The six services | `SectionService` has **seven** public methods (`get/list/add/update/move/duplicate/remove`) — `move` and `duplicate` are easy to miss. Split every workspace lookup into a **private unchecked** `require…` helper and a **public checked** `get`, so an agent with `tasks.write` but not `tasks.read` can still create and complete tasks (finding 17). One `assertPermitted` per public method. Mapping: projects/sections/progress/timeline reads → `projects.read`, writes → `projects.write`; tasks → `tasks.read`/`tasks.write`; reflections → `reflections.read`/`reflections.write`; `DashboardService.load` and `ActivityService.list` → `workspace.read`. `ActivityService.record` is unchecked — it runs inside an already-authorized unit. |
| `src/index.ts` | Export the new service. |
| `test/test-support.ts` | `buildHarness` gains `agents`/`users` repositories, `AgentConnectionService`, `DashboardService`'s `activity` dep, and an `agentActor(permissions)` helper. Highest-traffic file in the domain suite. |

#### `packages/repositories`

**No change.** The first draft added a `{ userId }` query to `AgentConnectionRepository`;
every other service scopes in the service layer instead (`activity-service.ts:72`,
`dashboard-service.ts:63`), and a repository query with one caller is inconsistent at this
scale. `AgentConnectionService.list` filters.

#### `packages/prototype-data`

| File | Change |
|---|---|
| `src/agent-tokens.ts` (new) | `PROTOTYPE_AGENT_TOKENS: Record<string, AgentConnectionId>` — §51's `prototype-user-a-readwrite` → `agent-claude`, plus `prototype-user-a-readonly` → `agent-cursor`. Fixture data both the seed and the host need. |
| `src/seeds.ts` | `agent-heavy` (§16), added to `SEED_NAMES` and `builders`. |
| `src/personas.ts` | Demo User gains a `recent_agent_activity` widget, so §24's tile renders with no configuration. Every seed embeds `PERSONAS` (`seeds.ts:147-159`), so **this regenerates all six committed seed snapshots**. |
| `prototype/seeds/agent-heavy.json` + the five existing files | Regenerated via `pnpm prototype:seed`-style writes; `seeds.test.ts:74` asserts byte equality. |
| `src/seeds.test.ts` | Every pinned seed list updated: the name assertion and its title at `:28-35`, the three `it.each` lists at `:38`, `:68`, `:79`, the canvas list at `:341`, and the unknown-seed **error-message regex** at `:275`. |
| `apps/web/.../prototype/control/testing/fake-prototype-control.ts:13` and `dev-panel/dev-panel-controls.spec.ts:60` | Two more places the seed list is written out by hand. |

**What the seed must satisfy** (from `validateDocumentIntegrity`,
`packages/repositories/src/data-store.ts:170-224`):

- Connections belong to `user-demo` in `workspace-demo` — §51's literal `user-a` is a spec
  illustration, not a persona (`personas.ts:29`). The *token strings* keep §51's spelling.
- Every activity `entityId` resolves to a live entity of its `entityType`; `projectId`, when
  set, equals the target's project; an agent event's connection must exist and its owner's
  workspace must equal the event's workspace; a system event carries neither actor id.
- The revoked `agent-old` connection still exists — revocation is a flag, not a delete.
- The project gets a real canvas (`projectCanvas()` + a `recent-activity` section), because
  `seeds.test.ts:341` requires rich-text-above-task-list and `:356` requires dense positions.

#### `apps/prototype-host`

| File | Change |
|---|---|
| `persistence/store.ts` | `Persistence` gains `agents: JsonAgentConnectionRepository` and `users: JsonUserRepository`. Both classes exist (`json-repositories.ts:168,176`) and are wired nowhere today. |
| `auth/prototype-agent-authenticator.ts` (new) | §51. `authenticate(headers)` → `ActorContext | null`; `null` when there is no `Authorization` header at all. A non-`Bearer` scheme, an unknown token, a missing connection, or `revoked: true` → `AgentAuthenticationError`. It reads the **live** connection every call, which is what makes §53's "immediately" true, then `touch`es it. |
| `api/context.ts` | `resolveActor(dependencies, request)` becomes async: bearer token first, persona header second. A request carrying both is an **agent** request — the token is the stronger claim, and a test pins it. `GET /api/me` (`routes.ts:87`) currently calls `resolveUser`, so a token-only request would identify as `document.users[0]`; it now resolves the **connection's owner** when a token is present. |
| `router.ts` | `access-control-allow-headers` gains `authorization` (`:126`). Without it a browser can never send a token — harmless while the panel only copies tokens, but the omission is a trap for Slice 15. |
| `api/routes.ts` | `actorFor` becomes `await actorFor(request)` in all ~25 handlers. Three new routes: `GET /api/agent-connections`, `PATCH /api/agent-connections/:id`, `POST /api/agent-connections/:id/revoke`. `GET /api/activity` keeps its path and now answers feed entries. |
| `api/errors.ts` | `PermissionDeniedError` → 403 `permission_denied`; `AgentAuthenticationError` → 401 `unauthorized`. |
| `api/services.ts` | Wire `AgentConnectionService`, the authenticator, and `ActivityService`'s three new repositories. `createApiRouteTable(persistence)` keeps its one-argument form — `concurrency.test.ts`, `routes.test.ts:57` and `services.test.ts` all call it. |
| `prototype/runtime.ts` | `state()` gains `agentConnections` (with tokens). |
| `prototype/routes.test.ts` | Extended for the new state member. |
| `main.ts` | No change; a test pins `127.0.0.1`. |

#### `apps/web`

| File | Change |
|---|---|
| `core/gateway/gateway-error.ts` | `WIRE_ERROR_CODES` gains `permission_denied` and `unauthorized`, or the UI reads both as `internal_error`. |
| `core/gateway/work-manager-gateway.ts` | New `AgentGateway` (`list`, `setPermissions`, `revoke`) and `ActivityGateway` (`list(query)` → `ActivityFeedEntry[]`). |
| `core/gateway/prototype-work-manager-gateway.ts`, `testing/fake-gateway.ts` | Implement both; `emptyDashboard()` and the other `DashboardResult` fixtures gain `recentAgentActivity`. |
| `prototype/control/prototype-control.ts` + `prototype-http-control.ts` + `testing/fake-prototype-control.ts` | Nothing new to call — `agentConnections` rides on the existing `PrototypeState`. |
| `features/activity/activity-feed.ts/.html/.scss` (new) | §57's card: actor badge (user / agent / system) with a distinct token-driven colour and icon, the composed line, project name when present, time. **Purely presentational — an `entries` input, injecting nothing.** A widget is given data and never a gateway (`widget-contract.ts:14`), so a feed component that injected `ActivityStore` could not be used by the widget at all. |
| `features/activity/activity-store.ts` (new) | Loads `gateway.activity.list({ projectId })`. |
| `features/projects/sections/activity/recent-activity-section.*` + `sections/registry.ts` | §30's **Recent Activity** section type. |
| `features/dashboard/widgets/recent-agent-activity/*` + `widgets/registry.ts` | §24's **Recent Agent Activity** widget, reading `dashboard.recentAgentActivity`. It shares `widgets/widget-content.scss` like the other six. |
| `features/settings/agents/agent-connections-page.*` + `agent-connections-store.ts` | §53's UI, replacing the placeholder. |
| `features/settings/settings-page.ts` | Links to AI & Agents. |
| `prototype/dev-panel/dev-panel-controls.*` (+ spec) | §46's **Agent Connection** control: roster, token with a copy button, permission summary, revoked badge, link to Settings. The class comment saying the control is absent is removed. |
| `prototype/dev-panel/dev-panel-store.ts` | `CURRENT_SLICE = 13`. |

#### The cost of `lastUsedAt`, and the throttle

`touch` is a repository write: it runs inside `unitOfWork.run`, which `structuredClone`s the
whole document, runs `validateDocumentIntegrity` twice, and rewrites `.prototype/data.json`
(`data-store.ts:266-291`, `:374-380`) — all on the one serialized lock (`:313`). Naively, that
would make **every authenticated GET rewrite the data file** and give every agent mutation two
lock acquisitions.

So `touch` is **throttled**: the authenticator writes only when the stored `lastUsedAt` is
absent or more than **60 seconds** older than the clock. §53 renders "Last used: 4 minutes
ago"; a minute of granularity is invisible there, and the record stays the single source of
truth (an in-host `Map` would vanish on restart and put a second one beside it). It is
touched once per request, in the authenticator, and **never on the 401 path** — a rejected
token is not a use.

A consequence worth stating: with the throttle, `data.json` may still differ after a denied
write, so the acceptance check asserts a task **count**, not file bytes.

#### Docs

`development.md` (Slice 13 status), five `docs/decisions/` entries, and
`docs/decisions/2026-08-activity-summary-ownership.md` gets its "Revisit when: Slice 13"
question answered by entry 3 below.

### Test plan

**Domain**

1. `actor.test.ts` — an agent without the permission is denied; an agent with it passes; a **user** actor is never permission-checked; a **system** actor is never permission-checked; `assertUserActor` rejects agent and system.
2. `task-service.test.ts` — an agent without `tasks.write` cannot `create` or `complete`; the denied write persists nothing and records no activity; **an agent with `tasks.write` but not `tasks.read` can still create and complete** (the private-helper split, finding 17).
3. `project-service.test.ts` — `projects.read` denial on `get`/`list`; `projects.write` denial on `create`/`update`.
4. `reflection-service.test.ts` — `reflections.read` and `reflections.write` denials.
5. `dashboard-service.test.ts` — `workspace.read` denial; `recentAgentActivity` holds only agent events, newest first, capped at 8, empty when there are none.
6. `activity-service.test.ts` — `workspace.read` denial; `list` resolves an agent event's `actorName` to the connection name, a user event's to the user name, a system event's to `System`; `entityTitle` comes from the live entity (so a renamed task renders its **new** title, which `summary` would not); `projectName` is absent on an `agent_connection` event. The "connection missing" fallback case is marked in the test as reachable only through a fake repository — `data-store.ts:219` rejects such a document.
7. `agent-connection-service.test.ts` — **an agent actor cannot list, read, update or revoke connections**; list is scoped to the actor's user; `updatePermissions` replaces the set and records activity; `revoke` records activity and is idempotent; `updatePermissions` on a revoked connection is rejected with a `DomainRuleError`; another user's connection is `EntityNotFoundError`; `touch` stamps `lastUsedAt` from the clock.

**Host**

8. `auth/prototype-agent-authenticator.test.ts` — §51's exact token resolves to `{ userId, connectionId, permissions }`; no header → `null`; a non-`Bearer` scheme → error; unknown token → error; revoked connection → error; a permission change between two calls is visible to the second; `lastUsedAt` is stamped from the simulated clock.
9. `api/routes.test.ts` — the three connection routes; a bearer `PATCH /api/agent-connections/:id` is refused (finding 2); `GET /api/activity` answers feed entries; a token write lacking the permission is 403 **with the permission named**; a revoked token is 401; a request carrying both a token and `x-prototype-user` is treated as the agent; persona requests are unaffected.
10. `api/errors.test.ts` (new) — the two new mappings, directly.
11. `main.test.ts:34` **already** asserts the listener is bound to `127.0.0.1`. §51's off-machine rule is satisfied and pinned; no new test, and the slice's build list item is a verification, not a change.
12. `prototype/routes.test.ts` — `/prototype/state` carries the roster **with** tokens.

**Web**

13. `agent-connections-page.spec.ts` — a card per connection with the grid checked to match; unchecking Modify tasks sends exactly `['projects.read','tasks.read']`; Revoke calls the gateway and the card shows revoked and disables the grid; a failing gateway shows an error rather than an empty grid; **the zero-connection empty state**.
14. `activity-feed.spec.ts` — three actors, three distinct badges (asserted on the actor class, not the colour); an entry with no project renders; empty state.
15. `recent-activity-section.spec.ts` — loads for its project; empty state; gateway failure.
16. `dashboard-page.spec.ts` — the Recent Agent Activity tile renders its entries, and its empty state. **Not** a new per-widget spec file: no widget has one, and all six are covered here.
17. `registry.spec.ts` (both) — the new type registered exactly once.
18. `dev-panel-controls.spec.ts` — the Agent Connection control lists the roster and shows each token.

**Acceptance** — `scripts/agent-acceptance.mjs`, above.

### Boundaries touched

- **Components depend on gateway interfaces.** The settings page, the feed and the section
  inject `WORK_MANAGER_GATEWAY`; the widget takes data, per the widget contract.
- **Domain depends on repositories + `Clock` only.** The authenticator lives in the host —
  it parses an HTTP header. What it hands the domain is an `ActorContext`, a shape the
  domain already owns. Permission *checking* is domain-side, which is what the slice asks.
- **Contracts defined once.** Everything new lands in `packages/contracts`; no view model is
  declared in the web app.
- **No `new Date()` in domain.** `lastUsedAt` and every event timestamp come from the `Clock`.
- **One flag service.** `agentConfirmations` is untouched — Slice 22's.
- **`core/` must not import `prototype/`.** The feed lives in `features/activity/`.

### Explicit non-goals

- **No OAuth** (§51, §80). Fake bearer tokens, localhost only.
- **No MCP** — no SDK dependency, no `/mcp` route, no tool registry. Slices 14 and 15.
- **No agent confirmations** (§58) — Slice 22.
- **No live updates** (§62) — the settings page and the feed load on navigation. Slice 16.
- **No `actor` filter on `ActivityQuery`.** Nothing would call it: the widget reads
  `recentAgentActivity` and the section shows a project's whole history. Adding it would be
  the "method the UI cannot exercise" this repo already refuses.
- **No backfill** of activity for write paths that have none today.
- **`workspace.read` is enforced but has no tools yet** — Slice 14 brings those.

### Open questions — resolved, each becoming a decision entry

1. **Where do tokens live?** Not on `AgentConnectionSchema` — §52's example has no token,
   and a secret-shaped field in the shared contract invites production thinking (§7). A
   fixture table in `@cwm/prototype-data`, resolved against the live connection, surfaced
   only on `/prototype/state`. → `2026-08-agent-tokens-are-fixtures-not-records.md`.
2. **Transport or domain enforcement?** Domain. `ActorContext` carries permissions: the
   caller asserts identity, the domain asserts capability. Consequence: the connection
   service is user-actors-only, because no permission could safely gate it.
   → `2026-08-permissions-live-on-the-actor.md`.
3. **Does the feed render `summary` or compose?** Composes, from the structured parts plus a
   live `entityTitle` — which is what
   `2026-08-activity-summary-ownership.md` predicted and asked Slice 13 to confirm. That
   entry's open question ("is `summary` still worth writing?") is answered there: kept, as a
   human-readable line in `data.json` (§14), and now demonstrably not what the UI reads.
   → `2026-08-activity-feed-composes-from-parts.md`.
4. **What is §46's Agent Connection control?** A read-only roster with copyable tokens;
   editing is §53's Settings UI. Duplicating the grid would break the "no control exists
   twice" rule Slice 12 established.
   → `2026-08-agent-connection-panel-control-is-a-roster.md`.
5. **Five permission rows or seven?** §53's mock shows five; `AgentPermissionSchema` has
   seven. The UI renders all seven — a grid that hides two grants the agent actually holds
   is a permission UI that lies.
6. **`workspace.read` is a superset grant.** `DashboardResult` carries every open task's
   title, status, priority and due date, so an agent holding only `workspace.read` reads
   task content it was not granted `tasks.read` for. Rather than requiring both (which
   would make `workspace.read` alone useless, and §54 pins it as what backs
   `get_dashboard_context`), the grant is **labelled honestly** in §53's grid — "Read
   workspace overview — includes task and project content in aggregate" — and the
   consequence is recorded. Both 5 and 6 land in
   `2026-08-permissions-live-on-the-actor.md`.

### Revisions

**Round 1** (two reviewers, against the plan and the code). Substantive changes made:

- **Privilege escalation found and closed.** The first draft never said what permission
  `AgentConnectionService` needs, which would have let any token restore its own
  `tasks.write` and defeat the acceptance check. It is now user-actors-only.
- **`ActivityEventSchema` cannot be extended** — it is a `superRefine` wrapper over a
  private shape. The plan now exports the base shape and builds both schemas from it.
- **The feed contradicted a standing decision entry.** The first draft rendered `summary`;
  `2026-08-activity-summary-ownership.md` had already decided Slice 13 would compose, and
  asked to be revisited here. `ActivityFeedEntry` now carries a live `entityTitle`, and
  entry 3 answers the open question.
- **Four files were missing from the change list**: `persistence/store.ts` (no `agents`/
  `users` repositories exist in `Persistence` at all), `domain/test/test-support.ts`,
  `contracts/src/prototype.ts`, and the committed `prototype/seeds/*.json` snapshots.
- **`resolveActor` becoming async** is ~25 call sites plus a signature change plus
  `ApiDependencies`, not a one-line change; said so.
- **`lastUsedAt` is a write on every agent read.** Documented as a deliberate cost, touched
  once per request, and the acceptance check now asserts a task count rather than file bytes.
- **`ActivityQuery.actor` dropped** — it had no caller. *(Reversed in Step 4: it turned out
  to have one, and its absence was a real defect — see below.)*
- **`ActivityService.list` now returns feed entries** rather than adding a second read verb.
- **Token kept off `GET /api/agent-connections`**, on `/prototype/state` only.
- **Internal self-calls** (`create` → `this.get`) would have made writes require read;
  split into private unchecked helpers, pinned by a test.
- **Seed constraints from `validateDocumentIntegrity` written down**, including that the
  connections belong to `user-demo`, not §51's illustrative `user-a`.
- **Test plan gaps closed**: revoked-token 401, `workspace.read` denial, system-actor
  permission case, non-`Bearer` and both-credentials precedence, the connections empty
  state, the dev-panel control, `updatePermissions` on a revoked connection, and a direct
  test of the two new error mappings.

**Round 2** (the second reviewer, on feasibility). Both reviewers independently found the
privilege-escalation hole in finding 1, which is the strongest signal the plan produced.
Further changes:

- **`touch` is now throttled to 60 s** and skipped on the 401 path. Unthrottled it would
  have made every authenticated GET clone, twice-validate and rewrite the whole data file
  on the single global write lock.
- **`GET /api/me` and CORS**: `/api/me` calls `resolveUser`, not `resolveActor`, so a
  token-only request would have identified as `document.users[0]`; and
  `access-control-allow-headers` (`router.ts:126`) omits `authorization`, so no browser
  could ever send a token. Both now in the change list.
- **Three more pinned seed lists** found: the unknown-seed error regex
  (`seeds.test.ts:275`), `fake-prototype-control.ts:13`, and `dev-panel-controls.spec.ts:60`.
- **`AgentConnectionRepository` left alone** — scoping belongs in the service, as it does
  for every other collection.
- **`ActivityFeed` must inject nothing.** A widget is handed data and never a gateway, so a
  feed component that injected a store could not be shared with the widget at all — which
  was the whole point of building one.
- **The new widget is covered in `dashboard-page.spec.ts`**, not a new per-widget spec: no
  widget has one, and inventing the pattern here is unasked work.
- **`workspace.read` reads task content** (open question 6) — a real capability leak that
  the first draft did not name. Answered by labelling, and recorded.
- **`main.test.ts:34` already pins the localhost bind**, so that build-list item is a
  verification rather than a change.
- **`SectionService` has seven public methods**, not the five the mapping implied.
- `actor.test.ts:23`'s `as never` cast would hide the new required `permissions` field from
  the compiler; it becomes a real literal.

**Round 3** (a re-review of the revised plan). It confirmed the revisions and found four
things, three of which changed the code:

- **The throttle wedged against a backwards clock.** Written as "more than 60 s later", a
  simulated date moved backwards — a first-class §46 control — would strand `lastUsedAt` in
  the future and suppress every later touch. It compares distance now, with a test each way.
- **A comment in shipped code was factually wrong.** The plan claimed Zod 4's `superRefine`
  returns a non-object schema that cannot be `.extend()`ed. It returns the same object
  schema; the reviewer ran it. The structure is still right — both schemas share one shape
  and one refinement, and extending the refined schema would run the check twice — but the
  comment in `contracts/src/activity.ts` said something untrue, which under AGENTS.md §2 is a
  defect. Reworded.
- **The authenticator cannot use `AgentConnectionService.get`**, because that method is
  user-actors-only and there is no actor yet — it is the step that produces one. It reads the
  repository directly and only `touch`es through the service.
- **`package.json` needed the `agent-acceptance` script**, and the acceptance steps needed
  the seed's actual project id pinned.

### What changed during implementation

- **`ActivityService` lost its `sections` dependency.** A section has no title of its own —
  §31's frame heads it from the registry's display name — so resolving one was dead weight.
- **The `agent-heavy` seed grew a second project.** One project could not show both a
  connection being used and connection *hygiene* being a piece of work in its own right.
- **The feed formats its timestamps.** Only visible in the browser: §57 draws `11:32 AM`, and
  the feed was printing raw ISO. It shows a date as well as a time, because Slice 11 already
  learned that a bare time makes five-day-old rows read as tonight.
- **Two component defects the specs caught**, both listed in `development.md`: the refused
  toggle leaving the checkbox moved, and the empty state rendering over a load error.

### Step 4 review

Two reviewers ran against the diff: one on boundaries and spec conformance, one that ran
everything. The second reported the full suite, both boundary lint scripts, both acceptance
scripts and all six seed snapshots green, and all 18 planned tests present. The first found
**no boundary violations and no must-fix defects**. Six suggestions; five were taken:

- **The dashboard tile could lie.** `recentAgentActivity` fetched the newest 200 events and
  filtered to agents *afterwards*, so a workspace whose recent history was mostly a person's
  would render "No agent has done anything yet" while agent work sat just outside the window
  — and it resolved names for 200 rows to keep 8. This **reverses the plan's own decision to
  drop `ActivityQuery.actor`**: that call was made because nothing would use the filter, and
  the implementation proved otherwise. The service now scopes, narrows, truncates, then
  resolves, in that order, with a test that buries one agent event under thirty user ones.
- **`relative()` said "1 minutes ago"** — visible in the exact string §53 writes out.
- **The two new stores skipped `PendingTasks`**, which every other gateway-calling store
  registers with. Their specs passed on microtask timing rather than on the mechanism.
- **`UpdateAgentPermissionsInput` accepted duplicates.** Unreachable from the grid, reachable
  from the route; a grant is a set.
- **The acceptance script and the plan disagreed** about step 2's permission array.
- A cap test imported `RECENT_AGENT_ACTIVITY_LIMIT` and asserted against it, so it could not
  catch a wrong cap *value*. Now a literal.

One was **not** taken: a finding that three new files deviate from the repo's formatting
idiom. They follow it — `activity-store.ts`'s longest line is 482 characters against
`reflections-store.ts`'s 560 and `timeline-store.ts`'s 587, which are the nearest existing
examples (section stores). `project-page-store.ts`, the file the reviewer compared against,
is a page store and is conventionally formatted; so is `agent-connections-store.ts`, the
page-level store here.
