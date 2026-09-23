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

## Write receipts and the history tools

`create_section` returns `{ section, operation }`; `move_section` and `update_section` return the
same envelope with `operation: null` for a normalized no-op. `move_section` targets the zero-based
combined section/shortcut order and records one placement operation. `update_section` records
only normalized title, config, collapse and span fields that changed. Every successful explicit
write records one activity event and one action in the connection's own history for the section's
project, and returns its receipt — `historyId`, `actionId`, `revision`, operation, label and
lifetime; a container created automatically for a row gets no receipt of its own, because it joins
that row's one action and receipt. The receipt exposes no payload.

`set_project_page_enabled` returns `{ page, operation }`: a `page.add` receipt when the call created
the record — §26's first enable — a `page.update` receipt when it moved an existing boolean, and
`operation: null` when the page was already where the call asked it to go. Undoing a `page.add`
removes that page again, while it is unchanged and nothing on it references it; undoing a
`page.update` writes the boolean back and touches nothing else. The action belongs to the owning
root's history whatever route the toggle came from. A toggle still succeeds while the project is
archived, so Open archive stays reachable; a page **transition** does not.

`update_project`, `archive_project` and `restore_project` return `{ project, operation }`: a
`project.archive` receipt when the status entered `archived`, `project.reactivate` when it left it,
`project.update` for every other change — completion, reparenting, layout and progress settings
included — and `operation: null` when nothing changed, archiving an archived project included. The
action belongs to the **subject** project's own history, even when a reparent moves it to another
root. Its Undo writes back exactly the recorded fields after re-running the parent, cycle,
archived-ancestry and live-child rules; an archive's Undo, a reactivation's Redo and an edit made
while archived may run while that project is archived, but an archived ancestor still blocks.
`create_project` still returns the bare project and records nothing.

`restore_section` returns `{ section, operation }` too, with `operation: null` for a repeat on a
live section: Archive Restore still needs no receipt to invoke and still never expires, and
recording it only means the same connection can take it back. `add_section_shortcut` returns
`{ shortcut, operation }` and `remove_section_shortcut` returns
`{ shortcutId, projectId, pageId, operation }` — there is no placement left to return — and both
record into the **destination** root project's history, never the source's. Section duplication and
shortcut resize, collapse and move have no tool of their own; they stay HTTP-and-domain operations,
so the registry still holds thirty-seven tools.

Task tools return `{ task, operation }` and reflection tools return `{ reflection, operation }`;
their receipts enter the same history as section writes. Compound row Add owns an implicitly
created container so Undo/Redo removes and restores both under the row family's one write grant.

`get_operation_history` (`projects.read`) reads that connection's summary for a project: the next
Undo and Redo actions, or `null`, each with its own step `blockedBy`, the revision and the
project-level archived blocker; its description tells an agent which one decides a step (Slice 41). `undo_operation` and
`redo_operation` take `{ historyId, actionId, expectedRevision }` — strict, so the
retired `{ undoId }` form is rejected — and call `OperationHistoryService.transition` with their
fixed direction. The result is `{ direction, actionId, result, summary }`. Their permission
declaration maps the stored action family to `projects.write`, `tasks.write` or
`reflections.write` — with the fourth, fifth and sixth families, a shortcut placement, an optional
page and an existing project's own write, all naming `projects.write`; a write-only caller can chain
from receipts and returned summaries. Four families naming one grant is why the coverage helper behind that declaration de-duplicates:
`tools/list` must not say a caller needs one grant twice.

## Removal receipts

`remove_section` returns `SectionRemovalResult`: a final archived-shaped section snapshot, an
operation receipt `undo_operation` accepts, and `archiveListed`. Disposable views and empty
sections may be deleted; the result snapshot does not claim that the section is still stored.
`archiveListed` is true only when `get_project_archive` will list the section, which is false for
a deleted one and also for one kept solely because a shortcut or an archived row still names it. If the response is
lost, repeating `remove_section` for that id on the same connection returns a refusal naming the
removal's `historyId`, `actionId`, current `expectedRevision` and `expiresAt`, without another
write — while that removal is still the connection's applied, unexpired action and no later removal
advanced the section's generation. It does so for a hard-deleted section only after the write grant
and workspace visibility checks. Other actors see not-found.

The MCP transport carries refusal text rather than typed `details`, so every refusal message starts
with its reason token — `section_already_removed:`, `history_not_next:`,
`history_revision_stale:`, `history_expired:`, `history_blocked:`, `history_conflict:`,
`history_unavailable:`, `history_retired:` — and the tool descriptions list them with the recovery
path. A replayed call whose first attempt landed refuses `history_revision_stale:`, and
`get_operation_history` then shows the revision advanced. Conflict text includes current names with
ids, capped at five; blocked text names the blocking project. A history belonging to another
connection, even of the same person, is not found. `contract.test.ts` pins the minimal grants, the
ordered chain, receipt recovery and scope; the host's `handler.test.ts` pins the messages, the
chain and revocation over the real transport.

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
