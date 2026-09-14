# How prototype data works

## Runtime flow

1. `pnpm prototype:seed <name>` runs `seed-cli.ts` with `tsx`. It resolves the target path
   against `INIT_CWD` (the directory the command was run from, not the package), builds
   the named seed, and writes it atomically over `.prototype/data.json` — the running
   host does **not** see this; restart it or use the dev panel's Seed control.
2. `pnpm prototype:reset` is the same command with `personal-workspace`.
3. `pnpm prototype:upgrade <file>` runs `upgrade-cli.ts`: parse the file as plain data,
   refuse anything but version 2 (a version-3 file is a no-op), convert with
   `upgradeProjectPages`, validate the output with the document schema, write the original
   beside it as `.backup-<timestamp>.json`, then write through a temp file.
4. Tests: `seeds.test.ts` parses every builder's output with `PrototypeDocumentSchema`,
   and compares it byte-for-byte to `prototype/seeds/<name>.json` serialised with LF;
   `upgrade-project-pages.test.ts` converts the committed v2 corpus;
   `version-3-undo-compatibility.test.ts` loads, persists and reloads
   `test/fixtures/nested-projects-v3.json` — the `nested-projects` snapshot as it was before Undo
   records existed — and proves every collection survives with an empty `undoRecords`.
5. Other packages import the builders directly: the MCP harness and the host tests seed
   an `InMemoryDataStore` from `agent-heavy`; the acceptance scripts copy the committed
   JSON because they run under plain `node`.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PERSONAS` | const | The three personas | [API](../../api/miscellaneous/variables.html#PERSONAS) |
| `writeSeedFile` | function | Write a named seed atomically | [API](../../api/miscellaneous/variables.html#writeSeedFile) |
| `upgradeProjectPages` | function | v2 → v3 converter; pure over the parsed document | [API](../../api/miscellaneous/variables.html#upgradeProjectPages) |
| `WriteSeedOptions`, `UpgradeDataFileOptions` | interfaces | Injectable file operations for the two CLIs' tests | [API](../../api/interfaces/WriteSeedOptions.html) |

## Dependencies

**Depends on**

- [contracts](../contracts/overview.md) — the document schema every seed is validated
  against; the entity types the builders construct.
- [repositories](../repositories/overview.md) — the seed CLI writes through the same
  store the host uses.

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
- **No migration chain.** One converter, called explicitly, registered nowhere. A defaulted
  collection added inside version 3 (`undoRecords`) needs no converter; the v3 fixture test is
  the evidence an older file still loads without loss.
- **Seeds hold no Undo history.** Every snapshot carries `"undoRecords": []`, and loading a seed
  replaces the document — so it discards every outstanding receipt.

## Commands

```bash
pnpm prototype:seed busy-week        # rewrite .prototype/data.json
pnpm prototype:reset                 # personal-workspace
pnpm prototype:upgrade .prototype/data.json
pnpm --filter @cwm/prototype-data test
pnpm --filter @cwm/prototype-data lint
```

## Changing it

- **Changing a seed:** edit the builder, run the tests, commit the regenerated
  snapshot the test tells you about. Say in the commit what scenario changed and why.
- **A contract change that breaks the seeds:** the seed test fails first. Fix the
  builders; then decide whether a real `.prototype/data.json` is worth a converter or
  a reset (§14).
- **The trap:** editing `prototype/seeds/*.json` by hand. The test will fail, and the
  next builder run would have overwritten it anyway.
