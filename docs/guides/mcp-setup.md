# MCP setup

Canvas Work Manager serves the same thirty-seven tools over Streamable HTTP and stdio (§59) —
§54's fourteen, the five section-edit/removal tools the canvas needs, §54's three page tools, Slice 25.4's
three shortcut tools, Slice 25.6's eight archive/recovery tools, Slice 25.7's journal tool, and
Slices 35–36's history tools `get_operation_history`, `undo_operation` and `redo_operation`.
Both use the fake local credentials from the `agent-heavy` seed; they have no security value
and the HTTP host binds only to `127.0.0.1`.

## Prepare the workspace

From the repository root:

```powershell
pnpm install
pnpm prototype:seed agent-heavy
```

Useful fixture tokens:

| Token | Connection | Grants |
|---|---|---|
| `prototype-user-a-readwrite` | Claude | project reads; task/reflection reads and writes; workspace reads |
| `prototype-user-a-readonly` | Cursor | project/task reads |
| `prototype-user-a-revoked` | Retired assistant | always refused |

Every listed tool advertises its grant under
`_meta["local.canvas-work-manager/requiredPermission"]`, and the **complete** list under
`_meta["local.canvas-work-manager/requiredPermissions"]` beside it. The two agree for every tool
that needs one grant; §54's derived pages need more than one, and `get_project_todos` is the first
— it declares `["projects.read", "tasks.read"]`. Denied calls also name the missing permission in
their tool error, and a derived page is refused outright rather than answering with the half it was
allowed to read. `get_project_archive` is the other combined read: it declares
`["projects.read", "tasks.read", "reflections.read"]` and remains queryable when the Archive
tab is disabled.

## Streamable HTTP

Start the application normally — two terminals:

```powershell
pnpm dev:web
```

```powershell
pnpm dev:host
```

The MCP endpoint is `http://127.0.0.1:4310/mcp`. It requires this header on every request:

```text
Authorization: Bearer prototype-user-a-readwrite
```

Cursor reads project configuration from `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "canvas-work-manager-http": {
      "url": "http://127.0.0.1:4310/mcp",
      "headers": {
        "Authorization": "Bearer prototype-user-a-readwrite"
      }
    }
  }
}
```

Claude clients that accept JSON MCP configuration use the equivalent HTTP entry:

```json
{
  "mcpServers": {
    "canvas-work-manager-http": {
      "type": "http",
      "url": "http://127.0.0.1:4310/mcp",
      "headers": {
        "Authorization": "Bearer prototype-user-a-readwrite"
      }
    }
  }
}
```

For Claude Code, the same configuration can be added directly:

```powershell
claude mcp add --transport http --header "Authorization: Bearer prototype-user-a-readwrite" canvas-work-manager-http http://127.0.0.1:4310/mcp
```

Claude Desktop builds that do not accept local HTTP entries should use stdio below.

## Stdio

