# MCP setup

Canvas Work Manager serves the same thirty-five tools over Streamable HTTP and stdio (§59) —
§54's fourteen, the five section-edit/removal tools the canvas needs, §54's three page tools, Slice 25.4's
three shortcut tools, Slice 25.6's eight archive/recovery tools, and Slice 25.7's journal tool.
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

`move_section` uses the same combined order and returns `{ section, undo }`; `update_section`
returns that envelope for title, config, collapse and span changes. An unchanged update, or a move
clamped to the section's current position, returns the current section with `undo: null`. Hold the returned `undo.undoId` and pass it
to `undo_operation` once; add Undo removes only the created section, move Undo restores its
surviving neighbours, and update Undo restores only the fields recorded by that update. Receipts
carry an opaque sequence for ordering, not inverse data. Automatic Reflections/Tasks container
creation is intentionally receipt-free. Refusals use the reason tokens in the table under
[Undoing a section removal](#undoing-a-section-removal); an edit conflict's repair is to use the
later receipt or make the change again by hand, never Archive.

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

### Undoing a section removal

`remove_section` (`projects.write`) returns `{ section, undo }`: an archived-shaped final
section snapshot and a receipt `{ undoId, operation, sequence, label, createdAt, expiresAt }`. A
disposable section may already be absent from storage; the response snapshot is not evidence it
remains there. Pass `undoId` to `undo_operation` (`projects.write`) to reverse that removal —
the section returns between the neighbours it left (Archive Restore appends instead), with
exactly the rows the removal archived or moved, while later non-structural edits such as renamed
tasks are kept.

A receipt is usable once, for 24 hours, by the same agent connection that made the removal; any
other connection, including another of the same person, gets not-found. If the remove response
was lost, repeating `remove_section` for the same id is still a refusal. `section_already_removed:`
includes the exact connection's newest outstanding `undoId` and `expiresAt`, even after a
disposable section was deleted. It performs no second write or activity event; consumed,
expired, pruned or superseded receipts are not returned. Other actors receive no receipt.
Refusals are MCP errors whose text starts with a reason token:

| Prefix | Meaning | What to do |
|---|---|---|
| `undo_consumed:` | Already undone | Nothing; the section is back |
| `undo_expired:` | Older than 24 hours | `restore_section`, which appends |
| `undo_conflict:` | Something the removal touched changed; text names available titles and ids with a next step | Follow the listed repair, retry Undo, or check Archive for retained content |
| `undo_blocked:` | The project or an ancestor is archived | Reactivate the named project, then retry |
| `undo_unavailable:` | No page can take the section back | Make a compatible page available and retry Undo; Archive may contain retained content |

The `agent-heavy` fixture token's connection does not hold `projects.write`; grant it in
**Settings → AI & Agents** before trying either tool.

**Grants are checked when Undo runs, not when the receipt was issued.** Unchecking
`projects.write` refuses `undo_operation` with text naming the missing permission and changes
none of your work (only the connection's *Last used* time); checking it again makes the same receipt usable for the rest of its 24 hours. A revoked
connection can no longer call any tool, so its receipts are simply unusable — the section,
rows and other people's work are untouched. Receipts are stored in the same `data.json` as the
work they reverse, so they survive a host restart, but a workspace keeps only its newest 50;
Archive, not the receipt, is the durable route for retained notes and cascaded rows. A stdio
child reloads that file on every call: point it at a separate file, or never let it and the HTTP
host write the same file at the same time (Slice 33's `mcp-acceptance` runs them one after the
other).

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
  section/shortcut order; omission appends.
- `remove_section_shortcut` (`projects.write`) deletes only the placement; the source section and
  its rows remain.

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
