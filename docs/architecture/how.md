# How the prototype works

## Runtime flow

1. `pnpm dev:host` runs `apps/prototype-host/main.ts` under `tsx watch`. It resolves the
   port from `CWM_HOST_PORT`, loads `.prototype/data.json` through `loadPersistence`
   (seeds a missing file; fails on an invalid or wrong-version file), builds one `SimulatedClock` and one
   `SwitchableAIProvider`, wires the domain services with `createApi`, builds the tool
   registry with `createToolRegistry`, and starts one HTTP server on `127.0.0.1:4310`
   with three route families: `/api/*` (§61), `/prototype/*` (§46, §62) and `/mcp` (§50).
2. `pnpm dev:web` runs `ng serve` on `:4200`. `app.config.ts` is the only file that names
   a concrete adapter: it provides `PrototypeWorkManagerGateway`, `PrototypeIdentityProvider`,
   `PrototypeLiveUpdates` and `PrototypeHttpControl` behind their injection tokens.
3. On load the browser asks `GET /api/me` for the persona, opens
   `GET /prototype/events?user=<personaId>`, and renders `/app`. Every read and write goes
   through the gateway to `/api/*`; every committed mutation on the host publishes one
   Server-Sent Event, and the affected stores re-read.
4. An MCP client posts to `/mcp` with a bearer token. The authenticator resolves it to an
   agent connection and an `ActorContext`; the tool calls the same domain service the UI
   calls; the same event reaches the open browser.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `start` / `stop` | functions | Start and stop the host server on `127.0.0.1` | [API](../api/miscellaneous/functions.html#start) |
| `configuredPort` | function | `CWM_HOST_PORT`, never `PORT`; throws on an unusable value | [API](../api/miscellaneous/variables.html#configuredPort) |
| `loadPersistence` | function | Load and validate the data file; `CWM_DATA_FILE` overrides | [API](../api/miscellaneous/variables.html#loadPersistence) |
| `createApi` | function | Wire every domain service and the authenticator over a `Persistence` | [API](../api/miscellaneous/variables.html#createApi) |
| `createToolRegistry` | function | The §54 tool set over those services | [API](../api/miscellaneous/variables.html#createToolRegistry) |
| `PrototypeRuntime` | class | The instances the dev panel may change without a restart | [API](../api/classes/PrototypeRuntime.html) |
| `SimulatedClock` | class | Real time shifted by an offset; §45's one clock | [API](../api/classes/SimulatedClock.html) |
| `appConfig` | const | The Angular composition root — the only place adapters are named | [API](../api/miscellaneous/variables.html#appConfig) |
| `routes` | const | §68's route map | [API](../api/miscellaneous/variables.html#routes) |

## Dependencies

The whole system depends on Node `^22.22.3 || ^24.15.0 || >=26` and pnpm 11
(`package.json` → `engines`, `packageManager`). Between the parts, edges point downward
only — see the package graph in [what](what.md) and each subsystem's `how.md`:

- [contracts](contracts/how.md) ← everything
- [repositories](repositories/how.md) ← domain (interfaces), prototype-data, host
- [domain](domain/how.md) ← mcp-tools, host
- [mcp-tools](mcp-tools/how.md) ← host
- [prototype-data](prototype-data/how.md) ← host, tests
- [prototype-host](prototype-host/how.md) ← web (over HTTP only), e2e
- [web](web/how.md) ← e2e

## Invariants and lints

| Rule | Enforced by |
|---|---|
| Domain imports only `@cwm/contracts` and repository *interfaces* | `scripts/check-package-imports.mjs` in `packages/domain`'s `lint`, plus `import-lint.test.ts` |
| MCP tools import only contracts, domain and zod | The same script with `--allow` in `packages/mcp-tools`'s `lint` |
| No `new Date()` in domain code (§45) | `packages/domain/scripts/check-no-direct-date.mjs` and `time-lint.test.ts` |
| No literal colours, spacing or radii in component styles (§21) | `apps/web/scripts/check-design-tokens.mjs`, self-tested by `expect-failure.mjs` |
| Contracts are defined once (§11) | Every package imports `@cwm/contracts`; there is no second schema anywhere |
| Every tool has a contract test | `packages/mcp-tools/src/contract.test.ts` iterates the registry and fails on a missing case |
| Documentation structure | `scripts/check-docs.mjs` — see the [protocol](../documentation-protocol.md) |

## Commands

```bash
pnpm install                 # once; see README for the frozen-lockfile repair if tools are missing
pnpm dev:web                 # Angular on http://localhost:4200
pnpm dev:host                # host on http://127.0.0.1:4310
pnpm prototype:seed <name>   # rewrite .prototype/data.json from a seed (empty, personal-workspace, busy-week, nested-projects, overdue-chaos, agent-heavy)
pnpm prototype:reset         # personal-workspace
pnpm prototype:upgrade <f>   # v2 → v3 converter for an old data file
pnpm mcp:stdio               # the same registry over stdio (CWM_MCP_TOKEN)
pnpm test                    # every workspace's vitest suites — offline, no browser
pnpm lint                    # type-checks, the boundary lints, the token lint, and docs:check
pnpm build                   # ng build; type-check everything else
pnpm e2e                     # Playwright, with its own servers — stop dev:web and dev:host first
pnpm storybook               # http://localhost:6006
pnpm docs:api                # Compodoc → docs/api/
pnpm docs:check              # documentation structure
```

Environment variables: `CWM_HOST_PORT` (default `4310`), `CWM_DATA_FILE` (default
repo-anchored `.prototype/data.json`; an override resolves against the process cwd), `PROTOTYPE_AI_PROVIDER`
(`mock` | `real`; `real` is a stub that fails the dashboard read), `CWM_MCP_TOKEN` (stdio
only). The README documents each.

## Changing it

- **A new entity or field:** start in [contracts](contracts/how.md); the type errors
  lead you to every consumer. Bump `SCHEMA_VERSION` if an existing `data.json` would be
  wrong, and decide whether this cutover earns a converter (§14).
- **A new rule:** a failing test in `packages/domain`, then the service. Never in a route,
  a tool or a component.
- **A new read surface:** domain service → route in `api/routes.ts` → gateway interface
  and adapter → store → component; MCP tool if an agent needs it. Each step has a sibling
  to copy.
- **A new prototype control:** `packages/contracts/src/prototype.ts`, `prototype/routes.ts`
  on the host, `PrototypeControlPort` and `DevPanelControls` in the web app — one
  implementation of each control, shown in the overlay and on `/prototype/state`.
- **The trap:** starting both processes under one supervisor. Read
  [`scripts/dev.mjs`](../../scripts/dev.mjs) before trying.
