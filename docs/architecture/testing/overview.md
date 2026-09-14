# Testing

How the prototype is verified (§69): fast offline unit and contract suites in every
package, component specs and Storybook in the web app, four acceptance scripts that run a
real host, a Playwright suite that starts both processes on its own data file, and the
lints that hold the architectural boundaries mechanically. `pnpm test` is offline and
browser-free by design; the browser-driven checks are separate commands, run
deliberately.

**Code:** `*.test.ts` in every package and the host; `*.spec.ts` and `*.stories.ts` in
`apps/web`; `apps/prototype-host/scripts/*.mjs`; `apps/e2e`; the lint scripts under
`scripts/`, `packages/domain/scripts/` and `apps/web/scripts/` ·
**Package:** `@cwm/e2e` for Playwright · **Depends on:** `vitest`, `@angular/build`'s
unit-test builder, `@playwright/test`, `@modelcontextprotocol/client`, `storybook`

## Responsibilities

- **Domain unit tests** (§69): every rule, over `InMemoryDataStore` and a frozen clock.
- **Contract tests** for schemas (accept/reject) and for every MCP tool (success under
  minimal grants, denial per grant, store assertion) with no socket.
- **Host tests**: routes, errors, auth, hub, SSE, MCP handler and stdio, all in-process.
- **Component tests** for stores and components with fake gateways; **Storybook** for
  the variant sets §4 names, with a theme toolbar.
- **Acceptance scripts** for four slices' *done when*, against a second host on a temp
  file.
- **End-to-end**: the web path, direct canvas editing and removal Undo, MCP, and the
  todos, archive and reflections journeys, each seeding the host itself.
- **Root tooling tests**: roadmap Outcome and built Compodoc anchor guards, using Node's built-in test runner.
- **Lints**: package imports, no direct `Date`, design tokens, and the documentation
  structure.

## Not responsible for

- Design evaluation: passing tests are not evidence that a design feels right; §77's
  step — load a seed, use the feature, write the friction down — is a separate
  obligation recorded in `.prototype/notes.json`.
- Exhaustive coverage of the disposable parts (§71).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
