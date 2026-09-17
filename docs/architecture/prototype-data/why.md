# Why prototype data exists

## The problem it solves

A design prototype is only as good as the states you can put it in. "What does the
dashboard look like on a Friday with five overdue tasks?" needs a workspace that has
exactly that, reproducibly, in one command (§16). And a persona switch is only a
demonstration of isolation if three personas with separately owned workspaces exist in
every seed (§17). Without this package every scenario would be hand-edited JSON that
nobody could regenerate.

## Forces

- **Determinism.** Two runs of a seed must produce the same bytes, or a screenshot is
  a fact about a random number rather than about the seed. Scenario dates are relative to
  a fixed "Monday morning" so overdue and upcoming stay meaningful under the simulated
  clock.
- **Validity.** A seed that no longer matches the contracts must fail CI, not surprise a
  session — so every builder's output is parsed by the document schema in a test.
- **The tokens have no security value** (§51) and the contract must never grow a
  secret-shaped field (§52, §80).
- **A real data file eventually becomes worth keeping.** By schema version 3 the
  developer's `.prototype/data.json` had a fortnight of real use in it.

## The shape, and the alternatives rejected

**Builders, not hand-written JSON.** Each seed is a function producing a document;
`prototype/seeds/*.json` are snapshots of those functions, committed so that plain-Node
acceptance scripts can copy a seed without importing TypeScript, and compared
byte-for-byte in `seeds.test.ts`. Rejected: committing only the JSON — every contract
change would mean editing six files by hand.

**Three personas in every seed, scenario content in Demo User's workspace.** Alex and Sam
exist so that switching persona repaints the shell, the theme and the dashboard from
another workspace; they carry no scenario content until an observed use case earns it
([decision](../../decisions/2026-08-persona-workspace-topology.md)).

**Tokens are fixtures beside the seeds, not records.** A token maps to a connection id;
the host re-reads the *live* connection on every request, so revocation and permission
edits take effect on the next call. A token whose connection is absent from the loaded
seed simply fails to authenticate
([decision](../../decisions/2026-08-agent-tokens-are-fixtures-not-records.md)).

**Bounded converters, not a migration runner.** Version 1 → 2 reset; version 2 → 3
shipped `upgradeProjectPages`; version 3 → 4 shipped `upgradeOperationHistory`. Each reads its
input shape as plain data (re-declaring it as a schema would put a second definition of every
entity in the repository). When version 4 arrived, the v2 step was **frozen** at a literal version
3 and stopped validating — it had imported `SCHEMA_VERSION` and would otherwise have stamped a
version-3 shape as version 4 and rejected every version-3 input — and the v3 step became the one
that validates the final document before a byte is written. The CLI sniffs the version and runs the
steps in order: two named functions, still registered nowhere (§14, §71). Version-3 Undo receipts
are retired rather than translated, because they hold no cursor, placement or generation to
translate ([decision](../../decisions/2026-09-schema-version-4-conversion.md)).

**Paths resolve from where the command was run.** `pnpm --filter` runs a script with the
package as its cwd, so the CLIs resolve a path argument against `INIT_CWD` — a trap
every path-taking passthrough shares.

## Consequences

- Any workspace state is `pnpm prototype:seed <name>` away, and the acceptance scripts
  and the e2e suite seed themselves the same way.
- A seed change is a builder change, and the snapshot diff in review shows exactly what
  moved.
- The seeds carry the integrated showcase: since 25.8 `nested-projects` holds a root
  with optional pages, three-level work, Home shortcuts, archived ancestry, linked
  reflections and isolated agent connections. Changing the model means changing that
  seed deliberately.
- `.gitattributes` normalises every text file to LF because the byte comparison would
  otherwise fail on a fresh Windows clone.

## Decisions that shape this system

- [Persona workspace topology in seeds](../../decisions/2026-08-persona-workspace-topology.md)
- [Schema version 4 converts explicitly, retires version-3 receipts, and chains two named steps](../../decisions/2026-09-schema-version-4-conversion.md) — the frozen v2 step, the validating v3 step, the chained CLI
- [Where §51's bearer tokens live](../../decisions/2026-08-agent-tokens-are-fixtures-not-records.md)
- [A root project is a workspace with pages; a subproject is a unit of work](../../decisions/2026-09-project-workspaces-and-subproject-work-units.md) — the v2 → v3 converter

## Spec sections

§16 prototype seeds · §17 personas · §45 time (scenario-relative dates) · §51 prototype
MCP authentication · §76 prototype reset · §14 the one converter.
