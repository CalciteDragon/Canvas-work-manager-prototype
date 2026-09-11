# Why the host exists

## The problem it solves

A browser cannot host an MCP server, and the MCP SDK needs Node (§6). The prototype
also needs *somewhere* for the domain services to run against the one data file, for
the browser and an agent to reach the same state, and for a person to change the rig —
seed, date, persona — while the app is running. One small Node process answers all of
that (§5). What it must not become is a backend: §7 says it is replaced wholesale in the
MVP, so every hour spent making it robust is wasted.

## Forces

- **Two clients, one state.** The browser and an MCP client must see each other's
  writes within a second (§62) — so both must go through the same process and the same
  unit of work.
- **Fake auth, real permissions.** A header names a persona; a fixture token names an
  agent connection; but the connection's *permissions* are real and change on the next
  call (§18, §51, §53).
- **Localhost only.** The tokens have no security value, so nothing here may be
  reachable off-machine.
- **Disposable** (§71): the fewer abstractions the host has, the cheaper it is to change
  a route when a data shape changes.

## The shape, and the alternatives rejected

**A hand-written route table over `node:http`.** Routes are keyed by `'METHOD /path'`,
matched by method and pattern, and answer `{ status, body }`. Rejected: Express or
Fastify — a framework to learn and configure for forty routes that will be deleted.

**Three route families, one server.** `/api/*` is application data (§61); `/prototype/*`
changes the rig (§46, §62) and sits beside `/prototype/health` because none of it is
workspace content; `/mcp` is the SDK's handler mounted as a raw route. Rejected: a second
port for MCP — the whole point is that an agent's write lands in the same process the
browser is watching ([decision](../../decisions/2026-08-live-updates-are-http-only.md)).

**`CWM_HOST_PORT`, never `PORT`.** Tooling that exported `PORT=4200` for `ng serve`
handed the host the web port four separate times; the host now ignores `PORT` entirely
and throws on an unusable value rather than falling back
([decision](../../decisions/2026-08-host-port-is-not-the-generic-port.md)).

**CORS on the host, not a dev-server proxy.** The `x-prototype-user` header makes every
gateway call non-simple, so the preflight is load-bearing; the host answers it and the
browser talks to `:4310` directly ([decision](../../decisions/2026-08-host-cors-over-dev-proxy.md)).

**The clock and the AI provider are built in `main.ts`, not inside `createApi`.** The
development panel has to hold the *same instances* the services were wired with; that is
what lets it move the date or swap the provider without a restart, and the services
never learn that any of it exists.

**Real AI is a stub that fails loudly.** `PROTOTYPE_AI_PROVIDER=real` selects an adapter
that throws; the dashboard read fails as a whole and the explanation goes to the host's
console. Quietly falling back to the mock would make an experiment about real AI
unfalsifiable (§44).

**Started separately from the web app.** `concurrently` handed `tsx watch` a piped stdin
and the host hung silently; `pnpm dev` now prints the two commands and exits
([decision](../../decisions/2026-08-web-and-host-start-separately.md)).

## Consequences

- One process to start, one file to inspect, `curl` for everything.
- A stdio MCP process is a second owner of the file and cannot reach the running host's
  hub; the [setup guide](../../guides/mcp-setup.md) documents the safe workflow.
- Every route is a few lines; every route is also untested for the things a framework
  would give for free (content negotiation, streaming bodies). That is the accepted cost.
- The acceptance scripts run a second host on a temp file (`CWM_DATA_FILE`,
  `CWM_HOST_PORT`) beside a live one, which is what makes them safe to run mid-session.

## Decisions that shape this system

- [The web app and the host start separately](../../decisions/2026-08-web-and-host-start-separately.md)
- [The host's port variable is `CWM_HOST_PORT`, not `PORT`](../../decisions/2026-08-host-port-is-not-the-generic-port.md)
- [CORS on the host, not a dev-server proxy](../../decisions/2026-08-host-cors-over-dev-proxy.md)
- [Latency and failure injection live in the client, not the host](../../decisions/2026-08-latency-and-failure-live-in-the-client.md)
- [What an `Identity` is, and where it comes from](../../decisions/2026-08-identity-contract-and-me-route.md)

Each subsystem's `why.md` carries its own.

## Spec sections

§5 runtime architecture · §6 why a host exists · §7 not the production backend · §18
authentication contract · §44 optional real AI · §46 development panel · §50–§51 MCP
protocol and auth · §59 HTTP and stdio · §61 prototype API · §62 live updates · §71
expected to be replaced.
