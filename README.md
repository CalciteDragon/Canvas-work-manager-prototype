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

**Changes appear in the open browser.** Every domain mutation that records activity — from
the UI, from an HTTP MCP client, or from the development panel — broadcasts one Server-Sent
Event on `GET /prototype/events`, and the affected feature stores re-read. (At most one: a
write that changes nothing announces nothing, and neither does the `lastUsedAt` stamp behind
every agent call.) A task an agent completes
ticks itself off in an open project page in well under a second, with the activity feed
naming the connection. Frames are held until the write commits, so a refresh triggered by one
always reads the new value. This is a property of the HTTP transport; a `pnpm mcp:stdio`
process owns a separate store and leaves the UI unchanged.

### The Design Lab

<http://localhost:4200/prototype/design> (§22, §67). A control rail on the left writes seven
live design tokens — radius, spacing density, surface contrast, accent, font scale, elevation,
sidebar width — as inline custom properties on the document element, so they change the
catalogue *and the surrounding shell*, in both themes. Navigate away and the values follow
you; **Reset** or a page reload returns them to the stylesheet, because they are session-only
like the theme.

Two things the rail states about itself rather than leaving you to discover: **surface
contrast reduces only** (`color-mix()` clamps at 100%, where the default sits), and the
**accent knob moves `--color-accent` alone** — accent-tinted surfaces keep their own colours.
Both are explained in
[the decision entry](docs/decisions/2026-08-design-lab-tokens-are-session-knobs.md).

The catalogue beside it has two labelled kinds of panel. *Live component* panels are the real
components driven by fixtures, with their real empty, loading and error states. *Primitive*
panels are representative markup marked **not yet a shared component** — buttons, inputs,
cards, project cards and menus do not exist as components in this repository, and a primitive
everybody keeps re-styling is the evidence for extracting one.

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

## Storybook

```bash
pnpm storybook
```

<http://localhost:6006> — `TaskRow`'s six §4 variants and `ProjectSectionFrame`'s, with a
dark/light toolbar switch and live controls. `pnpm storybook:build` produces a static build.

It runs on `@storybook/angular-vite` rather than the stable webpack framework, because this
app is zoneless and builds on `@angular/build`; the reasoning and the two configuration traps
are in
[the decision entry](docs/decisions/2026-08-storybook-runs-on-the-vite-framework.md).

## End-to-end tests

§69's two tests: the web path (create a project, create a task, see it on the dashboard) and
the MCP path (an agent creates a task and it appears in the open page with no reload).

**Stop `pnpm dev` first.** The suite starts its own web and host processes and refuses a port
that is already in use, rather than silently reusing your dev server and destroying the
workspace you were using. It runs the host against `.prototype/e2e-data.json`, never
`.prototype/data.json`.

Once, to fetch the browser:

```bash
pnpm exec playwright install chromium
```

Then, from the repository root:

```bash
pnpm e2e
```

## Other commands

```bash
pnpm build   # build the web app; type-check everything else
pnpm test    # run all workspace tests (fast, offline, no browsers needed)
pnpm lint    # type-check every workspace, including the stories and the e2e specs
```

## Is it finished?

[docs/first-milestone-walkthrough.md](docs/first-milestone-walkthrough.md) is the click-path
for every item in §81's First Prototype Milestone — fifty numbered steps across eight groups,
each naming the seed it needs and what you should see. That document is what "demonstrable"
means here.
