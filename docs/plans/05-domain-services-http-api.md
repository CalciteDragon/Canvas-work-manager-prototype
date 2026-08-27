# Slice 5 — Domain services + first HTTP API

**Status:** done

## Goal

Projects and tasks become real, rule-checked, activity-recording behavior in
`packages/domain`, reachable over HTTP from the prototype host and durable across a
host restart.

## Spec sections

§8 (UI never sees storage), §9 (the gateway shapes the services must be able to feed),
§12 (domain services know nothing of HTTP, MCP, or JSON), §33 (task model, five
statuses, `completedAt`), §57 (every mutation produces an attributable activity event),
§61 (the prototype REST routes), plus §13/§15 for the repository and unit-of-work
boundary the services sit on and §69 for what the domain tests must cover.

## Acceptance check

Executable, in order.

1. `pnpm --filter @cwm/domain test` exits 0 and covers task status transitions,
   `completedAt` and `archivedAt` handling, project hierarchy rules, cross-workspace
   scoping on read *and* write, `null`-means-clear update semantics, and activity
   emission for every mutation.
2. `pnpm --filter @cwm/prototype-host test` exits 0 and covers every route this slice
   adds, including malformed JSON bodies (400), schema-invalid bodies (400), malformed
   query strings (400), unknown ids (404) on every `:id` route, cross-workspace ids
   (404), rule violations (409), and the empty-collection responses Slice 6 will hit
   first.
3. `pnpm --filter @cwm/prototype-host acceptance` exits 0. The script copies
   `prototype/seeds/personal-workspace.json` to a **temporary** data file (never
   `.prototype/data.json`), starts a real host against it via `CWM_DATA_FILE`, and
   asserts, in order:
   - `POST /api/projects` → 201, contract-valid `Project`
   - `POST /api/tasks` in that project → 201, contract-valid `Task`
   - `POST /api/tasks/:id/complete` → 200, `status: "done"`, `completedAt` set
   - `GET /api/activity` → contains `project.created`, `task.created`, `task.completed`,
     each with `actor: "user"` and `actorUserId` set
   - the host is stopped, started again against the same file, and
     `GET /api/tasks?projectId=…` still returns the completed task — proving the writes
     went through a unit of work to disk.
4. `pnpm test` and `pnpm lint` both exit 0. `pnpm lint` runs the domain's
   `check-no-direct-date.mjs` **and** a new `check-domain-imports.mjs`, so no service
   constructs a `Date` and no domain file imports a `node:`/filesystem module, a store,
   or a concrete repository.
5. **No lost updates under concurrency.** A host test fires five `POST /api/tasks`
   without awaiting any of them; all five return 201 with distinct ids, and a following
   `GET /api/tasks?projectId=…` returns all five. Without a serialized write path the
   overlapping units reject (`runUnitOfWork` refuses overlap) and the run fails on the
   201s; the read-back is there so the check still holds for any implementation that
   drops a unit silently instead — the store clones the document per unit, so a dropped
   unit discards its sibling's insert.

   (The *deterministic* proof that overlapping units serialize lives in
   `data-store.test.ts` with explicit blockers; item 5 is the end-to-end consequence.)
6. `development.md` marks Slice 5 `done`; this plan carries a Revisions section; and the
   decision entries below exist. (Driving the app and recording friction in
   `.prototype/notes.json` is AGENTS §3 Step 4, not a pass condition — a checklist item
   that rewards *finding* friction rewards inventing it.)

## File-level change list

### `packages/contracts`

- `src/task.ts` — add `archivedAt: IsoDateTimeSchema.optional()` to `TaskSchema`, and
  correct the docstring, which currently claims "Exactly §33's shape. Nothing §33 does
  not name." It must say what the field is for and why §33's text ("Start flexible")
  permits it. A comment that silently becomes false is a stale doc (AGENTS §2).
- `src/inputs.ts` — add `includeArchived: z.boolean().optional()` to `TaskQuerySchema`
  (default: archived tasks are excluded; **implemented in the repository**, see below),
  and add `ActivityQuerySchema` (`projectId?`, `limit?` — nothing else has a Slice 5
  consumer) so `GET /api/activity` parses a contract-owned shape rather than one
  invented in the host (§11).
- `src/task.test.ts`, `src/inputs.test.ts` — cover the new field and query shape in the
  existing style.

### `packages/repositories`

- `src/interfaces.ts` — add `UnitOfWork { run<T>(fn: () => T | Promise<T>): Promise<T> }`.
  Signature matches `DataStore.runUnitOfWork` exactly so a synchronous callback still
  type-checks. This is the §15 operation boundary named as a narrow interface, so domain
  services can depend on it without depending on a store, a file, or JSON. Defined once,
  here.
- `src/interfaces.ts` — also widen `ActivityRepository.list()` to
  `list(query?: ActivityQuery)`. It currently takes no argument, which would force
  `ActivityQuerySchema`'s filters into the service — the exact split this slice moves
  `includeArchived` *out* of. Activity is not an exception to the rule.
- `src/json-repositories.ts` — implement `ActivityQuery` (`projectId`, `limit`) in
  `JsonActivityRepository.list`, symmetric with the task and project filters, and
  implement `includeArchived` in `JsonTaskRepository.list`:
  one predicate, `query.includeArchived === true || task.archivedAt === undefined`.
  It goes here, not in the service, because
  `docs/decisions/2026-08-repository-query-semantics.md` fixed the reason these shapes
  live on the repository interface — a query field the repository silently ignores
  type-checks and lies, and two implementations would diverge on it.
- `src/data-store.ts` — export `unitOfWorkFor(store: DataStore): UnitOfWork`. Not a
  pass-through and not a naive queue; see "The write path" below. Three properties:
  memoized per store, serialized across independent callers, and **re-entrant** — a
  `run` from inside an open unit joins it rather than queueing behind it.
- `src/index.ts` — add `unitOfWorkFor` to the hand-written barrel (it is not `export *`).
- `src/data-store.test.ts` — `serializes overlapping units of work` (two `run()` calls
  started without awaiting; both succeed, in order, two persists); `a nested run joins
  the caller's unit instead of deadlocking` (one persist, both writes committed);
  `a failing unit of work does not poison the queue`; `returns the same adapter for the
  same store`.