Stdio clients spawn the root command and pass the raw token in `CWM_MCP_TOKEN`. Replace
`C:\absolute\path\to\Canvas work manager prototype` with this checkout's absolute path.

Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`) both accept:

```json
{
  "mcpServers": {
    "canvas-work-manager-stdio": {
      "command": "pnpm",
      "args": [
        "--dir",
        "C:\\absolute\\path\\to\\Canvas work manager prototype",
        "mcp:stdio"
      ],
      "env": {
        "CWM_MCP_TOKEN": "prototype-user-a-readwrite"
      }
    }
  }
}
```

If the client cannot find `pnpm`, replace `command` with the absolute path reported by
`Get-Command pnpm`. Set `CWM_DATA_FILE` in `env` only when intentionally using a non-default
prototype file.

### Name the sections you create

`create_section` takes a `title` alongside `type`, and naming at creation is the more natural
path; `update_section` renames one afterwards. Both trim what they are given and refuse a
whitespace-only name, and `update_section` with `title: null` clears the override so the
section falls back to its type's display name.

An agent that names the sections it creates is the difference between a legible canvas and
seven identical frames — a person looking at three `Task List` headers cannot tell which one
an agent filled. Note that `list_sections` returns the stored `title` and not a resolved
name, so a section with no `title` has no name in the tool output to read back; that is
deliberate ([why](../decisions/2026-09-a-section-has-a-name.md)).

### Insert a section at a chosen position

`create_section` accepts an optional zero-based `position` in the destination page's combined
placement order. On a root Home page, that order includes both sections and shortcuts; on other
section-bearing pages it includes the sections there. Omit `position` to append, or give a value
beyond the current end to insert at the end. For example, `position: 0` inserts before the first
placement. The insertion and renumbering happen as one `projects.write` operation.

`move_section` uses the same combined order and returns `{ section, operation }`; `update_section`
returns that envelope for title, config, collapse and span changes. An unchanged update, or a move
clamped to the section's current position, returns the current section with `operation: null` and
records nothing to undo. Every other section write records one action in **your connection's own
history for that project** and returns its receipt `{ historyId, actionId, operation, revision,
label, createdAt, expiresAt }`; see [Undo and Redo](#undo-and-redo). Add Undo removes only the
created section, move Undo restores its surviving neighbours, and update Undo restores only the
fields recorded by that update; Redo reapplies exactly what the write did. Receipts carry ids and a
revision, not inverse data. Automatic Reflections/Tasks container creation is intentionally
receipt-free.

### Say which kind of project, and which page

`create_project` takes a required `kind`. A **root** is a workspace: it starts with a Home page
and can turn on Todos, Archive and Reflections. A **subproject** is a unit of work with exactly
one work canvas, requires `parentProjectId`, and has no pages to configure — nesting goes to any
depth. A root naming a parent, or a subproject without one, is refused rather than reinterpreted,
so a call that means one of the two cannot quietly produce the other.

`list_project_pages` shows what a project owns, including a page that is switched off; a disabled
page keeps its sections and everything referring to them and is simply not navigation.
`set_project_page_enabled` turns one of a root's optional three on or off, and the first enable
is what creates it. Home cannot be disabled.

It answers `{ page, operation }`. Which receipt you get says which write happened:

```jsonc
// First enable — the call that created the record.
{ "page": { "id": "projectPage-4f1c9a2e", "kind": "reflections", "enabled": true, "…": "…" },
  "operation": { "historyId": "history-b7d30e51", "actionId": "operation-9a6e2c14", "operation": "page.add",
                 "revision": 1, "label": "Enabled the reflections page", "…": "…" } }

// A later toggle — the record already existed, so only the switch moved.
{ "page": { "id": "projectPage-4f1c9a2e", "enabled": false, "…": "…" },
  "operation": { "operation": "page.update", "label": "Disabled the reflections page", "…": "…" } }

// Already where you asked: nothing was written, so there is nothing to undo.
{ "page": { "id": "projectPage-4f1c9a2e", "enabled": false, "…": "…" }, "operation": null }
```

Undoing a `page.add` **removes** the page it created — the same id, and only while the record is
unchanged and nothing on it refers to it; a section on the page, live or archived, or a shortcut
placement, refuses the whole call and tells you to remove that reference first. Redo brings the same
page id back. Undoing a `page.update` writes the switch back and touches nothing else, so sections,
rows and layout survive both directions. A toggle still works while the project is archived, because
§31 keeps Open archive reachable; undoing one does not — the transition answers
`history_blocked:` until the project is reactivated.

`update_project`, `archive_project` and `restore_project` answer `{ project, operation }` too. The
receipt says how the status moved, and it belongs to **that project's** own history — a
sub-project's, not its root's, even when the call moved it to another root:

```jsonc
// A rename, a completion, a move or a layout/progress change. The label names the edit:
// Renamed "Kitchen" to "Kitchen remodel", Completed "Kitchen", Moved "Kitchen" under Garden, or
// Edited "Kitchen" when one call changed several things.
{ "project": { "id": "project-kitchen", "name": "Kitchen remodel", "…": "…" },
  "operation": { "historyId": "history-5d0c2a91", "actionId": "operation-31e8b7f0", "operation": "project.update",
                 "revision": 1, "label": "Renamed \"Kitchen\" to \"Kitchen remodel\"", "…": "…" } }

// archive_project, or a status that entered archived.
{ "project": { "status": "archived", "…": "…" }, "operation": { "operation": "project.archive", "…": "…" } }

// restore_project, or any status that left archived.
{ "project": { "status": "active", "…": "…" }, "operation": { "operation": "project.reactivate", "…": "…" } }

