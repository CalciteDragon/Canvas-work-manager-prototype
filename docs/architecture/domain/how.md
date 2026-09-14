# How the domain works

## Runtime flow

1. A caller — a host route, an MCP tool, or a test — constructs an `ActorContext`
   (`{ workspaceId, userId }`, plus `connectionId` and `permissions` for an agent) and
   calls a public service method with it. The domain trusts the pair it is handed.
2. The method asserts its grant with `assertPermitted` (agents only; a user actor passes),
   then opens a unit of work through the `UnitOfWork` interface.
3. Inside the unit it reads through repository interfaces, applies the rule, writes, and
   records an `ActivityEvent` through `ActivityService.record`, which also hands a
   `LivePublication` to the `LiveEventPublisher` — held by the store until commit.
4. On commit the store validates the whole document and persists it; on any throw the
   provisional state is discarded and the caller sees one of the three errors.
5. Derived read services skip step 3's writes: they read the repositories, scope by the
   actor's visible projects, drop everything under an archived ancestor, and compute.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `ActorContext` | type | Who acts; the agent variant carries grants | [API](../../api/miscellaneous/typealiases.html#ActorContext) |
| `assertPermitted` | function | Throws `PermissionDeniedError` naming the missing grant | [API](../../api/miscellaneous/variables.html#assertPermitted) |
| `Clock` | interface | `now()`; the only source of time | [API](../../api/interfaces/Clock.html) |
| `SimulatedClock` | class | Host clock: real time plus a settable offset | [API](../../api/classes/SimulatedClock.html) |
| `PrototypeClock` | class | Frozen clock for tests | [API](../../api/classes/PrototypeClock.html) |
| `DomainRuleError` | class | A refused operation; optional typed `details` | [API](../../api/classes/DomainRuleError.html) |
| `EntityNotFoundError` | class | An id that does not resolve for this actor | [API](../../api/classes/EntityNotFoundError.html) |
| `PermissionDeniedError` | class | A missing grant | [API](../../api/classes/PermissionDeniedError.html) |
| `ActivityService` | class | Records events and publishes live frames | [API](../../api/classes/ActivityService.html) |
| `ProjectService` | class | Project rules | [API](../../api/classes/ProjectService.html) |
| `ProjectPageService` | class | Page listing and optional-page toggles | [API](../../api/classes/ProjectPageService.html) |
| `SectionService` | class | Section lifecycle and container resolution | [API](../../api/classes/SectionService.html) |
| `SectionShortcutService` | class | Home shortcut placements | [API](../../api/classes/SectionShortcutService.html) |
| `TaskService` | class | Task lifecycle | [API](../../api/classes/TaskService.html) |
| `ReflectionService` | class | Reflection lifecycle | [API](../../api/classes/ReflectionService.html) |
| `AgentConnectionService` | class | Permissions, revocation, `lastUsedAt` | [API](../../api/classes/AgentConnectionService.html) |
| `DashboardService` | class | §24's derived read | [API](../../api/classes/DashboardService.html) |
| `ProgressService` | class | §39's three formulas | [API](../../api/classes/ProgressService.html) |
| `TimelineService` | class | §38's derived ranges | [API](../../api/classes/TimelineService.html) |
| `WorkspaceService` | class | Search and upcoming work under one grant | [API](../../api/classes/WorkspaceService.html) |
| `ProjectTodosService` | class | Root-wide chronology | [API](../../api/classes/ProjectTodosService.html) |
| `ProjectArchiveService` | class | Root-wide archive projection | [API](../../api/classes/ProjectArchiveService.html) |
| `ProjectJournalService` | class | Root-wide reflection feed and completed-work picker | [API](../../api/classes/ProjectJournalService.html) |
| `AIProvider` | interface | §42's two methods | [API](../../api/interfaces/AIProvider.html) |
| `PrototypeAIProvider` | class | §43's deterministic composer | [API](../../api/classes/PrototypeAIProvider.html) |
| `LiveEventPublisher` | interface | The port the host's hub implements | [API](../../api/interfaces/LiveEventPublisher.html) |

## Dependencies

**Depends on**

- [contracts](../contracts/overview.md) — every entity, input and read-model schema.
- [repositories](../repositories/overview.md) — the **interfaces** only: `UnitOfWork`,
  the `*Repository` interfaces, and nothing named `Json*` or `DataStore`. The allowlist in
  `scripts/check-package-imports.mjs` is the definition of "only".

**Depended on by**

- [mcp-tools](../mcp-tools/overview.md) — every tool calls a service.
- [prototype-host](../prototype-host/overview.md) — `createApi` wires the services;
  routes call them; the authenticator builds actors for them.
- Tests in `packages/mcp-tools` and `apps/prototype-host` construct services over an
  `InMemoryDataStore` seeded from `@cwm/prototype-data`.

## Invariants and lints

- **Imports:** only `@cwm/contracts` and repository interfaces —
  `pnpm --filter @cwm/domain lint` runs `check-package-imports.mjs`; `import-lint.test.ts`
  proves the lint itself catches the three bypasses it was rewritten for.
- **Time:** no `new Date()` outside `clock.ts` — `scripts/check-no-direct-date.mjs` and
  `time-lint.test.ts`.
- **Every public method asserts its grant**, and success is tested under the *minimal*
  grant — the MCP contract suite runs each tool with exactly `tool.permission` and
  `additionalPermissions`, which is what proves a grant sufficient, not only necessary.
- **The service graph is acyclic**: `TaskService` and `ReflectionService` compose
  `SectionService` for container resolution; writing services compose `ActivityService`
  for event recording. A new edge is an AGENTS.md boundary change and needs saying so.
- **Every state change records exactly one event** through `ActivityService.record`; a
  no-op write records nothing and therefore announces nothing.
- **Section and shortcut creation positions** are optional zero-based indexes in the page's
  combined placement order. Each service resolves and validates its target (and, for a shortcut,
  its source) before insertion, clamps a position past the end, inserts and calls
  `renumberPlacements` within the same unit of work, then records only the creation event.
  Without a position it appends. Refused writes leave sibling positions untouched.
- **Reads drop archived ancestry the same way** — through `archivedAncestry` — and each
  query walks its own chain (a shared memo was wrong on cycles).

## Commands

```bash
pnpm --filter @cwm/domain test    # vitest over InMemoryDataStore
pnpm --filter @cwm/domain lint    # tsc, the date lint, the import allowlist
```

## Changing it

- **A new rule:** write the failing test in the service's `*.test.ts` first, using
  `test/test-support.ts` to build a store, a clock and an actor. Put the rule in the
  service that owns the entity; if a second service needs it, prefer a pure function in a
  shared file (the `project-visibility.ts` pattern) over a new service edge.
- **A new operation:** assert the grant; open the unit of work; look the target up with
  the service's private unchecked lookup, not `get` (or a `tasks.write`-only agent cannot
  use it); record one event with the verb §57's feed should show.
- **A new derived read:** its own service, repository reads only, every grant it returns
  asserted up front, canonical records in the result. Copy `ProjectTodosService`.
- **The trap:** `ActorContext` is trusted. HTTP callers cannot forge it, but an in-process
  caller can; a mismatched workspace is caught only at commit by document integrity.
