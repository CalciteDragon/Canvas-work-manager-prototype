# Slice 2 — Contracts package

**Status:** done

## Goal

`packages/contracts` defines every prototype entity once, as Zod schemas with inferred
TypeScript types, exported from a single entrypoint and covered by accept/reject tests.

## Spec sections

§11 (shared contracts package, Zod, one reuse point), §14 (the `data.json` document and
its `schemaVersion`), §25 (dashboard widget model + `WidgetSize`), §33 (task model —
exact shape and the five statuses), §35 (milestones), §36 (reflections), §52 (agent
connections + permissions), §57 (activity events with a user/agent/system actor).
Read for field lists only: §17 (persona fields), §26/§28 (project header, layout mode),
§29/§31 (section type/config/frame title), §53 (the permission list the UI shows),
§61 (what a `TaskQuery` has to answer).

## Acceptance check

Executable, in order.

1. `pnpm --filter @cwm/contracts test` exits 0, and its reported file count equals the
   number of `src/*.test.ts` files on disk.
2. `pnpm test` (root, `-r --if-present`) exits 0 — contracts tests run alongside the
   host and web suites.
3. `pnpm lint` exits 0 (`tsc --noEmit` per workspace, unchanged from Slice 1).
4. `src/index.test.ts` imports the barrel by its package specifier (`@cwm/contracts`,
   not a relative path), parses a task through it, and uses `import type { Task }` — so
   the runtime half and the type half are both proven by `vitest run`, the package's own
   runner. (tsx is a devDependency of the host, not of this package; it is the wrong tool
   to assert this from here.)
5. `PrototypeDocumentSchema.parse()` accepts the §14 document literal (with the current
   `schemaVersion`) and rejects one whose `schemaVersion` is older.
6. `git status --porcelain` shows changes only under `packages/contracts/`; the two
   `CONTRACTS_PACKAGE` probe lines in `apps/web/src/app/app.ts` and
   `apps/prototype-host/main.test.ts`; `apps/web/package.json` and `apps/web/angular.json`
   (the zod dependency and the bundle budget it forces); `pnpm-lock.yaml`;
   `development.md`; two new `docs/decisions/` entries; `.prototype/notes.json`; and this
   plan.

## File-level change list

`packages/contracts`

- `package.json` — **already applied** while the plan was under review: `zod` ^4.4.3 as
  the one dependency, `vitest` ^4.0.8 as a devDependency, `test: vitest run` matching
  `apps/prototype-host`'s script shape. `lint` stays `tsc --noEmit`. Verify only.
- `src/ids.ts` — `brandedId()` helper; `UserId`, `WorkspaceId`, `ProjectId`, `SectionId`,
  `TaskId`, `MilestoneId`, `ReflectionId`, `ActivityEventId`, `AgentConnectionId`
  schemas + branded types. Ids are non-empty strings (seeds use `task-123`, `user-a`),
  not uuids.
