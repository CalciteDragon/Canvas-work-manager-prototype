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
- **Local data is disposable.** Keeping usable current seeds matters more than preserving
  a developer's old file.

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

**Reset or reseed, rather than carry old files forward.** Local prototype data is disposable
until the user says otherwise. The earlier conversion pipeline, fixtures and legacy prose encoder
have been removed. Seeds use hand-authored Markdown and capture Activity identity through the
seed-owned `activity-identity.ts` module; every seeded config is checked against its type
([policy](../../decisions/2026-10-prototype-data-is-disposable.md),
[retirement](../../decisions/2026-10-retiring-the-sub-projects-section.md)).

**The seed CLI uses the repo-anchored file.** The library writer accepts an explicit target path
for isolated tests. Both keep the same atomic temp-and-rename write.

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

- [The Sub-Projects section is retired; Work is the hierarchy surface](../../decisions/2026-10-retiring-the-sub-projects-section.md)

- [Persona workspace topology in seeds](../../decisions/2026-08-persona-workspace-topology.md)
- [Activity identity survives removal of its task or reflection](../../decisions/2026-09-historical-activity-identity.md) — what seed Activity capture validates
- [Prototype data is disposable until further notice; working seeds are what must survive](../../decisions/2026-10-prototype-data-is-disposable.md) — seeds must load; the old pipeline has been removed
- [Where §51's bearer tokens live](../../decisions/2026-08-agent-tokens-are-fixtures-not-records.md)
- [A root project is a workspace with pages; a subproject is a unit of work](../../decisions/2026-09-project-workspaces-and-subproject-work-units.md) — the current project/page model

## Spec sections

§16 prototype seeds · §17 personas · §45 time (scenario-relative dates) · §51 prototype
MCP authentication · §76 prototype reset · §14 disposable local storage.
