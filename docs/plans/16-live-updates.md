# Slice 16 — Live updates

## Goal

A change made by an agent over MCP, by the web UI, or by the development panel appears in
every open browser tab within a second, without a refresh and without a full-app reload.

## Spec sections

§62 (Server-Sent Events at `GET /prototype/events`, `{ type, entityId }`, "the frontend
then refreshes relevant state", no real-time sync infrastructure), §6 (one host, one data
file, so an agent's write and the browser's read are the same workspace), §57 (the activity
feed is the record of every mutation — the events ride the same choke point), §63 (the
optimistic paths this must not clobber), §8/§10 (the Angular side depends on an interface,
never on `EventSource`), §71 (the event stream is explicitly disposable).

## Acceptance check

The slice's *Done when* is: **"an agent completing a task via MCP visibly checks it off in
an open project page within a second, and the activity feed shows the agent as actor."**

Made executable as `pnpm --filter @cwm/prototype-host live-acceptance`
(`apps/prototype-host/scripts/live-acceptance.mjs`, run as
`node --import tsx scripts/live-acceptance.mjs` like the Slice 15 script, because it
imports `@cwm/prototype-data` for the fixture token):

1. Start the real host on an ephemeral loopback port against a temporary copy of the
   `agent-heavy` seed.
2. Open `GET /prototype/events?user=<the agent connection's owner>` with `fetch` and begin
   reading the stream.
3. Connect the official MCP v2 client over Streamable HTTP with the fixture bearer token
   and call `complete_task` on a `todo` task in that persona's workspace. Record
   `issuedAt` **before** awaiting the call — the frame is flushed at commit, which is
   before the tool's HTTP response is written, so measuring from the resolved promise
   would give a negative interval.
4. Assert a frame
   `data: {"type":"task.completed","entityType":"task","entityId":"<id>","projectId":"<id>"}`
   arrives within 1000 ms of `issuedAt`.
5. Assert the frame arrives **after** the write is committed: on receipt, immediately
   `GET /api/tasks/<id>` (with the persona header) and require `status === "done"`. This
   is the check a naive "broadcast inside the unit of work" implementation fails.
6. Assert `GET /api/activity?projectId=<id>` — sent with the `x-prototype-user` persona
   header, which `actorFor` requires — has a newest entry whose `actor` is `"agent"` and
   whose `actorName` is the seed connection's `name`. That is the "activity feed shows the
   agent as actor" half.

The browser half is proven by the Angular specs listed below **plus** a manual run whose
observations are recorded in `.prototype/notes.json` (§77). That entry is a required
artifact of this phase: `pnpm dev`, open a project page, complete a task through a real
MCP client, watch the row tick and the feed name the agent.

## Design decisions this plan makes

### One emission point: `ActivityService.record`

Every mutating domain service records **at most one** activity event per operation, inside
that operation's unit of work. That is the domain operation boundary the slice asks for, it
already carries `entityType`, `entityId` and `projectId`, and it guarantees the live stream
and §57's feed can never disagree about what happened. The alternative — a `publish` call in
each mutating service — is five places to forget.

"At most one", not "exactly one", and the difference matters:

- A no-op write records nothing (`TaskService.commit`, `SectionService.commit`,
  `ProjectService`), as do the idempotent early returns in `TaskService.complete` and
  `archive`. Correct: nothing changed, so nothing should refresh.
- `AgentConnectionService.touch` stamps §53's "Last used" on every authenticated agent call
  and deliberately records **no** activity event. So "Last used" will not live-update. That
  is the honest cost of this choke point, and it is why the agent connections page is a
  non-goal below.

Recorded as `docs/decisions/2026-08-live-events-ride-the-activity-record.md`.

### Delivery is deferred until after the commit

`record` runs inside the unit of work, and the unit's document is only visible to other
readers once `runUnitOfWork` commits. Broadcasting from inside it would let a browser
refetch *before* the commit, read the old value, and never refresh again — the exact failure
that looks like "live updates do not work". The host's hub therefore buffers per unit of
work in an `AsyncLocalStorage` and flushes only after `run` resolves; a rejected unit —
including one whose *commit-time* `validateDocumentIntegrity` fails, after the publish was
already buffered — discards its buffer, so a rolled-back write never broadcasts.

