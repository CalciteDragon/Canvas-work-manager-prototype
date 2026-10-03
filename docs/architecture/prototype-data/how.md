# How prototype data works

## Runtime flow

1. `pnpm prototype:seed <name>` runs `seed-cli.ts` with `tsx`. It resolves the target path
   against `INIT_CWD` (the directory the command was run from, not the package), builds
   the named seed, and writes it atomically over `.prototype/data.json`. It first takes the
   file's owner record (`seedDataFileOwned`, `kind: 'seed'`), so while a host runs it is refused
   with `data_file_in_use:` naming the host; stop the host or use the dev panel's Seed control
   ([decision](../../decisions/2026-09-one-writer-per-data-file.md)).
2. `pnpm prototype:reset` is the same command with `personal-workspace`.
3. `pnpm prototype:upgrade <file>` runs `upgrade-cli.ts` through `upgradeDataFileOwned`, which
   takes the owner record (`kind: 'upgrade'`) before the read and is refused while anything else
   owns the file — no backup and no temp file are written then. It parses the file as plain data and
   **sniff its version first** — the frozen v2 step refuses anything newer, so the "already
   current" answer cannot be delegated to it. Version 2 runs `upgradeProjectPages` (frozen at a
   literal version 3, unvalidated, opaque JSON) and then `upgradeOperationHistory`; version 3 runs
   the latter and then the v4 step, and every version continues to the v5 step. The v3 step drops `undoRecords` (counting them), writes `archiveGeneration: 0` on every
   section and empty history collections, and returns opaque version-4 JSON. `upgradeActivityIdentity` then validates legacy Activity
   references and backfills historical context, preserving all version-4 histories and actions, and
   returns opaque version-5 JSON (frozen at literal 5; a version-5-or-later input passes through).
   `upgradeMarkdownSections` then converts every Rich Text section — live, archived, and in the
   `section.add`/`section.remove` snapshots and the `before`/`after` of a `section.update` config
   edit — to Markdown, storing the prose through `encodeLegacyProse` so nothing in it can become
   structure, and validates the version-6 result. It refuses conflicting types for one section id,
   a `markdown` key in a Rich Text config, a Rich Text created container, and an encoding that does
   not round-trip; an edit to a section no record holds any more is left as recorded and counted
   ([decision](../../decisions/2026-10-schema-version-6-markdown-conversion.md)). Only then is the
   original written beside the file as `.backup-<timestamp>.json` and the new document written
   through a temp file. A version-4 file runs the Activity and Markdown steps; a version-5 file runs just the Markdown
   step; a version-6 file re-runs it, so a clean one is a byte-identical no-op and a hand-edited one
   still holding Rich Text is converted. The message names the version converted from and, when
   non-zero, how many version-3 Undo receipts were dropped, Activity events backfilled, Rich Text
   sections and history records converted, unreadable configs kept and orphaned edits left.
4. Tests: `seeds.test.ts` parses every builder's output with `PrototypeDocumentSchema`,
   and compares it byte-for-byte to `prototype/seeds/<name>.json` serialised with LF;
   `upgrade-project-pages.test.ts` covers the frozen v2 step alone;
   `version-3-undo-compatibility.test.ts` is the v3 → v4 suite over
   `test/fixtures/nested-projects-v3.json` plus legacy receipts added as plain JSON (a pre-Slice-31
   reassign, consumed and outstanding records); `legacy-prose.test.ts` proves the encoding inert
   under markdown-it with the app's options and exactly invertible; `upgrade-markdown-sections.test.ts`
   converts the frozen `test/fixtures/history-v5-rich-text.json` and its refusal cases;
   `upgrade-cli.test.ts` covers the chain, the version
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
| `upgradeActivityIdentity` | function | Frozen v4 → v5 step; backfills validated Activity context, preserves histories, returns opaque JSON | [API](../../api/miscellaneous/variables.html#upgradeActivityIdentity) |
| `upgradeMarkdownSections` | function | v5 → v6 step, re-run on v6; converts Rich Text everywhere it is stored, counts, and validates the final document | [API](../../api/miscellaneous/variables.html#upgradeMarkdownSections) |
| `encodeLegacyProse`, `decodeLegacyProse` | functions | Fixed reversible escaping of legacy prose into inert Markdown, and its exact inverse | [API](../../api/miscellaneous/variables.html#encodeLegacyProse) |
| `upgradeDataFile` | function | The CLI's version sniff, chain, backup and atomic write | [API](../../api/miscellaneous/variables.html#upgradeDataFile) |
| `seedDataFileOwned`, `upgradeDataFileOwned` | functions | The CLIs' entries: the same writes under the data file's owner record. The library functions above stay ownership-free, because `loadPersistence` seeds inside its caller's ownership | [API](../../api/miscellaneous/variables.html#seedDataFileOwned) |
| `WriteSeedOptions`, `UpgradeDataFileOptions` | interfaces | Injectable file operations for the two CLIs' tests | [API](../../api/interfaces/WriteSeedOptions.html) |

## Dependencies

**Depends on**

- [contracts](../contracts/overview.md) — the document schema every seed is validated
  against; the entity types the builders construct.
- [repositories](../repositories/overview.md) — the seed CLI writes through the same
  store the host uses.
- `markdown-it`, test only: `legacy-prose.test.ts` renders encoded prose with the web
  renderer's options. No source file imports it.

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
- **No migration runner.** Four named converters, called in a fixed order by the one CLI,
  registered nowhere. The v2, v3 and v4 steps are frozen at their literal version-3, version-4 and
  version-5 outputs; only the v5 → v6 step validates the final document, so the chain never writes
  an unloadable file.
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
