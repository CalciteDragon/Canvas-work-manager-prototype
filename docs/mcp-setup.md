# MCP setup

Canvas Work Manager serves the same eighteen tools over Streamable HTTP and stdio (§59) —
§54's fourteen, plus the four section tools the canvas needs.
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
| `prototype-user-a-readwrite` | Claude | project/task reads, task writes, workspace reads |
| `prototype-user-a-readonly` | Cursor | project/task reads |
| `prototype-user-a-revoked` | Retired assistant | always refused |

Every listed tool advertises its grant under
`_meta["local.canvas-work-manager/requiredPermission"]`. Denied calls also name the missing
permission in their tool error.

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
deliberate ([why](decisions/2026-09-a-section-has-a-name.md)).

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
([why](decisions/2026-08-live-updates-are-http-only.md)).

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
