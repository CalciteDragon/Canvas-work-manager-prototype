# Slice 4 — Seeds, personas, clock, reset

**Status:** done

## Goal

Any contract-valid, reproducible prototype workspace state is one command away, with
fake personas and simulated time ready for later UI and domain slices.

## Spec sections

§16 (committed prototype seeds), §17 (Demo User, Alex, and Sam personas), §45
(`Clock` and settable `PrototypeClock`), and §76 (reset and named-seed commands).

## Acceptance check

Executable, in order.

1. `pnpm --filter @cwm/prototype-data test` exits 0 and proves the complete seed-name
   registry is exactly `empty`, `personal-workspace`, `busy-week`, `nested-projects`,
   and `overdue-chaos`; every builder result parses through `PrototypeDocumentSchema`,
   constructs the public `InMemoryDataStore` (thereby passing repository document-
   integrity validation), and equals its committed
   `prototype/seeds/<name>.json` snapshot.
2. The same suite proves every seed contains the three §17 personas — `Demo User`,
   `Alex`, and `Sam` — with stable readable ids, avatars, separate owned workspaces,
   and distinct valid preferences. Mutating one built document cannot contaminate a
   later build.
3. Seed-specific assertions prove `empty` has no work entities; `personal-workspace`
   has a small usable project; `busy-week` has multiple projects and a realistic mix
   of task dates/statuses/priorities; `nested-projects` has a valid multi-level project
   hierarchy; and `overdue-chaos` has several incomplete tasks overdue relative to the
   exported deterministic seed date.
4. `pnpm --filter @cwm/domain test` exits 0 and proves `PrototypeClock.now()` and
   `setNow()` return/store detached `Date` values; invalid construction and invalid
   updates reject, and an invalid update preserves the prior valid time.
5. `pnpm lint` exits 0, including a package-local domain lint guard that fails on a
   direct `new Date()` in domain source anywhere except the clock implementation.
6. From the repository root, `pnpm prototype:seed busy-week` atomically rewrites
   `.prototype/data.json`; the resulting document parses and contains multiple
   projects. `pnpm prototype:seed does-not-exist` exits non-zero, names the invalid
   value, lists valid names, and leaves the current data file unchanged.
7. `pnpm prototype:reset` produces byte-for-byte the same live document as
   `pnpm prototype:seed personal-workspace`. The CLI creates `.prototype/` if it is
   absent and uses sibling-temp-file plus rename so a write cannot truncate live data.
   Injected temp-write and rename failures leave an existing target byte-identical; a
   failed rename may leave a complete recoverable sibling temp file, which the next
   seed run overwrites.
8. `pnpm test`, `pnpm lint`, and `pnpm build` exit 0; `pnpm dev` starts both apps and
   the host still answers its existing health route.
9. `development.md` marks Slice 4 done only after the checks pass; this plan records
   review revisions; the persona-workspace choice is in `docs/decisions/`; and actual
   seed/reset exercise friction, if any, is appended to `.prototype/notes.json`.

## File-level change list

- `packages/prototype-data/src/personas.ts` — define the three stable persona/workspace
  fixtures and their deliberately different preferences using contract-owned types.
- `packages/prototype-data/src/seeds.ts` — own the literal seed-name registry, fixed
  scenario date, deterministic builders, and per-scenario entities. Each call returns
  a fresh `PrototypeDocument`; ids and timestamps remain readable for inspection.
- `packages/prototype-data/src/index.ts` — export seed names/builders, scenario date,
  and persona fixtures; remove the Slice 1 placeholder.
- `packages/prototype-data/src/seed-cli.ts` — validate one seed argument, build and
  schema-validate the document before touching disk, create `.prototype/`, then write
  a complete sibling temporary file and rename it to `data.json`. Resolve repository
  paths from the module location so filtered package execution is cwd-independent. A
  narrow injected file-operations/target seam makes failure paths testable without
  touching the live file.
- `packages/prototype-data/src/seeds.test.ts` — validate the registry, schemas,
  referential integrity, committed snapshots, persona isolation/preferences, fresh
  builder results, and each scenario's distinguishing behavior; exercise CLI success,
  default/reset equivalence, invalid-name non-mutation, directory creation, and
  temp-before-rename behavior through a temporary target seam rather than mutating the
  real live file.