- `src/json-repositories.test.ts` — `excludes archived tasks unless includeArchived is
  set`; `filters activity events by project and applies limit last`.
- `docs/decisions/2026-08-repository-query-semantics.md` — append the `includeArchived`
  semantics. Its own "Revisit when" already names Slice 5.

### The write path

Worth stating once, because two rounds of review found bugs here and the code is
non-obvious. `BaseDataStore.runUnitOfWork` throws `UnitOfWorkInProgressError` if a unit
is already open *or* if the caller is an async descendant of one
(`activeOperationTokens.has(this) || inheritedContext(this) !== undefined`). So:

- **Independent callers must not overlap.** A Node HTTP server interleaves requests by
  construction, so without serialization two writes turn an ordinary double-click into a
  500. `unitOfWorkFor` serializes them on a promise chain — effectively a global write
  lock. Reads are unaffected: with no open unit, `getActiveDocument` returns the
  committed document, so `GET` routes never queue.
- **Nested callers must join, not queue.** A plain promise-chain adapter would append
  the inner call behind the outer unit that is awaiting it: a permanent hang, no error,
  no timeout, and a wedged host. So `unitOfWorkFor` keeps its own
  `AsyncLocalStorage<Set<DataStore>>` marker; when `run` sees this store already marked,
  it invokes the callback directly, inside the caller's unit, and the whole operation
  stays atomic.
- **The adapter is memoized** in a `WeakMap<DataStore, UnitOfWork>`. Two adapters over
  one store are two independent chains, which overlap, which is the bug serialization
  was added to fix.
- **The queue tail must store the caught branch**, or one rejected write leaves an
  unhandled rejection.
- **`run` is `async`** (and the join is `(async () => fn())()`), so a *synchronous*
  throw from `fn` rejects the returned promise instead of escaping `run` synchronously
  and violating the `Promise<T>` the interface advertises.
- **The queued branch runs inside `operationContexts.run(new Map(), …)`.** `unitOfWorkFor`
  lives in the same module as that ALS, so one line makes a queued unit immune to a
  caller that happens to be a stale async descendant of some earlier direct
  `store.runUnitOfWork` — which would otherwise 503 against an idle queue.

This shape was verified by running it against the real `InMemoryDataStore` before the
plan was accepted: nested join → one persist with both writes committed; two overlapping
callers → two persists, both present; a rejected unit followed by a successful one.

The convention "only entry-point service methods open a unit of work" still holds and is
still tested — the re-entrancy join is a safety net so that breaking it costs a
redundant call, not a hang.

### `packages/domain`

- `package.json` — add `@cwm/contracts` and `@cwm/repositories` as dependencies and
  `@cwm/prototype-data` as a devDependency (tests use `SEED_NOW`); add
  `check-domain-imports.mjs` to the `lint` script.
- `scripts/check-domain-imports.mjs` — walks `src/**/*.ts` (excluding `*.test.ts`, like
  `check-no-direct-date.mjs`) with the TypeScript AST and fails on:
  - a module specifier that is `node:*`, `fs`, `path`, `http`, `https`, or `@cwm/prototype-data`;
  - a relative specifier escaping `packages/domain/src`;
  - any **named binding** from `@cwm/repositories` outside an allowlist of the eight
    `*Repository` interfaces plus `UnitOfWork`. The specifier itself must be allowed —
    the domain is required to import it — so the check is on the bindings. This is what
    catches the breach that matters: a service importing `DataStore`, `JsonDataStore`,
    `InMemoryDataStore`, `FileOperations`, or `validateDocumentIntegrity` is a service
    that knows storage is JSON (§12).
- `src/import-lint.test.ts` — a self-test for the above, mirroring the existing
  `time-lint.test.ts`, so the lint is proven to fail on a violation rather than assumed.
- `src/errors.ts` — `EntityNotFoundError` (an id that does not resolve *for this actor*)
  and `DomainRuleError` (a rule the caller broke: bad transition, cycle, unsupported
  move). Two classes; the host maps them to 404 and 409.
- `src/ids.ts` — `IdGenerator { next(prefix: string): string }` and
  `PrototypeIdGenerator`, returning `` `${prefix}-${crypto.randomUUID().slice(0, 8)}` ``.
  Readable ids are a stated reason §14 chose JSON, and the seeds' `task-1` convention
  survives. `crypto` is the global (no `node:crypto` import, which the new lint rejects);
  `Date` is never touched, so the existing lint stays green. Services parse the result
  through `TaskIdSchema`/`ProjectIdSchema`/`ActivityEventIdSchema` rather than casting,
  so the brand stays honest. Tests inject a deterministic counter.
- `src/actor.ts` — `ActorContext`: `{ workspaceId, actor: 'user' | 'agent' | 'system',
  userId?, agentConnectionId? }`, plus `assertValidActor`, rejecting the combinations
  `ActivityEventSchema` already forbids (user actor with no user, agent actor with no
  connection, system actor with either). The caller resolves identity; the domain checks
  the shape and scopes every read and write to `workspaceId`. This is the shape Slice
  13's `AgentContext` will fill in for MCP.
- `src/activity-service.ts` — `ActivityService.record(actor, { action, entityType,
  entityId, projectId?, summary })` builds and inserts exactly one `ActivityEvent`, with
  `id` from the generator and `createdAt` from the clock. The full signature is pinned
  here because `ActivityEventSchema` requires more than a verb: `summary` is required and
  non-empty, and `projectId` must match the target's project when present, which
  `validateDocumentIntegrity` enforces. `ActivityService.list(actor, query)` returns the
  actor's workspace events, `createdAt` descending, ties broken by document insertion
  index descending — decorate with the array index and sort on both keys. A plain stable
  sort would give the *opposite* tie order (stability preserves the original ascending
  relative order), and the clock is settable, so two events in one millisecond are
  ordinary. `limit` applies last, after scoping and sorting.
  `ActivityQuerySchema.limit` is `z.number().int().positive().max(200)` because it
  arrives off a query string.
  It owns the `entity.verb` vocabulary this slice introduces: `project.created`,
  `project.updated`, `project.archived`, `task.created`, `task.updated`,
  `task.completed`, `task.archived`. **`record` never opens a unit of work.**
