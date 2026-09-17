# Why the MCP transport exists

## The problem it solves

§48 makes MCP a product experiment: real clients — Claude, Cursor, scripts — must be
able to connect and drive the workspace, so that the prototype can observe what agents
actually do. That needs a real endpoint speaking the real protocol, and a way to say
*which* agent is acting so that §53's permissions and §57's attribution are real. But
none of it may become production auth (§51, §80).

## Forces

- **Use the official SDK, do not hand-roll the protocol** (§50). Protocol drift is not
  a question the prototype is trying to answer.
- **Two transports, one registry** (§59). Claude Desktop builds that reject local HTTP
  entries need stdio; the browser experiment needs HTTP.
- **Permission edits take effect on the next call** (§53). A token that cached its
  grants would make the Settings page a lie.
- **The tokens are worthless**, so the listener must be local-only and the 401 must
  not be an oracle.

## The shape, and the alternatives rejected

**SDK v2's Node adapter, mounted as a raw route.** `createMcpNodeHandler` wraps the
SDK's fetch-shaped handler for `node:http`, and `createAuthenticatedMcpHandler` puts the
authenticator and the two localhost guards in front. Rejected: a second HTTP server for
MCP — the browser and the agent must share one process so an agent's write reaches the
open page ([decision](../../../decisions/2026-08-live-updates-are-http-only.md)).

**The token is a pointer, not a record.** The authenticator maps a fixture token to a
connection id and then reads the *live* `AgentConnection`, so revocation and grant
changes apply immediately; §53's "Last used" is a throttled write so that a read does
not rewrite the file on every call
([decision](../../../decisions/2026-08-agent-tokens-are-fixtures-not-records.md),
[decision](../../../decisions/2026-08-last-used-is-a-throttled-write.md)).

**One 401 for every cause.** Unknown token, deleted connection and revoked connection are
indistinguishable to the caller: a chatty 401 would be an oracle for which tokens exist,
and a bad habit to form for tokens that will one day be real.

**Stdio reloads the document before every call.** A child process cannot see the running
host's in-memory state, so it re-reads the file and re-authenticates each time — it
therefore sees host-side revocations, while the host does not see its writes
([decision](../../../decisions/2026-08-stdio-token-and-live-auth.md)). The documented
safe workflow is to stop the host for a stdio mutation session, or point each transport
at its own `CWM_DATA_FILE`.

**Permission metadata is namespaced under `_meta`**, with the singular key kept for
existing clients and a plural key carrying every grant a combined read needs
([decision](../../../decisions/2026-08-mcp-tool-permission-metadata.md)).

## Consequences

- `pnpm --filter @cwm/prototype-host mcp-acceptance` lists tools, creates a task and
  finds it in the file over both transports with a real client — the slice's *done when*,
  runnable at any time. Later slices extended it; [testing / how](../../testing/how.md) lists
  what it now covers, including Slice 35's A → B → Undo → Undo → Redo → Redo chain over both
  transports and a fresh connection seeing only its own history.
- A stdio agent's write does not appear in the browser; the guide says so and says why.
- The tool list is public and unfiltered by grant; the metadata tells a client what each
  tool needs before it calls.
- Nothing here should grow toward OAuth (§80). Slice 22's confirmations, if built, use
  the protocol's own input-required pattern, not a new auth layer.

## Decisions that shape this system

- [Stdio uses an environment token and reloads identity per call](../../../decisions/2026-08-stdio-token-and-live-auth.md)
- [Live updates reach the browser over HTTP, and not over stdio](../../../decisions/2026-08-live-updates-are-http-only.md)
- [Where §51's bearer tokens live](../../../decisions/2026-08-agent-tokens-are-fixtures-not-records.md)
- [How §53's "Last used" is recorded](../../../decisions/2026-08-last-used-is-a-throttled-write.md)
- [MCP tools advertise their required permission in namespaced metadata](../../../decisions/2026-08-mcp-tool-permission-metadata.md)
- [What the tool registry knows about MCP](../../../decisions/2026-08-tool-registry-is-transport-free.md) — the three obligations this transport inherited

## Spec sections

§49 MCP architecture · §50 protocol · §51 prototype authentication · §52 agent
connections · §53 permission UI (the "next call" rule) · §59 HTTP and stdio modes · §60
tests without a server.
