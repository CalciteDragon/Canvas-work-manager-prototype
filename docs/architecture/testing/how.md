# How testing works

## Runtime flow

1. `pnpm test` first runs `node --test scripts/roadmap.test.mjs scripts/check-docs.test.mjs` for roadmap and documentation guards,
   then `pnpm -r --if-present test`: `vitest run` in each package and the
   host, `ng test --no-watch` in the web app. No browser or external network is needed;
   transport and persistence tests use isolated localhost servers and temporary files.
2. `pnpm lint` runs each workspace's `lint` — `tsc --noEmit` plus the import, date and
   token lints where they apply — and then `node scripts/check-docs.mjs`.
3. `pnpm build` builds the web app (with the bundle budgets) and type-checks the rest.
4. `pnpm --filter @cwm/prototype-host <acceptance|agent-acceptance|mcp-acceptance|live-acceptance>`
   starts a second host on a temp file and walks a slice's *done when*. Since Slice 30,
   `acceptance` removes `personal-workspace`'s first Home placement, undoes it through
   `POST /api/undo/:id` and checks it returns first and a repeat is `undo_consumed`;
   `mcp-acceptance` grants `projects.write` to the token's connection **in its copied temp
   files** (the seed is unchanged), cascades the middle `agent-heavy` task list away with
   `remove_section`, restores it with `undo_operation` over both transports, and checks the
   persisted file shows the section live and the record consumed.
5. `pnpm e2e` (dev servers stopped, Chromium installed once) starts both processes,
   seeds before each spec, and runs the six journeys, including the canvas editing
   geometry and touch checks.
6. `pnpm storybook` serves the story sets with the theme toolbar; `pnpm storybook:build`
   produces a static build the 25.x closeouts used as a check.
7. After every slice, §77: seed, use, try it through MCP, write the friction down.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `InMemoryDataStore` | class | The store every suite below the browser uses | [API](../../api/classes/InMemoryDataStore.html) |
| `PrototypeClock` | class | Frozen time for tests | [API](../../api/classes/PrototypeClock.html) |
| `PrototypeIdGenerator` | class | Deterministic ids where a test needs them | [API](../../api/classes/PrototypeIdGenerator.html) |
| `createApi` | function | A whole host in-process for route and MCP tests | [API](../../api/miscellaneous/variables.html#createApi) |
| `createToolRegistry` | function | What the contract suite iterates | [API](../../api/miscellaneous/variables.html#createToolRegistry) |

The harness and fakes are test-support files, excluded from the API reference; their
paths are in [what](what.md).

## Dependencies

**Depends on**

- Every system, by construction. Test-only dependencies: `vitest`, `@playwright/test`,
  `@modelcontextprotocol/client`, `storybook`, `@storybook/angular-vite`,
  `@storybook/addon-themes`, `jsdom`.
- [prototype-data](../prototype-data/overview.md) — seeds for every suite and script.
- [prototype-runtime](../prototype-host/prototype-runtime/overview.md) — `/prototype/seed`
  for the e2e specs.

**Depended on by**

- The development protocol in [AGENTS.md](../../../AGENTS.md): a phase is not done until
  `pnpm test` and `pnpm lint` are green and the acceptance check has been run.

## Invariants and lints

| Rule | Check |
|---|---|
| Domain imports only contracts and repository interfaces | `check-package-imports.mjs` in `@cwm/domain`'s lint; `import-lint.test.ts` |
| Tools import only contracts, domain, zod | same script, `--allow`, in `@cwm/mcp-tools`'s lint |
| No `new Date()` in domain code | `check-no-direct-date.mjs`; `time-lint.test.ts` |
| No design literals outside `_tokens.scss` | `check-design-tokens.mjs`; `expect-failure.mjs` self-test |
| Every tool has a contract case, tested under minimal grants | `contract.test.ts` |
| Every registry list is pinned | `registry.spec.ts` ×3 (sections, widgets, pages) |
| Every seed parses and matches its snapshot | `seeds.test.ts` |
| `LIVE_UPDATES` is provided | `app.spec.ts` |
| Documentation structure and links | `check-docs.mjs` |
| `pnpm test` needs no browser or external network | Host transport tests use ephemeral localhost ports; e2e and acceptance commands are separate |

## Commands

```bash
pnpm test                                             # everything offline
pnpm lint                                             # type-checks, boundary lints, token lint, docs check
pnpm build
pnpm --filter @cwm/domain test -- task-service         # one suite
pnpm --filter web test                                # ng test --no-watch
pnpm --filter @cwm/prototype-host acceptance          # and agent-acceptance, mcp-acceptance, live-acceptance
pnpm exec playwright install chromium                 # once
pnpm e2e                                              # stop dev:web and dev:host first
pnpm storybook                                        # :6006
```

## Changing it

- **A new rule:** a failing domain test first (AGENTS.md step 3), named for what it
  proves. Tests protect intentional behaviour: when intent changes, change the test
  *and* the implementation *and* the doc, never preserve a behaviour because a test
  asserts it (§77).
- **A new tool:** the contract suite tells you the case is missing.
- **A new boundary rule:** a lint with a self-test, not a comment. Copy the shape of
  `check-package-imports.mjs` + `import-lint.test.ts`.
- **A new e2e journey:** seed in `seed.ts`, spec beside the others, and an assertion that
  cannot pass vacuously — 25.5's review found one that could.
- **Archive acceptance** lives in `archive.spec.ts`: the original cascade/subproject journey,
  and Slice 29's content journey over `nested-projects` — created-id assertions that removed
  views, blank prose and reassigned sources are absent while prose, cascaded and
  pre-archived-only containers are present with recovery metadata; reload; append after an
  interposed Home shortcut; retry idempotency; the disabled tab reopened from a nested route;
  and the same projection and canonical restores through a real MCP client.
- **The trap:** a test that passes before the implementation, or fails on a typo. Watch
  it fail for the right reason first.

The Compodoc fragment regression runs when generated API output exists; otherwise Node
reports it skipped. Run `pnpm docs:api` before `pnpm test` to exercise it.
