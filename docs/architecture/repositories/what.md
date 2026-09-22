# What repositories are made of

## Structure

```mermaid
flowchart TB
  subgraph interfaces["interfaces.ts — what the domain sees"]
    uow["UnitOfWork"]
    ds["DataStore<br/>unitOfWorkFor(actor)"]
    repos["ProjectRepository · ProjectPageRepository · TaskRepository<br/>SectionRepository · SectionShortcutRepository · MilestoneRepository<br/>ReflectionRepository · ActivityRepository · AgentConnectionRepository · UserRepository<br/>OperationHistoryRepository · OperationActionRepository"]
  end
  subgraph store["data-store.ts — the implementation"]
    base["BaseDataStore<br/>queue, provisional document, commit, integrity"]
    mem["InMemoryDataStore<br/>tests"]
    json["JsonDataStore<br/>load, temp-and-rename persist"]
    integrity["validateDocumentIntegrity"]
  end
  subgraph impl["json-repositories.ts"]
    coll["JsonCollectionRepository<br/>shared query and write helpers"]
    jr["JsonProjectRepository … JsonUserRepository"]
  end
  errors["errors.ts<br/>RepositoryConflictError · RepositoryNotFoundError · UnitOfWorkInProgressError"]
  mem --> base
  json --> base
  base --> integrity
  jr --> coll
  jr -. implement .-> repos
  base -. implements .-> ds
  base --> jr
```

The domain imports only the left box. The right boxes are what the host constructs,
and what tests construct with `InMemoryDataStore` instead of `JsonDataStore`.

## A unit of work

```mermaid
sequenceDiagram
  participant S as Domain service
  participant D as DataStore
  participant R as Json*Repository
  participant F as data.json
  S->>D: runUnitOfWork(actor, fn)
  D->>D: queue until the previous unit finishes
  D->>D: clone the document as provisional state
  S->>R: list / get / insert / update (against provisional state)
  R-->>S: rows
  S-->>D: fn returns
  D->>D: validateDocumentIntegrity(provisional)
  D->>F: write temp file, rename over data.json
  D->>D: release held live frames
  D-->>S: result
  Note over D: any throw discards provisional state, a stale or outside write is rejected
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `UnitOfWork`, `DataStore` | `src/interfaces.ts` | §15's operation boundary and the store that provides it |
| `*Repository` interfaces | `src/interfaces.ts` | One per collection; queries are contract shapes from `@cwm/contracts`; task, reflection, section, shortcut, page and action repositories expose bounded removal seams |
| `BaseDataStore` | `src/data-store.ts` | The queue, provisional state, commit and `replaceActiveDocument` |
| `InMemoryDataStore` | `src/data-store.ts` | Seeded from a literal; no disk |
| `JsonDataStore` | `src/data-store.ts` | Loads a path, persists with temp-and-rename |
| `validateDocumentIntegrity` | `src/data-store.ts` | Whole-document parse plus reference, uniqueness, scope and ownership checks |
| `JsonCollectionRepository`, `Json*Repository` | `src/json-repositories.ts` | The twelve implementations over provisional state, including the row and optional-page removals used by safe Add Undo and the two operation-history repositories |
| `RepositoryConflictError`, `RepositoryNotFoundError`, `UnitOfWorkInProgressError` | `src/errors.ts`, `src/data-store.ts` | Storage-level failures the domain maps or lets through as bugs |