- `src/common.ts` — `IsoDateTimeSchema` (`z.iso.datetime()`, per §11's example) and
  `IsoDateSchema` for date-only fields (milestone/project target dates).
- `src/user.ts` — `Workspace` (`id: WorkspaceId`, `name`, `ownerUserId: UserId`,
  `createdAt`); `User` with the §17 fields (`id: UserId`, `name`, `avatar?`,
  `workspaceId`, `preferences`, `createdAt`); `UserPreferences` = `theme`
  (`z.enum(['dark','light'])` — §22's two themes; Design Lab is dev tooling, not a
  persona theme) and `dashboardWidgets: DashboardWidget[]` (§25's widgets have no
  top-level collection in §14 and no owner field, so they live on the persona — see open
  question 3). No user-level default layout mode: §28 puts `projectLayoutMode` on the
  project and §46 puts the switch on the dev panel.
- `src/project.ts` — `ProjectStatus` and `ProjectLayoutMode` (`flow | grid`, §28) as
  `z.enum`s; `Project`: `id`, `workspaceId`, `parentProjectId?`, `name`, `description?`
  (§40 searches project description), `icon?` (§26's header), `status`, `targetDate?`
  (date-only), `projectLayoutMode`, `createdAt`, `updatedAt`. No `position`: §83 still
  asks about ordering and Slice 20 owns it, so the sidebar orders projects itself.
  (`ProjectSection.position` stays — the Slice 2 brief names it.)
- `src/section.ts` — `SectionColumnSpan` = `z.literal([12, 8, 6, 4])` (§27; numeric, so
  not a `z.enum` — see the rule under `src/dashboard.ts`), `ProjectSection`:
  `id: SectionId`, `projectId: ProjectId`, `type` as an open string per §29's registry,
  `position`, `columnSpan`, `collapsed`, `config: unknown`, optional `title` for the §31
  frame, `createdAt`/`updatedAt`.
- `src/task.ts` — `TaskStatus` as a `z.enum` of the five §33 values in §33's order;
  `TaskPriority` as `z.enum(['low','medium','high'])` — §33 names the field without
  values and §83 does not ask about them, so this is a starting guess of the same class
  as `ProjectStatus` (open question 2), sized to the one state §4 actually names
  ("high priority"); `Task` in exactly
  the §33 shape — including `parentTaskId?: TaskId`, which §33 names (Slice 20 owns
  subtask *rendering and ordering*, not the field) — and no fields §33 does not name.
- `src/milestone.ts` — `MilestoneStatus`, `Milestone` (§35: title, description,
  targetDate, status, plus id/projectId/timestamps).
- `src/reflection.ts` — `Reflection`: `id: ReflectionId`, `projectId: ProjectId`,
  optional `title`, `body`, `createdAt`/`updatedAt`, and an optional `prompt` recording
  which of §36's prompts (if any) was answered — §36 makes prompting optional but does
  not say the prompt is stored, so keeping it is this plan's invention, cheap to drop if
  §36's UI turns out to be stateless.
- `src/activity.ts` — `ActivityActor` = `z.enum(['user','agent','system'])` (§57's three
  distinctions); `ActivityEntityType` = `z.enum` over §14's mutable collections
  (`project`, `section`, `task`, `milestone`, `reflection`, `agent_connection`);
  `ActivityAction` as an open `entity.verb` string (regex `^[a-z_]+\.[a-z_]+$`) rather
  than an enum — §57 names no action list and every later slice adds verbs, so an enum
  would make each of those slices edit contracts for nothing. `ActivityEvent`: `id: ActivityEventId`, `workspaceId`, `actor`,
  `actorUserId?`, `actorAgentConnectionId?`, `action`, `entityType`, `entityId`,
  `projectId?`, `summary` (§57's example line), `createdAt`.
- `src/agent.ts` — `AgentPermission` as a `z.enum` covering all four §54 tool families
  consistently: `projects.read`, `projects.write`, `tasks.read`, `tasks.write`,
  `reflections.read`, `reflections.write`, `workspace.read`. (§53's UI displays five of
  these; `reflections.read` pairs with §54's `list_reflections` and `workspace.read` with
  `search_workspace`/`get_upcoming_work`/`get_dashboard_context`. Enumerating §53's five
  alone would leave three §54 tools with no permission to require.) `AgentConnection` per
  §52's JSON literal — `id`, `userId`, `name`, `permissions`, `revoked` — plus
  `createdAt` and `lastUsedAt?` (§53 displays "Last used").
- `src/dashboard.ts` — `WidgetSize` = `z.enum(['small','medium','wide','full'])` (§25),
  `DashboardWidgetType` = `z.enum` of §24's nine widgets, `DashboardWidget` exactly as
  §25 (`id`, `type`, `position`, `size`, `config: unknown`, `hidden`).
  Every closed set of **string** values in this package is a `z.enum`, so the tests can
  assert `.options` against the spec's list. `SectionColumnSpan` is the one exception:
  §27's values are numbers, which `z.enum` silently refuses to validate in zod 4, so it
  uses `z.literal([12, 8, 6, 4])` and is asserted via `[...Schema.values]`.
- `src/inputs.ts` — `CreateTaskInput` (§11's example verbatim, extended with the other
  §33 writable fields), `UpdateTaskInput`, `CreateProjectInput`, `UpdateProjectInput`,
  `CreateReflectionInput`, `UpdateReflectionInput`, `TaskQuery`, `ProjectQuery`.
  Clearable date fields are `.nullable().optional()` (null = clear) per §11's example.
  `TaskQuery` fields, each serving §61's `GET /api/tasks`: `projectId?`,
  `parentTaskId?`, `status?: TaskStatus[]`, `priority?: TaskPriority[]`, `dueBefore?`,
  `dueAfter?`, `search?`. `ProjectQuery` fields for `GET /api/projects`: `workspaceId?`,
  `parentProjectId?`, `status?: ProjectStatus[]`, `search?`. §61 names no parameters, so
  these are this plan's proposal: the filters Slice 5's `TaskService.list` needs, plus
  `dueBefore`/`dueAfter` (Slice 11's Today and Upcoming widgets) and `search` (§40).
  Nothing beyond those — no sorting, paging, or cursors.
- `src/document.ts` — `SCHEMA_VERSION` + `PrototypeDocumentSchema` with the nine §14
  collections, non-strict (zod's default: unknown top-level keys are stripped rather than
  fatal — a hand-edited `data.json` carrying a scratch key should still load). No `emptyDocument()` builder: producing documents is Slice 4's
  `packages/prototype-data` (the `empty` seed), and Slice 3's `InMemoryDataStore` takes
  a literal.
- `src/index.ts` — replaces the Slice 1 placeholder constant; re-exports every module.
- `src/*.test.ts` — one test file per module above, plus `index.test.ts` for acceptance
  #4 (repo idiom: `router.test.ts` sits beside `router.ts`). Unlike the host, contracts
  uses **extensionless** relative imports — its tsconfig has no
  `allowImportingTsExtensions`, and adding one is not worth a slice.

`apps/web/src/app/app.ts` and `apps/prototype-host/main.test.ts` — both used Slice 1's
`CONTRACTS_PACKAGE` placeholder as a resolution probe; the placeholder is deleted, so
both now probe with `SCHEMA_VERSION`. Two lines each, no behavior change.

`apps/web/package.json` — `zod` as a direct dependency. Not optional: Slice 1 consumes
packages as TypeScript source, so the Angular builder inlines `packages/contracts/src/**`
into the app's own module graph and resolves `zod` from `apps/web`, not from the package
that declares it. The package's own tests and every `tsc` pass stay green without this;
only the web suite catches it.

`apps/web/angular.json` — initial-bundle **warning** budget 500kB → 700kB (the 1MB error
budget is unchanged). The barrel is `export *`, so importing one constant pulls every
schema and the zod runtime — confirmed in the built bundle. This is a permanent new
ceiling, not a temporary one: Slice 6 imports contracts for real.

`pnpm-lock.yaml` — the two new dependency edges.

`docs/decisions/2026-08-status-and-priority-value-sets.md` and
`docs/decisions/2026-08-dashboard-widget-ownership.md` — open questions 2 and 3 below are
product questions §83 names, so they belong in the §78 log with Confidence and Revisit
when, not only in a plan that gets archived.

`.prototype/notes.json` — the friction this slice produced (§79).

`development.md` — Slice 2 marked `done` with a short divergence note covering:
`schemaVersion` starts at 1 (not §14's illustrative 4); §17's `userId`/`workspace` are
spelled `id`/`workspaceId` for consistency with the other entities; `ActivityAction` is
an open `entity.verb` string rather than an enum. No new *definitions* outside `packages/contracts` — every edit above is either a
two-line probe swap, dependency/config plumbing, or documentation.

## Test plan

Written first, one file per schema module. Each proves accept-and-reject, not shape
tautologies. **Coverage rule for this slice:** every entity schema in the file list gets
at least one accepting fixture and one rejecting case, and every `z.enum` gets an
`.options` assertion. This is a rule the test files satisfy, not an acceptance step — no
shell command can decide it.

- `common.test.ts` — `IsoDateTimeSchema` accepts `'2026-08-26T10:00:00.000Z'` and rejects
  `'2026-08-26'`, a local time, and a `+02:00` offset (UTC only, per §45's clock); `IsoDateSchema` accepts `'2026-08-26'` and rejects both a full datetime
  and `'2026-13-40'`. This pair is the package's most confusable one.
- `ids.test.ts` — a branded id accepts a non-empty string and rejects `''` and a number;
  two different brands are not assignable to each other (a `@ts-expect-error` line proves
  the brand is doing work, not just aliasing `string`).
- `user.test.ts` — a valid persona (`Demo User`, with one dashboard widget) parses; a
  user missing `workspaceId` fails; `theme: 'sepia'` fails; a `Workspace` parses and one
  missing `ownerUserId` fails.
- `project.test.ts` — a root project and a child project (`parentProjectId`) parse;
  `projectLayoutMode: 'kanban'` fails; an unknown status fails.
- `section.test.ts` — a task-list section parses with `columnSpan: 6`; `columnSpan: 5`
  fails and `[...SectionColumnSpanSchema.values]` is `[12, 8, 6, 4]` (presets only, §27);
  `config` accepts an arbitrary object; an empty `type`, a negative `position` and a
  fractional `position` all fail.
- `task.test.ts` — a minimal task (id, projectId, title, status, priority, timestamps)
  parses; a subtask with `parentTaskId` parses; `TaskPrioritySchema.options` equals
  `['low','medium','high']` and `priority: 'critical'` fails; `TaskStatusSchema.options` equals the five §33 values in order; `status:
  'archived'` fails; `dueAt: '2026-08-26'` fails (datetime, not date); an empty title fails.
- `milestone.test.ts` — valid milestone parses; unknown status fails.
- `reflection.test.ts` — a reflection with no title parses; empty `body` fails.
- `activity.test.ts` — a `user`, an `agent` and a `system` event all parse; an agent event
  carries `actorAgentConnectionId`; an event that names no actor id fails, and a `system`
  event that names one fails (§57 attribution is enforced, not merely modelled);
  `actor: 'robot'` fails; `entityType: 'widget'` fails;
  `action: 'completed'` fails while `action: 'task.completed'` parses (the `entity.verb`
  rule).
- `agent.test.ts` — §52's literal (id/userId/name/permissions/revoked + timestamps)
  parses; `permissions: ['tasks.delete']` fails; `AgentPermissionSchema.options` equals the
  seven permissions above exactly, so §53's grid and §54's tools both have something to
  bind to.
- `dashboard.test.ts` — a widget parses with each of the four sizes; `size: 'large'` fails.
- `inputs.test.ts` — `CreateTaskInput` accepts §11's example verbatim, rejects an empty
  title, and strips a caller-supplied `id`/`createdAt`; the project and reflection inputs
  each get an accepting and a rejecting case; `UpdateTaskInput` accepts `{ dueAt: null }` (clear) and an empty patch (legal
  no-op — the rule is deliberately absent); `TaskQuery` accepts a status array and rejects
  an unknown status value.
- `document.test.ts` — the §14 literal (with `SCHEMA_VERSION`) parses; `schemaVersion: 0`
  fails; a document with a task whose `projectId` names no project still parses (schemas
  validate shape, not referential integrity — that is Slice 3's job); a document missing
  `agentConnections` fails, pinning §14's nine-collection list.

## Boundaries touched

- **Contracts are defined once (§8, §11).** This slice is the definition site. The Slice 1
  placeholder `CONTRACTS_PACKAGE` constant is deleted rather than kept beside the real
  exports — no parallel or vestigial types.
- **No layer bleed.** The package depends on `zod` only: no repository interfaces, no
  services, no HTTP, no Angular. Its `package.json` gains exactly one runtime dependency.
- **No `new Date()`** anywhere in the package — timestamps are validated strings; the
  `Clock` that produces them arrives in Slice 4.

## Explicit non-goals

From the slice's *Do not*: no gateway interfaces, no services, no repositories.
Additionally deferred on purpose:

- **Per-project progress mode** (§39) — the field lands with Slice 10, which is where
  the three formulas become selectable. Adding it now would be a field nothing reads.
- **Task estimates and `archivedAt`** — not in §33's shape, and the slice says *exactly*
  §33. Archive semantics are Slice 5's problem (project status covers projects).
- **Section/milestone create-update input schemas** — they land with Slices 8 and 19,
  because both shapes are still moving: a section's `config` is defined by its registry
  entry (§29), and §35 leaves open whether milestones survive as a model at all. The
  reflection inputs *are* here despite Slice 10 being their consumer: §36 settles their
  shape completely, and they are covered by `inputs.test.ts` like every other schema.
- **Migrations for `schemaVersion`** — Slice 3 decides what happens to an old file.
  This slice only makes the version explicit and mismatch fatal.

## Open questions

1. **`schemaVersion` starting value.** §14's example shows `4`; this is the prototype's
   first schema. Decision: start at `1` and export `SCHEMA_VERSION`. §14's `4` reads as
   illustrative of a file mid-evolution, not as a required constant. Recorded here and in
   `development.md`'s slice note, not in `docs/decisions/` — §78's log is for answered
   *product* questions, and this is a technical constant nothing in the spec depends on.
2. **`ProjectStatus` and `MilestoneStatus` values.** §83 lists "What project statuses
   exist?" as an open product question, and §35 names `status` without values. Decision:
   Recorded in `docs/decisions/2026-08-status-and-priority-value-sets.md`.
   `planning | active | on_hold | completed | archived` and `upcoming | achieved | missed`
   — a starting guess, flagged for a `docs/decisions/` entry once real use tests it, not
   an answer. `TaskPriority` (`low | medium | high`) is the same class of guess: §33 names
   the field without values.
3. **Where dashboard widgets live.** §14's document has no widget collection and §25 has
   no owner field. Decision: on `UserPreferences`, since §17 gives each persona
   preferences and §25's widgets are per-person. Recorded in
   `docs/decisions/2026-08-dashboard-widget-ownership.md`.
