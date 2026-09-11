# How the tool registry works

## Runtime flow

1. The host calls `createToolRegistry` once with the `WorkManagerServices` that
   `createApi` built — projects, pages, todos, archive, journal, tasks, reflections,
   sections, shortcuts, dashboard, workspace.
2. `registry.list()` gives the host what it publishes in `tools/list`: name, description,
   the input schema as JSON Schema, and the permission metadata under
   `_meta["local.canvas-work-manager/…"]`.
3. On `tools/call` the host has already resolved the bearer token to an `ActorContext`;
   it calls `registry.call(name, input, { actor })`.
4. The registry finds the tool (or throws `UnknownToolError`), parses the input with the
   tool's Zod schema, and runs `execute`, which calls a domain service.
5. A domain error becomes a tool error with the domain's message — a denial reads
   `connection "agent-claude" is missing permission "tasks.read"` — and never partial
   structured content.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `WorkManagerTool` | interface | Name, description, `permission`, `additionalPermissions`, `inputSchema`, `execute` | [API](../../api/interfaces/WorkManagerTool.html) |
| `ToolContext` | interface | What `execute` receives: the actor | [API](../../api/interfaces/ToolContext.html) |
| `WorkManagerServices` | interface | The domain services a registry is built over | [API](../../api/interfaces/WorkManagerServices.html) |
| `ToolRegistry` | interface | `list`, `get`, `call` | [API](../../api/interfaces/ToolRegistry.html) |
| `createToolRegistry` | function | Builds the registry in `SPEC_TOOL_NAMES` order | [API](../../api/miscellaneous/variables.html#createToolRegistry) |
| `SPEC_TOOL_NAMES` | const | The one list of tool names, asserted by the host's `tools/list` test | [API](../../api/miscellaneous/variables.html#SPEC_TOOL_NAMES) |
| `UnknownToolError` | class | A name not in the registry | [API](../../api/classes/UnknownToolError.html) |

## Dependencies

**Depends on**

- [domain](../domain/overview.md) — every `execute` calls a service; errors are the
  domain's three.
- [contracts](../contracts/overview.md) — input schemas are the `Create*`/`Update*`
  inputs and queries; results are contract shapes.
- `zod` for the schemas.

**Depended on by**

- [prototype-host / mcp-transport](../prototype-host/mcp-transport/overview.md) — mounts
  the registry over Streamable HTTP and stdio.

## Invariants and lints

- **Imports:** only contracts, domain and zod — `check-package-imports.mjs --allow
  @cwm/contracts,@cwm/domain,zod` in `pnpm --filter @cwm/mcp-tools lint`.
- **Every tool has a contract case** — `contract.test.ts` iterates `registry.list()` and
  fails on a tool with no case. Each case runs the tool under exactly its declared grants
  (success), once per declared grant with that grant removed (denial), and asserts whether
  the store persisted (`mutates`).
- **Inputs that genuinely change**: a contract case must pick an input whose effect is
  observable — `complete_task` on an already-done task is idempotent and would pass a
  "still there" assertion having done nothing.
- **Foreign ids are not found, not forbidden**: the harness injects a foreign-workspace
  project because `agent-heavy` has none, so the branch is really tested.
- **The list is public**: `list()` is not filtered by grant; a client sees every tool and
  the metadata says what each needs.

## Commands

```bash
pnpm --filter @cwm/mcp-tools test   # registry, contract, activity and error suites — no server
pnpm --filter @cwm/mcp-tools lint   # tsc and the import allowlist
```

## Changing it

- **A new tool:** a definition in the right `src/tools/*.ts` (or a new file for a new
  group), its name in `SPEC_TOOL_NAMES`, and a `contract.test.ts` case — the suite tells
  you which is missing. Declare `additionalPermissions` if the result spans categories.
  Then the [MCP setup guide](../../guides/mcp-setup.md) if a client needs to know about it.
- **A tool-shape experiment (§56):** add the variant beside the original, run real
  clients at both, write the decision entry, delete the loser.
- **The trap:** answering a combined read with the part the caller may see. §54 says
  refuse; the contract suite's per-grant denial catches a tool that forgets.
