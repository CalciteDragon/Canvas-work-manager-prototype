# API

The host's REST surface (§61): the `/api/*` route table the browser's gateway calls,
the persona-header context that turns a request into an `ActorContext`, the error mapping
that turns a thrown domain error into a status, and `createApi` — the composition root
that wires every domain service over the loaded store. Routes validate bodies with
contract inputs and answer contract shapes; they hold no rules.

**Code:** `apps/prototype-host/api` · **Tests:** `api/routes.test.ts`,
`api/services.test.ts`, `api/errors.test.ts` · **Parent:**
[prototype-host](../overview.md)

## Responsibilities

- `createApi(persistence, { clock, ai })` → `HostServices`: every domain service, the
  authenticator, and the AI provider selection.
- Resolve the acting persona from `x-prototype-user` (default: the document's first
  user) into a user `ActorContext` whose workspace is derived from the resolved user, so
  an HTTP caller cannot forge the pair.
- Serve the route table — projects, pages, sections, shortcuts, tasks, reflections,
  progress, timeline, todos, archive, journal, completed work, dashboard, activity, agent
  connections, `me`.
- Map errors: validation → 400, `EntityNotFoundError` → 404, `DomainRuleError` → 409
  (with its typed `details` forwarded), `PermissionDeniedError` → 403, anything else →
  500 `internal_error` with the explanation on the console.
- Forward section-removal results as `{ section, undo }`; a deleted disposable section's
  `section` is an archived-shaped response snapshot. A repeated removal remains a 409 and
  may carry only the exact actor's newest outstanding receipt in typed `details`.

## Not responsible for

- Agent identity: the bearer token path is [mcp-transport](../mcp-transport/overview.md).
- The `/prototype/*` routes: [prototype-runtime](../prototype-runtime/overview.md).
- Live frames: emitted by the domain, delivered by [live-updates](../live-updates/overview.md).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
