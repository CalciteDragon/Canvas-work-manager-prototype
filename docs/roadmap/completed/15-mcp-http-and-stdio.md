<!-- completed-record id="15" closed="2026-08-29" summary="MCP over Streamable HTTP and stdio through the official SDK v2, with the client setup guide" -->
# Slice 15 — MCP HTTP endpoint (and stdio)

> **Completed record — frozen at closeout.** Status **done**, closed **2026-08-29**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.

## Outcome

**Status:** done — plan: [15-mcp-http-and-stdio.md](15-mcp-http-and-stdio.md) — official SDK v2 serves the identical fourteen-tool registry over modern `2026-07-28` Streamable HTTP and stdio; real clients list tools, create tasks, and find them in separate file-backed stores. HTTP authenticates every request, stdio reloads/authenticates every call, and the documented safe workflow avoids cross-process lost updates.

## Slice definition

**Goal:** A real MCP client can connect and drive the workspace.

**Spec:** §49, §50, §59

**Build**

- Official MCP TypeScript SDK **v2**, protocol target **2026-07-28**.
- `createMcpHandler()` mounted at `http://localhost:4310/mcp` using the SDK's modern
  HTTP serving path — do not hand-implement the protocol (§50).
- `pnpm mcp:stdio` entry registering **the identical registry** (§59).
- Bearer token → `ActorContext` via Slice 13's authenticator. (§55 said `AgentContext`;
  the spec was corrected in Slice 14 — there is one actor type, and it is the domain's.)
- `docs/mcp-setup.md`: how to point Claude Desktop / Cursor at both transports.
- **Three contract obligations inherited from Slice 14**
  ([why](../../decisions/2026-08-tool-registry-is-transport-free.md)), all of §69's list:
  `tools/list` as a real protocol response asserted against `SPEC_TOOL_NAMES`; **agent
  revocation** end to end, which needs a token and a handler in the same test because
  revocation is an authenticate-time refusal with nothing for a registry-level test to
  observe; and §60's in-process SDK-handler path itself.

**Done when** a real MCP client lists tools, creates a task, and that task is present
in `data.json` — over both HTTP and stdio.

---

## Implementation plan — Slice 15 — MCP HTTP endpoint and stdio

### Goal

A real MCP client can authenticate, list the exact Slice 14 registry, and drive the
workspace over both Streamable HTTP and stdio.

### Spec sections

§49 (MCP adapter architecture), §50 (official SDK v2 and protocol `2026-07-28`), §59
(identical HTTP/stdio tool surface), and §60 (in-process handler tests). Authentication
reuses §51's `PrototypeAgentAuthenticator`; tool execution keeps §55's corrected
`ActorContext` boundary.

### Acceptance check

The slice's *Done when* is: **"a real MCP client lists tools, creates a task, and that task
is present in `data.json` — over both HTTP and stdio."**

Run `pnpm --filter @cwm/prototype-host mcp-acceptance`. The script uses the official v2
client twice against separate temporary copies of the `agent-heavy` seed:

1. Start the real host on an ephemeral loopback port. Construct the official `Client` with
   `{ versionNegotiation: { mode: { pin: '2026-07-28' } } }`, connect it through
   `StreamableHTTPClientTransport` with an `authProvider`, and assert
   `client.getProtocolEra() === 'modern'`.
2. Assert `tools/list` is exactly `SPEC_TOOL_NAMES`; call `create_task`; close and inspect the
   temporary `data.json` for the returned task.
3. Spawn `pnpm mcp:stdio` through `StdioClientTransport`, with the same fixture token passed
   through `CWM_MCP_TOKEN`; pin the stdio `Client` to `2026-07-28`, assert its era is modern,
   and repeat the list/create/file assertions against a second temporary `data.json`.

The acceptance run opens a port only for the HTTP half. Contract tests below drive the
same SDK handler in-process and open no socket (§60).

### File-level change list

