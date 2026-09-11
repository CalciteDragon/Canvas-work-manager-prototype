<!-- completed-record id="1" closed="2026-08-26" summary="pnpm workspace, the Angular 22 shell and the host with one health route; packages consumed as source" -->
# Slice 1 — Empty monorepo that starts

> **Completed record — frozen at closeout.** Status **done**, closed **2026-08-26**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.

## Outcome

**Status:** done — plan: [01-empty-monorepo.md](01-empty-monorepo.md)
Diverged from the plan in three places: the host is never compiled (`build` is a
type-check — packages are consumed as source, so an `outDir` cannot work), Angular 22
already defaults to a headless vitest test runner so no builder swap was needed, and
Node had to be upgraded to 24.19.0 because Angular 22's CLI refuses 24.13.
Acceptance 5 (one Ctrl+C stops both) is the one check not machine-verified — it needs
a real keypress in a real terminal.

## Slice definition

**Goal:** `pnpm install && pnpm dev` starts two processes and prints two URLs.

**Spec:** §5, §64, §75

**Build**

- `pnpm` workspace at the repo root (`pnpm-workspace.yaml`, root `package.json`).
- Directory skeleton exactly as §64:
  ```
  apps/web/
  apps/prototype-host/
  packages/contracts/
  packages/domain/
  packages/repositories/
  packages/mcp-tools/
  packages/prototype-data/
  prototype/seeds/
  docs/decisions/
  .prototype/
  ```
- `apps/web`: Angular 22 app, standalone components, SCSS, no default sample content.
  Strip the generated boilerplate down to an empty shell page.
- `apps/prototype-host`: a TypeScript Node HTTP server on `:4310` with one route,
  `GET /prototype/health`, returning `{ ok: true }`.
- Root scripts: `dev` (both, concurrently), `build`, `test`, `lint`.
- TypeScript project references or path aliases so `apps/*` can import `packages/*`
  without a publish step.
- `.gitignore` covering `node_modules`, `dist`, `.angular`, and `.prototype/data.json`
  (the *seeds* are committed; the live working file is not).
- `git init`, first commit.

**Done when**

- `pnpm dev` starts Angular on `:4200` and the host on `:4310`.
- `curl localhost:4310/prototype/health` returns `{"ok":true}`.
- Both processes stop cleanly with one Ctrl+C.

**Do not** add a database, auth, MCP, or any UI beyond a blank page.

---

## Implementation plan — Slice 1 — Empty monorepo that starts

**Status:** done

### Goal

`pnpm install && pnpm dev` starts the Angular app on `:4200` and the prototype host on
`:4310`, with the full §64 directory skeleton in place and nothing else.

### Spec sections

§5 (runtime architecture: two processes, one command), §64 (repository structure),
§71 (the host is disposable), §75 (development workflow / root scripts).

### Acceptance check

Executable, in order. Each names the command that decides it.

1. `pnpm install` exits 0 **and** Angular's `esbuild` postinstall actually ran —
   `pnpm why esbuild` resolves and `pnpm --filter web build` does not fail on a missing
   binary. (pnpm 10+ blocks dependency build scripts by default; see the workspace
   `allowBuilds` allowlist.)
2. `pnpm dev` output contains, on `concurrently`-prefixed lines,
   `[web] ... http://localhost:4200` and
   `[host] prototype-host listening on http://127.0.0.1:4310`.
3. `curl -s -i localhost:4310/prototype/health` → HTTP 200,
   `content-type: application/json`, body exactly `{"ok":true}`.
4. `curl -s -o /dev/null -w "%{http_code}" localhost:4310/nope` → `404`, and
   `curl -X POST localhost:4310/prototype/health` → `404` (method is part of the match).
5. One Ctrl+C in the `pnpm dev` terminal stops both processes: afterwards
   `netstat -ano | findstr ":4200 :4310"` prints nothing.
6. `pnpm build` (= `pnpm -r --if-present build`) exits 0, producing `apps/web/dist`.
   The host does **not** emit: its `build` is a type-check. The five `packages/*` are
   consumed as TypeScript source and have no build step at all (open question 2, and
   round-2 finding D — a host `outDir` cannot compile source that lives outside its
   `rootDir`).
7. `pnpm test` exits 0 and runs all the test files named in the test plan (host
   router, host start/stop/EADDRINUSE, web shell).
