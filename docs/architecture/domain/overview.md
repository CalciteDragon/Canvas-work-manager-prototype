# Domain

`@cwm/domain` is the product's rules as code (§12): what a project, page, section, task,
shortcut and reflection may do, who may do it, what each operation records, and what the
derived pages — dashboard, progress, timeline, todos, archive, journal — compute. Every
mutation in the prototype, whether from the browser, an MCP tool or the development
panel, reaches one of these services; nothing else enforces a rule. Services depend only
on repository interfaces, a `Clock`, and — where an invariant needs it — another domain
service through an acyclic edge. They never know about HTTP, MCP, JSON or seeds.

**Code:** `packages/domain/src` · **Tests:** `packages/domain/src/*.test.ts` over
`InMemoryDataStore`, with `test/test-support.ts` · **Package:** `@cwm/domain` ·
**Depends on:** `@cwm/contracts`, and repository *interfaces* from `@cwm/repositories`

## Responsibilities

- **Scoping and identity.** Every read and write is scoped by the `ActorContext`'s
  workspace; a foreign id is not found, never forbidden. The actor carries an agent's
  grants, and every public service method asserts the grant it needs (§53).
- **Rules.** Project kinds, nesting and archive; page ownership of sections; container
  ownership of rows; the resolution of where a write lands when nobody said (§27); task
  status transitions and `completedAt`; archive cascades and exact restore; the
  archived-ancestor rule; reflection subjects.
- **Activity.** One `ActivityEvent` per state-changing operation, with the actor, through
  `ActivityService.record` — which is also where a live frame is published, after commit.
- **Time.** All timestamps come from the injected `Clock`. `new Date()` is banned here by
  lint.
- **Derived reads.** The dashboard, progress, timeline, workspace search, upcoming work,
  the Todos chronology, the content-oriented Archive projection and the journal feed, each computed from
  canonical records on demand — never stored.
- **The AI seam.** `AIProvider` is an interface here; the deterministic
  `PrototypeAIProvider` composes text from counts the caller already derived (§43).

## Not responsible for

- Persistence, transactions or validation of the document as a whole —
  [repositories](../repositories/overview.md).
- Authentication: the host resolves a header or a token to an `ActorContext`; the
  domain checks its shape ([prototype-host](../prototype-host/overview.md)).
- Tool descriptions and input schemas — [mcp-tools](../mcp-tools/overview.md).
- Seeds and personas — [prototype-data](../prototype-data/overview.md).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
