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
5. An explicit section add, update or move applies its normalized change, records one typed
   inverse through `UndoRecorder.record`, and returns a receipt from the same unit; automatic
   container resolution bypasses that public seam. Removal additionally settles rows and decides
   whether recovery or an integrity reference requires retention. Receipts never carry snapshot
   data. `UndoService.undo` later executes the selected record in one unit of its own: exact-actor
   lookup, consumed/expired checks, the per-type executor (field/placement/reference conflicts
   collected before any write), `consumedAt`, one activity event. A repeated removal can read back
   only the exact actor's newest outstanding receipt through the recorder, without writing or
   extending it.
6. Derived read services skip step 3's writes: they read the repositories, scope by the
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
| `SectionService` | class | Section lifecycle and container resolution; explicit add/update/move and removal return typed Undo results | [API](../../api/classes/SectionService.html) |
| `UndoRecorder` | interface | Records an inverse and reads the exact actor's newest outstanding receipt inside the caller's unit | [API](../../api/interfaces/UndoRecorder.html) |
| `RepositoryUndoRecorder` | class | Stores a record, computes `sequence`, prunes expired and over-limit records | [API](../../api/classes/RepositoryUndoRecorder.html) |
| `UndoService` | class | Executes one receipt for the exact actor under `projects.write` | [API](../../api/classes/UndoService.html) |
| `SectionShortcutService` | class | Home shortcut placements | [API](../../api/classes/SectionShortcutService.html) |
| `TaskService` | class | Task lifecycle | [API](../../api/classes/TaskService.html) |
| `ReflectionService` | class | Reflection lifecycle | [API](../../api/classes/ReflectionService.html) |
| `AgentConnectionService` | class | Permissions, revocation, `lastUsedAt` | [API](../../api/classes/AgentConnectionService.html) |
| `DashboardService` | class | §24's derived read | [API](../../api/classes/DashboardService.html) |
| `ProgressService` | class | §39's three formulas | [API](../../api/classes/ProgressService.html) |
| `TimelineService` | class | §38's derived ranges | [API](../../api/classes/TimelineService.html) |
| `WorkspaceService` | class | Search and upcoming work under one grant | [API](../../api/classes/WorkspaceService.html) |
| `ProjectTodosService` | class | Root-wide chronology | [API](../../api/classes/ProjectTodosService.html) |
| `ProjectArchiveService` | class | Root-wide archive projection; section entries filtered and annotated by the internal pure `sectionRecoveryOf` | [API](../../api/classes/ProjectArchiveService.html) |
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
  for event recording; `SectionService` records each explicit section operation's inverse through an `UndoRecorder`
  (an interface over one repository that never opens a unit). `UndoService` composes only
  `ActivityService` — no section, task or reflection service — and shares the inverse with
  section writes through function modules (`owned-rows.ts`, `section-removal-undo.ts`, `section-edit-undo.ts`,
  `page-placements.ts`, `project-visibility.ts`). A new edge is an AGENTS.md boundary change
  and needs saying so.
- **Undo never overwrites a later write.** The executor compares only the structural fields it
  would write (section archive state and page; each recorded row's section, parent and archive
  markers), a newer record for the same section by `sequence`, and unrecorded dependents; any
  difference refuses with `undo_conflict` before a write. Non-structural edits are preserved.
  Add Undo also refuses any later substantive change to the section, and any task, reflection or
  shortcut that references it. Update Undo compares only the fields it recorded; move Undo only
  the subject's page and live state. A newer add or removal record for the subject supersedes
  either, as does a newer overlapping update (for update) or move (for move); disjoint field
  edits and moves survive. Edit refusals never point to Archive, which holds nothing they changed.
  Every refusal message starts with its reason token (`undo_consumed: …`), because MCP carries
  message text only.
- **A removal refusal does not disclose a deleted id.** For a missing section, `SectionService`
  consults the read-only recorder only after `projects.write` and workspace visibility checks; it
  returns a receipt only when the newest record for that section is outstanding and belongs to
  the exact actor. No older receipt is revived after a newer actor, consumed, expired or pruned
  record.
- **`sequence` is the only order between Undo records.** Timestamps can repeat or go backwards
  under the settable clock, and ids are random.
- **Every state change records exactly one event** through `ActivityService.record`; a
  no-op write records nothing and therefore announces nothing.
- **Archive and deletion share the content policy but use separate checks.** A removal policy
  settles a container only when live rows remain: cascade archives those live rows, while
  reassign moves every assigned row, including independently archived subtrees. If only
  pre-archived rows remain, even an explicit reassign is a no-op so the owner section stays as
  their first Archive recovery step. After settlement, `sectionRecoveryOf` decides whether
  content must remain recoverable. Canonical task/reflection references and Home shortcut sources
  independently prevent deletion. New disposable sections with no such reference are deleted;
  historical tombstones are never purged. Archive projects retained content only and never
  decides deletion eligibility by itself.
- **Section and shortcut creation positions** are optional zero-based indexes in the page's
  combined placement order. Each service resolves and validates its target (and, for a shortcut,
  its source) before insertion, clamps a position past the end, inserts and calls
  `renumberPlacements` within the same unit of work, then records only the creation event.
  Without a position it appends. Refused writes leave sibling positions untouched.
- **Renumbering is not editing.** `renumberPlacements` changes `updatedAt` only on the
  placement a move names as its subject; siblings shifted by an insert, move or removal keep
  the `updatedAt` of their last real edit. Undo's restore uses the same rule: only the restored
  section's `updatedAt` moves. Its index comes from `resolveRestoreIndex` — after the surviving
  previous neighbour, else before the next, else the clamped original index.
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
