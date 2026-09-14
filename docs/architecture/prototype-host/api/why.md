# Why the API exists

## The problem it solves

The browser must not know that a JSON file, a domain service or a Node process exists
(§8). It needs an HTTP surface shaped like the gateway interfaces it depends on (§9), so
that the prototype adapter is a thin `fetch` layer and a production adapter over a real
API is the same shape (§10, §72). §61 defines that surface; this subsystem is it.

## Forces

- **Every gateway method needs a route**, and the gateway grows only with real
  implementations ([decision](../../../decisions/2026-08-gateway-surface-grows-with-implementations.md)),
  so the route table grows one slice at a time and carries no stubs.
- **A caller mistake must not be a 500.** A typo in a query string that surfaces as
  `internal_error` costs an hour; §61's error envelope exists so it costs a glance.
- **Identity is a header, but the workspace must not be forgeable.** The persona header
  names a user; the workspace is derived from the resolved user on the host, never read
  from the request.
- **Disposable** (§71): forty small handlers, no framework.

## The shape, and the alternatives rejected

**`createApi` is the composition root for the domain.** It takes the loaded store and
the runtime-changeable instances and returns every service plus the authenticator. It
is also what tests call to get a complete host in-process. Rejected: constructing
services inside each route — the dev panel needs the *same* clock instance the services
hold, so construction has to happen once, above the routes.

**One error mapping.** `api/errors.ts` is the only place a thrown thing becomes a status,
and the same mapping produces the `GatewayError` the browser sees. Slice 6 found the
alternative by accident: the identity provider flattened every status to
`internal_error` while the gateway read the envelope properly — one rule, two entry
points, already diverged.

**Typed refusals cross the boundary.** `DomainRuleError.details` (a discriminated
record such as `{ reason: 'section_not_empty', liveRowCount }`) is forwarded in the 409
body, so a UI can open the right dialog without parsing prose; the browser preserves it
untrusted ([decision](../../../decisions/2026-09-a-section-has-a-name.md)).

**A lost section-removal response can be recovered without turning a refusal into a
write.** A repeat stays a 409 and returns only the highest-sequence, unconsumed, unexpired
receipt belonging to that exact actor. The route forwards typed `section_already_removed`
details; inverse snapshots never cross the boundary. The result of a successful disposable
removal remains `{ section, undo }`, where `section` is an archived-shaped snapshot even
though the stored section is absent
([decision](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)).

**`GET /api/me` and CORS came with the shell, not the spec.** §18 cannot be honoured
without an identity read, and the non-simple `x-prototype-user` header makes the
preflight load-bearing ([decision](../../../decisions/2026-08-identity-contract-and-me-route.md),
[decision](../../../decisions/2026-08-host-cors-over-dev-proxy.md)).

**Derived pages get their own routes**, returning the same read model the MCP tool
returns: `/todos`, `/archive`, `/journal`, `/completed-work` under a project, and
`/dashboard` for the persona — one derivation per page, shared across transports.

## Consequences

- Adding a gateway method is: domain service → route → adapter → interface. Each step
  has a neighbour to copy, and the route is usually five lines.
- The browser's `GatewayError` and an MCP client's tool error come from the same domain
  error and say the same thing.
- There is no pagination, no ETag, no content negotiation. None of it is needed for a
  workspace that fits in memory; none of it should be added here.

## Decisions that shape this system

- [What an `Identity` is, and where it comes from](../../../decisions/2026-08-identity-contract-and-me-route.md)
- [CORS on the host, not a dev-server proxy](../../../decisions/2026-08-host-cors-over-dev-proxy.md)
- [The gateway interface grows with its implementations](../../../decisions/2026-08-gateway-surface-grows-with-implementations.md)
- [Workspace scoping, and why a foreign id is 404 rather than 409](../../../decisions/2026-08-workspace-scoping-and-not-found.md)
- [A section has a name](../../../decisions/2026-09-a-section-has-a-name.md) — typed refusal details across the boundary
- [Disposable removal and immediate canvas Undo](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)

## Spec sections

§9 gateway shape · §10 prototype adapter · §18 authentication contract · §61 prototype
API · §63 optimistic UI (what the statuses feed).
