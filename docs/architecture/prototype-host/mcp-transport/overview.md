# MCP transport

How the tool registry reaches a real agent (§49–§51, §59): the official MCP TypeScript
SDK v2 targeting protocol `2026-07-28`, mounted at `http://127.0.0.1:4310/mcp` over
Streamable HTTP and served identically over stdio by `pnpm mcp:stdio`; and the
bearer-token authenticator that turns `Authorization: Bearer prototype-user-a-readwrite`
into an agent `ActorContext` whose permissions are re-read from the live connection on
every call. The protocol is never hand-implemented (§50).

**Code:** `apps/prototype-host/mcp` (`handler.ts`, `server.ts`, `stdio.ts`) and
`apps/prototype-host/auth/prototype-agent-authenticator.ts` · **Tests:** `mcp/handler.test.ts`,
`mcp/stdio.test.ts`, `auth/prototype-agent-authenticator.test.ts`, and
`scripts/mcp-acceptance.mjs` against real clients · **Parent:** [prototype-host](../overview.md)
· **Client setup:** [the MCP guide](../../../guides/mcp-setup.md)

## Responsibilities

- Build the SDK server over the registry: `tools/list` from `registry.list()` with namespaced
  permission metadata, including the operation-family map used by Undo and Redo;
  `tools/call` through `registry.call`.
- Authenticate every HTTP request and every stdio call: unknown, deleted and revoked
  tokens all fail with the same 401, deliberately without saying which.
- Refuse non-localhost `Host` and `Origin` headers with 403 before protocol negotiation.
- Stdio: read `CWM_MCP_TOKEN`, reload the data file and re-authenticate before each call,
  run one call at a time within the process, keep protocol data on stdout and diagnostics on
  stderr.
- Stdio: own the data file for each call's turn (Slice 54), so two stdio processes take turns
  and a call is refused with `data_file_in_use:` while a host owns the file.
- An SDK stdio test with one injected host clock proves a removal's Undo expires while Archive
  keeps its prose and Activity readable through restart and canonical Restore.
- SDK clients over both transports prove failed task and Undo commits leave the canonical file,
  Activity and history unchanged; a response lost after a committed Undo is recovered by reading
  history and is refused at the old revision. HTTP additionally proves no frame for a failed
  commit and one already-committed frame for a successful call.

## Not responsible for

- Tool semantics and input schemas — [mcp-tools](../../mcp-tools/overview.md).
- Permission enforcement — the domain asserts; the token only carries the grants.
- Choosing a transition grant from caller input — the domain derives it from the stored action,
  and discovery only describes that rule.
- Reaching the browser: a stdio process owns a separate store and cannot publish to the
  running host's hub ([live-updates](../live-updates/overview.md)). The owner record makes stdio
  and the host take turns; it does not make stdio writes live.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