- `src/project-service.ts` — `ProjectService` with `create`, `get`, `list`, `update`,
  `archive`. Owns: workspace scoping — `list` builds `{ ...query, workspaceId:
  actor.workspaceId }` with the actor's workspace **last**, so a caller-supplied
  `ProjectQuery.workspaceId` cannot widen the result; parent-must-exist / same-workspace
  / no-self / no-cycle nesting; the archive-with-active-children rule applied *both*
  through `archive()` and through an `update()` that transitions status into `archived`
  (the exposed route is `PATCH`, so a rule only `archive()` enforces is decorative); and
  timestamps from the clock.
- `src/task-service.ts` — `TaskService` with `create`, `get`, `list`, `update`,
  `complete`, `archive`. Owns: project must exist and be in the actor's workspace, parent
  task must exist in the same project, status transition rules, `completedAt` set on
  entering `done` and cleared on leaving it, `archivedAt` handling,
  `null`-clears / `undefined`-leaves-alone update semantics, and the verb rule below.
  An explicit `TaskQuery.projectId` or `parentTaskId` that does not resolve for this
  actor raises `EntityNotFoundError` rather than returning `[]` — consistent with `get`,
  and it stops the UI rendering "no tasks" for a typo or a foreign id. A list with no
  such filter skips the check entirely, so an empty workspace still answers `[]`.
  `ProjectQuery.parentProjectId` deliberately does *not* get the same treatment — it
  returns `[]` for an unknown or foreign parent, because the workspace override already
  makes a leak impossible and projects are the thing the sidebar lists on every load.
- `src/index.ts` — export the services, errors, actor type and guard, id generator, and
  the existing clock.
- `test/test-support.ts` — a `CountingDataStore extends InMemoryDataStore` exposing a
  persist count. `data-store.test.ts`'s `TrackingStore` is test-local and not exported,
  and several tests below assert persist counts. It lives in `test/`, **not** `src/`,
  because both lints scan `src/**/*.ts` excluding only `*.test.ts`: a helper whose whole
  purpose is `extends InMemoryDataStore` would fail `check-domain-imports.mjs` on the
  first commit, and `new Date(SEED_NOW)` would fail `check-no-direct-date.mjs`. Keeping
  the lints' scope at `src/` with no exemption list is cleaner than carving holes in
  them. Renaming it `*.test.ts` is not an option — Vitest errors on a test file with no
  tests.
- `tsconfig.json` — widen `include` to cover `test/**/*.ts`.
- `src/project-service.test.ts`, `src/task-service.test.ts`,
  `src/activity-service.test.ts`, `src/ids.test.ts`, `src/actor.test.ts` — the test plan
  below, driven against `InMemoryDataStore`/`CountingDataStore` plus the real
  `Json*Repository` implementations (tests may name concrete implementations; services
  may not), with a `PrototypeClock` starting at `SEED_NOW` and a counter id generator.
  Fixtures contain **two personas**, both populated, so every scoping test has a real
  foreign workspace to fail against.

### `apps/prototype-host`

- `package.json` — add `@cwm/domain`, `@cwm/repositories`, `@cwm/prototype-data`, and an
  `acceptance` script.
- `persistence/store.ts` — resolve the data file from `CWM_DATA_FILE` (relative to
  `process.cwd()`), defaulting to `@cwm/prototype-data`'s repo-anchored
  `DEFAULT_DATA_PATH`. A cwd-relative default would be wrong: `pnpm dev:host` runs with
  cwd `apps/prototype-host` and would silently create a second data file that
  `pnpm prototype:reset` never touches. If the file does not exist, write the default
  seed first so a cold clone can `curl` immediately. Returns the store and the
  repositories the routes need.
- `api/context.ts` — resolve the acting user from an optional `x-prototype-user` header,
  defaulting to the first user in the document, and build the `ActorContext` from *that
  user's own* workspace, so an HTTP caller cannot forge a workspace. A document with no
  users — impossible in the shipped seeds, reachable in a hand-built route-test fixture —
  fails loudly rather than reading `workspaceId` off `undefined`. A placeholder, not
  authentication: §18's `IdentityProvider` is Slice 6 and §51's agent tokens are Slice
  13, which is what `apps/prototype-host/auth/` is reserved for. It lives in `api/` so
  that empty directory keeps meaning "no auth yet".
- `api/services.ts` — construct `PrototypeClock`, `PrototypeIdGenerator`,
  `unitOfWorkFor(store)` and the three services once at startup.
- `api/body.ts` — read and `JSON.parse` the request body. A `SyntaxError` here is a
  caller mistake, not a 500, so it is normalized to the same 400 as a schema failure.
  **An empty body resolves to `undefined`, not a parse error** — `JSON.parse('')` throws,
  and `POST /api/tasks/:id/complete` and `/archive` take no body, so the naive rule would
  400 the acceptance script's own third step. Those two handlers do not read a body at
  all. A non-object JSON body (`null`, `[]`) reaches Zod and fails as a 400 there. Bodies
  over 1 MB are rejected rather than buffered without limit.
- `api/routes.ts` — the routes this slice covers.
  From §61: `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`,
  `GET/POST /api/tasks`, `PATCH /api/tasks/:id`.
  From the slice's Build list (not §61): `POST /api/tasks/:id/complete`.
  From §9's `TaskGateway`, which pins `list/get/create/update/complete/archive`:
  `GET /api/tasks/:id` and `POST /api/tasks/:id/archive`. Both are five-line handlers
  over services this slice already builds; deferring them would leave `TaskService.archive`
  unreachable dead code and force Slice 6 or 7 — whose scope guards are about UI — to
  reopen this file.
  Added because the slice's *Done when* requires seeing the resulting event, and there is
  no other way short of reading the JSON file: `GET /api/activity`. §61 says "may
  expose", "Examples", and "not final production routes", so it is not a closed list.
  Query strings parse through `TaskQuerySchema` / `ProjectQuerySchema` /
  `ActivityQuerySchema`; bodies parse through the Create/Update input schemas; responses
  are contract shapes.