The nesting rule is stated in terms of the buffer, not `unitOfWorkFor`'s `openUnitStores`:
**if a buffer already exists in the `AsyncLocalStorage`, reuse it and do not flush.**
`unitOfWorkFor` joins a nested call by returning `fn()` without opening a unit, so a wrapper
that unconditionally started a new buffer would flush the inner one before the outer commit.
Two *queued* (non-nested) units each get their own buffer, because the wrapper establishes
the store around `uow.run` and the queued callback inherits its caller's context.

`createApi` builds the wrapped adapter **locally** and hands it to the services.
`Persistence.unitOfWork` is left alone — reassigning it would route `PrototypeRuntime`'s
seed swap through the hub too, which the route table already covers.

### The wire event is §62's, plus two routing fields

`{ type, entityId }` verbatim, plus `entityType` and optional `projectId`. `projectId` is
what lets an open project page ignore another project's traffic, which is what "targeted
refresh, not full-app reload" requires. `entityType` is a convenience, **not** a reliable
router: `SectionService` deliberately records section mutations as `entityType: 'project'`
with the *project's* id as `entityId`
(`docs/decisions/2026-08-section-activity-targets-the-project.md`), so a
`project.section_added` event names no section. Clients route on `type` and `projectId`.

`workspaceId` is not on the wire. The stream is filtered server-side by `?user=`, so a tab
never sees another workspace's ids. This is about noise, not security — the stream is
unauthenticated like every other `/prototype/*` route (§51), and any localhost caller may
name any persona. Because the port must carry a workspace the wire event does not, the
domain port publishes a `LivePublication { workspaceId, event }` and the SSE writer
serializes only `event`.

**`?user=` diverges from `resolveUser` on purpose.** `api/context.ts`'s helper reads a
header off a `RouteRequest` and defaults an absent value to `document.users[0]`, because a
REST call needs *an* actor. A stream needs none, so the SSE handler uses its own lookup:
absent → unfiltered (what a debugging `curl` wants), unknown → `404`. Raw mounts bypass
`toErrorResult`, so that 404 is written by hand — **with CORS headers**, or the browser
reports a CORS failure instead of the real problem.

Resolving the persona once, at connect time, is safe because every seed builds
`users` and `workspaces` from the same `PERSONAS` list (`packages/prototype-data/src/seeds.ts`),
so a reseed never invalidates a persona id or moves it to another workspace.

### Refreshes are quiet, and they defer to writes in flight

Two rules, applied to **every** subscribing store, not just the task list:

- **Quiet.** A live-driven refresh never sets `loading`, never clears the current data, and
  never writes `error` on failure. The loud `load()` path stays exactly as it is for route
  changes and first paint. Without this, an agent completing a task flickers the sidebar,
  the dashboard and the feed; worse, a transient host blip during an agent-driven reload
  would replace a rendered project page with an error the user never caused.
- **Deferred.** A store with an optimistic write in flight queues the refresh and runs it
  once, when the write settles. `TaskListStore` gets a pending-mutation counter for its
  completion and field edits; `ProjectPageStore` gets the same counter for its optimistic
  section reorder (which previews `sectionsState` before the host answers) and reuses its
  existing quiet `reconcileSections` for the re-read.

**Self-echo is accepted.** There is no client id and no origin tag, so a tab sees its own
writes come back. The cost is one extra quiet read per user action; the two rules above are
what make that harmless. Filtering it would mean a per-connection identity on the stream —
more machinery than §71 wants for a disposable channel.

### What the development panel stops reloading, and what it keeps

