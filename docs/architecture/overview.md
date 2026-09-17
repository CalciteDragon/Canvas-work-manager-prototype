# Canvas Work Manager — Prototype

A design-first prototype of a project and task manager whose distinguishing feature is
that AI agents are first-class users, through a real MCP server (§1, §48). It is built as
**real product behaviour over fake infrastructure** (§3): every rule about projects, tasks,
sections, pages and permissions is real and tested; storage is one JSON file, auth is a
header, and AI is a deterministic mock.

**Code:** the pnpm workspace at the repository root — `apps/*` and `packages/*` ·
**Spec:** *Canvas Work Manager — Prototype Product, Design & Development Specification.md*,
cited as §N · **Entry point for agents:** [`AGENTS.md`](../../AGENTS.md)

## Responsibilities

- Answer §2's questions about what the product should be, cheaply enough to throw away bad
  answers (§77). The output is the [decision log](../decisions/README.md), not the code.
- Keep the one boundary that makes the code reusable for the MVP (§8, §70): UI depends on
  gateway interfaces; domain depends on repository interfaces and a clock; MCP tools call
  domain services; contracts are defined once.
- Let a real MCP client and a person work on the same workspace and see each other's
  changes without a refresh (§48, §62).

## Not responsible for

- Anything in §80's *never build* list: production databases, auth, cloud, billing,
  queues, analytics. If one seems necessary, that is a decision entry to write, not a task.

## Subsystems

Level 1 is one folder per workspace package or app, plus the cross-cutting verification
system. Dependencies flow downward on this list; the [what](what.md) page draws them.

- [contracts](contracts/overview.md) — `@cwm/contracts`: every entity, input and the
  `data.json` document as Zod schemas, defined once.
- [domain](domain/overview.md) — `@cwm/domain`: the product rules as services over
  repository interfaces and a `Clock`.
- [repositories](repositories/overview.md) — `@cwm/repositories`: repository interfaces,
  the unit of work, and the JSON document store that implements them.
- [mcp-tools](mcp-tools/overview.md) — `@cwm/mcp-tools`: the transport-free registry of
  thirty-seven tool definitions over the domain services.
- [prototype-data](prototype-data/overview.md) — `@cwm/prototype-data`: seeds, personas,
  agent tokens, the seed CLI and the explicit schema converters.
- [prototype-host](prototype-host/overview.md) — `apps/prototype-host`: the Node process
  on `:4310` that serves the fake API, the MCP endpoint, the event stream and the rig
  controls over one data file.
- [web](web/overview.md) — `apps/web`: the Angular 22 application on `:4200`.
- [testing](testing/overview.md) — how every layer is verified: unit, component,
  contract, acceptance scripts, Storybook and Playwright, plus the lints that hold the
  boundaries.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
- [The roadmap](../roadmap/README.md) — goals, progress, active and completed slices
- [The documentation protocol](../documentation-protocol.md) — how this tree is maintained