| File | Responsibility |
|---|---|
| `package.json` | Add the workspace-level `mcp:stdio` command required by §59. |
| `pnpm-lock.yaml` | Lock official v2 server, Node adapter, and client packages. |
| `apps/prototype-host/package.json` | Add `@cwm/mcp-tools`, SDK v2 runtime dependencies, client test dependency, and `mcp:stdio` / `mcp-acceptance` scripts. |
| `apps/prototype-host/api/services.ts` | Construct `WorkspaceService` beside the existing services and expose the complete `WorkManagerServices` object the identical registry needs. |
| `apps/prototype-host/mcp/server.ts` | Adapt every transport-free `WorkManagerTool` into one official `McpServer`; publish existing Zod schemas, expose `tool.permission` as reverse-DNS-style `_meta['local.canvas-work-manager/requiredPermission']`, and return JSON as both text and structured content. It receives a definition registry plus a narrow `resolveInvocation(): Promise<{ registry; actor }>` callback, so transports share definitions without freezing authentication. No repository access. |
| `apps/prototype-host/mcp/handler.ts` | Create the official `createMcpHandler()` fetch handler. An authenticated wrapper runs `PrototypeAgentAuthenticator` before every HTTP POST (including `server/discover`), maps missing/bad credentials to 401, and carries `ActorContext` into the per-request factory through a typed host-owned map keyed by a generated standard `AuthInfo.clientId`—never by casting the actor to SDK auth. Expose the official Node adapter mount with localhost Host/Origin guards. |
| `apps/prototype-host/mcp/stdio.ts` | Require `CWM_MCP_TOKEN`, then serve the same server factory with official `serveStdio`. Before **every tool call**, reload `CWM_DATA_FILE`, rebuild the domain graph/registry, and authenticate the token so permission changes and revocation made by the running UI/HTTP host affect the next stdio call. Write diagnostics only to stderr. |
| `apps/prototype-host/mcp/handler.test.ts` | Drive `createMcpHandler` with the official HTTP client transport and an in-process `fetch`; assert modern protocol negotiation, exact `tools/list`, success, permission denial, and live revocation. |
| `apps/prototype-host/mcp/stdio.test.ts` | Drive a spawned stdio server with the official client, change/revoke its connection through a separately loaded file-backed graph, and prove the next call reloads and refuses the stale credential. |
| `apps/prototype-host/router.ts` | Give the existing plain Node host one narrow `/mcp` raw-handler mount before its disposable JSON router consumes the body; all API routes remain unchanged. |
| `apps/prototype-host/main.ts` | Build one API/service graph and registry, mount the MCP Node handler at `/mcp`, and close the SDK handler during shutdown. |
| `apps/prototype-host/main.test.ts` | Through the real Node mount, pin raw `/mcp` delegation before body consumption, retention of the existing host behavior, localhost/headerless admission, and 403 rejection for untrusted Host/Origin. |
| `apps/prototype-host/scripts/mcp-acceptance.mjs` | Execute the real-client HTTP and stdio acceptance sequence and inspect both persisted files. |
| `docs/guides/mcp-setup.md` | Document localhost HTTP and stdio configuration, fixture tokens, environment variables, client examples, troubleshooting for Claude Desktop and Cursor, and the safe rule that a mutation-capable stdio process must not run concurrently with the HTTP/UI host's independently cached JSON store. |
| `README.md` | Replace the stale pre-Slice-15 statement with the two live transports and a link to the setup guide. |
| `docs/decisions/2026-08-mcp-tool-permission-metadata.md` | Record the namespaced protocol representation of the registry's declared permission. |
| `docs/decisions/2026-08-stdio-token-and-live-auth.md` | Record how a headerless stdio process receives the same prototype credential, why it reloads per call, and the remaining cross-process concurrent-write limitation. |
| `.prototype/notes.json` | Record friction observed while using both transports against real file-backed data. |
| `development.md` | Mark Slice 15 in progress at phase start and done only after both acceptance paths pass. |

### Test plan

Write these tests first and watch each new behavior fail before implementation:

1. **`lists the exact §54 registry through a modern in-process SDK handler`** — construct
   the official `Client` with pinned version negotiation, connect it through an in-process
   `StreamableHTTPClientTransport.fetch`, assert `getProtocolEra() === 'modern'`, and assert
   `listTools()` names equal `SPEC_TOOL_NAMES`. Every entry has its registry description,
   input schema, and `_meta['local.canvas-work-manager/requiredPermission']` equal to
   `tool.permission`.
2. **`creates a task through the in-process handler as the authenticated agent`** — the
   fixture bearer token reaches `PrototypeAgentAuthenticator`, `create_task` returns a
   non-error result, the task is readable from the backing store, and its activity actor is
   the agent.
