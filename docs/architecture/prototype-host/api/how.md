# How the API works

## Runtime flow

1. `createRequestHandler` matches `'METHOD /path'` against the table `createApiRoutes`
   built; path parameters (`:id`, `:projectId`, `:kind`) are extracted by the router.
2. The handler reads `x-prototype-user`; `resolveActor` looks the user up in the loaded
   document (or takes the first user) and builds `{ workspaceId, userId }` from the
   record — never from the request.
3. The body, if any, is parsed with the contract's input schema; a Zod failure is a 400.
4. The handler calls one service method and returns its result as JSON with the status
   the route declares (200, or 201 for creates). Section create answers `SectionAddResult`;
   update and move answer `SectionWriteResult` and use `undo: null` for no-ops. `DELETE
   /api/sections/:id` answers `SectionRemovalResult` — the final archived-shaped result and its
   Undo receipt. When the section was disposable, that result is a snapshot and the stored row is
   absent. A repeat can answer 409 with the exact actor's outstanding receipt in typed details.
   `POST /api/undo/:id` answers the discriminated `UndoResult`.
5. A thrown error goes through `api/errors.ts`: the domain's three errors map to 404,
   409 and 403; a `DomainRuleError` with `details` forwards them; `AgentAuthenticationError`
   is 401; anything else is 500 `{"error":"internal_error"}` with the stack on the
   console.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `createApi` | function | Wire the services, including the `RepositoryUndoRecorder` that explicit section writes record through, and `UndoService`; returns `HostServices` | [API](../../../api/miscellaneous/variables.html#createApi) |
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
- **Undo refusals are ordinary 409s.** Consumed, expired, conflicting, blocked and unavailable
  each carry `details` that parse as `UndoRefusalDetails`; a receipt another actor was issued is
  404; a connection whose grant or token changed after the receipt is 403 or 401, re-read per
  call by the authenticator. `routes.test.ts` pins each.
- **A repeated removal stays a refusal.** Only the exact actor's newest unconsumed, unexpired
  receipt is returned, including when the section was deleted. It produces no second write or
  event; a different actor sees the normal not-found response. The route forwards the shared
  `SectionAlreadyRemovedDetailsSchema` unchanged.
- **No-op section edits stay no-ops.** The host returns the current section with `undo: null`;
  it does not create an activity event, Undo record or live mutation frame.
- **Projections are forwarded, not filtered.** `GET /api/projects/:projectId/archive` returns
  `ProjectArchiveService.derive` as-is, including each section entry's `recovery` metadata;
  `routes.test.ts` pins that a removed view is absent and prose is present without route logic.

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
