# Why the prototype is shaped this way

## The problem it solves

The product idea — a work manager where agents are users — has too many open questions to
specify from a desk (§2, §83): what a project is, whether nesting helps, which section
types deserve to exist, which MCP tools agents actually reach for. Guessing and building
the MVP would bake the guesses in. The prototype exists to answer those questions by being
used, and to be cheap enough to change when an answer is "no" (§1, §77).

## Forces

- **Behaviour must be real** or the answers are worthless: real state transitions, real
  permission checks, real agents over a real protocol (§3.1, §48).
- **Infrastructure must be fake** or the cost of changing an idea explodes: no database
  to migrate, no auth to configure, no cloud to deploy (§3.2, §14, §80).
- **Some of it must survive into the MVP** — the contracts, the domain rules, the
  gateway shapes, the tool semantics (§70) — while the rest is expected to be replaced
  (§71). The two halves must not be entangled.
- **One process cannot host both a browser and an MCP server**, and the MCP SDK needs a
  Node runtime (§6). So there are two processes even though there is no backend.

## The shape, and the alternatives rejected

**Two apps over shared packages.** `apps/web` (Angular) and `apps/prototype-host` (Node)
share `packages/contracts`, and the host composes `domain`, `repositories`, `mcp-tools`
and `prototype-data`. Rejected: an in-browser-only prototype with mocked services — it
cannot expose MCP, and §48 says MCP is an experiment, not an integration chore. Rejected:
a Supabase-backed prototype — every data-shape change would become a migration (§14).

**One boundary, enforced mechanically (§8).** Components inject gateway interfaces;
domain services take repository interfaces and a `Clock`; MCP tools take domain services.
The alternative — "be careful" — is what §12's lints and the import checker exist to
replace; see [testing](testing/why.md). The cost is a handful of adapter files that a
production build swaps (`app.config.ts` names every concrete adapter, and nothing else
does).

**One JSON document, persisted at operation boundaries (§14, §15).** Rejected: SQLite —
a schema to migrate for no gain; the whole workspace fits in memory and a temp-and-rename
write is atomic. The cost is that two processes cannot share the file safely, which is why
[live updates are HTTP-only](../decisions/2026-08-live-updates-are-http-only.md) and
stdio MCP owns a separate store.

**Two terminals, not one command.** `pnpm dev` used to start both processes under
`concurrently`; it hung the host silently. It now prints the two commands and exits
([decision](../decisions/2026-08-web-and-host-start-separately.md)).

**Disposable on purpose (§71).** The host's HTTP layer, the JSON repositories, prototype
auth, fake tokens, the mock AI, the event stream, the dev panel and the seed loader are
deliberately under-engineered. Adding abstraction to them is the wrong direction.

## Consequences

- Changing a data shape is: edit a Zod schema, fix the type errors, reseed. When a real
  file is worth keeping, a bounded converter is written once (`pnpm prototype:upgrade`).
- Every mutation, from the UI, from an agent or from the dev panel, goes through the same
  domain service — so one activity record, one permission check, one live frame.
- The MVP migration (§72–74) is a set of adapter swaps: identity provider, gateway,
  repositories. Nothing in `packages/domain` or `packages/contracts` changes.
- Two processes must be started, and the browser must be told where the host is
  (`PROTOTYPE_API_BASE_URL`); [CORS on the host](../decisions/2026-08-host-cors-over-dev-proxy.md)
  is what makes that work.

## Decisions that shape this system

- [The web app and the host start separately](../decisions/2026-08-web-and-host-start-separately.md)
- [The host's port variable is `CWM_HOST_PORT`, not `PORT`](../decisions/2026-08-host-port-is-not-the-generic-port.md)
- [The initial bundle budget is set deliberately at 850 kB](../decisions/2026-08-initial-bundle-budget.md)
- [A root project is a workspace with pages; a subproject is a unit of work](../decisions/2026-09-project-workspaces-and-subproject-work-units.md) —
  the one user-requested direction, and the model every layer now implements

Each subsystem's `why.md` lists the decisions that shape it; the
[decision index](../decisions/README.md) lists them all.

## Spec sections

§1–§3 purpose and philosophy · §5–§8 runtime architecture and the core boundary ·
§64 repository structure · §70–§74 what survives into the MVP and how · §75–§80 workflow,
reset, design loop, decision log, notes, non-goals · §81–§83 milestones and the questions
to answer.
