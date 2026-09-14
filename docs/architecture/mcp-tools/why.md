# Why the tool registry exists

## The problem it solves

MCP is a product experiment here, not an integration (§48): the questions are which tools
agents reach for, which confuse them, and how much context a tool should return (§2, §56).
Those questions are about tool *semantics*, and semantics tested only through a running
server would be slow to change and impossible to test without a socket (§60). So the tool
set is a plain package of definitions over the domain services, and the protocol is
someone else's job.

## Forces

- **Tools must be testable in-process** (§60), with every success and every
  permission-denied path covered, or a change to one is a change nobody can verify
  cheaply.
- **Two transports must serve one list** (§59). A registry that belonged to the HTTP
  server would have to be duplicated for stdio.
- **Permissions are enforced in the domain** (§53). A second check in the registry would
  be a second source of truth, and the first to drift would be the one no test covered.
- **Combined reads need more than one grant** (§54): a page that returns tasks and
  reflections cannot be readable under `projects.read` alone.

## The shape, and the alternatives rejected

**No SDK in this package.** Slice 14 built the registry without the MCP SDK and Slice 15
mounted it; the deferral is recorded with the three obligations it moved
([decision](../../decisions/2026-08-tool-registry-is-transport-free.md)). Rejected: an
in-process SDK handler in the registry's tests — it would have made the registry depend
on the transport it exists to be independent of.

**The registry declares, the domain enforces.** `WorkManagerTool.permission` and
`additionalPermissions` are metadata; `execute` calls a service that asserts them.
`contract.test.ts` pins the two together from both sides: success is asserted under
**exactly** the declared grants, which proves each grant sufficient and not only
necessary. That test is what forced `WorkspaceService` into existence — composing the
checked services inside `search_workspace` would have demanded three grants where §53's
grid offers one ([decision](../../decisions/2026-08-workspace-tools-need-their-own-service.md)).

**Canvas placement is part of the create call.** `create_section` and
`add_section_shortcut` accept the same optional `position` defined by the shared contracts;
the domain inserts and renumbers atomically under their existing `projects.write` grant. A
tool-level create-then-move sequence was rejected because it would record two mutations for one
placement. The caller-selected insertion follows the approved direct-editing direction
([decision](../../decisions/2026-09-direct-canvas-editing-direction.md)), with its atomic
positioning rule recorded in [contextual insertion names its position](../../decisions/2026-09-contextual-insertion-names-its-position.md).
Sections and Home shortcuts still share one ordering rule
([decision](../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md)).

**Permission metadata is namespaced.** Every tool advertises
`_meta["local.canvas-work-manager/requiredPermission"]` and the complete list under
`requiredPermissions` beside it, so a client can show what a tool needs before calling it
([decision](../../decisions/2026-08-mcp-tool-permission-metadata.md)).

**`execute` receives domain services and nothing else.** No unit of work, no clock, no
seed, no repository — a tool that could read storage directly would be a second place
where scoping and grants have to be remembered. `check-package-imports.mjs` with
`--allow @cwm/contracts,@cwm/domain,zod` makes that mechanical.

**An unknown tool name is its own error**, not `EntityNotFoundError`: the tool list is
public and unfiltered, so there is nothing to hide, and the host maps it to MCP's own
unknown-tool response.

**Combined reads are refused outright**, never answered with the half that was allowed:
`get_project_todos` declares `projects.read` and `tasks.read`; Archive and the journal add
`reflections.read`. The denial names the missing grant.

## Consequences

- Adding a tool is one file in `src/tools/`, one registry line, and one contract case —
  and the suite fails until the case exists.
- The tool count grew from §54's fourteen to thirty-four as the section, page,
  shortcut, archive, journal and Undo tools arrived; each arrived with its slice, and the list
  in `SPEC_TOOL_NAMES` is what the host's `tools/list` test asserts against.
- Tool experiments (§56 — `complete_task` versus `update_task(status)`, combined versus
  separate search) can be run by adding a variant here and comparing real clients, without
  touching the transport. Slice 24 owns that.
- `workspace.read` became a partial superset of three read grants and produces a dead
  end — reflection hits an agent cannot open. Recorded, not designed around; a real client
  is what will show whether it matters.

## Decisions that shape this system

- [What the tool registry knows about MCP](../../decisions/2026-08-tool-registry-is-transport-free.md)
- [MCP tools advertise their required permission in namespaced metadata](../../decisions/2026-08-mcp-tool-permission-metadata.md)
- [Why `workspace.read` needed a service of its own](../../decisions/2026-08-workspace-tools-need-their-own-service.md)
- [Where the agent permission model is enforced](../../decisions/2026-08-permissions-live-on-the-actor.md)
- [A section has a name](../../decisions/2026-09-a-section-has-a-name.md) — `list_sections` returns the stored `title`, deliberately not a resolved name
- [Home orders sections and shortcuts together](../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md) — one combined index space for sections and shortcuts
- [Direct canvas editing is the next development direction](../../decisions/2026-09-direct-canvas-editing-direction.md) — accepted contextual insertion
- [A section removal commits one scoped, expiring Undo record](../../decisions/2026-09-section-removal-undo-records.md) — `remove_section` receipts, `undo_operation`, reason-token refusal messages
- [Disposable removal and immediate canvas Undo](../../decisions/2026-09-disposable-removal-and-immediate-undo.md) — safe deletion and exact-actor recovery after a lost response

## Spec sections

§48 goals · §49 architecture · §54 initial tools (and the roots/work-units/pages
additions) · §55 experimental tool registry · §56 tool experiments · §60 tests without a
server.
