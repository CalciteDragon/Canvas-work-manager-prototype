# Why testing is shaped this way

## The problem it solves

A prototype optimised for changing ideas (§84) throws code away often, so its tests must
protect *intentional* behaviour and nothing else (§77): when intent changes, the test,
the implementation and the doc change together. At the same time the architectural
boundaries are the entire point (§8, §12, §70) and cannot be left to good intentions.
§69 names the layers; this system is their shape.

## Forces

- **`pnpm test` must stay fast, offline and browser-free**, or it stops being run.
- **Tool semantics must be testable without a server** (§60).
- **Boundaries drift silently**; a lint that only catches the cases someone thought of
  is worse than none, because it reassures.
- **Two processes and a data file** make an e2e suite easy to point at the developer's
  own workspace by accident.
- **Reviews find what suites cannot.** Every slice's record lists defects the browser
  pass or a diff review found that a green suite had missed.

## The shape, and the alternatives rejected

**Isolated stores below the browser.** Domain, tool, and most host tests build services
over `InMemoryDataStore` seeded from the builders. Persistence and stdio tests use
temporary files; no test uses the developer's `.prototype/data.json`. Rejected: a shared
test database — each test can own its document cheaply.

**Contract tests iterate the registry.** `contract.test.ts` fails on any tool without a
case, and success is asserted under *exactly* the declared grants — the one design that
proves a grant sufficient. Rejected: testing tools through an SDK handler in the registry
package ([decision](../../decisions/2026-08-tool-registry-is-transport-free.md)).

**Allowlist import lint with an AST walker**, not a regex denylist. The first version
banned `fs` and let `fs/promises` through; the rewrite reports relative paths that
escape the package and computed dynamic imports, and `import-lint.test.ts` proves it
catches its three known bypasses.

**The token lint has a self-test.** `expect-failure.mjs` pins `file:line rule` for every
fixture, so the *controls* — a `1px` hairline, `100vh`, a `1fr` track, "Silver" in body
copy — stay clean; each was a false positive once.

**Acceptance scripts are plain Node against a second host.** They copy a committed seed
rather than importing TypeScript, set `CWM_DATA_FILE` and `CWM_HOST_PORT`, and can run
beside a live session. Each stands where the slice's *done when* stands: the Slice 16
script insists the frame arrives within a second *and* that the write is already
readable.
Slice 31 extends those transport checks with repeat-removal receipt recovery over HTTP
and MCP; its separate Playwright journey verifies the visible Undo action against persisted
deletion, recreation, Archive projection and reload.

**The e2e suite owns its servers and its data file.** Playwright's `webServer` takes an
array — the deciding reason over Cypress — and each entry names the address its server
actually binds (`127.0.0.1` for the host, `[::1]` for `ng serve`), refuses to reuse a
running server, and runs the host on `.prototype/e2e-data.json`
([decision](../../decisions/2026-08-e2e-owns-its-servers-and-its-data.md)). Rejected:
reusing the developer's dev servers — it would destroy the workspace being demoed.

**Storybook on the preview Vite framework**, because the app is zoneless and builds on
`@angular/build`; the stable webpack framework would install a second, contradictory
build system ([decision](../../decisions/2026-08-storybook-runs-on-the-vite-framework.md)).
`@storybook/addon-vitest` is out of scope — it would pin vitest away from v4.

**Reviews are part of the method, not the suite.** AGENTS.md's step 4 reviews the diff for
correctness, spec conformance, boundaries, acceptance and living documentation, then the
feature is used in the real app. The records show why: a project with nothing done
rendered "Not available" instead of "0%", overdue rows printed the time, a checkbox stayed
visually moved after a refused toggle — none of it visible to a unit test.

## Consequences

- The default suite runs offline and without a browser. Host transport tests open
  isolated localhost ports, and persistence tests own temporary files.
- Every boundary in AGENTS.md has a mechanical check except "components inject
  interfaces", which a reviewer's pass covers.
- `pnpm e2e` requires the dev servers to be stopped and Chromium to be installed once.
- The documentation tree has the same status as a test: `pnpm lint` fails on a broken
  structure ([protocol](../../documentation-protocol.md)).

## Decisions that shape this system

- [The end-to-end suite starts its own servers and writes its own data file](../../decisions/2026-08-e2e-owns-its-servers-and-its-data.md)
- [Storybook runs on the Vite framework, not the webpack one](../../decisions/2026-08-storybook-runs-on-the-vite-framework.md)
- [What the tool registry knows about MCP](../../decisions/2026-08-tool-registry-is-transport-free.md)
- [§4's *Agent Modified* task row has no data behind it](../../decisions/2026-08-agent-modified-has-no-data-behind-it.md) — why the story set has six variants

## Spec sections

§60 MCP tests without a server · §69 testing strategy · §77 design-first loop · §12 and
§21 (the lints' rules) · §75 workflow.
