# How the host works

## Runtime flow

1. `pnpm dev:host` (`tsx watch main.ts`) or `pnpm --filter @cwm/prototype-host start`.
   `main.ts` reads `CWM_HOST_PORT` (default `4310`; an unusable value throws with the
   message intact), then loads the data file, then wires services and the registry, then
   listens — in that order, so a broken file fails the start rather than the first request.
2. `createRequestHandler` dispatches each request: raw routes first (`/mcp`, the event
   stream), then the table keyed `'METHOD /path/:param'`, then 404 as
   `{"error":"not_found"}`. CORS headers and the preflight are answered here.
3. `/api/*` handlers resolve the persona from `x-prototype-user` (or the document's first
   user), parse the body with the contract input, call the service, and answer the
   contract shape; `api/errors.ts` turns a thrown domain error into a status.
4. `/mcp` hands the request to the SDK's Node adapter behind the localhost guards and the
   bearer-token authenticator; a tool call reaches the same services.
5. Every committed unit of work releases its held live frames to the hub, which writes
   them to every `GET /prototype/events` subscriber whose persona matches.
6. `/prototype/*` reads or changes the `PrototypeRuntime`: swap the document, reset,
   move the clock, switch the AI provider, append a note.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `start`, `stop` | functions | The server's life; `stop` closes in-flight sockets | [API](../../api/miscellaneous/functions.html#start) |
| `configuredPort`, `PORT_VARIABLE`, `HOST` | function / consts | `CWM_HOST_PORT`; `127.0.0.1` | [API](../../api/miscellaneous/variables.html#configuredPort) |
| `createRequestHandler`, `healthRoutes` | function / const | The router | [API](../../api/miscellaneous/functions.html#createRequestHandler) |
| `RouteTable`, `RawRouteTable`, `RouteRequest`, `RouteResult` | types / interfaces | What a route receives and returns | [API](../../api/interfaces/RouteRequest.html) |
| `loadPersistence`, `Persistence` | function / interface | The store over the chosen file | [API](../../api/miscellaneous/variables.html#loadPersistence) |
| `createApi`, `HostServices` | function / interface | Domain services and the authenticator, wired | [API](../../api/miscellaneous/variables.html#createApi) |
| `PrototypeRuntime` | class | The runtime-changeable instances | [API](../../api/classes/PrototypeRuntime.html) |
| `SwitchableAIProvider` | class | Delegates to mock or real; swapped by the panel | [API](../../api/classes/SwitchableAIProvider.html) |
| `RealAIProvider` | class | §44's deliberate stub | [API](../../api/classes/RealAIProvider.html) |

## Dependencies

**Depends on**

- [domain](../domain/overview.md) — services, `SimulatedClock`, `ActorContext`, errors,
  `LiveEventPublisher`.
- [mcp-tools](../mcp-tools/overview.md) — `createToolRegistry`.
- [repositories](../repositories/overview.md) — `JsonDataStore`.
- [prototype-data](../prototype-data/overview.md) — seeds for `/prototype/seed`, the
  token table for the authenticator.
- [contracts](../contracts/overview.md) — inputs and the `/prototype/*` shapes.
- `@modelcontextprotocol/server` and `@modelcontextprotocol/node` (SDK v2); `tsx`.

**Depended on by**

- [web](../web/overview.md) — over HTTP only; the browser never imports host code.
- [testing](../testing/overview.md) — the e2e suite starts a host on
  `.prototype/e2e-data.json`; the acceptance scripts start one on a temp file.

## Invariants and lints

- **Localhost only**, always — `HOST` is a constant, and the MCP handler additionally
  refuses non-localhost `Host`/`Origin` headers with 403 before negotiation.
- **A caller mistake is never a 500**: `api/errors.ts` is the one mapping — validation
  400, not found 404, rule 409, permission 403, unknown token 401.
- **The persona header is not auth** and the token is not a secret; nothing here should
  grow toward either (§7, §80).
- **Type-check is the build**: `pnpm --filter @cwm/prototype-host build` is `tsc
  --noEmit`, because packages are consumed as source and there is no `outDir`.

## Commands

```bash
pnpm dev:host                                          # tsx watch main.ts on :4310
pnpm --filter @cwm/prototype-host start                # without the watcher (what e2e uses)
pnpm --filter @cwm/prototype-host test                 # vitest, in-process, no port unless a test asks for one
pnpm --filter @cwm/prototype-host acceptance           # Slice 5: create → complete → activity → restart survives
pnpm --filter @cwm/prototype-host agent-acceptance     # Slice 13: revoke a grant, next write fails clearly
pnpm --filter @cwm/prototype-host mcp-acceptance       # Slice 15: real client over HTTP and stdio
pnpm --filter @cwm/prototype-host live-acceptance      # Slice 16: frame within a second, write already readable
curl localhost:4310/prototype/health                   # {"ok":true}
```

Environment: `CWM_HOST_PORT`, `CWM_DATA_FILE`, `PROTOTYPE_AI_PROVIDER` — see the README's
table for each.

## Changing it

- **A new route:** an entry in `createApiRoutes` (or `createPrototypeRoutes`) that
  parses with a contract input and calls a service; a case in `routes.test.ts`. Do not
  add a layer.
- **A new runtime control:** a method on `PrototypeRuntime`, a `/prototype/*` route that
  answers the new state, and the panel's side in
  [prototype-tooling](../web/prototype-tooling/overview.md).
- **The trap:** resolving a path against the process cwd. `pnpm --filter` runs a script
  with the package as cwd; `persistence/store.ts` and `prototype/notes.ts` both anchor to
  the repository for that reason.
