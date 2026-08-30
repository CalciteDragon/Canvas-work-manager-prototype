# Canvas Work Manager — Prototype

A design-first prototype of a work manager whose distinguishing feature is that AI
agents are first-class users of it, through a real MCP server.

**If you are an agent working in this repository, read [AGENTS.md](AGENTS.md) first.**
It carries the architectural boundaries and the development protocol. The slice plan
lives in [development.md](development.md); the specification it implements is
*Canvas Work Manager — Prototype Product, Design & Development Specification.md*.

## Running it

```bash
pnpm install
pnpm dev
```

That starts two processes:

| Process | URL | What it is |
|---|---|---|
| `web` | http://localhost:4200 | The Angular application — shell, dashboard, project pages, tasks |
| `host` | http://127.0.0.1:4310 | The prototype host — fake API (§61), Streamable HTTP MCP at `/mcp`, and §62's event stream at `/prototype/events`, over `.prototype/data.json` |

The host serves §54's fourteen transport-free tool definitions through the official MCP SDK
v2, targeting protocol `2026-07-28`. Streamable HTTP is mounted at `/mcp`; `pnpm mcp:stdio`
serves the identical registry for local child-process clients. Both use the fake agent
credentials and real domain services. See [docs/mcp-setup.md](docs/mcp-setup.md) for client
configuration and the JSON store's cross-process limitation.

**Changes appear in the open browser.** Every domain mutation — from the UI, from an HTTP MCP
client, or from the development panel — broadcasts one Server-Sent Event on
`GET /prototype/events`, and the affected feature stores re-read. A task an agent completes
ticks itself off in an open project page in well under a second, with the activity feed
naming the connection. Frames are held until the write commits, so a refresh triggered by one
always reads the new value. This is a property of the HTTP transport; a `pnpm mcp:stdio`
process owns a separate store and leaves the UI unchanged.

### The development panel

Press **Ctrl/Cmd + Shift + D** on any page (spec §46). If your browser swallows the chord —
it is Chrome's own "bookmark all tabs" — the same controls are at
<http://localhost:4200/prototype/state>, which also carries the per-project layout experiment.

The panel changes the rig, not the workspace: persona, seed, simulated date, theme, layout
mode, AI provider, network delay, failure rate, feature flags, and an **Add Prototype Note**
button that appends to `.prototype/notes.json` with the current route and project (§79).

Two things are worth knowing while using it:

- **Changing seed, persona, date or AI provider reloads the page** — the one tab that pressed
  the button. These change what every derived read on every page means at once, so a reload
  is cheaper and clearer than a fan-out of refreshes, and a persona switch is a new session
  rather than a data change. Other open tabs refresh themselves through §62's stream. Network
  delay, failure rate and the feature flags are kept in `sessionStorage` so that reload does
  not wipe them; the theme is not, because it comes from the persona.
- **Failure Rate applies to the app's gateway, not to the panel** — so you can always turn
  it back off. The exception is Layout Mode, which writes a real project field.

The host endpoints behind it, should you want them from `curl`:

| Route | What it does |
|---|---|
| `GET /prototype/state` | Seed, simulated clock, AI provider, personas |
| `POST /prototype/seed` | `{"seed":"busy-week"}` — swaps the document, no restart |
| `POST /prototype/reset` | Default seed *and* real time (§76) |
| `POST /prototype/clock` | `{"now":"2026-08-18T09:00:00.000Z"}`, or `{"now":null}` for real time |
| `POST /prototype/ai-provider` | `{"provider":"mock"｜"real"}` |
| `POST /prototype/notes` | `{"note":"…","route":null,"projectId":null}` (§79) |
| `GET /prototype/events` | §62's Server-Sent Events. `?user=<personaId>` scopes it to one workspace; omit it to watch everything. |

### Environment

| Variable | Default | What it does |
|---|---|---|
| `CWM_HOST_PORT` | `4310` | Which port the host listens on. Deliberately **not** `PORT`: `pnpm dev` runs Angular and the host under one environment, and the host ignores `PORT` entirely so that a tool exporting `PORT=4200` for `ng serve` cannot hand the host the web port. An unusable value fails the start with a message rather than silently falling back to 4310. |
| `CWM_DATA_FILE` | `.prototype/data.json` | Which file the host reads and writes. Resolved against the process's cwd; this is what lets the acceptance scripts run against a temp file. |
| `PROTOTYPE_AI_PROVIDER` | `mock` | `mock` composes the dashboard's AI text locally, with no API key and no network (§43). `real` selects the developer-only adapter, which is a stub: the host starts and every other route works, but `GET /api/dashboard` returns `500 {"error":"internal_error"}` and `/app` shows an error instead of any widget — the digest is part of the same read. The explanation is printed on the host's console, not in the response. Real AI is never required (§44). |

One Ctrl+C stops both. Health check: `curl localhost:4310/prototype/health`.

Requires Node `^22.22.3 || ^24.15.0 || >=26` (Angular 22's floor) and pnpm 11.

## Other commands

```bash
pnpm build   # build the web app; type-check everything else
pnpm test    # run all workspace tests
pnpm lint    # type-check every workspace
```
