# Prototype data

`@cwm/prototype-data` is everything that makes a workspace state one command away (§16,
§17, §76): the six deterministic seed builders, the three personas, the fixture agent
tokens, the CLI that writes a seed into `.prototype/data.json`, and the three explicit converters
that carry a version-2, version-3 or version-4 data file forward to version 5. It is prototype-only (§71) and
nothing in it survives into the MVP.

**Code:** `packages/prototype-data/src` · **Committed snapshots:** `prototype/seeds/*.json`
· **Tests:** `packages/prototype-data/src/*.test.ts` and `test/fixtures/` (vitest) ·
**Package:** `@cwm/prototype-data` · **Depends on:** `@cwm/contracts`, `@cwm/repositories`

## Responsibilities

- Build valid documents for `empty`, `personal-workspace`, `busy-week`,
  `nested-projects`, `overdue-chaos` and `agent-heavy`, deterministic down to the byte —
  the committed snapshots are compared against the builders' output.
- Define Demo User, Alex and Sam with stable ids, distinct preferences and separately
  owned workspaces in every seed.
- Hold §51's bearer tokens (`prototype-user-a-readwrite`, `-readonly`, `-revoked`) as
  fixtures beside the seeds, not as contract fields.
- `pnpm prototype:seed <name>` / `pnpm prototype:reset`: write a seed atomically over the
  data file. `pnpm prototype:upgrade <file>`: sniff the version, convert v2 → v3 → v4 → v5 (or start at v3/v4), validate, back up, write.

## Not responsible for

- Loading a seed into a *running* host — the development panel does that through
  `/prototype/seed` ([prototype-runtime](../prototype-host/prototype-runtime/overview.md)).
- Authentication — the host resolves a token to a connection
  ([mcp-transport](../prototype-host/mcp-transport/overview.md)).
- A migration framework: each converter is one named function for one cutover, run in a fixed
  order by the one CLI (§14).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
