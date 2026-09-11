# How repositories work

## Runtime flow

1. The host calls `loadPersistence`, which opens the path from `CWM_DATA_FILE` (default
   `.prototype/data.json`, repo-anchored) with `JsonDataStore` and parses it through
   `validateDocumentIntegrity`. A missing file or a wrong `schemaVersion` fails the start.
2. A domain service asks the store for a unit of work. Units are queued: the next starts
   when the previous commits or discards, so provisional state is never visible to a
   concurrent operation.
3. Inside the unit, the `Json*Repository` instances read and write the provisional clone.
   Queries follow the shared semantics (AND, empty array matches nothing, archived
   excluded unless `includeArchived`).
4. On return the store validates the provisional document whole, writes it to a temp
   file, renames it over the data file, and releases any live frames the unit held.
5. On a throw the clone is discarded; a write attempted after the unit closed, or with a
   stale token, is rejected with `UnitOfWorkInProgressError` or a conflict.
6. `replaceActiveDocument` — used by the dev panel's seed swap and reset — runs *through*
   `runUnitOfWork`, so it cannot land under a queued unit.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `DataStore` | interface | `unitOfWorkFor` and document access | [API](../../api/interfaces/DataStore.html) |
| `UnitOfWork` | interface | The repositories a service uses inside one operation | [API](../../api/interfaces/UnitOfWork.html) |
| `BaseDataStore` | class | Queue, provisional state, commit, swap | [API](../../api/classes/BaseDataStore.html) |
| `JsonDataStore` | class | The file-backed store | [API](../../api/classes/JsonDataStore.html) |
| `InMemoryDataStore` | class | The test store | [API](../../api/classes/InMemoryDataStore.html) |
| `validateDocumentIntegrity` | function | The whole-document check at load and commit | [API](../../api/miscellaneous/variables.html#validateDocumentIntegrity) |
| `TaskRepository`, `SectionRepository`, … | interfaces | One per collection | [API](../../api/interfaces/TaskRepository.html) |
| `JsonCollectionRepository` | class | Shared helpers the ten implementations extend | [API](../../api/classes/JsonCollectionRepository.html) |
| `UnitOfWorkInProgressError` | class | A write outside or after its unit | [API](../../api/classes/UnitOfWorkInProgressError.html) |

## Dependencies

**Depends on**

- [contracts](../contracts/overview.md) — the document schema and every entity and query
  shape. Node's `fs/promises` for the JSON store.

**Depended on by**

- [domain](../domain/overview.md) — interfaces only, lint-enforced.
- [prototype-data](../prototype-data/overview.md) — the seed CLI writes through the
  store so a seed file is produced the same way a commit is.
- [prototype-host](../prototype-host/overview.md) — constructs the `JsonDataStore` and
  hands it to `createApi`.
- Tests in `packages/mcp-tools` and `apps/prototype-host` — `InMemoryDataStore`.

## Invariants and lints

- **Persist once per operation, never per property write** — structurally, because the
  only write path is the unit's commit.
- **The document is valid at every commit**, by the same function that validates it at
  load. The invariants it holds are listed in [why](why.md).
- **No hard delete** except `SectionRepository.remove` (a kept seam, unused by the
  domain) and shortcut placements.
- **Seeds are committed byte-for-byte** as LF JSON and compared in
  `packages/prototype-data`'s tests, which is why `.gitattributes` normalises line
  endings.

## Commands

```bash
pnpm --filter @cwm/repositories test   # vitest: store, unit of work, integrity, query semantics
pnpm --filter @cwm/repositories lint   # tsc --noEmit
```

## Changing it

- **A new collection:** the interface in `interfaces.ts`, its `Json*Repository`, a slot in
  the document schema in contracts, and the integrity checks for any reference it holds.
  Then the `UnitOfWork` shape and every test-support builder that constructs one.
- **A new integrity rule:** a failing `data-store.test.ts` case with a document that
  violates it, then the check. Prefer this over a write-path guard when the rule is about
  the document rather than about one operation.
- **The trap:** writing a query filter that treats `[]` as "everything". The semantics
  entry exists because a gateway once did exactly that.
