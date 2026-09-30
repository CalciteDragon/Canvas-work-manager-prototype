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
serves the same registry through the SDK's stdio transport. Calls take turns: the next call
loads only after the previous one's `registry.call` has finished and persisted, because each
reload is its own store with its own write lock, and two overlapping calls at one history
revision would otherwise both commit (Slice 45's `stdio.test.ts` race case). Protocol bytes go to stdout
only; diagnostics to stderr.

Other processes take turns through the data file's owner record
([decision](../../../decisions/2026-09-one-writer-per-data-file.md)). Each turn acquires (`kind: 'stdio'`, up to 5 s)
after the previous turn and before its reload, and releases after `registry.call` and `afterCall`
— ownership first, then the turn, or the next call would wait on its own record. A live
`http-host` owner is not waited on (`skipWaitForKinds`): the call throws `DataFileInUseError`, and
the SDK returns it as an `isError` result whose text starts `data_file_in_use:`, reads included,
because authentication may write `lastUsedAt`. The process stays up, and its next call after the
host stops succeeds. Every stdio wait, per-call or at start-up, prints
`canvas-work-manager stdio waiting for data file owned by <kind> pid <pid>` to stderr. One
`process.on('exit')` listener releases whatever the current turn holds,
which covers a child that exits inside `afterCall`.

Start-up does **not** acquire: definitions come from a plain read, so a stdio child starts and lists
tools while a host owns the file — and the SDK client probes on a disposable sibling process first,
which a lifetime hold would have to fight. Only a missing file is seeded under ownership; if that
acquisition is refused because a host starting at the same moment won and seeded the file,
start-up loads the file it wrote. An unowned read is not quite free on Windows: while the child
holds the file open, the host's `rename` over it fails with `EPERM` and that one unit rolls back
with an error. This predates the owner record and is now confined to stdio start-up.

`startStdio` owns that startup. Direct execution calls it with no hooks. A dedicated test child
composes the same function with a per-call persistence loader that fails one commit, or a hook
inside the serialized registry call immediately after a successful commit and before the result
returns to SDK serialization. The latter closes the child so the SDK client sees a lost response.
Another test child supplies one `SimulatedClock` to startup and each per-call `createApi`. It
reads the exact removal receipt's expiry from a temporary sidecar after the first history read,
advances past it, and initializes from that sidecar on reconnect. This control is not an MCP tool
or ordinary stdio environment switch. The SDK test checks the expired refusal, retained Archive
and ActivityService reads on the same file after each child closes, then Restore and a second reopen.
The serialized turn is released in `finally` on both success and failure.

**Authentication.** `PrototypeAgentAuthenticator` maps the token through the fixture
table to a connection id, reads the live `AgentConnection`, refuses a missing or revoked
one, stamps `lastUsedAt` when it has moved far enough to matter, and returns an agent
`ActorContext` carrying the connection's current permissions.

**Discovery.** `toolPermission` returns one discriminated declaration per registry tool.
`mcp/server.ts` publishes the singular/plural `_meta` pair for a static declaration, or the
operation-family map for Undo and Redo. Those history tools deliberately omit the static keys:
section actions require `projects.write`, task actions `tasks.write`, reflection actions
`reflections.write`, and shortcut, page and project actions `projects.write`, with the
family read from the stored action only when the call runs. The published map is six entries —
`section`, `task`, `reflection`, `shortcut`, `page`, `project` — and both transports assert it exactly.

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
| `startStdio` | function | Direct stdio startup and host-local test composition | [API](../../../api/miscellaneous/variables.html#startStdio) |
| `StdioStartupHooks` | interface | Per-call load and post-call/pre-reply test seams | [API](../../../api/interfaces/StdioStartupHooks.html) |

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
  the full six-family map — written out rather than derived from the declaration, so a family the
  domain gains and discovery forgets fails a test instead of agreeing with itself — and the absence
  of the singular/plural keys on Undo and Redo; static tools keep both old keys.
- **Revocation is tested end to end** with a token and a handler in the same test,
  because it is an authenticate-time refusal with nothing for a registry test to observe.
- **Failed commit and lost response are distinct.** `handler.test.ts` and `stdio.test.ts`
  use real SDK clients and isolated JSON files. One-shot failed task and Undo commits preserve
  bytes, business state, history and Activity; a retry lands once. For an Undo committed before
  its response is lost, the old-revision retry refuses and a separate history read shows Redo.
  HTTP asserts zero frames on failed commits and one post-commit frame on success; stdio owns no
  hub. Authentication is warmed before byte baselines so its throttled `lastUsedAt` write is not
  confused with the tool call.
- **Expiry does not erase recovery.** `stdio.test.ts` observes the removal as Undo before
  the child advances past its receipt expiry, then `history_expired:` without a write. It
  reopens the same file sequentially: Archive retains the exact prose, Restore records one
  new action and Activity event, and a final reopen still reads them. Authentication is
  settled before the refusal's byte comparison.
- **Localhost only, both ways**: the listener binds `127.0.0.1` and the handler refuses
  foreign `Host`/`Origin`.
- **One 401**; never a message that distinguishes causes.

## Commands

```bash
pnpm dev:host                                          # then point a client at http://127.0.0.1:4310/mcp
pnpm mcp:stdio                                         # CWM_MCP_TOKEN=prototype-user-a-readwrite; refused while dev:host owns the file
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
- **The trap:** taking ownership for the stdio process's lifetime, or at start-up. It would block
  `pnpm dev:host` whenever a client such as Claude Desktop is open, and the SDK's sibling probe
  would contend with the session child. Per call is the rule; the guide's *file-store limitation*
  section is what the operator sees.