- `packages/prototype-data/package.json` — add contracts/runtime and repository
  test-only dependencies, Vitest/tsx/Node tooling, and test/seed scripts.
- `packages/prototype-data/tsconfig.json` — include Node types needed by the seed CLI
  and filesystem tests.
- `packages/domain/src/clock.ts` — define `Clock` and the settable `PrototypeClock`;
  clone input/output dates and fail fast on invalid input.
- `packages/domain/src/clock.test.ts` — drive the clock behavior red before its
  implementation.
- `packages/domain/src/index.ts` — export the clock contract and implementation;
  remove the placeholder.
- `packages/domain/scripts/check-no-direct-date.mjs` — cross-platform source scanner
  used by lint; permit the clock implementation and reject direct construction in all
  other non-test domain source.
- `packages/domain/package.json` — add Vitest, a test script, and run the time guard as
  part of lint after type-checking.
- `prototype/seeds/empty.json` — committed generated snapshot for the persona-only
  empty state.
- `prototype/seeds/personal-workspace.json` — committed generated snapshot for the
  default small workspace.
- `prototype/seeds/busy-week.json` — committed generated multi-project working week.
- `prototype/seeds/nested-projects.json` — committed generated project hierarchy.
- `prototype/seeds/overdue-chaos.json` — committed generated overdue stress state.
- `package.json` — add root `prototype:seed` and defaulting `prototype:reset` scripts.
- `pnpm-lock.yaml` — record the new workspace and tool dependency edges.
- `docs/decisions/2026-08-persona-workspace-topology.md` — record why every seed ships
  all three personas in separate workspaces and what future use should revisit.
- `docs/decisions/2026-08-persona-contract-fields.md` — record why §17 uses canonical
  `User.id`/`workspaceId` rather than introducing persona-only aliases.
- `Canvas Work Manager — Prototype Product, Design & Development Specification.md` —
  correct §17's provisional persona field names to the implemented canonical contract.
- `development.md` — mark Slice 4 in progress now and done only after acceptance.
- `.prototype/notes.json` — append only friction observed during real CLI/seed use.
- `docs/plans/04-seeds-personas-clock-reset.md` — keep this plan current and record
  iterative subagent review changes.

## Test plan

Tests are written and observed failing for the intended missing behavior before the
minimum implementation is added.

- `exposes exactly the five Slice 4 seed names` — later deferred seeds do not leak in,
  and CLI/help share one registry rather than duplicate name lists.
- `builds every seed as a valid isolated prototype document` — parse each builder
  result through `PrototypeDocumentSchema` and repository integrity validation, then
  mutate nested output and prove the next build is pristine.
- `matches every committed human-readable seed snapshot` — committed examples cannot
  drift from executable builders.
- `includes Demo User, Alex, and Sam as distinct workspace owners` — names, ids,
  avatars, workspace references/owners, and non-identical preferences are present in
  every seed; projects remain inside their persona's workspace.
- `builds an actually empty work state` — the empty seed contains no projects,
  sections, tasks, milestones, reflections, events, or connections while retaining
  the personas/workspaces needed to switch identity.
- `builds the default personal workspace` — at least one small project and task belong
  to Demo User's workspace.
- `builds a realistic busy week` — Demo User's workspace has at least three projects,
  several tasks, more than one status and priority, and dates on both sides of the
  scenario date without schema-invalid status combinations.
- `builds nested projects` — at least one root → child → grandchild chain exists and
  stays in one workspace; walking every parent chain terminates without self-parenting
  or a cycle. This is a fixture assertion, not new generic nesting domain policy.
- `builds overdue chaos` — several incomplete tasks have due dates before the fixed
  scenario date; completed/cancelled tasks are not counted as overdue.
- `writes a selected seed atomically` — a temporary destination receives exactly one
  complete validated JSON document through `write temp → rename target`, with no temp
  file left on success.
- `keeps the live seed intact when the temp write fails` — injected `writeFile`
  rejection never calls rename and leaves an existing target byte-identical.
- `keeps the live seed intact when rename fails` — injected rename rejection occurs
  only after a complete temp write and leaves the existing target byte-identical; the
  complete sibling temp file is an explicitly accepted recoverable artifact.
