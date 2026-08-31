# The end-to-end suite starts its own servers and writes its own data file

**Question**

§69 asks for exactly two end-to-end tests. This prototype is two processes and one JSON file.
What runs them, and what stops a run from destroying the workspace the developer was using?

**Options tested**

- *Cypress*: rejected on one deciding property. Playwright's `webServer` takes an **array**;
  Cypress has no equivalent, so two processes would mean hand-rolling orchestration.
- *`ng e2e` or `playwright-ng-schematics`*: rejected. Angular ships no e2e implementation and
  endorses no tool; the schematic's builder starts exactly one dev server, which cannot
  express this repo's shape. A plain `playwright.config.ts` is less machinery and more honest.
- *Playwright with its own config and its own data file*: chosen. It also publishes no install
  scripts, so pnpm 11's `allowBuilds` gate is untouched and browsers arrive through an
  explicit `pnpm exec playwright install chromium`.

**What we learned**

The suite lives in `apps/e2e` as its own workspace package, and its script is `e2e`, **not**
`test` — `pnpm test` runs `pnpm -r --if-present test` and must stay fast, offline, and green
without browsers installed. It does get a `lint`, so `pnpm lint` type-checks the specs.

**Five mechanics, four found by reasoning and one by running it.**

- **`cwd`** defaults to the config file's directory, so a bare `pnpm dev:host` would resolve
  against `apps/e2e/package.json` and die with `ERR_PNPM_NO_SCRIPT`. Both entries name their
  package with `--filter`, and use `start` rather than `dev`: the host's `dev` is `tsx watch`,
  and a file watcher inside an e2e run is a source of spurious restarts.
- **`CWM_DATA_FILE` must be absolute.** The host resolves an override against *its own* cwd,
  which is `apps/prototype-host` — a relative path would quietly create a second data
  directory inside that package, which the slash-anchored `.gitignore` entry would not even
  hide.
- **`reuseExistingServer: false`** on both, so a port already in use throws instead of hanging.
  A developer with `pnpm dev` up gets a loud conflict; silently reusing a dev server would mean
  an e2e run that destroys the workspace they were using.
- **No workspace-package imports.** `@cwm/prototype-data` is source-only (`exports` points at
  `src/index.ts`) and Playwright does not transpile dependencies reached through
  `node_modules`, so the fixture token is inlined with a comment pointing at
  `agent-tokens.ts`, which says the string is meant to be pasted.
  `@modelcontextprotocol/client` is a published npm package and is declared normally.
- **The two readiness probes use different addresses, and that is not an oversight.** The host
  binds `127.0.0.1` only, so its probe must not depend on Node's `::1` fallback. `ng serve`
  does the opposite — it listens on `[::1]:4200` — so probing it at `127.0.0.1` times out after
  three minutes with no explanation. That one cost a full failed run to find. Each entry names
  the address its server actually binds; neither is a default anyone should tidy into matching
  the other.

**Determinism came from two places, both Slice 12's machinery.** Each spec calls
`POST /prototype/seed` and `POST /prototype/clock` itself, so a run depends on no leftover
state and passes twice in a row. The web spec pins the clock to **mid-day UTC** and hard-codes
a matching `YYYY-MM-DD` due date: the drawer writes `${date}T23:59:59.999Z` and
`DashboardService` compares UTC days, so a date derived from `new Date()` would put the task in
Overdue instead of Today on any machine west of UTC.

**The MCP spec waits for the event stream before firing.** `page.goto` resolving does not mean
the SSE handshake completed; without the wait the test is flaky rather than wrong. It asserts
the row appears with **no reload anywhere in the test**, which is the §62 claim, and that
Recent Activity names Claude, which is the §57 one.

**Current decision**

`pnpm e2e` from the repository root, with `pnpm dev` stopped. Two specs, one worker, chromium
only, the host against `.prototype/e2e-data.json`. Playwright's `test-results/` and
`playwright-report/` and that data file are all gitignored, and `git status` is clean after a
run — which is how we know they landed where the ignore entries expect.

**Confidence**

High. Both specs pass from a clean checkout and pass again immediately afterwards.

**Revisit when**

A third test is proposed. §69 says keep only a few and names exactly two, so a third needs an
argument, not just a gap. Also revisit if CI ever runs this, which needs the browser install
step to be part of the pipeline rather than a README line.