3. **`returns a tool error when the live connection lacks tasks.write`** — authenticate a
   read-only fixture token and assert the next `create_task` result is `isError: true`, names
   `tasks.write`, and persists no task.
4. **`authenticates the modern probe and every later HTTP POST`** — count authenticator
   calls across `connect`, `listTools`, and `callTool`; then revoke the connection and assert
   the same client's next request fails at authentication and no tool runs.
5. **`refuses the next stdio tool call after an external live revocation`** — keep one
   official stdio client connected, revoke its connection through a second file-backed
   graph, then assert the child reloads/re-authenticates and refuses the next tool call.
6. **`requires a bearer credential on the MCP endpoint`** — absent, malformed, and unknown
   credentials receive an HTTP 401-shaped connection failure rather than falling back to a
   user persona.
7. **`delegates only /mcp to the raw SDK handler`** — host routing leaves health/API JSON,
   malformed paths, OPTIONS, and error mapping intact and gives the MCP adapter the
   unconsumed Node request/response.
8. **`guards the real localhost MCP mount`** — a valid localhost Host and a headerless
   non-browser Origin path reach MCP, while an untrusted Host or browser Origin receives
   403 before the SDK handler.
9. **`mcp-acceptance.mjs`** — real official clients pinned to the modern era prove
   list/create/file persistence over both an actual HTTP listener and a spawned stdio
   process.

The existing Slice 14 registry contract suite remains the exhaustive success/denial matrix
for all fourteen tools; this slice tests the transport seam and does not duplicate it.

### Boundaries touched

- **MCP tools call domain services, never repositories.** `mcp/server.ts` receives a
  definition `ToolRegistry` plus the narrow host callback
  `resolveInvocation(): Promise<{ registry: ToolRegistry; actor: ActorContext }>`.
  Persistence loading, authentication, and service construction stay behind that callback
  in host composition; the SDK adapter can neither see nor import repositories. The
  transport-free registry remains unchanged.
- **Domain services know no MCP.** All SDK imports live under `apps/prototype-host/mcp`.
- **Contracts are defined once.** The adapter publishes each registry tool's existing Zod
  input schema and returns existing domain/contract values; it introduces no parallel tool
  input or result types.
- **Authentication establishes identity; domain services enforce capability.** HTTP
  authenticates each protocol request; stdio reloads and authenticates each tool call.
  Neither duplicates permission checks; the registry/domain path still raises
  `PermissionDeniedError`.
- **Local tokens stay local.** HTTP remains bound to `127.0.0.1`, and the MCP mount adds the
  SDK's localhost Host/Origin validation. Stdio receives its token from the spawning local
  process environment.
- **Identical registry across transports.** Both entries call the same `createToolRegistry`
  and `createWorkManagerMcpServer` functions; no transport-specific tool list exists.

### Explicit non-goals

- No production OAuth, remote bind, TLS, cloud deployment, or durable MCP sessions (§51,
  §80).
- No legacy hand-written MCP endpoint. `createMcpHandler`, `toNodeHandler`, and `serveStdio`
  own the protocol and transports (§50, §59).
- No filtering `tools/list` by permission; Slice 14 deliberately decided discovery remains
  complete and enforcement remains in domain services.
- No output-schema expansion, annotations experiment, confirmations, or multi-round input;
  §56/§58 experiments belong to Slices 22–24.
- No live-update event stream; Slice 16.
- No changes to Angular, contracts, domain behavior, repositories, seeds, or the
  transport-free `packages/mcp-tools` registry.
- No exhaustive tests of disposable Node routing or the stdio launcher; one routing seam
  test plus the real two-transport acceptance is proportionate to §71.

### Open questions

Resolved in the plan, to be recorded after exercise:

1. **Permission metadata.** Standard MCP annotations have no permission field. Publish the
   registry declaration under the reverse-DNS-style, explicitly local Tool metadata key
   `_meta['local.canvas-work-manager/requiredPermission']`; keep the full tool list visible.
   This follows §50's target protocol's vendor-prefix recommendation and makes Slice 14's
   declaration observable without inventing a second contract or pretending a standard
   annotation means something it does not.