- `defaults reset to personal-workspace` — the reset entry path and explicit seed
  selection produce identical bytes.
- `rejects an unknown seed before mutation` — non-zero CLI behavior is testable through
  an exported narrow runner; the prior target stays byte-identical and diagnostics
  include both the bad value and valid names.
- `creates a missing target directory` — a clean checkout can seed without setup.
- `returns a detached simulated now` — changing constructor input or `now()` output
  does not mutate `PrototypeClock` state.
- `updates and detaches simulated now` — `setNow()` changes subsequent results but
  later mutation of its argument does not.
- `rejects invalid simulated dates at construction` — a clock cannot begin with an
  invalid instant.
- `rejects an invalid simulated-date update without changing time` — `setNow()`
  validates before assignment, so a failed update cannot poison future calculations.
- `domain lint rejects direct Date construction outside clock.ts` — run the scanner
  against controlled temporary source trees so both permitted and prohibited cases
  are proven, without introducing a banned expression into production domain files.

## Boundaries touched

- **Contracts exist once (§8, §11).** Seed builders use `PrototypeDocument` and parse
  with `PrototypeDocumentSchema`; they create no parallel entity/persona interfaces.
- **Domain services use repository interfaces + `Clock` (§8, §12, §45).** The domain
  package gains only the time port and prototype implementation. It imports neither
  repositories nor transports, and the scanner makes direct source construction fail
  lint from this slice onward.
- **Persistence remains infrastructure (§14, §15).** The deliberately disposable seed
  CLI replaces the full live fixture atomically; it does not expose repository/domain
  operations or become an alternate mutation path used by product code.
- **Seed validation is layered.** Contract parsing proves canonical shapes; constructing
  the public `InMemoryDataStore` in tests catches dangling/cross-workspace references
  before a fixture can reach the host without exporting an infrastructure validator
  solely for tests.
- **Prototype-only controls stay centralized (§47).** This slice adds CLI tooling only;
  it does not add UI flags or scattered prototype conditionals.

## Explicit non-goals

- No seed-loading, persona-switching, or clock controls in Angular; Slice 12 owns the
  development panel (§46).
- No host seed/reset/date endpoints; Slice 12 owns them.
- No `large-project`, `completed-project`, or `agent-heavy` seed. The development plan
  explicitly defers them; `agent-heavy` belongs to Slice 13.
- No real accounts, authentication, OAuth, or user-management behavior (§17, §80).
- No domain services, repository changes, event broadcasts, HTTP, MCP, or mock AI.
- No randomized fixture generation, faker dependency, seed migrations, or generic
  fixture DSL. Stable hand-readable literals are cheaper to inspect and reproduce.
- No attempt to decide dashboard widget survival, project/task status value survival,
  nesting's product value, or whether milestones deserve their model; seeds only put
  those existing hypotheses into later observable use.

## Open questions

None that change the slice shape. The plan uses a documented reversible default: all
three personas exist in every seed and own separate workspaces, while the named scenario
primarily changes Demo User's workspace. This is the smallest arrangement that lets the
later development panel test persona preferences and user isolation without real auth.

## Revisions

- Initial plan written from Slice 4, §§16/17/45/76, the current contracts and document
  integrity rules, prior dashboard-widget ownership decision, and existing package
  scripts.
- Round 1: added explicit temp-write and rename-failure atomicity tests with defined
  orphan-temp behavior; routed referential checks through public `InMemoryDataStore`;
  required invalid clock construction and state-preserving update coverage; and added
  seed-local project ancestry termination/cycle checks.
- Round 2: no substantive plan findings remained.
- Implementation review: deep-froze the exported persona templates and added a
  regression test so consumers cannot contaminate future deterministic builds; recorded
  the `userId`/`workspace` → `id`/`workspaceId` contract choice and corrected §17. The
  separate claim that §17 did not name user isolation was rejected because the exact
  section explicitly lists it.
- Final review: correctness/acceptance and architecture-boundary passes returned no
  substantive findings; the spec/living-doc pass returned clean after the fixes above.
  The real CLI verified busy-week replacement, invalid-name non-mutation, and reset
  equivalence. `pnpm test`, `pnpm lint`, and `pnpm build` passed; the running host and
  Angular app returned HTTP 200 before clean shutdown.