8. `pnpm lint` exits 0. In this slice `lint` means type-checking, not ESLint — no slice
   has asked for a linter. The invocation is per-workspace, not uniform: `tsc --noEmit`
   for the host and the packages, and
   `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json` for
   `apps/web`, whose root `tsconfig.json` is solution-style and has no inputs of its own.
9. `apps/prototype-host` and `apps/web` both import `@cwm/contracts` and resolve it at
   **runtime** as well as in the type-checker. Covered by tests under vitest (host) and
   the Angular builder (web — `App` imports it statically, so the shell test cannot
   render if resolution breaks); verified against `ng serve` as well as `ng build`,
   because Vite's dependency optimizer and esbuild resolve a symlinked source-entry
   package differently. **tsx** — the resolver that actually runs `dev` and `start` —
   has no test, because no shipped host code imports contracts yet; it is checked by
   hand with `pnpm exec tsx -e "import('@cwm/contracts')"` and becomes test-covered in
   Slice 5, when the host's API routes validate against real contract schemas.
10. The repository is a git repo with one commit, and `git status --porcelain` is empty
    after a `pnpm dev` run (`.prototype/data.json`, `dist`, `.angular`, `node_modules`
    are ignored; `prototype/seeds/` is not).

### File-level change list

Root

- `pnpm-workspace.yaml` — workspace globs `apps/*`, `packages/*`, plus an
  `allowBuilds` allowlist (`esbuild`, and whatever else Angular's install
  needs). pnpm 10+ refuses to run dependency postinstall scripts without it, which makes
  `pnpm install` exit 0 and `ng build` fail later on a missing binary.
- `package.json` — private root; `packageManager: pnpm@11.24.0`; scripts `dev`,
  `dev:web`, `dev:host`, `build`, `test`, `lint`; devDeps `concurrently`, `typescript`.
  `dev` = `concurrently --kill-others --names web,host ...` so one Ctrl+C ends both.
- `tsconfig.base.json` — shared compiler options + path aliases `@cwm/<pkg>` →
  `packages/<pkg>/src/index.ts` (source, not `dist`).
- `.gitignore` — `node_modules`, `dist`, `.angular`, `.prototype/data.json`, editor/OS
  noise. `prototype/seeds/` stays committed.
- `README.md` — how to start, what the two processes are, pointer to `AGENTS.md`.
  Not required by the slice; kept short because the next session cold-starts here.

`apps/web` — Angular 22, standalone, SCSS, CLI-generated then stripped:

- `angular.json`, `package.json` (declares `"@cwm/contracts": "workspace:*"`; `lint` is
  `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json`),
  `tsconfig*.json` extending `tsconfig.base.json`.
- `src/app/app.ts` / `.html` / `.scss` — empty shell page: the app name and nothing
  else. All CLI sample markup deleted. Imports `@cwm/contracts` so acceptance 9 covers
  the Angular resolver.
- `src/styles.scss` — empty. Design tokens are Slice 6 (§21); no literal colors here.
- Test runner: the CLI's Angular 22 default, provided it runs headless with no browser
  download. If it is Karma/Chrome, switch to the vitest `@angular/build:unit-test`
  builder so `pnpm test` is hermetic.

`apps/prototype-host` — Node/TypeScript, laid out **exactly as §64**: the layer
directories are siblings of `main.ts`, not nested under `src/`.

- `package.json` — `dev` (`tsx watch main.ts`), `start` (`tsx main.ts`), `build` and
  `lint` (both `tsc --noEmit`), `test` (vitest); declares
  `"@cwm/contracts": "workspace:*"`.
- `tsconfig.json` — extends the base; **no `outDir`, no `rootDir`**. The host is never
  emitted: `dev` and `start` both run it through `tsx`, so a compile step would exist
  only to be thrown away — and it could not succeed anyway while `packages/*` are
  consumed as source outside the host's directory (round-2 finding D).
- `main.ts` — exports `start(port)` → `Promise<Server>` that **rejects** on
  `EADDRINUSE` rather than exiting, and `stop(server)` → `Promise<void>` that calls
  `server.close()` + `server.closeAllConnections()` so a socket that is mid-request
  cannot hold shutdown open. Binds **127.0.0.1** (localhost only). A bootstrap guard
  (`process.argv[1]` is this file) starts port 4310, logs the URL, registers `stop` on
  SIGINT/SIGTERM behind a re-entrancy guard and a 2s give-up timer, and exits non-zero
  with a clear message if `start` rejects. The split exists so the tests can drive the
  server without the module binding 4310 or calling `process.exit` inside the vitest
  worker.
