# How the MCP transport works

## Runtime flow

**HTTP.** `main.ts` builds the handler once with
`createAuthenticatedMcpHandler({ registry, authenticator })` and mounts it as the raw
route for `/mcp`. Per request: the `Host` and `Origin` headers must be localhost (403
otherwise, before any protocol negotiation); the bearer token is authenticated (401 on
any failure); the SDK handler runs with the resulting actor; a `tools/call` reaches
`registry.call`, whose result or tool error is returned as JSON-RPC.

**Stdio.** `pnpm mcp:stdio` runs `mcp/stdio.ts` with `tsx`: it reads `CWM_MCP_TOKEN`
(exits immediately if absent), then for every call reloads the data file at
`CWM_DATA_FILE`, authenticates the token against the freshly loaded connections, and
serves the same registry through the SDK's stdio transport. Protocol bytes go to stdout
only; diagnostics to stderr.

**Authentication.** `PrototypeAgentAuthenticator` maps the token through the fixture
table to a connection id, reads the live `AgentConnection`, refuses a missing or revoked
one, stamps `lastUsedAt` when it has moved far enough to matter, and returns an agent
`ActorContext` carrying the connection's current permissions.

**Discovery.** `toolPermission` returns one discriminated declaration per registry tool.
`mcp/server.ts` publishes the singular/plural `_meta` pair for a static declaration, or the
operation-family map for Undo and Redo. Those history tools deliberately omit the static keys:
section actions require `projects.write`, task actions `tasks.write`, reflection actions
`reflections.write`, and both shortcut placements and optional pages `projects.write`, with the
family read from the stored action only when the call runs. The published map is five entries —
`section`, `task`, `reflection`, `shortcut`, `page` — and both transports assert it exactly.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `createAuthenticatedMcpHandler` | function | The `/mcp` raw route | [API](../../../api/miscellaneous/variables.html#createAuthenticatedMcpHandler) |
| `createMcpNodeHandler` | function | SDK fetch handler → `node:http` | [API](../../../api/miscellaneous/variables.html#createMcpNodeHandler) |
| `AuthenticatedMcpDependencies` | interface | Registry plus authenticator | [API](../../../api/interfaces/AuthenticatedMcpDependencies.html) |
| `McpInvocation` | interface | What the server hands a tool call | [API](../../../api/interfaces/McpInvocation.html) |
| `REQUIRED_PERMISSION_META_KEY`, `REQUIRED_PERMISSIONS_META_KEY`, `REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY` | consts | The mutually exclusive static and operation-family discovery keys | [API](../../../api/miscellaneous/variables.html#REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY) |
| `PrototypeAgentAuthenticator` | class | Token → live connection → actor | [API](../../../api/classes/PrototypeAgentAuthenticator.html) |
| `AgentAuthenticationError` | class | The one 401 | [API](../../../api/classes/AgentAuthenticationError.html) |
| `AgentAuthenticatorDependencies` | interface | Connections repository, clock, token table | [API](../../../api/interfaces/AgentAuthenticatorDependencies.html) |

## Dependencies

**Depends on**

- [mcp-tools](../../mcp-tools/overview.md) — the registry.
- [domain](../../domain/overview.md) — `ActorContext`, `AgentConnectionService`'s
  throttled touch, the error types the tool errors carry.
- [prototype-data](../../prototype-data/overview.md) — the fixture token table.
- `@modelcontextprotocol/server`, `@modelcontextprotocol/node`; the `@modelcontextprotocol/client`
  dev dependency for the tests and the acceptance script.

**Depended on by**

- External MCP clients only. The web app never calls `/mcp`.

## Invariants and lints

- **The protocol is the SDK's.** No hand-written JSON-RPC anywhere; `handler.test.ts`
  and `stdio.test.ts` drive a real client against the handler in-process (§60).
- **`tools/list` equals `SPEC_TOOL_NAMES`** — asserted by the host's test, so the
  registry and the wire agree.
- **Discovery is truthful for history transitions.** `handler.test.ts` and `stdio.test.ts` assert
  the full five-family map — written out rather than derived from the declaration, so a family the
  domain gains and discovery forgets fails a test instead of agreeing with itself — and the absence
  of the singular/plural keys on Undo and Redo; static tools keep both old keys.
- **Revocation is tested end to end** with a token and a handler in the same test,
  because it is an authenticate-time refusal with nothing for a registry test to observe.
- **Localhost only, both ways**: the listener binds `127.0.0.1` and the handler refuses
  foreign `Host`/`Origin`.
- **One 401**; never a message that distinguishes causes.

## Commands

```bash
pnpm dev:host                                          # then point a client at http://127.0.0.1:4310/mcp
pnpm mcp:stdio                                         # CWM_MCP_TOKEN=prototype-user-a-readwrite; stop dev:host first for mutations
pnpm --filter @cwm/prototype-host mcp-acceptance       # real client, both transports, task lands in the file
pnpm --filter @cwm/prototype-host live-acceptance      # HTTP MCP write → SSE frame within a second, already readable
pnpm --filter @cwm/prototype-host test -- mcp          # handler and stdio suites
```

Client configuration for Cursor, Claude Desktop and Claude Code, the fixture tokens,
and the troubleshooting table are in [the MCP setup guide](../../../guides/mcp-setup.md).

## Changing it

- **A new tool** needs nothing here: the registry is the list. Update the guide if a
  client needs to know how to use it.
- **Protocol version or SDK upgrade:** `mcp/server.ts` and the two SDK dependencies;
  run `mcp-acceptance` against a real client before believing the tests.
- **The trap:** running a stdio mutation session while `pnpm dev:host` is up. The host
  does not see the child's writes and will overwrite them; the guide's
  *file-store limitation* section is the rule.