Slice 12 parked three `location.reload()` calls here (`development.md`: "Host-state changes
**reload the app** (§62's live updates are Slice 16)"):

- `project-layout-control.ts` — **removed.** It writes through the gateway, so it now
  produces a `project.updated` event and `ProjectPageStore` re-reads the project and its
  sections. This is the slice's clearest payoff.
- `DevPanelStore.switchPersona` — **kept.** `PrototypeIdentityProvider` memoizes a fulfilled
  identity for the page's lifetime and the SSE stream is opened for that persona. A persona
  change is a different session, not a data change.
- `DevPanelStore.run(…, reloadAfter: true)` for seed / reset / clock / AI provider —
  **kept for the panel's own tab**, because these change the clock, the AI provider mode and
  the whole document at once, and every store's derived reads (overdue windows, digests,
  progress) move with them; one reload is cheaper and more legible than a fan-out of quiet
  refreshes. *Not* because a reseed invalidates the persona — it does not.
  What changes is *other* tabs: the `/prototype/*` mutating routes now broadcast
  `{ type: 'prototype.reloaded', entityId: <'seed'|'reset'|'clock'|'ai-provider'> }`, and
  every subscribing store re-reads. The broadcast is emitted from the route table, one per
  successful request, rather than from `PrototypeRuntime` — `reset()` calls `loadSeed` and
  `setAIProvider` internally, so instrumenting the runtime would emit three events for one
  button.

`development.md`'s Slice 12 note and `DevPanelStore.switchPersona`'s comment both say
"Slice 16" in the future tense and are corrected in this change.

## File-level change list

| File | Responsibility |
|---|---|
| `packages/contracts/src/live.ts` | **New.** `LiveEventSchema` / `LiveEvent` — §62's `{ type, entityId }` plus `entityType?` and `projectId?`. `type` reuses `ActivityActionSchema`; `entityType` reuses `ActivityEntityTypeSchema`; `projectId` reuses `ProjectIdSchema`. No parallel definitions. |
| `packages/contracts/src/live.test.ts` | **New.** Accepts §62's literal example, accepts a fully routed event, rejects a malformed `type`. |
| `packages/contracts/src/index.ts` | Export `./live`. |
| `packages/domain/src/live-events.ts` | **New.** `LivePublication { workspaceId: WorkspaceId; event: LiveEvent }` and `LiveEventPublisher { publish(publication: LivePublication): void }` — a port in the same spirit as `Clock`. No transport, no Node. |
| `packages/domain/src/activity-service.ts` | Accept an optional `events?: LiveEventPublisher`; after `activities.insert`, publish `{ workspaceId: actor.workspaceId, event: { type: action, entityType, entityId, projectId } }`. Optional so every existing construction site and test keeps working, and so the domain never *requires* a stream. |
| `packages/domain/src/index.ts` | Export `./live-events`. |
| `packages/domain/src/activity-service.test.ts` | The publish cases below. |
| `apps/prototype-host/events/hub.ts` | **New.** `LiveEventHub implements LiveEventPublisher`: `subscribe(listener, workspaceId?) => unsubscribe`, `broadcast(publication)`, `broadcastToAll(event)` for rig-level frames that reach every subscriber regardless of filter, and `wrapUnitOfWork(uow): UnitOfWork` which buffers publications for the life of a unit and flushes after it commits — discarding on rejection, reusing an existing buffer when one is already open. |
| `apps/prototype-host/events/hub.test.ts` | **New.** Commit ordering, both rollback shapes, nesting, queued overlap, filtering, `broadcastToAll`, unsubscribe. |
| `apps/prototype-host/events/sse.ts` | **New.** `createEventStreamHandler(hub, store)` → `RawRouteHandler` for `/prototype/events`: `text/event-stream`, `retry: 2000`, a 15 s heartbeat comment, CORS from the router's own helper on **every** response including the 404, its own `?user=` lookup (absent → unfiltered, unknown → 404), unsubscribe + `clearInterval` on `close`, `405` for a non-GET. |
| `apps/prototype-host/events/sse.test.ts` | **New.** Headers, framing, filtering, missing/unknown user (with CORS), disconnect cleanup, non-GET. |
| `apps/prototype-host/router.ts` | Export `corsHeaders` so the raw SSE mount can answer a browser. Raw mounts bypass the router's own CORS *and* its `OPTIONS` branch — right for `/mcp`, and for this stream it means the mount owns both; `EventSource` never preflights, so the `405` also covering `OPTIONS` is stated rather than special-cased. |
| `apps/prototype-host/api/services.ts` | Build the `LiveEventHub` (or take an injected one via `CreateApiOptions`), build a locally wrapped unit of work from it, pass that to every service and the hub to `ActivityService`, and return the hub on `HostServices`. `Persistence.unitOfWork` itself is untouched. |
| `apps/prototype-host/api/services.test.ts` | The wiring: a mutation through a service built by `createApi` reaches the hub; the injected-hub option works. |
| `apps/prototype-host/prototype/routes.ts` | Take the hub as a third parameter beside `noteOptions`; after a successful seed / reset / clock / AI-provider request, `broadcastToAll({ type: 'prototype.reloaded', entityId: <route name> })`. One event per operation. |
| `apps/prototype-host/prototype/routes.test.ts` | Each host-state route broadcasts exactly one frame; `POST /prototype/notes` broadcasts none. |
| `apps/prototype-host/main.ts` | Take the hub off `HostServices`; pass it to `createPrototypeRoutes` and, with `persistence.store`, to `createEventStreamHandler` for the `/prototype/events` raw mount. Shutdown needs **no** new code: `stop()` already calls `closeAllConnections()`, which destroys a mid-request SSE socket, and the handler's own `close` listener clears the heartbeat. |
| `apps/prototype-host/main.test.ts` | The stream works over the real socket, and `stop()` terminates it and its heartbeat — a regression check on existing behaviour, not new behaviour. |
| `apps/prototype-host/live-updates.test.ts` | **New.** In-process, through the real route table and the real MCP registry: one committed frame per mutation, none for a failed one, and the MCP path broadcasts too. |
| `apps/prototype-host/scripts/live-acceptance.mjs` | **New.** The acceptance check above, over a real socket and a real MCP client. |
| `apps/prototype-host/package.json` | Add the `live-acceptance` script. |
| `apps/web/src/app/core/live/live-updates.ts` | **New.** The `LiveUpdates` interface (`subscribe(listener): () => void`) and the `LIVE_UPDATES` token, with `providedIn: 'root'` and an **inert** default factory that never emits — a store given no live source behaves exactly as it does while the stream is down, a state it must handle anyway. The real adapter is named only in `app.config.ts` (§8). |
| `apps/web/src/app/core/live/prototype-live-updates.ts` | **New.** The §10 adapter: `EventSource` against `${PROTOTYPE_API_BASE_URL}/prototype/events?user=<persona from IdentityProvider>`, opened lazily on the first subscriber, frames validated with `LiveEventSchema`, closed when the last subscriber leaves — including when the last one leaves *before* the async persona lookup resolves. A **failed** persona lookup enters the same backoff as a dead source rather than killing the stream for the page's lifetime — `PrototypeIdentityProvider` deliberately un-memoizes a rejection because `pnpm dev` starts web and host together and the first call often loses the race to the host's listen, so this is the startup most sessions begin with. Reconnect: on `error`, if `readyState !== CLOSED` the browser is already retrying and this does nothing; if it is `CLOSED` (which is what a non-200 such as the `?user=` 404 produces, with **no** browser retry) it schedules one reopen on a capped backoff — 1 s doubling to 30 s, reset on `open`. Without the backoff a 404 would become a hot request loop. The only file in `apps/web` that names `EventSource`. |
| `apps/web/src/app/core/live/prototype-live-updates.spec.ts` | **New.** Persona query, parse, ignore-malformed, retry behaviour both ways, backoff on a refused connection, teardown before and after the source opens. |
| `apps/web/src/app/core/live/testing/fake-live-updates.ts` | **New.** `FakeLiveUpdates` with an `emit(event)` for store specs. |
| `apps/web/src/app/core/gateway/testing/shell-test-providers.ts` | Provide `FakeLiveUpdates` so shell specs can drive events. |
| `apps/web/src/app/app.config.ts` | Provide `PrototypeLiveUpdates` for `LIVE_UPDATES`. |
| `apps/web/src/app/app.spec.ts` | Assert `appConfig` wires the real adapter, as an **injection-shape check** (`TestBed.configureTestingModule({ providers: appConfig.providers })`, then `TestBed.inject(LIVE_UPDATES) instanceof PrototypeLiveUpdates`) and not by rendering `App`. This opens no socket only because the adapter is lazy — which is what makes the laziness load-bearing. |
| `apps/web/src/app/features/tasks/task-list-store.ts` | Add `refresh()`: a quiet re-read of the current project's tasks that never touches `loading`, `error` or `loadFailed`, guarded by a new pending-mutation counter — it defers while any optimistic write is in flight and coalesces a burst into one trailing run. It captures `loadGeneration` and rechecks it before writing, exactly as `load` does, or a refresh in flight across a project switch drops project A's tasks under project B's header. Like every other read in these stores it runs inside `track()`/`PendingTasks`, so the specs' `whenStable()` remains the await point. No subscription of its own. |
| `apps/web/src/app/features/projects/project-page-store.ts` | Subscribe on construction, unsubscribing via `DestroyRef`. On an event for this project — `projectId` match, or a `project.*` event whose `entityId` is this project — quietly refresh tasks, progress, the project record, and the sections via the existing `reconcileSections`. Same pending-mutation guard as the task store, because the optimistic section reorder previews `sectionsState`. On `prototype.reloaded`, `load(projectId)`. Never `location.reload()`. |
| `apps/web/src/app/features/activity/activity-store.ts` | Keep the loaded `projectId` and `limit` (it currently keeps neither, only a generation), add a quiet `refresh()`, and subscribe: reload on any event for the loaded project, and on `prototype.reloaded`. |
| `apps/web/src/app/features/dashboard/dashboard-store.ts` | Add a quiet refresh; subscribe and reload on `task.*` / `project.*` / `reflection.*` / `milestone.*` / `prototype.reloaded`, and not on `agent_connection.*`. |
| `apps/web/src/app/core/shell/shell-store.ts` | Add a quiet refresh; subscribe and reload the project tree on `project.*` and `prototype.reloaded`. |
| `apps/web/src/app/prototype/dev-panel/project-layout-control.ts` | Drop `location.reload()`; the write now broadcasts and the project page re-reads. **No dedicated test:** the control only renders its mode buttons when the route names a project, and jsdom's `location.reload()` neither throws nor is observable, so an assertion there would pass either way. The replacement behaviour is proven by `project-page-store.spec.ts`'s `project.updated` case. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | Correct `switchPersona`'s comment — the reload is deliberate, not a Slice 16 to-do. Bump `CURRENT_SLICE` to 16. |
| five feature spec files | `task-list-store.spec.ts`, `project-page-store.spec.ts`, `recent-activity-section.spec.ts`, `dashboard-store.spec.ts`, `shell-store.spec.ts` — the cases below. |
| `docs/decisions/2026-08-live-events-ride-the-activity-record.md` | **New.** Why the emission point is `ActivityService.record`, what "at most one" costs (`touch`), and why delivery waits for the commit. |
| `docs/decisions/2026-08-live-updates-are-http-only.md` | **New.** Why a stdio MCP process does not reach the browser, and why that is not worth fixing (§62, §80). |
| `docs/mcp-setup.md` | One sentence: live updates are a property of the HTTP transport. |
| `development.md` | Slice 16 status; and correct the Slice 12 note that says host-state changes reload the app because live updates are Slice 16. |
| `.prototype/notes.json` | Friction from the required manual run. |

## Test plan

Written first, each named with what it proves. Deliberately not exhaustive (§71): the hub's
commit ordering is the part that is easy to get silently wrong, so that is where the cases
concentrate. Heartbeat timing and subscriber-error isolation are left untested — they are
Node's behaviour, not this prototype's.

**Contracts — `packages/contracts/src/live.test.ts`**

1. `accepts §62's example event` — `{ type: 'task.updated', entityId: 'task-123' }` parses, so the spec's literal shape stays valid.
2. `accepts the routed event` — with `entityType` and `projectId`.
3. `rejects a type that is not entity.verb` — `'taskupdated'` fails, so a typo cannot reach a client.

**Domain — `packages/domain/src/activity-service.test.ts` (additions)**

4. `record publishes the recorded activity as a live event` — the publisher sees the actor's `workspaceId` and `{ type: action, entityType, entityId, projectId }`.
5. `record works with no publisher` — the dependency is optional; nothing throws.
6. `record publishes after the insert` — the publisher observes the event already present in the repository, proving the order.

**Host — `apps/prototype-host/events/hub.test.ts`**

7. `holds events until the unit of work commits` — a subscriber sees nothing while the callback runs, and everything after `run` resolves.
8. `discards events when the callback throws`.
9. `discards events when the commit rejects` — the callback succeeds and `validateDocumentIntegrity` fails at close, which is the realistic rollback and happens *after* the publish is buffered.
10. `flushes a nested unit with its outer one` — one flush, both events in order, driven through the real `unitOfWorkFor` so the join path is the one exercised.
11. `keeps two queued units' events apart` — two overlapping callers each flush only their own, the case `concurrency.test.ts` exists for.
12. `broadcasts immediately outside a unit of work` — the development panel's path.
13. `delivers only the subscriber's workspace` — a filtered subscriber never sees another workspace's event; an unfiltered one sees both.
14. `broadcastToAll reaches a workspace-filtered subscriber` — a browser is always filtered, and `prototype.reloaded` carries no workspace.
15. `a unit that records nothing flushes harmlessly` — `AgentConnectionService.touch` is the highest-frequency wrapped unit in the system and buffers nothing.
16. `stops delivering after unsubscribe`.

**Host — `apps/prototype-host/events/sse.test.ts`**

17. `answers text/event-stream with CORS for the web origin` — headers plus `cache-control: no-cache`.
18. `writes one data frame per event` — `data: {json}\n\n`, carrying only the `LiveEvent` and never the workspace.
19. `filters by the ?user persona's workspace`.
20. `streams unfiltered when ?user is absent`, and `404`s an unknown user id **with CORS headers**, so the browser can see the real error.
21. `unsubscribes and clears the heartbeat when the client disconnects` — the leak check.
22. `refuses a non-GET with 405`.

**Host — `apps/prototype-host/live-updates.test.ts`**

23. `a task completion through the API route broadcasts one committed event` — the frame arrives, and reading the task at that moment already shows `done`.
24. `a failed mutation broadcasts nothing` — completing an unknown task emits no frame.
25. `an MCP tool call broadcasts the same event` — through the real registry with an agent `ActorContext` built from the `agent-heavy` seed's connection (a real, seeded `agentConnectionId` with `tasks.write`, because `validateDocumentIntegrity` rejects an activity event naming a connection the document does not contain).

**Host — `apps/prototype-host/prototype/routes.test.ts` (additions)**

26. `each host-state route broadcasts one prototype.reloaded frame`, naming the knob that moved.
27. `capturing a note broadcasts nothing` — a §79 note is not a workspace change.

**Host — `apps/prototype-host/api/services.test.ts` (additions)**

28. `a service built by createApi publishes through the hub` — the wiring, not the hub.

**Host — `apps/prototype-host/main.test.ts` (additions)**

29. `GET /prototype/events streams over the real socket` — the raw mount is wired.
30. `stopping the server terminates an open stream and its heartbeat` — the Ctrl+C hang.

**Web — `apps/web/src/app/core/live/prototype-live-updates.spec.ts`**

31. `opens the stream with the resolved persona` — the URL carries `?user=<id>` from `IdentityProvider`, not from storage.
32. `delivers a parsed event to subscribers`.
33. `ignores a frame that is not a LiveEvent` — malformed JSON and a wrong shape are both dropped without throwing.
34. `does not reopen while the browser is retrying` — an `error` with `readyState === CONNECTING` opens no second source.
35. `reopens on a capped backoff after a refused connection` — `readyState === CLOSED` schedules exactly one reopen, after a delay, and repeated failures back off rather than looping.
36. `closes the source when the last subscriber leaves`, including `when the last subscriber leaves before the persona resolves`.
36b. `backs off rather than dying when the persona lookup rejects` — the `pnpm dev` startup race must not leave the page permanently without a stream.

**Web — store specs**

37. `task-list-store.spec.ts`: `refresh re-reads the project's tasks without touching loading or error`; `refresh defers while an optimistic completion is in flight and lands once it settles`; `a burst of refreshes coalesces into one re-read`.
38. `project-page-store.spec.ts`: `a live task event for this project quietly refreshes tasks and progress`; `a live event for another project is ignored`; `a project.updated event re-reads the project and its sections`; `a live event during an optimistic section reorder does not clobber the preview`; `prototype.reloaded reloads the project`.
39. `recent-activity-section.spec.ts`: `a live event for the section's project reloads the feed`; `a failed live refresh leaves the rendered feed alone`.
40. `dashboard-store.spec.ts`: `a live task event quietly reloads the dashboard`; `an agent_connection event does not`.
41. `shell-store.spec.ts`: `a live project event reloads the sidebar tree without a loading flicker`.

**Acceptance — `scripts/live-acceptance.mjs`** — the six numbered steps above.

## Boundaries touched

- **Domain must not know about HTTP, MCP or JSON.** `LiveEventPublisher` is a port in
  `packages/domain`, shaped like `Clock`. It takes contracts types and returns `void`.
  The `AsyncLocalStorage`, the buffering, the SSE framing and the sockets live in
  `apps/prototype-host`.
- **Components depend on interfaces, never a transport.** Stores inject `LIVE_UPDATES`, an
  interface token. `EventSource` appears in exactly one file, and `app.config.ts` remains
  the only file naming a concrete adapter.
- **Contracts defined once.** `LiveEvent` reuses `ActivityActionSchema`,
  `ActivityEntityTypeSchema` and `ProjectIdSchema`. Host and client parse the same schema.
- **MCP tools call domain services.** Unchanged — the MCP path broadcasts because the
  services it already calls record activity. Test 25 pins it.
- **No `new Date()` in domain code.** The publisher adds no timestamp; the heartbeat's
  interval lives in the host.
- **One flag service.** No new flag; live updates are unconditional.

## Explicit non-goals

From the slice's *Do not*: no CRDTs, no presence, no conflict resolution, no reconnect
replay or backfill (a reconnecting client refreshes, which is the same thing at prototype
scale), no `Last-Event-ID` cursor.

Deferred by this plan, with the reason:

- **Cross-process events from `pnpm mcp:stdio`.** Slice 15's documented limitation; fixing
  it means an inter-process channel, which is the infrastructure §62 forbids.
- **The agent connections page.** Its two workspace writes — permissions and revocation —
  are made *by* that page, and the third mutation, `touch`'s "Last used", records no
  activity event and so produces no live event at all. A subscription there would change
  nothing observable.
- **Sub-projects, reflections, timeline and progress-section stores.** They refresh through
  `ProjectPageStore` or their own writes.
- **A connection indicator in the UI.** `LiveUpdates` exposes no `connected` signal, because
  nothing renders one and §71 says not to build the stream out.
- **Suppressing self-echo.** Accepted, with the two refresh rules as the mitigation.
- **Optimistic-UI changes (§63).** This slice refreshes; it touches the optimistic paths
  only to make refresh safe alongside them.

## Open questions

1. **Should the stream be persona-filtered at all, given one host and one file?**
   Resolved: yes, by `?user=`. The seeds carry several personas in different workspaces, and
   an unfiltered stream would make every tab refresh on every other persona's writes. Noise
   reduction, not access control.
2. **How does a refresh avoid clobbering an in-flight optimistic edit?**
   Resolved, and *not* via `TaskListStore.fieldRevisions`: those entries are set by `claim`
   and never deleted, so "has a revision" means "was ever edited", and a refresh skipping
   them would permanently ignore server updates to every field the user has touched. Both
   `TaskListStore` and `ProjectPageStore` get an explicit pending-mutation counter instead.
3. **Does the inert default for `LIVE_UPDATES` risk shipping a dead stream?**
   Resolved: the `app.spec.ts` injection-shape check asserts `appConfig` provides the real
   adapter.

## Revisions

**Round 1** (24 findings). The substantive ones, all verified against the source first:

- The port could not carry `workspaceId`, making the hub's filtering unimplementable.
  Introduced `LivePublication`.
- "Exactly one event per operation" was false: no-op writes and idempotent returns record
  nothing, and `AgentConnectionService.touch` never records. Restated as "at most one", and
  the agent-connections non-goal's reasoning corrected — it was wrong about *why*.
- `entityType` is not a reliable router: `SectionService` records section mutations as
  `entityType: 'project'`. Clients route on `type` and `projectId`.
- Open question 2 misread `TaskListStore`: `fieldRevisions` is never cleared, so the
  proposed guard would have made every edited field permanently stale.
- `refresh` built on `load()` would repaint skeletons on every agent write.
- Slice 12 parked three `location.reload()` calls in this slice and the plan ignored them.
- Emitting `prototype.reloaded` from `PrototypeRuntime` would fire three times for one
  `reset()`; moved to the route table.
- The nesting rule had to be "reuse an existing buffer", not "mirror `openUnitStores`".
- The adapter's manual reconnect would race `EventSource`'s own.
- Acceptance step 4 measured from the resolved tool call, which is *after* the frame is
  flushed and would have been negative.

**Round 2** (20 findings). What changed:

- The quiet-refresh rule had been applied to `TaskListStore` alone; the other four stores
  would still have flickered and, worse, could have replaced a rendered page with an error
  caused by an agent's write. Promoted to a rule for every subscribing store.
- `ProjectPageStore`'s optimistic **section reorder** was unguarded, and the tab's own
  reorder echoes back before its HTTP response lands. Given the same pending-mutation
  counter.
- The reason kept for reloading on reseed was false — every seed rebuilds all personas from
  the same list, so a persona id never dies. Replaced with the real reason, and the same
  invariant now justifies resolving `?user=` once at connect time.
- "Reopen when `readyState === CLOSED`" would have turned the `?user=` 404 into a hot
  request loop, because a non-200 closes the source with no browser retry. Added a capped
  backoff, and test 35 now pins it instead of pinning the bug.
- Shutdown needed no new code: `stop()`'s existing `closeAllConnections()` already destroys
  an open stream. The `main.ts` row lost that clause; the test stays as a regression check.
- Self-echo was a decision the plan was making by omission. Now stated, with its cost.
- The `main.ts` row omitted the wiring that makes the slice work, and
  `createPrototypeRoutes`' positional signature was unaddressed.
- `createApi` must build the wrapped unit of work *locally*; reassigning
  `Persistence.unitOfWork` would drag the seed swap through the hub.
- The SSE `?user=` lookup diverges from `resolveUser` (absent → unfiltered, not
  default-persona) and its 404 must carry CORS. Both now stated.
- `ActivityStore` keeps no `projectId`; the adapter can be torn down before its async
  persona lookup resolves; `app.spec.ts` must assert by injection, not by rendering; test 25
  needs a real seeded connection id. All now specified.
- Tests added for `broadcastToAll` to a filtered subscriber, two queued units, and an
  empty-buffer unit. Heartbeat-timing and subscriber-isolation cases dropped as §71 noise.

**Round 3** (verdict: ready; four specification gaps). Closed:

- A *rejected* persona lookup was unspecified, and the obvious implementation would leave
  the stream dead for the page's lifetime on the `pnpm dev` startup race. It now enters the
  same backoff.
- `TaskListStore.refresh` had a pending-mutation guard but no `loadGeneration` guard, so a
  refresh crossing a project switch would have written A's tasks under B's header.
- Quiet refreshes run inside `PendingTasks`, so `whenStable()` stays the specs' await point.
- The `dev-panel-controls` test could not fail: the mode buttons do not render without a
  project in the route, and jsdom's `location.reload()` is neither throwing nor observable.
  Dropped in favour of the `project.updated` case that proves the replacement.

**Step 4** (three reviewers against the diff: correctness, boundaries/spec, acceptance/docs).
The suite, the lint and both acceptance scripts pass. What the reviews changed:

- Two comments claimed `app.config.ts` was the only file naming the concrete adapter;
  `app.spec.ts` names it too, deliberately, to assert the wiring. Corrected to "provides".
- The acceptance script had two ways to pass vacuously: `issuedAt` started at `Infinity`, so
  a frame arriving before the call was issued would measure `-Infinity` and satisfy the
  budget; and the frame wait had no timeout, so "no frame ever arrives" would have hung
  rather than failed red. Both fixed, and the fixture token now comes from `tokenFor` instead
  of being a second copy of a credential.
- Two `main.test.ts` titles over-promised: one implied it proved `main.ts`'s mount (it drives
  the handler directly; the real mount is `live-acceptance`'s job), the other named the
  heartbeat (asserted in `sse.test.ts`). Both now say what they prove.
- Four older decision entries had "Slice 16 will…" written in the future tense, two of them
  as an open *Revisit when* that this slice answered. All four updated in place, per AGENTS.md
  §2 rule 1 — that is the living-documentation rule doing exactly what it is for.
- README said "every domain mutation broadcasts one event"; it is *at most* one.

**Kept against a review finding.** The boundary reviewer read the adapter's capped
exponential backoff as §71 over-build and proposed a fixed 2 s interval, conceding the
mechanism itself is needed. Kept: the ~6 lines beyond a fixed timer are what stop a
persistently refused stream — a mistyped persona is a permanent 404 — from polling the host
forever, and resetting on `open` is what keeps a single hiccup from leaving a long session at
the ceiling. Two of the adapter's nine cases cover it, which is not the exhaustive suite §71
warns against.

**Step 4, correctness pass.** Four real browser-side defects, all found by review rather than
by a test, all fixed with a regression case where one was cheap:

- **`DashboardStore` could strand the page on a skeleton.** Both reads bumped one generation
  counter but only the loud one was allowed to clear `loading`, so a live frame arriving
  during the first load left the flag set forever with the data already in hand. Whoever
  holds the current generation now clears it; only the loud path sets it.
- **`TaskListStore.refresh` silently dropped a re-read** when a write began *after* the read
  started: the post-await guard returned without re-queueing. It re-queues now, and `load`
  joins the same counter so a frame arriving mid-load queues behind it instead of racing it.
- **`ProjectPageStore` dropped, rather than deferred, a canvas re-read** during a section
  write — and the comment justifying that was wrong: only three of the five section writes
  reconcile afterwards, and none re-reads the project record. Queued and flushed instead.
- **`ShellStore.refresh` never cleared `errorState`,** so the `pnpm dev` startup race (web up
  before the host) left the sidebar rendering its error branch over a tree that had since
  loaded fine. Both reads also now share a generation.
- **`LiveEventHub` had no listener error containment.** Latent — the SSE listener cannot
  throw — but one throwing subscriber would have aborted delivery to everyone behind it *and*
  rejected `wrapUnitOfWork.run`, answering an already-committed write with a 500.