- `router.ts` — a method+path table. `GET /prototype/health` → `{ ok: true }`;
  everything else, including a known path with the wrong method → 404 JSON.
  Deliberately disposable (§71): no framework, no layering.
- `api/`, `mcp/`, `auth/`, `persistence/` — empty directories with `.gitkeep`, matching
  §64, filled by Slices 3, 5, 13, 15.

`packages/*` — five placeholder packages (`contracts`, `domain`, `repositories`,
`mcp-tools`, `prototype-data`), each with `package.json` (name `@cwm/<pkg>`, an
`exports` map — `{".": {"types": "./src/index.ts", "default": "./src/index.ts"}}` —
rather than legacy `main`/`types`, because Vite's dependency optimizer handles a
symlinked source-entry package more reliably that way; `lint` script only),
`tsconfig.json`, and `src/index.ts` exporting one named placeholder so alias
resolution is exercised.
Cross-package `dependencies` are declared only where a package actually imports
another — which, this slice, is nowhere.

Other §64 directories

- `prototype/seeds/.gitkeep`, `docs/decisions/.gitkeep`, `.prototype/.gitkeep`.

Git

- `git init`, `.gitignore` in place first, then one commit containing the whole slice.

Living docs updated in this same change

- `development.md` — Slice 1 marked `done`.
- This plan, with its Revisions section filled in.

### Test plan

No domain behavior exists yet, so these are the smallest tests that would actually
catch a broken skeleton. Written before the implementation.

1. `apps/prototype-host/router.test.ts`
   - `GET /prototype/health` → 200, `application/json`, `{ ok: true }`.
     *The acceptance check's central claim, without opening a socket.*
   - Unknown path → 404 with a JSON body. *No unhandled-route crash.*
   - `POST /prototype/health` → **404**. *The table matches on method, not path alone.*
2. `apps/prototype-host/main.test.ts` — drives the exported `start` / `stop`, never the
   bootstrap path.
   - `start(0)` on an ephemeral port, fetch `/prototype/health` over real HTTP, assert
     the body, `stop`. *Proves the wiring, not just the handler.*
   - Asserts the bound address is `127.0.0.1`. *Proves localhost-only binding.*
   - `start` twice on the same port; the second call **rejects** with `EADDRINUSE`
     rather than hanging or exiting the process. *The most common real failure of "one
     command, two processes".*
   - With a raw socket held **mid-request** (headers written, no terminating blank
     line), `stop()` resolves and the port is free afterwards. *This is the shutdown
     check.* The socket must be mid-request, not merely keep-alive: since Node 19,
     `server.close()` closes idle sockets by itself, so a keep-alive test would pass
     with `closeAllConnections()` deleted. Verified by mutation — removing that line
     makes this test time out. It deliberately does **not** go through SIGTERM: this
     machine is win32, where `child.kill('SIGTERM')` is `TerminateProcess` and never
     runs the handler, so a signal-based test would pass whether or not shutdown works.
     Signal delivery is covered only by acceptance 5, run by hand.
   - Imports `@cwm/contracts` and asserts the placeholder — acceptance 9, host side.
3. `apps/web` — the CLI's `app.spec.ts`, trimmed to "the shell renders". No separate
   contracts-resolution test: `App` imports `@cwm/contracts` statically, so this test
   cannot render if resolution breaks.

`pnpm dev` itself (acceptance 2 and 5) is run by hand and reported; a test that spawns
the full dev orchestration would be slower and less reliable than looking at it once.

### Boundaries touched

- **Contracts defined once (§11):** the five placeholder packages establish the single
  home for each layer. Nothing is typed twice; the placeholders carry no real shapes.
- **Domain depends on repository interfaces + `Clock` only (§12):** *not* structurally
  enforced this slice. A shared `tsconfig.base.json` makes every `@cwm/*` alias
  resolvable from every package, so the rule holds by convention plus per-package
  `dependencies` (declared only where a real import exists). Structural enforcement —
  a lint boundary rule, or per-package alias sets — belongs with Slice 4's lint work
  and Slice 5's first real domain code. Recorded so it is not silently forgotten.
- **Components depend on gateway interfaces (§8):** untouched; `apps/web` makes no HTTP
  call yet.
- **No `new Date()` in domain (§45):** the lint rule lands in Slice 4; `packages/domain`
  is empty until Slice 5.
- **No literal colors/spacing (§21):** `styles.scss` ships empty rather than with CLI
  defaults, so no literal values enter ahead of the token system.

