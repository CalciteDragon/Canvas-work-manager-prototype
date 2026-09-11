# Prototype host

`apps/prototype-host` is the one Node process behind the prototype (§5–§7): it loads the
JSON document, wires the domain services, and serves them three ways on `127.0.0.1:4310` —
the fake REST API the browser uses (§61), the MCP endpoint agents use (§50), and the
event stream that tells open browsers something changed (§62) — plus the `/prototype/*`
controls that change the rig rather than the workspace (§46). It is deliberately
disposable (§71): no framework, no middleware, a hand-written route table. It is **not**
the production backend and is not a draft of one (§7).

**Code:** `apps/prototype-host` · **Entry:** `main.ts` · **Tests:** `*.test.ts` beside
each module (vitest) plus four acceptance scripts in `scripts/` · **Package:**
`@cwm/prototype-host` · **Depends on:** every `@cwm/*` package and the MCP SDK v2

## Responsibilities

- Start on `CWM_HOST_PORT` (never `PORT`), bound to localhost only, and fail loudly when
  the port is unusable or the data file is missing or stale.
- Turn a request into an `ActorContext`: a persona header for the API, a bearer token
  for MCP. Neither is authentication in any real sense (§18, §51).
- Map the domain's three errors to HTTP statuses and MCP tool errors.
- Hold the single instances the development panel may change at runtime — the clock and
  the AI provider — so a change takes effect without a restart.
- Broadcast one Server-Sent Event per committed activity record, scoped by persona.

## Not responsible for

- Rules: every route and tool calls a domain service ([domain](../domain/overview.md)).
- Tool definitions: the registry comes from [mcp-tools](../mcp-tools/overview.md).
- Storage: the store comes from [repositories](../repositories/overview.md); the host
  only chooses the path.
- Latency and failure injection: those live in the browser's gateway, where the
  optimistic revert can be observed
  ([decision](../../decisions/2026-08-latency-and-failure-live-in-the-client.md)).

## Subsystems

- [api](api/overview.md) — the `/api/*` route table, actor resolution, error mapping,
  and `createApi`, the composition root for the domain services.
- [mcp-transport](mcp-transport/overview.md) — the `/mcp` Streamable HTTP endpoint, the
  stdio entry, the bearer-token authenticator and the SDK server.
- [live-updates](live-updates/overview.md) — the event hub and the `/prototype/events`
  Server-Sent Events endpoint.
- [prototype-runtime](prototype-runtime/overview.md) — the `/prototype/*` rig controls:
  seed swap, reset, simulated clock, AI provider switch, friction notes.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
