# Repositories

`@cwm/repositories` is the storage boundary (§13–§15): the repository *interfaces* the
domain depends on, the `UnitOfWork` those interfaces are used inside, and the one
implementation the prototype has — a `DataStore` holding the whole `data.json` document in
memory, validating it as a whole at every commit, and persisting it atomically at operation
boundaries. Storage "is JSON" only in this package.

Integrity allows a project to be absent after creation Undo only while the workspace Activity
lifecycle anchor and the creator's exact-actor undone `project.add` history anchor both remain
valid; the lifecycle events and history must share the actor who created the project. Project and
canonical-page removal is available only to that preflighted domain inverse.

**Code:** `packages/repositories/src` · **Tests:** `packages/repositories/src/*.test.ts`
(vitest) · **Package:** `@cwm/repositories` · **Depends on:** `@cwm/contracts`

## Responsibilities

- Define `ProjectRepository`, `ProjectPageRepository`, `TaskRepository`,
  `SectionRepository`, `SectionShortcutRepository`, `MilestoneRepository`,
  `ReflectionRepository`, `ActivityRepository`, `AgentConnectionRepository`,
  `UserRepository`, `OperationHistoryRepository` and `OperationActionRepository`, plus the query
  semantics they share.
- Provide the unit of work: provisional state that is isolated until commit, rejected
  when stale or written from outside, and persisted once per operation.
- Expose only bounded removal seams — the row, section, placement, action and, since Slice 38,
  optional-page ones — each documented for the single preflighted caller it exists for.
- Validate the document as a whole on load and on every commit
  (`validateDocumentIntegrity`): schema, duplicate ids, dangling references, workspace
  scope, the ownership invariants the archive phase added, and operation histories' scope and
  ordering (never their payloads' references). Activity identity is also checked: a removed
  task/reflection target is valid only with complete matching captured context and canonical
  owning project/root records.
- Provide the narrow task/reflection removal seams used after row-add Undo has preflighted every
  canonical dependent; Activity is historical evidence and does not block that removal.
- Persist with temp-file-and-rename so a crash cannot leave a truncated file.
- Guard each canonical file with one advisory owner record, `<data file>.owner`
  (`acquireDataFileOwnership`, Slice 54), so separate processes take turns writing it rather
  than overwriting each other. A dead owner's record is reclaimed only under a nonce check.
- Swap the whole document from inside a unit of work, which is how the development
  panel loads a seed without a restart.

## Not responsible for

- Product rules: a repository stores and retrieves; the domain decides
  ([domain](../domain/overview.md)).
- Which file to open: the host resolves `CWM_DATA_FILE` and hands the store a path
  ([prototype-host](../prototype-host/overview.md)).
- Seeds: [prototype-data](../prototype-data/overview.md) builds documents; this package
  only holds them.
- When to take ownership: entrypoints decide — the host for its lifetime, stdio per call, the
  seed, reset, upgrade and e2e-preparation commands around their write. `JsonDataStore` and the
  library functions never acquire.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
