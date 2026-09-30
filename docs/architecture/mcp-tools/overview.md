# MCP tools

The 38-tool registry includes `list_archived_projects`, a workspace-scoped `projects.read` query.
`get_project_archive` returns only currently restorable archived items; `restore_project` keeps
the explicit status and `projects.write` requirement.

`@cwm/mcp-tools` is the transport-free registry of the tools an agent can call (§54–§55):
thirty-eight `WorkManagerTool` definitions — name, description, required permission(s),
Zod input schema, `execute` — over the domain services, in a stable order. It knows
nothing about MCP itself: no SDK, no transport, no server. The host mounts the same
registry over Streamable HTTP and over stdio, and the contract tests exercise every tool
with no socket open (§60).

`create_project` returns the created project with its `project.add` receipt. The existing
`get_operation_history`, `undo_operation` and `redo_operation` tools make creation Undo and its
same-id Redo available over both transports without adding registry entries.

**Code:** `packages/mcp-tools/src` · **Tests:** `packages/mcp-tools/src/*.test.ts` with
`test/harness.ts` (vitest) · **Package:** `@cwm/mcp-tools` · **Depends on:**
`@cwm/contracts`, `@cwm/domain`, `zod`

## Responsibilities

- Define each tool once, with the input schema the host publishes in `tools/list` and
  validates on `tools/call`.
- Declare each tool's static permission, combined-read grants, or history-family grant map as
  metadata — while the domain, not the registry, enforces it.
- Call domain services and nothing else: no repository, no unit of work, no clock.
- Map domain errors to tool-level failures a client can read, including the exact
  missing-grant message.
- Guarantee that every tool has a contract test: the suite iterates the registry.

## Not responsible for

- Protocol, transport, authentication and session handling —
  [prototype-host / mcp-transport](../prototype-host/mcp-transport/overview.md).
- The rules the tools invoke — [domain](../domain/overview.md).
- Client configuration — [the MCP setup guide](../../guides/mcp-setup.md).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
