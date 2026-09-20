# How prototype data works

## Runtime flow

1. `pnpm prototype:seed <name>` runs `seed-cli.ts` with `tsx`. It resolves the target path
   against `INIT_CWD` (the directory the command was run from, not the package), builds
   the named seed, and writes it atomically over `.prototype/data.json` — the running
   host does **not** see this; restart it or use the dev panel's Seed control.
2. `pnpm prototype:reset` is the same command with `personal-workspace`.
3. `pnpm prototype:upgrade <file>` runs `upgrade-cli.ts`: parse the file as plain data and
   **sniff its version first** — the frozen v2 step refuses anything newer, so the "already
   current" answer cannot be delegated to it. Version 2 runs `upgradeProjectPages` (frozen at a
   literal version 3, unvalidated, opaque JSON) and then `upgradeOperationHistory`; version 3 runs
   the latter and then the v4 step. The v3 step drops `undoRecords` (counting them), writes `archiveGeneration: 0` on every
   section and empty history collections, and returns opaque version-4 JSON. `upgradeActivityIdentity` then validates legacy Activity
   references, backfills historical context and validates the version-5 result, preserving all
   version-4 histories and actions. Only then is the
   original written beside the file as `.backup-<timestamp>.json` and the new document written
   through a temp file. A version-4 file runs just the Activity step; a version-5 file is validated and left alone. The message names the version
   converted from and, when any were retired, how many version-3 Undo receipts were dropped.
4. Tests: `seeds.test.ts` parses every builder's output with `PrototypeDocumentSchema`,
   and compares it byte-for-byte to `prototype/seeds/<name>.json` serialised with LF;
   `upgrade-project-pages.test.ts` covers the frozen v2 step alone;
   `version-3-undo-compatibility.test.ts` is the v3 → v4 suite over
   `test/fixtures/nested-projects-v3.json` plus legacy receipts added as plain JSON (a pre-Slice-31
   reassign, consumed and outstanding records); `upgrade-cli.test.ts` covers the chain, the version
   sniff, repeat runs, backup-before-write and a failed conversion writing nothing. The host's
   `recovery-undo-acceptance.test.ts` runs the real CLI as a subprocess.
5. Other packages import the builders directly: the MCP harness and the host tests seed
   an `InMemoryDataStore` from `agent-heavy`; the acceptance scripts copy the committed
   JSON because they run under plain `node`.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PERSONAS` | const | The three personas | [API](../../api/miscellaneous/variables.html#PERSONAS) |
| `writeSeedFile` | function | Write a named seed atomically | [API](../../api/miscellaneous/variables.html#writeSeedFile) |
| `upgradeProjectPages` | function | Frozen v2 → v3 step; pure, unvalidated, opaque output | [API](../../api/miscellaneous/variables.html#upgradeProjectPages) |
| `upgradeOperationHistory` | function | Frozen v3 → v4 step; retires receipts and returns opaque JSON | [API](../../api/miscellaneous/variables.html#upgradeOperationHistory) |
| `upgradeActivityIdentity` | function | v4 → v5 step; backfills validated Activity context, preserves histories and validates the final document | [API](../../api/miscellaneous/variables.html#upgradeActivityIdentity) |
| `upgradeDataFile` | function | The CLI's version sniff, chain, backup and atomic write | [API](../../api/miscellaneous/variables.html#upgradeDataFile) |
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
- **No migration runner.** Three named converters, called in a fixed order by the one CLI,
  registered nowhere. The v2 and v3 steps are frozen at their literal version-3 and version-4
  outputs; only the v4 → v5 step validates the final document, so the chain never writes an
  unloadable file.
- **Seeds hold no Undo history.** Every snapshot carries `"operationHistories": []` and
  `"operationActions": []` and `archiveGeneration: 0` on every section; loading a seed replaces
  the document — so it discards every history.

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
