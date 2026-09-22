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
5. A supported section, task, reflection or Home shortcut write applies its normalized change, records one typed
   action through `OperationRecorder.record`, and returns a receipt from the same unit; automatic
   container resolution joins the row action instead of recording a separate section action. The recorder finds or creates the actor's history
   for the subject's project, appends the action (discarding the redo branch), prunes by expiry and
   the 50-action cap, and returns the receipt at the new revision. Removal additionally settles rows,
   bumps `archiveGeneration` and decides whether recovery or an integrity reference requires
   retention; Archive Restore renumbers the combined order before capturing its appended placement,
   so a hand-edited sparse page still appends, and leaves `archiveGeneration` alone. A move — of a
   section or of a placement — compares the combined index before writing, so a clamped no-op
   normalizes nothing and records nothing. Receipts never carry payload data. `OperationHistoryService.transition` later runs one
   step in one unit of its own: find the caller's history (not found otherwise), compare the
   stored action family grant before disclosing revision or conflicts, select the next action in that direction, check expiry and archived ancestors, run the
   family's revert or reapply function (conflicts collected before any write), flip the action's
   state, move the cursor, record one `*_undone` or `*_redone` event. A permanent conflict instead
   commits only a retirement and refuses after the unit resolves. A repeated removal can read back
   only the exact actor's applied, unexpired removal through `outstandingRemovalFor`, without
   writing.
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
| `ProjectPageService` | class | Page listing and optional-page toggles, each changed toggle recorded in the owning root's history | [API](../../api/classes/ProjectPageService.html) |
| `SectionService` | class | Section lifecycle and container resolution; explicit add/update/move and removal return typed Undo results | [API](../../api/classes/SectionService.html) |
| `OperationRecorder` | interface | Records one history action and recovers a still-outstanding removal receipt inside the caller's unit | [API](../../api/interfaces/OperationRecorder.html) |
| `RepositoryOperationRecorder` | class | Finds or creates the actor's history, appends, discards the redo branch, prunes, returns the receipt | [API](../../api/classes/RepositoryOperationRecorder.html) |
| `OperationHistoryService` | class | The caller's summary under `projects.read`; one transition under its stored family’s write grant | [API](../../api/classes/OperationHistoryService.html) |
| `captureTaskAdd`, `revertTaskAdd`, `reapplyTaskAdd` | functions | Representative task capture and both-direction row executors; update/archive/restore follow the same seam | [API](../../api/miscellaneous/variables.html#captureTaskAdd) |
| `captureReflectionAdd`, `revertReflectionAdd`, `reapplyReflectionAdd` | functions | Representative reflection capture and both-direction row executors | [API](../../api/miscellaneous/variables.html#captureReflectionAdd) |
| `nextOperationAction`, `recordOperationAction`, `transitionOperationHistory`, `retireOperationAction`, `pruneOperationHistory` | functions | The pure cursor state machine | [API](../../api/miscellaneous/variables.html#nextOperationAction) |
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
  for event recording; the section, shortcut, task, reflection and page services record supported
  writes through an `OperationRecorder` (an interface over two repositories that never opens a unit).
  `OperationHistoryService` composes only `ActivityService` — no section, shortcut, task, reflection
  or page service — and shares the payloads with those writes through function modules
  (`operation-execution.ts`, `owned-rows.ts`, `section-removal-undo.ts`, `section-edit-undo.ts`,
  `section-restore-history.ts`, `shortcut-history.ts`, `page-history.ts`, `task-history.ts`,
  `reflection-history.ts`, `page-placements.ts`, `project-visibility.ts`).
  `SectionShortcutService` and `ProjectPageService` hold an
  `OperationRecorder` for the same reason `SectionService` does, and `shortcut-history.ts` and
  `page-history.ts` each declare their own narrower repository type — no task or reflection
  repository — so a reviewer can see from the signature that a placement or page inverse cannot reach
  a row. A page's dependency preflight stops at the **section** level for that reason: §27's
  ownership chain runs `project → page → section → row`, so a page with no section has no row. A new edge is an AGENTS.md boundary
  change and needs saying so.
- **Neither direction overwrites a later write.** Each executor compares the state the *other*
  direction left: a removal's section archive state, page and `archiveGeneration`, each recorded
  row's section, parent and archive markers, and unrecorded dependents; an update's recorded fields
  (`after` for Undo, `before` for Redo); a move's surviving recorded neighbours, never its index; an
  add's substance and references; a Restore's archived marker, generation and recorded rows, plus
  any live row Undo would hide or newly marked row Redo would absorb; a placement's page, source and
  substantive fields, with a source **content** edit deliberately not a conflict. Any difference
  refuses with `history_conflict` before a write,
  and untouched fields and disjoint edits survive. Only the next action is ever executable, so a
  caller's own later change is `history_not_next`, not a conflict. Redo replays captured values
  verbatim and stamps only `updatedAt`. The permanently unsatisfiable conflicts retire the action
  ([decision](../../decisions/2026-09-operation-history-retired-actions.md)). Every refusal message
  starts with its reason token (`history_conflict: …`), because MCP carries message text only.
- **A removal refusal does not disclose a deleted id.** For a missing section, `SectionService`
  consults `outstandingRemovalFor` only after `projects.write` and workspace visibility checks,
  and only across the exact actor's own histories; it returns a receipt only when that actor's
  newest action for the section is an applied, unexpired removal whose generation is still the
  section's.
- **A history's order is its cursor and orders, never a timestamp.** Timestamps can repeat or go
  backwards under the settable clock, and ids are random; `revision` advances on every committed
  history mutation and never on pruning
  ([decision](../../decisions/2026-09-operation-history-retention.md)).
- **Every state change records exactly one event** through `ActivityService.record`; a
  no-op write records nothing and therefore announces nothing. The service captures and validates
  target label and owning project/root before a row can be removed, then resolves current names
  when the target remains and captured names when it does not.
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
