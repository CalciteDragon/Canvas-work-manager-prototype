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
   update and move answer `SectionWriteResult` and use `operation: null` for no-ops. `DELETE
   /api/sections/:id` answers `SectionRemovalResult` — the final archived-shaped result, its
   operation receipt, and `archiveListed`, which says whether Archive will actually list the section.
   When the section was disposable, that result is a snapshot and the stored row is absent. A repeat can answer 409 with the exact actor's outstanding receipt in typed details.
   Task create answers `TaskAddResult`; update, complete, archive and restore answer
   `TaskWriteResult`. Reflection create answers `ReflectionAddResult`; update, archive and restore
   answer `ReflectionWriteResult`. Each shape is `{ task|reflection, operation }`: create requires
   the receipt and a normalized no-op carries `operation: null`.
   `POST /api/sections/:id/duplicate` answers `SectionAddResult`, because duplication records the
   add it is; `POST /api/sections/:id/restore` answers `SectionWriteResult`, with `operation: null`
   for a retry on a live section. The three shortcut writes answer
   `SectionShortcutAddResult` / `SectionShortcutWriteResult`, and `DELETE /api/shortcuts/:id` answers
   **200** with `SectionShortcutRemovalResult` rather than 204 — a body-less status cannot carry a
   receipt, and no route answers 204 any more.
   `GET /api/projects/:id/history` answers the caller's `OperationHistorySummary`;
   `POST /api/history/:historyId/transition` parses the strict transition body and answers
   `OperationHistoryTransitionResult`.
5. A thrown error goes through `api/errors.ts`: the domain's three errors map to 404,
   409 and 403; a `DomainRuleError` with `details` forwards them; `AgentAuthenticationError`
   is 401; anything else is 500 `{"error":"internal_error"}` with the stack on the
   console.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `createApi` | function | Wire the services, including the `RepositoryOperationRecorder` that section, shortcut, task and reflection writes record through, and `OperationHistoryService`; returns `HostServices` | [API](../../../api/miscellaneous/variables.html#createApi) |
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
- **History refusals are ordinary 409s.** `history_not_next`, `history_revision_stale`,
  `history_expired`, `history_blocked`, `history_conflict`, `history_unavailable` and
  `history_retired` each carry `details` that parse as `OperationHistoryRefusalDetails`, current
  summary included; a stale revision stays a 409 rather than a 412. Another actor's history, or an
  unknown id, is 404; a connection without the stored action family's grant is a 403 naming
  `projects.write`, `tasks.write` or `reflections.write`, and one whose token was revoked is 401,
  re-read per call by the authenticator. An expired action refuses while stored
  and, once a later write prunes it, is no longer the next step. `routes.test.ts` pins each.
- **A repeated removal stays a refusal.** Only the exact actor's applied, unexpired removal
  receipt is returned, including when the section was deleted. It produces no second write or
  event; a different actor sees the normal not-found response. The route forwards the shared
  `SectionAlreadyRemovedDetailsSchema` unchanged.
- **No-op section edits stay no-ops.** The host returns the current section with
  `operation: null`; it does not create an activity event, history action or live mutation frame.
- **Row envelopes stay strict.** `routes.test.ts` parses task and reflection create, update,
  completion, archive and restore responses as the shared contracts, including the receipt and a
  true no-op's `operation: null`; the route never strips the entity or reconstructs a receipt.
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
