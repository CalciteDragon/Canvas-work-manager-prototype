# How the API works

## Runtime flow

1. `createRequestHandler` matches `'METHOD /path'` against the table `createApiRoutes`
   built; path parameters (`:id`, `:projectId`, `:kind`) are extracted by the router.
2. The handler reads `x-prototype-user`; `resolveActor` looks the user up in the loaded
   document (or takes the first user) and builds `{ workspaceId, userId }` from the
   record — never from the request.
3. The body, if any, is parsed with the contract's input schema; a Zod failure is a 400.
4. The handler calls one service method and returns its result as JSON with the status
   the route declares (200, or 201 for creates).
5. A thrown error goes through `api/errors.ts`: the domain's three errors map to 404,
   409 and 403; a `DomainRuleError` with `details` forwards them; `AgentAuthenticationError`
   is 401; anything else is 500 `{"error":"internal_error"}` with the stack on the
   console.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `createApi` | function | Wire the services; returns `HostServices` | [API](../../../api/miscellaneous/variables.html#createApi) |
| `HostServices` | interface | Every service plus `authenticator`; what routes and the registry receive | [API](../../../api/interfaces/HostServices.html) |
| `CreateApiOptions` | interface | `clock` and `ai` overrides — the runtime's instances | [API](../../../api/interfaces/CreateApiOptions.html) |
| `aiProviderFor` | function | `real` → `RealAIProvider`, anything else → `PrototypeAIProvider` | [API](../../../api/miscellaneous/variables.html#aiProviderFor) |
| `createApiRoutes` | function | The `/api/*` `RouteTable` | [API](../../../api/miscellaneous/variables.html#createApiRoutes) |
| `ApiDependencies` | interface | What the routes need: services and persistence | [API](../../../api/interfaces/ApiDependencies.html) |
| `resolveActor` | function | Header → user `ActorContext` | [API](../../../api/miscellaneous/variables.html#resolveActor) |
| `RealAIProvider` | class | The failing stub | [API](../../../api/classes/RealAIProvider.html) |

## Dependencies

**Depends on**

- [domain](../../domain/overview.md) — the services and their errors.
- [contracts](../../contracts/overview.md) — inputs to parse, shapes to answer.
- [repositories](../../repositories/overview.md) — through `Persistence`, for the unit
  of work and the user lookup.
- The router in the parent ([prototype-host](../how.md)).

**Depended on by**

- The browser's `PrototypeWorkManagerGateway` and `PrototypeIdentityProvider`
  ([web / core](../../web/core/overview.md)) — the only consumers.
- [mcp-transport](../mcp-transport/overview.md) shares `HostServices` and the
  authenticator from `createApi`.

## Invariants and lints

- **No rules in routes.** A route parses, calls, answers. If a route has an `if` about
  the workspace, it is in the wrong layer.
- **The envelope is stable**: errors are `{ error, message, details? }` with the codes
  the gateway's `GatewayError` reads. `errors.test.ts` pins each mapping.
- **Every route has a case in `routes.test.ts`**, run in-process against an
  `InMemoryDataStore` — no port.
- **The workspace is never read from the request.**

## Commands

```bash
pnpm --filter @cwm/prototype-host test -- api        # the three api suites
curl -H "x-prototype-user: user-demo" localhost:4310/api/projects
curl -X POST -H "content-type: application/json" -d '{"kind":"root","name":"Try"}' localhost:4310/api/projects
```

The `acceptance` script (parent `how.md`) is the end-to-end version of the second line.

## Changing it

- **A new route:** add it to `createApiRoutes` beside its family; parse with the contract
  input; call the service; add the `routes.test.ts` case that exercises both the success
  and one refusal. Then the gateway interface and adapter in
  [web / core](../../web/core/how.md).
- **A new error kind:** the domain first, then one line in `api/errors.ts`, then the
  `GatewayError` mapping — and a test on each side, because this is exactly the seam
  that diverged once.
- **The trap:** answering `[]` for an id that does not resolve. The domain answers 404
  on purpose ([decision](../../../decisions/2026-08-workspace-scoping-and-not-found.md));
  do not soften it in a route.
