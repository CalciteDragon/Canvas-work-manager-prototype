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
| `host` | http://127.0.0.1:4310 | The prototype host — the fake API (§61) over `.prototype/data.json` |

The host is also where the MCP server, fake auth and the real-AI adapter will live
(spec §6). The MCP server does not exist yet; see [development.md](development.md) for
what has actually been built.

### Environment

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `4310` | Which port the host listens on. |
| `PROTOTYPE_AI_PROVIDER` | `mock` | `mock` composes the dashboard's AI text locally, with no API key and no network (§43). `real` selects the developer-only adapter, which is a stub — it starts fine and fails loudly on the first AI call (§44). Real AI is never required. |

One Ctrl+C stops both. Health check: `curl localhost:4310/prototype/health`.

Requires Node `^22.22.3 || ^24.15.0 || >=26` (Angular 22's floor) and pnpm 11.

## Other commands

```bash
pnpm build   # build the web app; type-check everything else
pnpm test    # run all workspace tests
pnpm lint    # type-check every workspace
```
