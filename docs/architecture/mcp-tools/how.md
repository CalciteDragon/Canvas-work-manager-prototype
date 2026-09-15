# How the tool registry works

## Runtime flow

1. The host calls `createToolRegistry` once with the `WorkManagerServices` that
   `createApi` built — projects, pages, todos, archive, journal, tasks, reflections,
   sections, shortcuts, dashboard, workspace, undo.
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

## Section and shortcut creation

`create_section` and `add_section_shortcut` extend their inputs from
`@cwm/contracts`; each accepts an optional zero-based `position` in the destination page's
combined section/shortcut order. A position beyond the current end is clamped to the end, and
omitting it appends. Both tools keep their declared `projects.write` permission and call the
matching domain service, which commits the insert and renumbering together. The contract tests
exercise each tool at a specified position under exactly that grant.

## Section write receipts and `undo_operation`

`create_section` returns `{ section, undo }`; `move_section` and `update_section` return the
same envelope with `undo: null` for a normalized no-op. `move_section` targets the zero-based
combined section/shortcut order and records one placement operation. `update_section` records
only normalized title, config, collapse and span fields that changed. Every successful explicit
write records one activity event and one sequence-ordered receipt; automatic row-container
creation stays receipt-free. The receipt exposes no inverse data.

## Removal receipts and `undo_operation`

`remove_section` returns `SectionRemovalResult`: a final archived-shaped section snapshot and a
receipt whose `undoId` `undo_operation` accepts. Disposable views and empty sections may be
deleted; the result snapshot does not claim that the section is still stored. If the response is
lost, repeating `remove_section` for that id on the same connection returns a refusal containing
the exact actor's newest outstanding `undoId` and `expiresAt`, without another write. It does so
for a hard-deleted section only after the write grant and workspace visibility checks. Other
actors see not-found, and consumed, expired, pruned or superseded receipts are not revived.

The MCP transport carries refusal text rather than typed `details`, so every Undo refusal message
starts with its reason token — `section_already_removed:`, `undo_consumed:`, `undo_expired:`,
`undo_conflict:`, `undo_blocked:`, `undo_unavailable:` — and tool descriptions explain the
recovery path. Conflict text includes current names with ids and actionable next steps, capped at
five conflicts; blocked text names the blocking project. A receipt issued to another connection,
even of the same person, is not found. `contract.test.ts` pins the minimal grant, receipt recovery
and scope; the host's `handler.test.ts` pins the message over the real transport.

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
- **`get_project_archive` returns the domain projection unchanged.** Its description tells an
  agent that section entries are content-only, what `contentCount` and `cascadeCount` mean, and
  that a zero-cascade container is restored before its own archived rows; its contract case
  seeds a removed view, removed prose and a cascaded container so the metadata is observed.
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
