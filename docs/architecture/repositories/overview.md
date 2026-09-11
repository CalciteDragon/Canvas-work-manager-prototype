# Repositories

`@cwm/repositories` is the storage boundary (§13–§15): the repository *interfaces* the
domain depends on, the `UnitOfWork` those interfaces are used inside, and the one
implementation the prototype has — a `DataStore` holding the whole `data.json` document in
memory, validating it as a whole at every commit, and persisting it atomically at operation
boundaries. Storage "is JSON" only in this package.

**Code:** `packages/repositories/src` · **Tests:** `packages/repositories/src/*.test.ts`
(vitest) · **Package:** `@cwm/repositories` · **Depends on:** `@cwm/contracts`

## Responsibilities

- Define `ProjectRepository`, `ProjectPageRepository`, `TaskRepository`,
  `SectionRepository`, `SectionShortcutRepository`, `MilestoneRepository`,
  `ReflectionRepository`, `ActivityRepository`, `AgentConnectionRepository` and
  `UserRepository`, plus the query semantics they share.
- Provide the unit of work: provisional state that is isolated until commit, rejected
  when stale or written from outside, and persisted once per operation.
- Validate the document as a whole on load and on every commit
  (`validateDocumentIntegrity`): schema, duplicate ids, dangling references, workspace
  scope, and the ownership invariants the archive phase added.
- Persist with temp-file-and-rename so a crash cannot leave a truncated file.
- Swap the whole document from inside a unit of work, which is how the development
  panel loads a seed without a restart.

## Not responsible for

- Product rules: a repository stores and retrieves; the domain decides
  ([domain](../domain/overview.md)).
- Which file to open: the host resolves `CWM_DATA_FILE` and hands the store a path
  ([prototype-host](../prototype-host/overview.md)).
- Seeds: [prototype-data](../prototype-data/overview.md) builds documents; this package
  only holds them.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
