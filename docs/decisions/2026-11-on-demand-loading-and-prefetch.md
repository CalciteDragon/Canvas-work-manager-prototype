# On-demand loading: what may leave the initial bundle, and how it is prefetched

**Question**

Slice 81's step 7 measured 1,151.16 kB against the 1,150 kB initial ceiling (the plan's Open
question 19). The user kept the ceiling and asked for an audit of the whole bundle, with as much
loaded on demand as can move "without significantly impacting user experience". What may leave
the initial bundle, what must stay, and how does a deferred piece avoid a visible wait? (§3.1, §77.)

**Options tested**

- *Raise the ceiling to 1,155 kB* (the plan's recommendation): rejected by the user.
- *Defer the More menu, or lazy-load the dashboard route*: not needed (below), and the dashboard is
  the landing route.
- *Audit first, then take the biggest safe item*: chosen. The
  [audit](../roadmap/70-ui-ux/bundle-audit-2026-11.md) found that the biggest item was not ours.

**What we learned**

**Every Zod locale was in the initial bundle: about 219 kB, a fifth of it.** `@cwm/contracts` and the
web app wrote `import { z } from 'zod'`. Zod's `z` is a namespace object (`export * as z`), and a
bound `z` used as a value hides from esbuild which members are used. So it kept all of them:
`z.locales` with every translation of every error message, and the JSON Schema converters the web
app never calls. Zod declares `"sideEffects": false`, so `import * as z from 'zod'` lets esbuild
follow the static `z.…` accesses and drop the rest. Same API, same English messages
(`config(en())` still runs); 43 files changed one line each. The initial bundle went from
**1,149.73 kB to 917.04 kB** (−232.69 kB). The other packages (domain, host, MCP tools, seeds) are
not bundled for a browser and keep `import { z }`.

Two route-level levers were measured and not taken, because each makes someone wait when the
deferred route is the first one they open (a reload or a link straight to a project page), and
prefetch cannot help there: the project routes (−379.69 kB) and the Todos, Reflections and
Archive page kinds (−64.65 kB). Both are in the audit as "needs user".

**Current decision**

- **Zod is imported as a namespace** (`import * as z from 'zod'`) in code the web app bundles
  (`packages/contracts/src`, `apps/web/src`). `scripts/check-zod-imports.mjs`, run by both lints,
  refuses `import { z }` and the default import.
- **The rule for on-demand loading.** Keep eager what is on first paint of the shell or of `/app`
  (sidebar tree, top bar, the dashboard, the skip link and route focus, global CSS, icons, toasts)
  and anything a first keypress needs (the development panel's chord, focus management). Load
  freely on demand: routes other than the landing, dialogs, menus and panels opened by a click,
  heavy editors, development tooling. Each deferred piece is prefetched (on idle, or
  on hover or viewport) so its first open does not wait. It keeps a placeholder the same size as
  what replaces it, so nothing shifts. A trigger that must work on the first click stays a working
  control. A primary action never shows a spinner for code.
- **Borderline means ask.** If a deferral can still make the person wait, as a route that may be
  the first one opened can, it is listed for the user rather than done.
- The 1,150 kB ceiling and the 850 kB warning are unchanged
  ([budget](2026-08-initial-bundle-budget.md)).

**Confidence**

High for the Zod change: measured, and `pnpm test` is unchanged. Medium for the rule: it is the
user's stated bar written down, and the two "needs user" items are where it will be tested.

**Revisit when**

The bundle approaches the ceiling again: take the audit's small deferrals (task drawer, More menu,
pencil menu) biggest first, then ask about the page kinds and project routes. Or Zod changes
how it exports `z`.
