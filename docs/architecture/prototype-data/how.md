# How prototype data works

## Runtime flow

1. `pnpm prototype:seed <name>` runs `seed-cli.ts` with `tsx`. It uses the target path
   of the repo-anchored `.prototype/data.json`, builds the named seed, and writes it atomically.
   It first takes the file's owner record (`seedDataFileOwned`, `kind: 'seed'`), so while a host runs it is refused
   with `data_file_in_use:` naming the host; stop the host or use the dev panel's Seed control
   ([decision](../../decisions/2026-09-one-writer-per-data-file.md)).
2. `pnpm prototype:reset` is the same command with `personal-workspace`.
3. Tests: `seeds.test.ts` parses every builder with `PrototypeDocumentSchema`, checks integrity,
   refuses retired types in seeds, checks the dense combined order of live sections and shortcuts,
   and compares LF-serialised output byte-for-byte to `prototype/seeds/<name>.json`.
   `activity-identity.test.ts` checks captured seed Activity context and its refusals.
4. Other packages import the builders directly: the MCP harness and the host tests seed
   an `InMemoryDataStore` from `agent-heavy`; the acceptance scripts copy the committed
   JSON because they run under plain `node`.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PERSONAS` | const | The three personas | [API](../../api/miscellaneous/variables.html#PERSONAS) |
| `writeSeedFile` | function | Write a named seed atomically | [API](../../api/miscellaneous/variables.html#writeSeedFile) |
| `captureActivityIdentities` | function | Capture and validate Activity context for seed events | [API](../../api/miscellaneous/variables.html#captureActivityIdentities) |
| `seedDataFileOwned` | functions | The seed/reset CLI entry under the file's owner record. `writeSeedFile` stays ownership-free, because `loadPersistence` seeds inside its caller's ownership | [API](../../api/miscellaneous/variables.html#seedDataFileOwned) |
| `WriteSeedOptions` | interfaces | Injectable target path and file operations for seed-writer tests | [API](../../api/interfaces/WriteSeedOptions.html) |

## Dependencies

**Depends on**

- [contracts](../contracts/overview.md) — the document schema every seed is validated
  against; the entity types the builders construct.
- [repositories](../repositories/overview.md) — the seed CLI acquires the shared data-file owner
  record through `acquireDataFileOwnership`; its write uses Node's `fs/promises` directly.

**Depended on by**

- [prototype-host](../prototype-host/overview.md) — the seed swap and reset routes; the
  authenticator's token table.
- Tests in [domain](../domain/overview.md), [mcp-tools](../mcp-tools/overview.md) and the
  host (dev dependencies).
- The acceptance scripts and the e2e suite, through the committed snapshots and
  `/prototype/seed`.

## Invariants and lints

- **Every seed parses** and **every snapshot matches its builder** — `seeds.test.ts`.
- **Determinism:** builders take no clock and no randomness; dates derive from one fixed
  reference instant.
- **Tokens are not in the contracts.** `AgentConnectionSchema` has no token field; the
  token table lives here and is asserted absent from `GET /api/agent-connections`.
- **Local files are disposable.** There is no conversion path. A file at another schema version,
  or holding a retired section type, is refused with reset/reseed guidance.
- **Seeds hold no Undo history.** Every snapshot carries `"operationHistories": []` and
  `"operationActions": []` and `archiveGeneration: 0` on every section; loading a seed replaces
  the document — so it discards every history.

## Commands

```bash
pnpm prototype:seed busy-week        # rewrite .prototype/data.json
pnpm prototype:reset                 # personal-workspace
pnpm --filter @cwm/prototype-data test
pnpm --filter @cwm/prototype-data lint
```

## Changing it

- **Changing a seed:** edit the builder, run the tests, commit the regenerated
  snapshot the test tells you about. Say in the commit what scenario changed and why.
- **A contract change that breaks the seeds:** the seed test fails first. Fix the
  builders and reset or reseed unreadable local data (§14).
- **The trap:** editing `prototype/seeds/*.json` by hand. The test will fail, and the
  next builder run would have overwritten it anyway.