- `api/errors.ts` — the one place the host formats an error. Full mapping:
  `ZodError` → 400 `invalid_request` (with issues);
  body `SyntaxError` → 400 `invalid_request`;
  `EntityNotFoundError` → 404 `not_found`;
  `RepositoryNotFoundError` → 404 `not_found`;
  `DomainRuleError` → 409 `rule_violation`;
  `RepositoryConflictError` → 409 `conflict` (a backstop — the domain mints ids, so it
  should be unreachable);
  `UnitOfWorkInProgressError` → 503 `busy` (also a backstop, but genuinely reachable:
  a stale async descendant of a committed unit still trips the store's guard);
  `DocumentIntegrityError` → 500 `internal_error` (a real bug, not a caller mistake);
  anything else → 500 `internal_error`.
  An unmatched method on a matched path returns the generic JSON 404 rather than 405 —
  deliberate for a disposable host (§71), stated so it is a choice, not an accident.
- `router.ts` — replace the exact-string route map with a small pattern matcher
  (`/api/tasks/:id`) and make handlers async, since they now await the domain. The health
  route keeps working unchanged. Still deliberately disposable (§71): no framework, no
  middleware stack.
- `main.ts` — build the store and services at startup and pass the resulting handler into
  `createServer`, so a failure to load the data file fails the start loudly. `start()`
  gains a handler parameter.
- `main.test.ts` — updated for that signature (it is *not* unchanged), keeping its
  existing start/stop and port-in-use coverage.
- `scripts/acceptance.mjs` — acceptance item 3, against a real host process and a
  temporary data file. Plain Node with no TypeScript imports: it copies the committed,
  contract-valid `prototype/seeds/personal-workspace.json` rather than calling
  `writeSeedFile`, which is TypeScript and whose CLI takes only a seed name, not a path.
- `router.test.ts`, `api/routes.test.ts` — route tests against an in-memory store.

### Documentation

- `docs/decisions/2026-08-task-status-archive-and-move.md` — legal transitions,
  `completedAt`, why archive is a field, and why moving a task between projects is
  refused for now.
- `docs/decisions/2026-08-project-nesting-and-archive-rules.md` — parent rules, cycles,
  and what archiving a parent does.
- `docs/decisions/2026-08-activity-summary-ownership.md` — what `summary` is for, and
  what it is not.
- `development.md` — Slice 5 `in progress` at start, `done` at the end.
- `.prototype/notes.json` — friction found while driving the real API (Step 4, not
  acceptance).

## Rules this slice fixes (and logs)

**Task archive → a new `archivedAt` field, not `status: 'cancelled'`.** The Build list
requires `TaskService.archive`, so it cannot simply be deferred. Overloading `cancelled`
was the cheaper change but the wrong one: §83 asks which of §33's five statuses are
useful, and conflating archive with cancel guarantees the prototype learns that
`cancelled` is used a lot and nothing about why. §58 also treats "complete task" and
"archive task" as different operations with different confirmation rules. §33 says
"Start flexible", so `archivedAt?: IsoDateTime` is a legitimate addition; it costs one
optional contract field and one repository predicate, and it leaves unarchiving possible.
Revisit when Slice 7's UI shows whether users distinguish the two at all.

**Task status transitions.** Entering `done` sets `completedAt` from the clock; leaving
`done` clears it. `complete()` on an already-`done` task is idempotent and records no
second event. `complete()` on an archived task is a `DomainRuleError`. Every other
transition between the five statuses is allowed — the prototype exists to find out which
of them matter (§83), and a transition table invented now would prejudge that.

**Which verb an update emits.** A *transition* into `done` — from some other status —
emits `task.completed`; a transition into archived emits `task.archived`; everything else
emits `task.updated`. Mirrors the project rule, so the §57 feed shows what happened rather
than "updated" for everything. A no-op status write (setting `done` on a task that is
already `done`) changes nothing and records nothing, which keeps `update` consistent with
`complete()`'s idempotency rather than emitting a second `task.completed`.

**Moving a task between projects is refused** with a `DomainRuleError`.
`UpdateTaskInputSchema` carries `projectId`, but `development.md` gives move-to-project
to **Slice 20**, behind the `subtasks` flag, alongside the parent/child semantics that
make it hard. Slice 5 owes only that it must not corrupt the document —
`validateDocumentIntegrity` fails a subtask whose parent sits in another project.
Refusing beats removing the field from the contract: these Zod objects are not
`.strict()`, so a removed `projectId` would be *silently stripped* and answered 200,
which is worse than an explicit 409, and Slice 20 gets the field back with no contract
churn.

**Project nesting.** A parent must exist, sit in the same workspace, not be the project
itself, and not create a cycle. No depth limit — whether nesting is worth keeping is a
§83 question and a limit would prejudge it.

**Archiving a project with active children** is a `DomainRuleError`, enforced on both
`archive()` and a status-into-`archived` `PATCH`. An implicit cascade would archive work
the caller never named, and §58 already flags archive as the operation deserving
confirmation.

**Cross-workspace reads and writes raise `EntityNotFoundError`, not `DomainRuleError`.**
409 would confirm that a foreign id exists. A create naming another workspace outright is
still a `DomainRuleError` — nothing is being looked up there. Workspace filters supplied
by the caller are overridden, never merged.

**`summary` is a denormalized log line, not the feed's rendering source.**
`ActivityEventSchema` requires it, and the calling service is the only layer that knows
the entity's title at mutation time, so services write it. But it freezes at write time —
rename a task and its old summary persists — and §57's feed renders actor, verb, entity
title, project, and time as separate elements, which one pre-rendered string cannot
supply. Slice 13's feed composes from `actor`/`action`/`entityId`; `summary` is a
fallback and a debugging aid. Logged so Slice 13 does not discover it the hard way.

## Test plan

Written and run red first. Fixtures contain two populated personas.

**TaskService**

- `creates a task with clock timestamps and a generated id` — timestamps come from the
  clock, not `Date`; the result parses through `TaskSchema`.
- `defaults status to todo and priority to medium`.
- `rejects a task in a project that does not exist` — `EntityNotFoundError`.
- `rejects a task in another workspace's project` — `EntityNotFoundError`, not 409.
- `rejects a parent task from another project` — `DomainRuleError`.
- `get and update treat another workspace's task as missing` — `EntityNotFoundError`.
- `list never returns another workspace's tasks` — `Task` has no workspace field and
  `TaskQuery` no workspace filter, so this is *not* repository delegation: the service
  resolves the actor's projects first and intersects. The assertion names the actor's
  exact task ids as present **and** the foreign ids as absent, so an unconditional `[]`
  fails it.
- `raises EntityNotFoundError for a projectId filter naming another workspace's project`.
- `applies every TaskQuery filter through list` — the filters that *are* repository
  delegation.
- `completes a task, setting status done and completedAt from the clock`.
- `does not record a second event when completing an already-completed task`.
- `refuses to complete an archived task` — `DomainRuleError`.
- `clears completedAt when a done task moves back to todo`.
- `update to status done sets completedAt and emits task.completed, not task.updated`.
- `a no-op status write records no event` — setting `done` on an already-done task,
  matching `complete()`'s idempotency.
- `archives a task by setting archivedAt and records task.archived`.
- `excludes archived tasks from list unless includeArchived is set`.
- `refuses to move a task to another project` — the destination is a **valid project in
  the actor's own workspace**, so the project lookup succeeds and only the move rule can
  make it fail; asserts `DomainRuleError` specifically and that the store is unchanged.
- `clears dueAt when update passes null` / `leaves dueAt alone when update omits it` —
  `inputs.ts` documents this explicitly and nothing tests it today.
- `persists through one unit of work` — one create causes exactly one persist on
  `CountingDataStore`; a rule violation causes none.

**ProjectService**

- `creates a project in the actor's workspace with clock timestamps`.
- `rejects a create naming another workspace` — `DomainRuleError`.
- `nests a project under a parent in the same workspace`.
- `rejects a parent that does not exist` and `rejects a parent in another workspace` —
  `EntityNotFoundError`; `rejects itself as parent` and `rejects a parent that would
  create a cycle` — `DomainRuleError`.
- `archives a project by setting status archived`.
- `refuses to archive a project with an active child`, and allows it once the child is
  archived.
- `refuses to archive via PATCH when a child is active, and emits project.archived when
  it succeeds`.
- `ignores a workspaceId query naming another workspace` — both workspaces populated;
  returns only the actor's projects. This is the test that a *merge* instead of an
  *override* would fail.
- `get and update treat another workspace's project as missing`.

**ActivityService**

- `records an attributable event for every mutation` — parameterized over the seven
  verbs; each event parses through `ActivityEventSchema`, names the right entity, sets
  `projectId` for project-scoped targets, and carries a non-empty §57-shaped summary.
- `records agent and system events without a user id` — proves the §57 three-actor
  distinction is representable before Slice 13 needs it.
- `lists events newest first, scoped to the actor's workspace` — the clock is advanced
  with `setNow` between mutations, so ordering is decided by `createdAt` and not by an
  accident of sort stability.
- `breaks createdAt ties by insertion index, newest first` — same-millisecond events are
  ordinary; two are created without advancing the clock. A plain stable sort fails this,
  which is the point of writing it.
- `applies limit after scoping and sorting`.
- `writes the event inside the same unit of work as the mutation` — a failed mutation
  leaves no orphan event.
- `a mutation called outside a unit of work does not persist` — `assertCanMutateDataStore`
  *permits* writes when no unit of work exists anywhere, so a forgotten `run()` fails
  silently into memory with no persist and no integrity validation. This pins the rule
  that only entry-point service methods open one.

**Actor and ids**

- `assertValidActor rejects a user actor with no user, an agent actor with no connection,
  and a system actor carrying either`.
- `PrototypeIdGenerator returns distinct prefixed ids that parse through the id schemas`.

**Repositories / write path**

- `excludes archived tasks unless includeArchived is set` (`json-repositories.test.ts`).
- `serializes overlapping units of work` — explicit blockers, deterministic.
- `a nested run joins the caller's unit instead of deadlocking` — one persist, both
  writes committed. Without the ALS join this test hangs, so it is run with a timeout.
- `a failing unit of work does not poison the queue`.
- `unitOfWorkFor returns the same adapter for the same store`.

**Host routes** (against an in-memory store, no socket, except where noted)

- `POST /api/projects returns 201 and a contract-valid project`.
- `POST /api/projects rejects a schema-invalid body with 400 and issues`.
- `POST /api/tasks rejects a malformed JSON body with 400, not 500`.
- `GET /api/projects applies query filters from the query string`.
- `GET /api/projects/:id returns 404 for an unknown id and for another workspace's id`.
- `PATCH /api/projects/:id updates and returns the new project`.
- `POST /api/tasks returns 201; GET /api/tasks/:id returns it; PATCH /api/tasks/:id
  updates`.
- `GET, PATCH, complete and archive on /api/tasks/:id return 404 for an unknown id`.
- `POST /api/tasks/:id/complete returns the completed task` — sent with **no body**, the
  way `curl -X POST` sends it.
- `POST /api/tasks/:id/archive returns the archived task`.
- `POST /api/tasks/:id/complete on an archived task returns 409 rule_violation`.
- `GET /api/tasks parses repeated and comma-separated status filters`.
- `GET /api/tasks rejects a malformed query string with 400`.
- `GET /api/tasks and GET /api/activity return [] on an empty workspace` — Slice 6's UI
  meets these first.
- `GET /api/activity returns the events newest-first`.
- `five concurrent POST /api/tasks all persist` — acceptance item 5, through a real
  server so the interleaving is real; asserts five 201s with distinct ids and five tasks
  on the following read, which fails on a lost update regardless of how the requests
  happened to interleave.
- `an unknown /api path still returns the JSON 404` and `GET /prototype/health still
  answers` — regressions on the router rewrite.

**End-to-end** — `scripts/acceptance.mjs`, acceptance item 3, including the stop/start
round trip against a temporary data file.

## Boundaries touched

- **Domain knows nothing of transport or storage (§12).** `packages/domain` imports
  `@cwm/contracts` and the *interfaces* from `@cwm/repositories`.
  `check-domain-imports.mjs` enforces this. The specifier rule is an **allowlist**
  (`@cwm/contracts`, `@cwm/repositories`, relative-within-`src`), because a ban list does
  not survive the next dependency — its first version banned `fs` and let `fs/promises`
  straight through. On `@cwm/repositories` it checks the named bindings, so a service
  importing `DataStore` or `JsonDataStore` fails. It walks the whole tree, covering
  `export … from`, `export *`, dynamic `import()` and `require()` as well as plain
  imports — a re-export was the hole that let a store back in. Tests may construct
  concrete repositories; services may not name them.
- **One unit of work per operation (§15).** Only an entry-point service method calls
  `UnitOfWork.run`; `ActivityService.record` and every internal helper run inside the
  caller's unit. The re-entrancy join in `unitOfWorkFor` makes a violation cost a
  redundant call rather than a hang, and a test pins the rule. No service calls
  `persist()` or touches a file.
- **No `new Date()` in domain (§45).** Every timestamp comes from the injected `Clock`;
  `check-no-direct-date.mjs` enforces it in `pnpm lint`.
- **Contracts defined once (§11).** Every request body, query, and response shape comes
  from `@cwm/contracts` — including `ActivityQuerySchema`, added there rather than
  invented in the host. The host defines no `Task`- or `Project`-shaped types.
- **Query semantics stay on the repository (§13).** `includeArchived` is implemented in
  `JsonTaskRepository` and `ActivityQuery` in `JsonActivityRepository`, not filtered
  afterwards in the service, so a contract query means the same thing to every
  implementation — the rule `docs/decisions/2026-08-repository-query-semantics.md`
  already set. No collection is an exception to it.
- **Angular is untouched.** No file under `apps/web` changes.
- **MCP is untouched.** `packages/mcp-tools` keeps its placeholder. The services are
  shaped so Slice 14's tools can call them with an agent `ActorContext`, but nothing here
  imports the MCP SDK.

## Explicit non-goals

From the slice: no Angular, no MCP, no sections. Also deliberately deferred:

- **No real authentication.** The acting user comes from a header with a default.
  §18's `IdentityProvider` is Slice 6; §51's agent tokens are Slice 13, and
  `apps/prototype-host/auth/` stays empty until then.
- **No move-to-project, subtask rollup, or ordering.** Slice 20.
- **No `SectionService`, `DashboardService`, `SearchService`, `ProgressService`,
  `TimelineService`, `ReflectionService`.** §12 names them; Slices 8–11 build them.
- **No live updates / event stream (§62).** Slice 16.
- **No latency or failure injection (§46).** Slice 12.
- **No delete anywhere.** Repositories have no delete and this slice does not add one.
- **No `DELETE` routes and no project archive route** — project archive is reachable
  through `PATCH`, which is the route the rule is tested against.
- **No pagination, sorting parameters, or ETags** beyond `ActivityQuerySchema.limit`.
- **No workspace repository or multi-workspace switching.** Personas already isolate
  workspaces (Slice 4); the actor carries one.
- **No further host HTTP tests than the list above.** §71 calls the host's HTTP
  implementation disposable; this is the slice that introduces the API, so it earns the
  route list once and should not grow it later.

## Open questions

None that block.

One acknowledged hole, stated rather than closed: the domain trusts the
`{ workspaceId, userId }` pair in `ActorContext` and does not resolve identity itself,
because it has no `UserRepository` dependency. HTTP callers cannot forge it —
`api/context.ts` derives the workspace from the resolved user — but an in-process caller
could pass a mismatched pair, and today that is caught only at commit by
`validateDocumentIntegrity`, as a 500. If Slice 13's MCP path makes that reachable, a
`UserRepository` moves into the domain and `ActorContext` shrinks to a user id.

## Revisions

- Initial plan written from the Slice 5 text, §8/§9/§12/§33/§57/§61, and the Slice 3/4
  code it builds on.
- **Round 1** (subagent review of the plan):
  - **Concurrency.** `runUnitOfWork` rejects re-entry and overlap; the original
    pass-through adapter would have turned any two interleaved HTTP writes into a 500.
    `unitOfWorkFor` now serializes, with tests and a 503 backstop.
  - **Nesting.** Made explicit that only entry-point service methods open a unit of work.
    Added a test for the quieter failure — a mutation with *no* unit of work anywhere
    passes `assertCanMutateDataStore` and vanishes without persisting.
  - **Workspace scoping.** The original plan scoped `list` and nothing else, and
    described task scoping as repository delegation — but `Task` has no workspace field.
    Added cross-workspace tests for `get`/`update`/activity and switched cross-workspace
    failures from 409 to 404.
  - **Task archive.** Reversed the `status: 'cancelled'` decision — it destroys exactly
    the §83 signal the prototype exists to collect. Now an `archivedAt` field.
    (The reviewer also proposed dropping `TaskService.archive` entirely — rejected:
    `development.md`'s Build list names it.)
  - **Move-to-project.** Cut; Slice 20 owns it. Slice 5 refuses a `projectId` change.
  - **Contracts.** `ActivityQuerySchema` and `archivedAt` became real contract changes
    rather than shapes invented in the host; `record`'s full signature pinned.
  - **Errors, project-archive-via-PATCH, hermetic acceptance, enforced import lint, and
    the `null`-clears / empty-state / guard / id-generator test gaps.**
- **Round 2** (second review, of the revised plan):
  - **The serializing adapter would deadlock.** A nested `run` would queue behind the
    outer unit that is awaiting it — a silent permanent hang, worse than the 500 it
    replaced, and no planned test would have caught it. `unitOfWorkFor` is now
    re-entrant via an `AsyncLocalStorage` marker, memoized per store in a `WeakMap`
    (two adapters over one store overlap, reintroducing the original bug), and stores
    the caught branch as its queue tail. Added the nesting, memoization, and
    queue-poisoning tests, and a "The write path" section, because this code has now
    produced a real bug in each of two rounds.
  - **A second cross-workspace leak.** `ProjectQuery.workspaceId` is caller-supplied and
    the repository honours it, so a merged query would have served another persona's
    projects to one curl — reachable from every shipped seed, all of which contain three
    workspaces. `list` now overrides, with a test that a merge would fail. Also pinned
    what an unresolvable `projectId`/`parentTaskId` filter does.
  - **`includeArchived` moved into `JsonTaskRepository`.** Filtering in the service while
    the field sits on the contract query would make
    `taskRepository.list({ includeArchived: true })` type-check and lie — the exact
    divergence `docs/decisions/2026-08-repository-query-semantics.md` exists to prevent.
    `json-repositories.ts` was also missing from the change list entirely.
  - **Error map corrections.** `RepositoryNotFoundError` (reachable) was missing while
    `RepositoryConflictError` (unreachable) was mapped; a malformed JSON body would have
    thrown `SyntaxError` into the 500 branch for an ordinary caller mistake. Added
    `api/body.ts` so it is clear which module parses.
  - **The acceptance script could not run.** `node acceptance.mjs` cannot import
    `writeSeedFile` (TypeScript), and `seed-cli.ts` takes only a seed name, not a path.
    It now copies the committed seed JSON. Also made it a package script.
  - **`CWM_DATA_FILE`'s default was cwd-relative**, which under `pnpm --filter` would
    have created a second data file at `apps/prototype-host/.prototype/data.json` that
    `pnpm prototype:reset` never touches. Now reuses the repo-anchored
    `DEFAULT_DATA_PATH`.
  - **§9's `TaskGateway`.** Added `GET /api/tasks/:id` and `POST /api/tasks/:id/archive`
    rather than deferring: without them `TaskService.archive` is unreachable dead code
    and a UI slice has to reopen `api/routes.ts`.
  - **Unfalsifiable tests.** `lists events newest first` was decided by sort stability
    under a fixed clock; the clock is now advanced, and the tie rule is defined and
    separately tested. `refuses to move a task` could have gone green off an unrelated
    `EntityNotFoundError`; the destination is now a valid same-workspace project.
    `list never returns another workspace's tasks` would have passed on an unconditional
    `[]`; it now asserts presence and absence. Acceptance item 5 asserted only "both
    succeed", which is true whether or not the requests overlapped; it is now a
    lost-update check over five concurrent writes.
  - **`check-domain-imports.mjs` was specified against module specifiers**, where the
    only specifier involved is `@cwm/repositories` — which the domain must import. The
    rule is now an allowlist over its *named bindings*, which is what catches a service
    importing `DataStore` or `JsonDataStore`, and it gained a self-test.
  - **Which verb a task `update` emits** was pinned (it was specified for projects and
    left ambiguous for tasks, and §57's feed renders the verb).
  - **`summary` ownership** got its own decision entry: it is a frozen, denormalized log
    line, not the feed's rendering source, and it goes stale on rename.
  - **Small fixes.** `@cwm/prototype-data` added as a domain devDependency for `SEED_NOW`;
    `TaskSchema`'s "nothing §33 does not name" docstring must change with the field;
    `ActivityQuerySchema` trimmed to the two filters with a Slice 5 consumer; a
    `CountingDataStore` test helper named, since `TrackingStore` is not exported; noted
    that `auth/` already exists; and capped the host route-test list per §71.
- **Round 3** (final review of the twice-revised plan; the write path, the two new
  routes, and the trimmed `ActivityQuerySchema` were all confirmed sound):
  - **`src/test-support.ts` would have failed the lint this slice adds.** Both domain
    lints scan `src/**/*.ts` excluding only `*.test.ts`, and the helper's whole purpose
    is `extends InMemoryDataStore` plus `new Date(SEED_NOW)`. Moved to
    `packages/domain/test/`, with the tsconfig `include` widened — cleaner than carving
    exemptions into two lints.
  - **`api/body.ts` would have 400'd the acceptance script's own third step.**
    `JSON.parse('')` throws, and `POST /api/tasks/:id/complete` carries no body. Empty
    bodies now resolve to `undefined`, those two handlers read no body, and a 1 MB cap
    is stated.
  - **The tie-break was backwards.** "Stable sort over the stored array" yields ties in
    insertion order *ascending*, contradicting the stated "descending" and the test name.
    Now an explicit index decoration, with `limit` applied last and bounded.
  - **Activity filtering contradicted the boundary added in round 2.**
    `ActivityRepository.list()` takes no query, so `ActivityQuerySchema` would have been
    filtered in the service — the split that `includeArchived` had just been moved out
    of. The interface is widened instead, so no collection is an exception.
  - **Verb rule vs. idempotency.** A no-op status write (setting `done` on a done task)
    now records nothing, matching `complete()`.
  - **Small fixes.** `run` is `async` so a synchronous throw rejects rather than escapes;
    the queued branch enters a clean `operationContexts` map; the
    `ProjectQuery.parentProjectId` asymmetry is stated rather than left for the next
    reviewer; `api/context.ts` fails loudly on a document with no users; acceptance item
    5's rationale no longer over-claims a lost-update that `runUnitOfWork` would reject.

## Outcome

Every acceptance item passes. `pnpm test` is 298 tests green across six packages;
`pnpm lint` is clean, including the two domain scanners.

**Deviations from the plan, and why:**

- **`main.test.ts` did not need changing.** The plan said it would. `start` took a
  default `routes = healthRoutes` parameter instead of a required one, so the existing
  start/stop and port-in-use tests kept working untouched. A default beat editing tests.
- **`SimulatedClock` was added, which the plan did not foresee.** Driving the API by hand
  showed every timestamp in a session was identical: `PrototypeClock` is frozen by design,
  which is right for a test and wrong for a host. The frozen clock stays for tests; the
  host got one that flows. This is the defect AGENTS §3 Step 4 exists to catch.
- **`main.ts` gained a `PORT` override.** The acceptance script needs a second host beside
  a live `pnpm dev`, and hardcoding 4310 would have made the two collide.
- **Three persist-count assertions were relaxed to behavioural ones.** A no-op mutation
  still calls `persist()`, because `runUnitOfWork` persists unconditionally. The
  observable contract — no duplicate event, unchanged `updatedAt` — is what matters, and
  asserting on disk writes was over-specifying an implementation detail of a store §71
  calls disposable. A redundant whole-file write per no-op is acceptable at prototype
  scale; if Slice 7's optimistic UI makes it noisy, the fix is a pre-check.
- **The concurrency test was rewritten after it proved vacuous.** See below.
- **Four decision entries, not three.** Workspace scoping earned its own once two review
  rounds found two separate leaks in it.

**On test-first.** The contracts, repositories and `unitOfWorkFor` were driven test-first
and watched fail. The three services were not — implementation came first, then tests.
To compensate, the seven load-bearing rules were verified by mutation: each was broken in
turn and a named test caught it. That found a real defect the green suite had hidden — the
five-concurrent-writes test passed with serialization removed, because an in-memory store
never actually overlaps. It now runs over a real file, where it fails as intended.

**Post-implementation review (AGENTS §3 Step 4).** Two review agents ran against the
diff. What they found and what changed:

- **The import lint enforced much less than this plan claimed.** It walked only top-level
  `import` declarations, so `export { JsonDataStore } from '@cwm/repositories'` — and then
  a clean relative import of that barrel from every sibling — passed silently, as did
  `import()`, `require()`, and every builtin reached by submodule (`fs/promises`) or
  unprefixed name (`crypto`, `async_hooks`). Rewritten as an allowlist over a full tree
  walk, with six new self-test cases covering each form. Writing those tests then found
  two bugs in the rewrite itself (`NamedExports` is not `NamedImports`).
- **An unknown `x-prototype-user` answered 500** — a caller mistake landing in the branch
  `api/errors.ts` exists to prevent. Now `EntityNotFoundError` → 404, with a test. The
  genuinely-broken case (a document with no users) stays a 500.
- **`ProjectPatch` was a parallel definition of `UpdateProjectInput`** (§11). The route
  parsed with the contract schema and handed the result to a hand-written twin, so a new
  contract field would have been accepted, validated, and silently ignored. Deleted;
  `ProjectService.update` takes `UpdateProjectInput`.
- **`queryObject` split every value on commas**, so `?search=design,%20copy` searched for
  `design`. Comma-splitting is now confined to the enum-array filters, with a test.
- **The clock's validity guard named `PrototypeClock`** in an error `SimulatedClock` also
  raises. Made class-neutral.
- Reviewers also confirmed, by tracing rather than by assertion, that §12 domain purity
  holds, that no service opens a nested unit of work, and that the four decision entries
  match the code.

A second reviewer hunted correctness bugs and proved several by running code:

- **A task could become its own ancestor.** `TaskService.update` checked only
  self-parenting, and `validateDocumentIntegrity` accepts a cycle — so `PATCH B{parent:A}`
  then `PATCH A{parent:B}` committed an A→B→A loop to the data file that reloaded on every
  boot and would hang the first subtask walk Slice 20 writes. Added an ancestor walk.
- **`PATCH {status:'done'}` completed an archived task** while `POST /complete` returned
  409 — the exact asymmetry the project service has an explicit comment about avoiding.
  The task service now enforces it on both entry points.
- **The project cycle walk never terminated on an already-cyclic document.** Worse than a
  hang: every step resolves as a microtask, so it starves the event loop and wedges the
  process, signal handlers included. The reviewer's proof pinned a test runner at 100% CPU;
  so did mine, which is how the test for it was written. Fixed with a visited set, and —
  the durable half — `validateDocumentIntegrity` now rejects a cyclic parent chain in
  projects and tasks, so a bad file fails at load where `main.ts` already exits 1.
- **A malformed percent-escape returned 500.** `decodeURIComponent` runs during route
  matching, outside `resolveRoute`'s error mapping, so `GET /api/tasks/%ZZ` threw a
  `URIError` past the 400 branch. Guarded in `match`, with `URIError` added to the mapping.
- **`unitOfWorkFor` cleared every store's operation context** while preserving every
  store's open marker, so a second store's unit inside a first store's would make the
  first store's reads silently fall back to the committed document. Latent (the app wires
  one store) but the two structures must agree. Now only this store's entry is dropped.

The same reviewer checked and dismissed several plausible suspicions, which is worth
recording: the no-op detection's key-order dependence is not a hazard (`next` is always a
spread of `current`, and `apply` only assigns or deletes); `apply`'s null-clearing is
correct for every nullable field in both inputs; `SimulatedClock` has no drift, DST or
repeated-`setNow` bug; and no sequence could lose a write or deadlock `unitOfWorkFor` with
a single store.

All four new guards were mutation-checked: each was removed in turn and a named test
caught it.

**Not acted on:**

- **CORS and a persona/identity route.** Slice 6 needs both — Angular on `:4200` calling
  `:4310` is blocked, and §18's `IdentityProvider` has nothing to read. A dev proxy in
  `angular.json` is the cheaper, more §71-appropriate answer than CORS middleware. It
  belongs to the slice that has a browser in it.
- **Returning the `SimulatedClock` from `createApi`** so Slice 12's dev panel is a route
  addition rather than a signature change. Speculative until that panel exists.
- **`check-no-direct-date.mjs` catching only `new Date(...)`.** A real narrowness, but
  Slice 4's script, and no live violation: a timestamp still needs `new Date` to reach
  `.toISOString()`.

**Open for the next slice:**

- Slice 6 needs `GET /api/tasks/:id` (shipped) and a `WorkManagerGateway` whose shape
  matches §9. The route list is otherwise complete for projects and tasks.
- Slice 12 should decide whether loading a seed also sets the clock to that seed's
  `SEED_NOW` — seed scenarios decay against real time (see `.prototype/notes.json`).
- Slice 13 will decide whether the activity feed renders `summary` or composes from the
  event's parts, which is the open half of the summary-ownership entry.
