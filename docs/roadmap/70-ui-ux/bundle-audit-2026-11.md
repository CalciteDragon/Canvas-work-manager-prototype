# Initial bundle audit — 2026-11-13 (Slice 81, Open question 19)

Slice 81's step 7, written in full and parked in `git stash`, builds at 1,151.16 kB against the
1,150 kB initial ceiling: it adds 1.53 kB to the committed 1,149.73 kB. The user asked for an
audit of the whole initial bundle and for on-demand loading of what can move without a noticeable
cost to the person using the app. The ceiling and the `angular.json` budgets are unchanged. The
rule this audit applied is the
[on-demand loading decision](../../decisions/2026-11-on-demand-loading-and-prefetch.md).

## Result

| | Initial bundle |
|---|---|
| Before (`fee597c`) | **1,149.73 kB** (1,149,728 bytes) |
| After the Zod namespace import | 917.04 kB |
| After route prefetch (the router's preloader, +2.06 kB) | 919.10 kB (919,103 bytes) |
| After idle prefetch on the existing `@defer` blocks (+1.66 kB) | **920.76 kB** |
| Ceiling (unchanged) | 1,150 kB, so **229.2 kB** under it |

## Method

`ng build --stats-json` (production) writes esbuild's metafile. "Initial" is `main` and every chunk
it reaches through static imports, plus the global stylesheet: the 22 files the CLI budget counts
(their bytes sum to its "Initial total"). Each input module's `bytesInOutput` is attributed to an
area. Those figures are measured before the final minify pass, so they sum to more than the
files do (1,380.9 kB against 1,149.7 kB). The sizes in the area table below are scaled to the file
total (× 0.833) and are estimates. The savings in the change table are measured: each comes from
building the change and comparing the CLI's initial total.

## Where the 1,149.73 kB went (before)

| Item | Est. size | Needed for first paint of `/app`? |
|---|---:|---|
| Zod locales, every language but English (`z.locales`) | 180 kB | No: never used |
| `@angular/core` | 154 kB | Yes |
| Zod core and classic schemas | 97 kB | Yes: the gateway parses every response |
| `@angular/router` | 80 kB | Yes |
| `@angular/cdk` (drag-drop, a11y, overlay pieces) | 73 kB | Partly: the sidebar's focus trap; drag-drop only on project pages |
| Project workspace shell and its stores | 66 kB | No, only on `/projects/*` |
| Project sections (Task List, Reflections, Progress, Timeline, Activity, frame) | 62 kB | No, only on `/projects/*` |
| `@cwm/contracts` schemas | 40 kB | Yes |
| Project canvas | 33 kB | No, only on a project's Home |
| Project page: Reflections (page and store) | 27 kB | No, only on that page |
| Global CSS (`styles.scss`: tokens, control primitives) | 26 kB | Yes |
| Dashboard and its widgets | 26 kB | Yes: `/app` is the landing |
| Project page: Todos (page and store) | 25 kB | No, only on that page |
| Tasks (rows, list store) | 23 kB | Yes: the dashboard's widgets show task rows |
| Zod JSON Schema code (`toJSONSchema` and processors) | 21 kB | No: the web app never calls it |
| `rxjs` | 21 kB | Yes |
| Sidebar tree (tree, items, pencil menu) | 21 kB | Yes |
| Toasts and failure feedback | 20 kB | Yes: toasts and pinned failures are global |
| Project history store, controls, wording | 15 kB | No, only on `/projects/*` |
| Project page: Archive (page and store) | 13 kB | No, only on that page |
| Project header and More menu | 13 kB | No, only on `/projects/*` (More only on click) |
| `@angular/platform-browser` | 13 kB | Yes |
| Task detail drawer | 12 kB | No: opened by clicking a task |
| Canvas chrome (insertion points, resize handle, scroll hold) | 12 kB | No, only on a project's Home |
| App shell and shell store | 12 kB | Yes |
| Project shortcuts | 11 kB | No, only on `/projects/*` |
| Other core (config, live updates, history, theme, a11y, identity) | 11 kB | Yes |
| `@angular/common` | 9 kB | Yes |
| Icons (one SVG set) | 8 kB | Yes: tree, header and top bar use them |
| Gateway | 7 kB | Yes |
| Activity feed | 5 kB | Yes: a dashboard widget |
| Development panel shell (the §46 chord) | 5 kB | Yes: the chord must work on every route |
| Top bar | 4 kB | Yes |
| Polyfills | 0 | None: the app is zoneless |

Already outside the initial bundle before this audit: the Markdown parser, renderer and editor
(127.8 kB), the Design Lab (62.4 kB), the section create, details, archive-confirm and Work create
dialogs, Page settings, the archived region and banner, the development panel's controls, and the
Calendar, Search, Settings, Settings › Agents and Settings › Archived projects routes.

## Changes

| Item | Change | Saving (measured) | UX risk | Status |
|---|---|---:|---|---|
| Zod locales and unused Zod code | `import * as z from 'zod'` in `@cwm/contracts` and the web app (43 files), in place of `import { z } from 'zod'`. The bound `z` object was used as a value, so esbuild kept every member of Zod's namespace, `z.locales` included. A lint (`scripts/check-zod-imports.mjs`) keeps the other forms out. | **−232.69 kB** | None. Same API and English messages; behaviour unchanged (`pnpm test` green) | **Done** |
| Lazy routes open without a wait | `withPreloading(PreloadAllModules)`: once the first navigation settles, the router fetches every `loadComponent` route (Calendar, Search, Settings, Agents, Archived projects, the two prototype tools), so a first click on one does not wait for its chunk. Before, each loaded on its first click. | +2.06 kB (the preloader) | Lowers it: removes an existing wait | **Done** |
| Existing deferred dialogs and blocks (details, archive confirm, section create, Page settings, Work create, archived banner, Archive list, first-run block) | `prefetch on idle` added to each `@defer (when …)`. Before, each chunk loaded on its trigger, so the first open of a dialog waited for it. | +1.66 kB (the idle scheduler) | Lowers it: the first open no longer fetches | **Done** (review finding) |
| Project routes (`/projects/:id`, `…/pages/:kind`) | `loadComponent` for `ProjectWorkspaceShell`, prefetched after the landing. | −379.69 kB (917.04 → 537.35 kB) | Reload or deep link to a project page: shell and sidebar paint first, then the project area waits for its chunk before the project's own read starts. Prefetch cannot help when this is the first route the person hits. | **Not done, needs user** |
| Project page kinds Todos, Reflections, Archive | Registry entries that `import()` their renderer, with idle prefetch. The shell would need an async renderer slot. | −64.65 kB (917.04 → 852.39 kB) | A deep link or reload on one of those pages shows a placeholder before the page. Moving between pages after prefetch: no wait. Touches the shell's landing and focus code. | **Not done, needs user** |
| Zod JSON Schema code left (≈ 12 kB) | Only `zod/mini` in the contracts would drop it, which changes how every schema is written for the host and MCP tools too. | ≈ −12 kB (est.) | None for the user. A large contracts rewrite. | Not done: cost far above the saving |
| Task detail drawer | `@defer (on idle)` in `TaskListSection` | ≈ −12 kB (est.) | Opening the drawer and moving focus into it on the first click rely on `viewChild` being present. That needs its own tests. | Not done: small; ready if a later step needs it |
| More menu, pencil menu, reflection composer, resize handle | `@defer` with idle prefetch and a same-size placeholder trigger | ≈ −3 to −4 kB each (est.) | The first open must still focus the first item. Each needs a first-open test. | Not done: small; ready if a later step needs it |
| Dashboard (`/app`), shell, sidebar, top bar, global CSS, icons, dev-panel shell, toasts | none | — | All are on first paint, or must work on the first keypress | Kept eager by the rule |
| `@angular/cdk` drag-drop | Goes with the project routes or page kinds above | (in those figures) | — | Follows the decisions above |

## Why the small deferrals were left

The Zod import made room for steps 7, 10 and 11 many times over (step 7 adds 1.53 kB, and
crossed the ceiling by 1.16 kB). Each remaining click-opened candidate saves 3–12 kB, and each adds a first-open path:
focus moving into the drawer, or a menu's first item focused, on the very first click. Those paths
would need their own tests and the risk of a slower first open. They stay listed here so a later
step that needs room can take them, biggest first.