2. **Stdio credential and freshness.** Stdio has no header, so `CWM_MCP_TOKEN` carries the
   raw local fixture token and the adapter feeds `Bearer <value>` to the same authenticator.
   The stdio server reloads the file-backed graph before every call so changes from the
   HTTP/UI host are visible to stdio. The reverse is not true: the already-running HTTP/UI
   host keeps its own in-memory `JsonDataStore`, so it will not see a stdio-created task and
   a later host write can overwrite that task. The setup docs therefore state the safe
   prototype rule: do not run mutation-capable stdio concurrently with the HTTP/UI host;
   stop/restart the host around stdio mutation sessions. Cross-process coordination is
   explicitly outside §71/§80, so the limitation is recorded rather than papered over with
   a queue.

### Revisions

#### Round 1

The reviewer found six substantive gaps, all adopted:

- `tool.permission` was declared specifically for `tools/list` but the plan dropped it at
  the SDK boundary. It now has a namespaced `_meta` representation, a decision entry, and a
  protocol assertion.
- Stdio authentication was a startup snapshot and its already-loaded store could never see
  a later UI revocation. It now reloads and re-authenticates before each tool call, with a
  long-lived stdio revocation test and the cross-process write limitation stated honestly.
- Version pinning belongs on the SDK `Client`, not `StreamableHTTPClientTransport`; both
  acceptance clients now pin and assert the modern era, while HTTP bearer auth belongs on
  the transport's auth provider.
- `@cwm/mcp-tools` and `router.test.ts` were missing from the file checklist.
- The required localhost Host/Origin guards were promised but untested; the real Node mount
  now has explicit 403 coverage.
- The actor-to-SDK-auth bridge was underspecified. The plan now requires a 401 wrapper and a
  typed opaque `AuthInfo.clientId` lookup, plus proof that the modern probe and later POSTs
  all authenticate.

#### Round 2

The reviewer found three remaining precision defects, all adopted:

- The first `_meta` name used a generic `canvas/` prefix; the 2026-07-28 metadata guidance
  recommends reverse-DNS vendor prefixes. It is now the explicitly local
  `local.canvas-work-manager/requiredPermission` everywhere.
- The boundary prose still claimed the adapter received only a static registry, contradicting
  stdio's fresh-per-call execution design. It now names the exact narrow
  `resolveInvocation()` dependency and keeps persistence/auth composition behind it.
- “Cross-process write race” understated the failure: the long-running HTTP host cannot see
  stdio writes and can later overwrite them. The decision and setup docs now require
  mutation-capable transports to run separately in this prototype.

### Implementation deviations

- The raw mount regression lives in `main.test.ts`, not `router.test.ts`. It needs a real
  Node request to prove the body remains unread and the SDK Host/Origin guards write the
  actual response; keeping those assertions together is stronger than a mocked router unit.
- The acceptance runner still launches the host entry with `node --import tsx` so it can
  capture the OS-assigned port from stdout, but the stdio half deliberately goes through
  the public root `pnpm mcp:stdio` entry. Both clients pin and assert the modern era.

### Step 4 review

Three reviewers ran against the actual diff: correctness, spec/boundaries, and
acceptance/living documentation. Their first pass found no architectural violation, but it
did find five completion defects, all fixed and re-reviewed:

- §60's in-process HTTP contracts used temporary JSON files. They now build the complete
  service/authenticator graph over `InMemoryDataStore`; real files remain only where the
  acceptance and stdio cross-process test earn them.
- Acceptance hard-coded port 4397 and could hang after an early child exit. The host now
  reports its actual bound port, acceptance asks the OS for port 0, parses that port, and
  bounds both graceful and forced cleanup—including the startup-timeout path.
- Acceptance spawned `mcp/stdio.ts` directly instead of exercising the required root
  `pnpm mcp:stdio` entry. It now uses the public command with silent lifecycle output, so
  stdout remains protocol-only.
- `README.md` still said MCP did not exist. It now describes both transports and points to
  `docs/guides/mcp-setup.md`.
- The plan named `router.test.ts`, while the real raw-body/guard coverage landed in
  `main.test.ts`. The checklist and deviation record now describe the stronger real-Node
  test that actually exists.

All three re-review passes returned **no substantive findings**. The phase was exercised
with official v2 clients over a real HTTP listener and a spawned stdio process; both pinned
and negotiated `2026-07-28`, listed `SPEC_TOOL_NAMES`, created a task, and proved its id and
title were present in the corresponding `data.json`. Friction is recorded in
`.prototype/notes.json`.
