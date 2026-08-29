# MCP setup

Canvas Work Manager serves the same fourteen tools over Streamable HTTP and stdio (§59).
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

Start the application normally:

```powershell
pnpm dev
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

### Important file-store limitation

Do not run mutation-capable stdio and HTTP/UI sessions concurrently against the same
`data.json`. The stdio child reloads before each call and therefore sees host-side
revocations, but the already-running host does not see stdio writes and can overwrite them
later. Stop `pnpm dev` before a stdio mutation session, then restart it afterwards.

Read-only clients can run together as long as authentication's throttled `lastUsedAt` write
is acceptable. For isolated experiments, point each transport at a separate
`CWM_DATA_FILE`.

## Verify and troubleshoot

The repository's real-client check lists tools, creates a task, and inspects the file over
both transports:

```powershell
pnpm --filter @cwm/prototype-host mcp-acceptance
```

- `401 unauthorized`: the token is missing, unknown, or its connection is revoked.
- Tool result names `tasks.write` (or another grant): the token is valid but lacks that
  permission. Change it in Settings → AI & Agents.
- `403` before protocol negotiation: the Host or browser Origin is not localhost.
- Stdio exits immediately: `CWM_MCP_TOKEN` is absent, or the configured command/path is
  wrong. Protocol data is stdout-only; diagnostics appear on stderr.