### Explicit non-goals

From the slice's *Do not*: no database, no auth, no MCP, no UI beyond a blank page.

Additionally deferred by decision:

- Zod schemas and real contract types → Slice 2.
- `.prototype/data.json`, seeds, `prototype:reset` / `prototype:seed` → Slices 3–4.
- Design tokens, theming, app shell, real routes → Slice 6.
- Storybook and e2e (Playwright) → Slice 17.
- ESLint / `angular-eslint` — no slice asks for a linter; `lint` is a type-check until
  Slice 4 needs the banned-pattern rules.
- CI configuration — not requested by any slice.
- Any HTTP framework in the host — `node:http` is enough and the host is disposable (§71).

### Open questions

1. **Angular test runner — resolved, no work needed.** Angular 22's `ng new` already
   defaults to the `@angular/build:unit-test` builder running vitest on jsdom. No
   Karma, no browser download, no builder swap. `pnpm --filter web test` is hermetic
   as generated.
2. **Path aliases vs project references.** The slice allows either. *Decision:* path
   aliases to `src/index.ts`, plus `workspace:*` dependencies so pnpm's `node_modules`
   resolves the same specifiers at runtime. Project references would force a build step
   between packages, costing time-to-change-an-idea (§84) for no prototype benefit.
   Revisit if builds become slow.
3. **`packageManager` pin.** pnpm 11.24.0 is what is installed here; pin that rather
   than a version nobody has run.
4. **Node version — resolved, with a machine change.** Angular 22's CLI requires Node
   `^22.22.3 || ^24.15.0 || >=26`. The machine had 24.13.1 and the CLI hard-refuses.
   Options were: upgrade Node, install a portable Node in the repo, drop to Angular 21,
   or stop before `apps/web`. **The user chose to upgrade**, so Node was moved to
   24.19.0 via `winget upgrade OpenJS.NodeJS.LTS`. Record the floor in the root
   `package.json` `engines` field so the next machine fails fast instead of confusingly.

### Revisions

Round 1 review (subagent, against the plan + §5/§64/§65/§71/§75 + AGENTS.md §1).
Substantive findings, all accepted except where noted:

- **`git init` + first commit was missing** from the file list, which also made the
  "`git status` clean" acceptance item unrunnable. Added.
- **Workspace dependencies were never declared.** tsconfig path aliases satisfy only the
  type-checker; under pnpm's isolated `node_modules`, tsx/vitest/the Angular builder
  resolve `@cwm/contracts` through `node_modules`. Both apps now declare
  `"@cwm/contracts": "workspace:*"`, and acceptance 9 was rewritten to require runtime
  resolution proven in each app's own resolver.
- **Host layout contradicted §64.** The plan had `src/main.ts` while leaving `api/`,
  `mcp/`, `auth/`, `persistence/` at the package root. Settled on §64 as written: layer
  directories are siblings of `main.ts`, `rootDir` is the package root.
- **`pnpm lint` had no linter behind it** and `pnpm build` claimed to build packages the
  alias-to-source decision says are never built. Both acceptance items rewritten to
  state what actually runs; ESLint added to the non-goals with a reason.
- **Missing failure-path tests:** EADDRINUSE, SIGTERM shutdown with a live keep-alive
  socket, and the localhost-only bind address are now asserted rather than claimed.
- **Router method test accepted "404 or 405"** — a test asserting two contracts pins
  neither. Fixed to 404.