// Nothing changed — archiving an archived project, or setting what is already there.
{ "project": { "…": "…" }, "operation": null }
```

Undo writes back exactly the fields that call changed, completion time included, and leaves any other
field someone changed since alone; a later change to one of the same fields refuses. Reversing a move
re-checks the destination the way a new move would: it must still exist, must not sit beneath the
project, and must not be under anything archived. Redoing an archive — or undoing a reactivation —
refuses while the project has a live sub-project, because archiving never cascades. One narrow
exception to the archive freeze applies here and nowhere else: a project's **own** archive can be
undone, its reactivation redone, and an edit made while it was archived undone or redone, while that
same project is archived — but an archived **ancestor** still answers `history_blocked:`.
`get_operation_history`'s top-level `blockedBy` still names the archived project; the entry's own
`blockedBy` is what says whether that one step may run (`null` for the archive's own Undo). `restore_project` itself needs
no receipt, however long ago the project was archived. `create_project` still answers the bare project
and records nothing.

### Todos

Slice 25.5 adds `get_project_todos` (`projects.read` **and** `tasks.read`): the whole chronology
under one root project — its own tasks plus every descendant unit of work and every descendant
task — ordered by due date, undated last, ties broken by kind then id. A unit of work's date-only
due date sorts at the end of that UTC day.

Rows keep their status and stay on the list once finished, done and cancelled alike; archived rows,
archived containers and anything beneath an archived project are excluded. Each row carries the
canonical project, page and container that owns it, so an agent can complete what it finds with
`complete_task` or `update_project` — the same operation a person uses on the canvas. Reading the
chronology neither creates the Todos page nor depends on it being switched on.

### Archive

Slice 25.6 adds `get_project_archive` (`projects.read`, `tasks.read` and `reflections.read`):
the root-wide recovery projection across archived and effectively hidden subprojects, sections,
tasks and reflections. Each item carries its owning project/page/container breadcrumb, archive
cause, and the current blocker or canonical restore operation. It remains queryable when the
Archive page is disabled and does not create the page.

Since Slice 29 section entries are **content-only**: removed Progress, Timeline, Recent Activity
and Sub-Projects views, blank Notes (including one created with no `config`, which stores `{}`)
and containers emptied by reassignment are retained in storage but not listed. Each listed section
carries `recovery` — `owned-content` (with `ownedData`; `contentCount`, every row still in the
container; and `separateRestoreCount`, the row restores still needed after the section's own),
`config` (Notes prose) or `unknown` (a type or config the prototype cannot read as empty) — beside
`cascadeCount`, exactly the rows that `restore_section` brings back. An *archived* container
(`restoration` ready or blocked) with a `separateRestoreCount` above zero holds rows archived on
their own: call `restore_section` first, then `restore_task` / `restore_reflection` for each row
entry that becomes ready (a parent task brings back the subtasks archived with it). A live
container hidden beneath an archived project has `restoration.kind: "not-archived"`; nothing in it
needs restoring — reactivate the project its blocker names.

The matching canonical writes are `archive_project` / `restore_project`, `remove_section` /
`restore_section`, `archive_task` / `restore_task`, and `archive_reflection` /
`restore_reflection`. Project restoration requires an explicit non-archived status; restoring a
section or row restores exactly the members marked as taken down by that operation, leaving
independently archived work archived.

`restore_section` answers `{ section, operation }`. It still needs no receipt to invoke and never
expires — it remains the way back once Undo no longer is — but a restore that changed something now
carries a receipt of its own, so you can take the restore back before undoing the removal beneath
it. A repeat on a live section answers `operation: null` and writes nothing.

### Undo and Redo

Every connection has its own Undo/Redo **history per project**: a stack of its section, shortcut, page, task and
reflection writes there, with a cursor. A person's history and every other connection's are separate — you can
never undo someone else's change, and nobody can undo yours.

- `get_operation_history` (`projects.read`, input `{ projectId }`) returns
  `{ projectId, historyId, revision, undo, redo, blockedBy }`. `undo` and `redo` name the next
  action in each direction — `{ actionId, operation, label, expiresAt, blockedBy }` — or `null` at
  either end. An entry's `blockedBy` is that step's own blocker (`{ projectId, title }` of the archived
  project a transition would refuse for, or `null`); the top-level `blockedBy` describes the project.
  `historyId` is `null` until the connection's first undoable write in that project.
- `undo_operation` and `redo_operation` (input `{ historyId, actionId, expectedRevision }`) run
  exactly that action, which must be the next one in that direction. They require only the stored
  action family's grant: `projects.write` for a section, a Home shortcut placement, an optional
  page or a project's own update, archive or reactivation, `tasks.write` for a task,
  `reflections.write` for a reflection. Discovery publishes
  that mapping under `_meta["local.canvas-work-manager/requiredPermissionsByOperationFamily"]`.
  Pass the history's current `revision`: a receipt's, or `get_operation_history`'s if anything
  happened since. The result is `{ direction, actionId, result, summary }`.

Only the newest applied action can be undone and only the most recently undone one redone, so
undo several changes in order. Any new undoable write in the project discards what was waiting to
be redone. An action is available for 24 hours; each history keeps its newest 50.

`remove_section` (`projects.write`) returns `{ section, operation, archiveListed }`: an
archived-shaped final section snapshot and the receipt. A disposable section may already be absent
from storage; the response snapshot is not evidence it remains there. Undo returns the section
between the neighbours it left (Archive Restore appends instead), with exactly the rows the removal
archived or moved, while later non-structural edits such as renamed tasks are kept; Redo re-removes
exactly those rows again, and refuses rather than sweep in a task added since.

If the remove response was lost, repeating `remove_section` for the same id is still a refusal.
While that removal is still your connection's applied, unexpired action, `section_already_removed:`
names its `historyId`, `actionId`, `expectedRevision` and `expiresAt`, even after a disposable
section was deleted. It performs no second write or activity event. Other actors receive no receipt.
If an `undo_operation` response itself was lost, simply call `get_operation_history`: if the action
now appears under `redo`, the Undo landed. Retrying the same call refuses `history_revision_stale:`
and executes nothing twice.

Refusals are MCP errors whose text starts with a reason token:

| Prefix | Meaning | What to do |
|---|---|---|
| `history_not_next:` | That action is not the next step in this direction | Read `get_operation_history`; undo the newer change first |
| `history_revision_stale:` | The history moved since you read it (or your earlier identical call landed) | Read the summary again, then retry if still needed |
| `history_expired:` | Older than 24 hours | For a removal, `restore_section`, which appends |
| `history_conflict:` | Someone else changed what the action touched; text names titles and ids | Follow the listed repair and retry, or make the change by hand |
| `history_blocked:` | The project or an ancestor is archived | Reactivate the named project, then retry |
| `history_unavailable:` | No page can take the section back | Make a compatible page available and retry; Archive may contain retained content |
| `history_retired:` | The action can never succeed again — say **another** connection restored the section from Archive, or it was removed again since — so it was retired | Nothing to repair; the next call reaches the action below it |

The `agent-heavy` fixture token's connection does not hold `projects.write`; grant it in
**Settings → AI & Agents** before trying the write tools.

**Grants are checked when a transition runs, not when the receipt was issued.** Unchecking
The stored action family's missing write grant refuses `undo_operation` and `redo_operation` with
text naming that grant and changes none of your work (only the connection's *Last used* time), while
`get_operation_history` keeps working under `projects.read`; checking it again makes the same
action usable for the rest of its 24 hours. A revoked connection can no longer call any tool, so its
history is simply unreachable — the section, rows and other people's work are untouched. Histories
are stored in the same `data.json` as the work they change, so they survive a host restart and a
fresh connection with the same token sees them; Archive, not history, is the durable route for
retained notes and cascaded rows. A stdio
child reloads that file on every call: point it at a separate file, or never let it and the HTTP
host write the same file at the same time (Slice 33's `mcp-acceptance` runs them one after the
other).

Task create/update/complete/archive/restore results are `{ task, operation }`; reflection
add/archive/restore results are `{ reflection, operation }`. A normalized no-op carries
`operation: null`. A write-only connection can chain transitions from the create receipt and each
transition's returned `summary` without calling `get_operation_history`.

### Reflections

Slice 25.7 adds `get_project_journal` (`projects.read`, `tasks.read` and `reflections.read`). It
returns the root-wide newest-first reflection feed across Home, the Reflections page and nested
work canvases, with each entry's canonical origin. A subject-linked entry retains only its task or
subproject ID in the write; the journal resolves the current name, status, archive state and
breadcrumb when the caller has the declared read grants. A subject can therefore remain visible
after its work is reopened or archived. The separate completed-work picker is a page/API read,
not another MCP tool, and the journal does not require the Reflections tab to be enabled.

### Home shortcuts

Slice 25.4 adds three placement tools:

- `list_section_shortcuts` (`projects.read`) lists Home placements with source project, page,
  section and breadcrumb identity, plus availability; it returns no task or reflection rows.
- `add_section_shortcut` (`projects.write`) places a read-only reference to a source section in
  the same root tree. It accepts the same optional zero-based `position` in Home's combined
  section/shortcut order; omission appends. It answers `{ shortcut, operation }`.
- `remove_section_shortcut` (`projects.write`) deletes only the placement; the source section and
  its rows remain. It answers `{ shortcutId, projectId, pageId, operation }` — there is no
  placement left to return.

Both record in the **destination** root project's history, never the source's, and their Undo and
Redo write the placement only: the source section, its configuration and its rows are never
written, so an edit to the source is not a conflict for a placement action. Putting a placement back
does check the source against §27's rules — same root tree, not the destination page itself — so a
source that has gone or moved out of the tree refuses. Undoing a removal puts
the same placement id back between the same neighbours, including when the source has since been
archived or hidden — it returns as the unavailable placeholder rather than unarchiving anything.

The source content still uses its own grant. For example, discovering a Task List shortcut does
not grant `tasks.read`; call `list_tasks` with that permission to read the source rows.

Once a root has more than one canvas, **where a write lands** stops being a single answer, so
say it:

- Nothing named — the project's canonical canvas takes it: a root's Home, a subproject's work
  canvas.
- `pageId` named — it lands there, provided that page holds that kind of section. A Reflections
  page holds only a reflections container; Todos and Archive hold none, because they project rows
  they do not own. A page that does not take it is a refusal, never a quiet fallback to Home.
- `sectionId` named — that exact container, and it must agree with any `pageId` also given.

`list_sections` takes an optional `pageId` for the same reason. Without one it answers with the
whole project, grouped by page.

### Run the integrated page workflow

For the multi-page showcase, seed `nested-projects` and open the root Home or a nested work canvas
in the browser. Over Streamable HTTP, use the same fake Claude token to create/update/complete a
nested task, add and remove a Home shortcut, attach a subject-linked reflection, archive and restore
the task, and toggle an optional page. The open browser surface receives each committed write through
the host event stream; verify each result with its canonical read rather than treating a projection as
another copy of the row. Page toggles likewise appear only after the host has persisted the setting and
the browser has reconciled fresh page context.

In **Settings → AI & Agents**, remove `tasks.read` from Claude and call `get_project_todos`. The
response is an MCP tool error with the exact missing-grant message
`connection "agent-claude" is missing permission "tasks.read"` and no partial structured content.
Restore the grant before continuing. A read-only Cursor token can query its permitted project/task
data but cannot perform writes; the revoked fixture token is refused at authentication.

### Important file-store limitation

Do not run mutation-capable stdio and HTTP/UI sessions concurrently against the same
`data.json`. The stdio child reloads before each call and therefore sees host-side
revocations, but the already-running host does not see stdio writes and can overwrite them
later. Stop `pnpm dev:host` before a stdio mutation session, then restart it afterwards.

Read-only clients can run together as long as authentication's throttled `lastUsedAt` write
is acceptable. For isolated experiments, point each transport at a separate
`CWM_DATA_FILE`.

**§62's live updates are a property of the HTTP transport.** The browser and the HTTP MCP
endpoint share one process, so an agent's write over `/mcp` appears in an open page within a
second. A stdio process owns a separate store and cannot reach the running host's event
stream, so its writes leave the UI unchanged — the visible symptom of the same limitation
above. Use HTTP whenever the UI is open
([why](../decisions/2026-08-live-updates-are-http-only.md)).

## Verify and troubleshoot

The repository's real-client check lists tools, creates a task, and inspects the file over
both transports:

```powershell
pnpm --filter @cwm/prototype-host mcp-acceptance
```

§62's own check opens `GET /prototype/events`, completes a task through a real MCP client,
and asserts the frame arrives within a second *and* that the write is already readable when
it does:

```powershell
pnpm --filter @cwm/prototype-host live-acceptance
```

- `401 unauthorized`: the token is missing, unknown, or its connection is revoked.
- Tool result names `tasks.write` (or another grant): the token is valid but lacks that
  permission. Change it in Settings → AI & Agents.
- `403` before protocol negotiation: the Host or browser Origin is not localhost.
- Stdio exits immediately: `CWM_MCP_TOKEN` is absent, or the configured command/path is
  wrong. Protocol data is stdout-only; diagnostics appear on stderr.