- **Acceptance criteria were claims, not checks** ("no resolution errors", "prints both
  URLs", "neither port still listens"). Each now names its command and expected output.
- *Not accepted:* the reviewer wanted `app.routes.ts` deleted as Slice 6 scope. It is
  CLI-generated boilerplate with an empty route array; deleting it means also unwiring
  `provideRouter` in `app.config.ts` and re-adding both in Slice 6. Kept as generated,
  with no routes authored.
- *Not accepted:* the reviewer flagged `README.md` as unasked. Kept, but the original
  justification here was a misquote: AGENTS.md §5 says the next agent begins with *only*
  `AGENTS.md`, so a README is explicitly **not** what a cold start reads first. The real
  reason to keep it is narrower — a human opening the repo in an editor looks for one,
  and it costs three lines pointing at `AGENTS.md`.

Round 2 review (same subagent, against the revised plan). It confirmed the round-1
resolutions and both rejections, and found four things that would have changed the code:

- **The host could not have been built at all as specified.** `rootDir: "."` +
  `outDir: "dist"` cannot emit while `main.ts` imports `@cwm/contracts`, which resolves
  to TypeScript source outside that `rootDir` (TS6059). Round 1 fixed the *wording* of
  the build/alias contradiction and left the incompatible pair. Resolved by removing
  emit from the host entirely: `dev` and `start` run through `tsx`, `build` is a
  type-check, and nothing in Slice 1 needs compiled host output. This also dissolves the
  related problem of `*.test.ts` landing in `dist`.
- **`main.ts` had to split.** As written — one module that binds 4310 on import and
  `process.exit`s on `EADDRINUSE` — its own tests were impossible: importing it would
  bind the real port, and the EADDRINUSE test would kill the vitest worker. Now
  `start`/`stop` are exported and a `process.argv[1]` bootstrap guard does the
  port/log/signal/exit work.
- **The SIGTERM test would have passed for the wrong reason.** This machine is win32,
  where `child.kill('SIGTERM')` is `TerminateProcess` and the handler never runs — so
  the assertion held whether or not shutdown worked. That is exactly the hole round 1's
  finding was meant to close, reintroduced in a shape that looked tested. Replaced with
  a direct `stop()` test that holds a real keep-alive socket open; signal delivery is
  now honestly listed as hand-verified only (acceptance 5).
- **pnpm 10+ blocks dependency build scripts by default**, so `pnpm install` would exit
  0 and Angular would then fail on a missing `esbuild` binary. Added an
  `allowBuilds` allowlist to `pnpm-workspace.yaml` and folded the check into
  acceptance 1.

Smaller, also accepted: `apps/web`'s root `tsconfig.json` is solution-style with no
inputs, so a bare `tsc --noEmit` there fails with TS18003 — the web `lint` script
type-checks `tsconfig.app.json` and `tsconfig.spec.json` explicitly. Packages now
publish an `exports` map instead of `main`/`types` pointing at `.ts`, and acceptance 9's
web half is verified against `ng serve` as well as `ng build`, because Vite's dependency
optimizer and esbuild resolve a symlinked source-entry package differently. Acceptance 2
now quotes the `concurrently`-prefixed output rather than bare URLs that never appear.

No findings remain open.

Round 3 review (subagent, against the implementation rather than the plan; it re-ran
the acceptance check itself). It confirmed 1–4 and 6–10 pass, found no boundary
violation and no leaked non-goal, and raised four things worth fixing:

- **The shutdown test was vacuous — the same defect round 2 had just closed.** Since
  Node 19, `server.close()` already closes *idle* connections, and the test's
  keep-alive socket was idle by the time `stop()` ran. The reviewer demonstrated it
  passing in 1ms with `closeAllConnections()` deleted. Replaced with a raw socket held
  mid-request, and confirmed by mutation: without `closeAllConnections()` the test now
  times out. The comment on `stop()` was rewritten too — it described behavior Node
  provides for free.
- **`@cwm/contracts` was not proven in the resolver that actually runs the host.** No
  shipped host code imports it; only the test does, under vitest, not tsx. Rather than
  invent an import to satisfy a test, acceptance 9 now says exactly what is covered by
  tests and what was checked by hand, and names Slice 5 as where tsx coverage arrives
  for real. The redundant web-side test was deleted: `App` imports the package
  statically, so the shell test already fails if resolution breaks.
- **The signal handler could exit 1 on a second Ctrl+C.** `void stop(server).then(...)`
  had no `catch`, and a second signal closes an already-closing server, which rejects
  with `ERR_SERVER_NOT_RUNNING` → unhandled rejection → exit 1, never reaching
  `process.exit(0)`. Added a re-entrancy guard, a `catch`, and a 2s give-up timer so a
  stuck close cannot hold the terminal — this sits directly on the acceptance-5 path.
- **The server had no `error` listener after a successful listen**, making any later
  error an uncaught exception. The listener now stays for the server's life and
  branches on whether startup already succeeded.

Also corrected: the plan said `onlyBuiltDependencies`, but pnpm 11's key is
`allowBuilds` — acceptance 1 pointed at a key that does not appear in the file. The
reviewer declined to recommend a try/catch around `handleRequest`'s `URL` parse
(theoretical, and §71 says do not over-engineer the host); agreed, left alone.
`pnpm-workspace.yaml` also carries a `minimumReleaseAgeExclude` block that pnpm wrote
itself during install — not authored here.
