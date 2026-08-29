# Slice 12 — Development panel

**Goal:** Every prototype variable — persona, seed, simulated date, theme, layout mode, AI
provider, network delay, failure rate, feature flags — is adjustable at runtime from one
panel, without restarting anything.

**Spec sections:** §22, §28, §46, §47, §63, §68, §71, §76, §79

---

## Acceptance check

Executable, in this order, against a running `pnpm dev` on the `overdue-chaos` seed unless
a step says otherwise.

1. `pnpm test`, `pnpm lint`, `pnpm build` all green.
2. At `/app`, **Ctrl+Shift+D** (Cmd+Shift+D on macOS) opens the panel over the current
   route; **Esc** closes it; the chord re-opens it.
3. **Network Delay → 3 s.** On a project page, clicking a task's complete control paints
   the row complete immediately, its `aria-busy` clears about three seconds later, and the
   Network panel shows `POST /api/tasks/:id/complete` starting 3 s after the click (§63).
4. **Failure Rate → 100 %.** The same click paints complete, then reverts to the prior
   state with a visible error and no `completedAt` in `.prototype/data.json`. The panel's
   own host-backed controls still work at 100 % (they do not use the work-manager gateway),
   so the rate can be dialled back down. Set it back to 0 %.
5. **Feature Flags.** Turning `gridProjectLayout` off makes the Layout Mode control
   unavailable in both the panel and `/prototype/state`, and renders a `grid` project as
   flow. On the `nested-projects` seed, turning `nestedProjects` off flattens the sidebar
   tree **without a reload** (the flag is a signal and the tree is a computed). Turn both
   back on.
6. **Current Date.** Set the clock to `2026-08-18T09:00:00Z` — *backwards*, because every
   `overdue-chaos` due date but one precedes `SEED_NOW` and moving forward can only add
   overdue work. The app reloads and `/app` shows the 08-18, 08-19, 08-20, 08-21 and 08-27
   tasks as due-today/upcoming rather than overdue. Then set it to the next Friday,
   `2026-08-28T09:00:00Z`: the five *open* tasks are overdue and Today is empty
   (`task-chaos-backup` is already `done`, so it never reads as overdue). No host restart.
7. **Seed.** Load `busy-week` from the panel. `.prototype/data.json` is rewritten, the app
   reloads onto that seed's projects, and the host was never restarted.
8. **Persona.** Switch to *Alex*. The app reloads; sidebar, top bar and dashboard read as
   Alex, and requests carry `x-prototype-user: user-alex`. The delay/failure/flag settings
   set above survive the reload (they are held in `sessionStorage`); the theme does not,
   because it comes from the persona.
9. **Theme.** Switching in the panel changes `data-theme` on `<html>`, same as the top bar.
10. **Layout Mode.** On a project page, flipping flow⇄grid re-renders that project's canvas
    and persists. This is the one panel control that writes through the work-manager
    gateway, so it *is* subject to steps 3–4's injection.
11. **AI Provider → `real`.** `/app` shows the dashboard error (the §44 stub rejects, the
    host answers 500 `internal_error`, and the digest is part of the one dashboard read).
    Back to `mock`: the dashboard renders again. No host restart.
12. **Reset.** Returns the default seed (`personal-workspace`) *and* real time.
13. **Add Prototype Note.** Saving a note appends to `.prototype/notes.json` preserving all
    39 existing entries, and carries the route, the project id when on a project page, and
    a **real-time** timestamp — not the simulated clock's, so notes stay in observation
    order.
14. `/prototype/state` still exists (§68) and shows the same controls plus the per-project
    layout list.

Steps 3–5 and 10–13 are manual browser checks; everything they rest on has an automated
counterpart in the test plan below except the 3 s timing itself.

---

## Design decisions this plan makes

### 1. What the host owns vs. what the client owns

The slice text lists host endpoints for "load seed, reset, set simulated date, set latency,
set failure rate". Latency and failure rate are **not** going on the host:

- §63 puts failure injection in the **gateway**, because what it exists to test is the
  optimistic path in the Angular store — revert + show error. A host returning a real 500
  tests the host's error envelope, not the revert.
- A host-side latency number would be a second source of truth the client must mirror, and
  the panel would have to survive a 3 s delay in order to change the 3 s delay.

**Host owns** seed, simulated date, AI provider, note capture. **Client owns** network
delay, failure rate, feature flags, theme.

Because this drops two of the five endpoints `development.md` lists under Slice 12's
*Build*, that bullet is edited in this same change — not just the status line (AGENTS.md §2
rules 1 and 6).

**The identity provider stays uninjected.** `PrototypeIdentityProvider` does its own
`fetch` to `/api/me` and is deliberately *not* behind `simulate()`: at failure rate 100 %
an injected `/api/me` leaves the shell permanently errored with no way back, because every
store and the panel itself depend on the identity resolving. The cost is that the app's
first load is never delayed — noted in the decision entry, with "revisit when a slice wants
to evaluate the cold-start loading state".

### 2. Reseeding without a host restart — through the lock, not around it

First draft added `JsonDataStore.reload()` that read the file and then asserted no unit was
open before swapping the document. **That is unsound.** `unitOfWorkFor` queues units as
`tail.then(…)`, and a queued unit has not yet called `activeOperationTokens.set` — that
happens inside `runUnitOfWork`. So the assert sees nothing, the swap lands, and the queued
unit then clones the *new* document while its route handler already resolved its actor
against the old one: a write validated against seed A persisted onto seed B.

Instead, the replacement goes **through** the existing lock:

```ts
await unitOfWork.run(() => store.replaceActiveDocument(buildSeed(name)));
```

`runUnitOfWork`'s commit path already validates, persists and swaps `documents`, so this
queues behind every in-flight *and* pending unit, needs no assertion, cannot 503, and
writes the file atomically through `JsonDataStore.persist()`. It also means the seed never
has to be written and read back: `buildSeed` produces the document, the unit persists it.
`writeSeedFile` is not involved, so `CWM_DATA_FILE` is honoured for free (the store already
knows its own path). `buildSeed` is typed `(seedName: SeedName)`, so the route narrows with
the exported `isSeedName` first — that is also where an unknown name becomes the 400.

`DataStore` gains one method, `replaceActiveDocument(document: unknown): void`, on
`BaseDataStore` so both stores inherit it. It needs **its own guard**: reusing
`assertCanMutateDataStore` would not do, because with no context *and* no active token that
helper returns cleanly rather than throwing. The guard checks context, token and
`role === 'callback'`, and the failure is a `DocumentIntegrityError` rather than
`UnitOfWorkInProgressError` — the latter maps to 503 `busy`, which is the wrong story for
"called outside a unit".

**What this fixes, and what it does not.** Units already queued at replacement time drain
first, so the first draft's "queued unit clones the new document" is gone. What remains is
a request that read the document *outside* the lock and has not yet enqueued:
`actorFor(request)` calls `store.snapshot()` as an argument expression, before the service
opens its unit. Closing that would mean routing reads through the lock, which is a far
larger change than this slice earns. It is bounded: every seed's entity ids are disjoint and
every seed shares `DEMO_WORKSPACE_ID`, so the stale actor stays valid and only the entity
lookup misses — a 404 on a write you raced against your own reseed, not corruption.

### 3. Switching the AI provider at runtime

`SwitchableAIProvider` wraps a current `AIProvider` and delegates. What makes the swap work
is only that the object the services hold *is* the wrapper, with a mutable delegate — the
domain still sees §42's interface and needs no re-wiring. `PROTOTYPE_AI_PROVIDER` remains
the startup default (§44).

### 4. Host-state changes reload the app

`PrototypeIdentityProvider` memoizes a fulfilled identity, and every store loads once —
§62's live updates are Slice 16. So after a persona switch, seed load, clock move, AI
provider swap or reset, the loaded UI is stale. The panel calls `location.reload()` after
each. That is what a development panel is allowed to do, and it is what makes acceptance
steps 6–8 and 11 observable at all.

Consequence: client-owned settings would be wiped by the reload the panel itself triggers.
So **delay, failure rate and flags are held in `sessionStorage`** (guarded by try/catch,
like the persona key) and survive it. The **theme is not** — it comes from the persona on
load, which keeps `docs/decisions/2026-08-theme-selection-is-session-only.md` intact and is
exactly what "switch persona changes the theme" is there to demonstrate.

### 5. The panel is an overlay, and `/prototype/state` stays

§46 wants a keyboard-summoned panel; §68's route map keeps `/prototype/state` as the
"seed/state inspector". Both, sharing one `DevPanelControls` component and one
**root-provided** `DevPanelStore` — root, not component-provided, because on
`/prototype/state` the overlay and the page are alive at once and two stores would diverge.
The route page adds the per-project layout list the overlay has no room for.

`StateInspectorStore` **survives** as a second, component-provided store with a different
job: it owns the per-project layout list, which the panel does not have. One root store for
the panel's own state; one component store for the inspector's list.

### 6. Theme keeps two controls

The top-bar toggle stays (§22 asks the shell to have one) and the panel drives the same
`ThemeService` signal. `ThemeService` gains a public `set(theme: Theme)` — it currently
exposes only `toggle()`. Two controls over one signal is not duplicated state. This answers
the theme decision entry's "Revisit when".

### 7. Layout Mode is the one control on the work-manager gateway

`projectLayoutMode` is a domain field written by `PATCH /api/projects/:id`. There is no
`/prototype/*` route for it and there should not be — inventing one would put a domain
write on the development namespace. So Layout Mode goes through `WORK_MANAGER_GATEWAY` and
**is** subject to latency and failure injection, unlike every other panel control. Stated
in acceptance 10 rather than papered over.

### 8. Values, pinned

- **Network Delay** (§46's own example list): `none | 300 ms | 1 s | 3 s` → `0 | 300 | 1000 | 3000`.
- **Failure Rate**: §46 gives no ladder, so this plan picks `0 | 0.25 | 0.5 | 1`, stored as
  a **fraction** and rendered as a percentage.
- **§47's `PrototypeFlags`**, all six, verbatim: `gridProjectLayout`, `nestedProjects`,
  `subtasks`, `manualProgress`, `aiSummarySections`, `agentConfirmations`. Two gate
  something that exists today; the other four are **inert** and the panel labels them so —
  the service is the single place a later slice adds the check, which is what §47 asks for.
- The flags are held as a **signal**, not plain fields. `ShellStore.projectTree` is a
  `computed` and only recomputes if it reads a signal — plain fields would make the sidebar
  need a reload to flatten.
- An empty-array filter (`list({ status: [] })`) short-circuits in the gateway before
  `request()`, so it is never delayed or failed. That is by design, and it is why the
  injection test must use a non-empty query.

### 10. `simulate()` stays transport-agnostic

The injection call goes at the top of `request()`, but `request()`'s `try/catch` →
`toUnreachableError` wraps only the `fetch`. A `simulate()` that threw its own error there
would escape as a plain `Error` and reach components — breaking §8's "the only failure type
the UI sees". Worse, it would make a service in `core/config/` construct a `GatewayError`
from `core/gateway/`, inverting the existing dependency direction.

So the settings service exposes `delay(): Promise<void>` and `shouldFail(): boolean`, and
the **gateway** owns the error:

```ts
await this.settings.delay();
if (this.settings.shouldFail()) throw toUnreachableError(new Error('prototype failure injection'));
```

### 9. Test volume, against §71

AGENTS.md names the development panel, the host's HTTP implementation and the seed loader
as **deliberately disposable** — not to be exhaustively tested. The first draft of this plan
had 22 cases including a full schema-test file. Cut to the tests that protect code which is
*not* disposable (the data store's document replacement, the gateway's injection point, the
flags' effect on the shell and project page) plus one smoke test per disposable unit.

---

## File-level change list

### `packages/contracts`

| File | Responsibility |
|---|---|
| `src/prototype.ts` *(new)* | `PrototypeStateSchema`, `LoadSeedInputSchema`, `SetSimulatedDateInputSchema`, `SetAIProviderInputSchema`, `PrototypeNoteSchema`, `PrototypeNotesFileSchema`, `CreatePrototypeNoteInputSchema`. Shared by host routes and the Angular control adapter — §11, one definition. |
| `src/index.ts` | Export the new module. |

`PrototypeState`: `seed: string \| null`, `seeds: string[]`, `simulatedNow`,
`clockOffsetMs`, `aiProvider: 'mock' \| 'real'`, and
`personas: UserSchema.pick({ id, name, avatar, workspaceId }).array()` — **picked, not
re-declared**, so there is no parallel definition of a `User` field. No `dataPath`: nothing
reads it and it would ship an absolute host path to the browser.

`PrototypeNoteSchema` is derived from the file that already exists — `{ id, createdAt,
route: string | null, projectId: string | null, slice: number.optional(), note }` — with
`route`/`projectId` **nullable**: of the 39 existing entries, 23 write `route: null` and 16
write a real route, so neither `.optional()` nor `z.null()` would round-trip the file. All
39 carry `slice`, so the panel stamps `slice: 12` and the file stays uniform. The envelope
is `{ notes: [...] }`.

### `packages/repositories`

| File | Responsibility |
|---|---|
| `src/data-store.ts` | `DataStore.replaceActiveDocument(document)` — replace the open unit's document; throws outside a unit's callback. Replaces the unsound `JsonDataStore.reload()` of the first draft (decision 2). |
| `src/data-store.test.ts` | Replacement commits and persists; it throws outside a unit; a unit queued *during* a replacement commits against the replaced document. |

### `apps/prototype-host`

| File | Responsibility |
|---|---|
| `api/services.ts` | `createApi(persistence, options?)` takes an injected `Clock`/`AIProvider` so the runtime holds the same instances the services use. `createApiRouteTable` **keeps its signature** (the new options default), because `concurrency.test.ts` calls it too and must not join this change. `main.ts` composes `createApi` + `createApiRoutes` directly. |
| `prototype/runtime.ts` *(new)* | `PrototypeRuntime`: the store, the `unitOfWork`, the `SimulatedClock`, the `SwitchableAIProvider`, the current seed name. `loadSeed`, `reset`, `setSimulatedNow`, `setAIProvider`, `state()`. |
| `prototype/switchable-ai-provider.ts` *(new)* | §42 `AIProvider` delegating to a swappable current provider. |
| `prototype/notes.ts` *(new)* | Append to `.prototype/notes.json`, **repo-anchored** via `fileURLToPath(new URL('../../../.prototype/notes.json', import.meta.url))` — the same trap `persistence/store.ts` documents, since `pnpm dev:host` runs with cwd `apps/prototype-host`. Atomic temp+rename. Timestamps from **real time**, never the simulated clock. Creates the file when absent; refuses to clobber a corrupt one. |
| `prototype/routes.ts` *(new)* | `GET /prototype/state`, `POST /prototype/seed`, `POST /prototype/reset`, `POST /prototype/clock`, `POST /prototype/ai-provider`, `POST /prototype/notes`. |
| `prototype/routes.test.ts` *(new)* | Route tests over a real runtime on a temp data file. |
| `main.ts` | Build the runtime; mount `{...healthRoutes, ...prototypeRoutes, ...apiRoutes}`. |

### `apps/web`

| File | Responsibility |
|---|---|
| `src/app/core/config/prototype-settings.ts` *(new)* | §47's central service — **in `core/config/` beside `prototype-config.ts`**, not in `prototype/`, because `core/gateway/` and `features/projects/` both import it and a core→prototype edge would invert the folder's meaning. Holds `PrototypeFlags` (the six, as a **signal**), `networkDelayMs` (0/300/1000/3000), `failureRate` (0/0.25/0.5/1), `sessionStorage` mirroring, and the transport-agnostic `delay()` / `shouldFail()` pair (decision 10). |
| `src/app/core/config/prototype-settings.spec.ts` *(new)* | Defaults; the flag key set is exactly §47's six; `simulate()` waits and throws per setting; storage access failure is survivable. |
| `src/app/prototype/control/prototype-control.ts` *(new)* | `PrototypeControlPort` **interface** + `PROTOTYPE_CONTROL` `InjectionToken` — matching `WORK_MANAGER_GATEWAY`/`IDENTITY_PROVIDER`, so no component injects a class containing `fetch`. |
| `src/app/prototype/control/prototype-http-control.ts` *(new)* | The concrete adapter over `/prototype/*`, validating with the new contracts and mapping errors with `toGatewayError`. Deliberately **not** the work-manager gateway, so failure injection can never lock the panel out. |
| `src/app/prototype/control/testing/fake-prototype-control.ts` *(new)* | Stub for the store's specs, mirroring `testing/fake-gateway.ts`. |
| `src/app/prototype/dev-panel/dev-panel-store.ts` *(new)* | `providedIn: 'root'`. Loads state; performs actions; injects `Router` to know the current route's project for Layout Mode and note capture; triggers the reload after host-state changes. |
| `src/app/prototype/dev-panel/dev-panel-store.spec.ts` *(new)* | Each action against the fake control; a failing action surfaces an error and leaves prior state; the current-project derivation. |
| `src/app/prototype/dev-panel/dev-panel-controls.{ts,html,scss}` *(new)* | §46's control set. Shared by the overlay and the route page. |
| `src/app/prototype/dev-panel/dev-panel-controls.spec.ts` *(new)* | One smoke test: the control groups render, the four inert flags are marked, the delay presets are exactly `none/300/1000/3000`. |
| `src/app/prototype/dev-panel/dev-panel.{ts,html,scss}` *(new)* | The overlay: Ctrl/Cmd+Shift+D, Esc, backdrop, `cdkTrapFocus`. |
| `src/app/prototype/dev-panel/dev-panel.spec.ts` *(new)* | Chord opens (both modifiers), Esc closes, focus enters the panel. |
| `src/app/prototype/dev-panel/state-inspector-page.ts` | Drops the Slice-12 deferral note; renders `DevPanelControls` above the per-project layout list; its layout buttons respect `gridProjectLayout`. |
| `src/app/prototype/dev-panel/state-inspector-page.spec.ts` | Adds the flag-gating case (the "still lists projects" case already passes and proves nothing new). |
| `src/app/prototype/dev-panel/state-inspector-page.scss` | Room for the shared controls above the layout list. |
| `src/app/prototype/dev-panel/state-inspector-store.ts` | Unchanged in job, but its layout writes are now gated on `gridProjectLayout`. |
| `src/app/core/shell/app-shell.{ts,html}` | Mounts `<app-dev-panel />` once. |
| `src/app/core/shell/shell-store.ts` | `projectTree` flattens when `nestedProjects` is off — **here, not in `Sidebar`**, which is deliberately injection-free and presentational. |
| `src/app/core/shell/shell-store.spec.ts` | A three-deep tree renders flat with the flag off. |
| `src/app/core/theme/theme-service.ts` | Public `set(theme: Theme)`. |
| `src/app/core/gateway/prototype-work-manager-gateway.ts` | Injection as the **first** statement of `request()` — before the identity await, so a slow or failing identity cannot pre-empt it — with the gateway owning the `GatewayError` (decision 10). |
| `src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | Failure rate 1 rejects with `unreachable` and never calls `fetch`; a delay precedes the fetch. Uses a **non-empty** query — `projects.list({ status: [] })` short-circuits before `request()` and would prove nothing. |
| `src/app/features/tasks/task-list-store.spec.ts` | The §63 payoff: under injected failure the optimistic completion **reverts**. |
| `src/app/features/projects/project-page.{html,spec.ts}` | Grid rendering respects `gridProjectLayout`; the hint text names the panel. |
| `src/app/app.config.ts` | Provides `PrototypeHttpControl` for `PROTOTYPE_CONTROL` — it stays the only file naming a concrete adapter. |
| `src/styles/_tokens.scss` | `--layout-dev-panel-width`, and a `--z-dev-panel` if needed. |

### Docs

| File | Responsibility |
|---|---|
| `development.md` | Slice 12 → done; **the *Build* bullet edited** to match decision 1. |
| `docs/decisions/2026-08-latency-and-failure-live-in-the-client.md` *(new)* | Decision 1, including the identity-provider exemption and its revisit condition. |
| `docs/decisions/2026-08-development-panel-surface.md` *(new)* | Decisions 4–7: overlay + route, one control set, the reload, theme's two controls. |
| `docs/decisions/2026-08-theme-selection-is-session-only.md` | "Revisit when" answered. |
| `README.md` | The panel, its chord, and the `/prototype/*` endpoints. |
| `.prototype/notes.json` | Friction from actually using the panel. |

---

## Test plan (written first)

**Repositories** — protects non-disposable code

1. `replaceActiveDocument` inside a unit commits the new document and persists it to the file.
2. `replaceActiveDocument` outside a unit throws — the case `assertCanMutateDataStore` would
   *not* have caught, which is why the guard is its own.
3. A replacement enqueued **behind** a pending write commits after it, and the write is not
   lost. (Framed this way deliberately: asserting that a unit queued *during* a replacement
   sees the new document would prove only that the FIFO chain works, which is true with or
   without this change.)
4. The residual window, documented rather than fixed: snapshot-read → replace → write lands
   on the new document and 404s, instead of silently persisting a cross-seed write.

**Host** — one smoke test per route, per §71

5. `GET /prototype/state` reports seed, simulated now, AI provider and the document's personas.
6. `POST /prototype/seed` swaps the document: the next `GET /api/projects` answers the new
   seed's projects, and the data file on disk changed — no restart. An unknown name is 400
   and changes nothing.
7. `POST /prototype/clock` moves the clock (a task created after carries the simulated
   `createdAt`); `{ now: null }` returns to real time; a non-UTC or non-date body is 400
   **at the route**, not merely at the schema.
8. `POST /prototype/ai-provider` swaps the delegate and `state()` reports the new mode.
9. `POST /prototype/reset` loads the default seed *and* returns real time.
10. `POST /prototype/notes` appends while preserving every prior entry **including its
   `slice` field**; creates a missing file; is 400 on an empty note; and stamps **real
   time** even when the simulated clock has been moved days away.

**Web**

11. `PrototypeSettings`: defaults are no delay and no failures; the flag record's keys are
    exactly §47's six; `simulate()` waits the configured delay and throws at rate 1 and
    never at 0; a throwing `sessionStorage` does not break the service.
12. Gateway: failure rate 1 → `GatewayError('unreachable')` with `fetch` never called
    (non-empty query); a configured delay precedes the fetch.
13. `TaskListStore`: with injection failing the write, an optimistic completion reverts and
    surfaces an error — §63's actual payoff.
14. `DevPanelStore`: load populates state; each action calls the right port method; a
    failing action surfaces an error and leaves prior state intact.
15. `ShellStore`: with `nestedProjects` off, a three-deep tree renders flat.
16. `ProjectPage`: with `gridProjectLayout` off, a `grid` project renders the flow canvas.
17. `StateInspectorPage`: its layout buttons are unavailable with `gridProjectLayout` off.
18. `DevPanel`: Ctrl+Shift+D and Meta+Shift+D open; Esc closes; focus enters the panel.
19. `DevPanelControls` smoke test: the groups render, the delay presets are exactly
    `none/300/1000/3000`, the four inert flags are marked.

Deliberately **not** written, per §71: a full schema-test file for the new contracts, and
per-field note-shape tests beyond case 10.

---

## Boundaries touched

- **Components → gateway interfaces (§8).** The first draft had components injecting a
  concrete `fetch`-holding class; corrected to `PrototypeControlPort` + `PROTOTYPE_CONTROL`,
  with the concrete adapter provided in `app.config.ts` — which remains the only file that
  names a concrete adapter.
- **Domain must not know about HTTP/JSON (§12).** The runtime lives in the host; the domain
  sees `Clock` and `AIProvider` exactly as before. `SwitchableAIProvider` **is** an
  `AIProvider`, not a new interface.
- **Contracts once (§11).** Prototype-state shapes live in `packages/contracts/src/prototype.ts`;
  `personas` is `UserSchema.pick(...)` rather than a re-declaration. Seed *names* stay in
  `@cwm/prototype-data` — the contract carries `string` and the host validates, so contracts
  gains no dependency and there is no cycle.
- **`core/` must not depend on `prototype/`.** `PrototypeSettings` sits in `core/config/`
  beside `PROTOTYPE_API_BASE_URL` for exactly this reason.
- **The sidebar stays presentational.** The `nestedProjects` flag is applied in
  `ShellStore`, not in `Sidebar`.
- **No `new Date()` in domain (§45).** All new date handling is host or web.
- **No scattered `if (prototypeMode)` (§47).** Every flag read goes through one service.
- **No literal colors/spacing (§21).** The panel's SCSS uses tokens only; a new
  `--layout-dev-panel-width` token is added rather than a literal width.

---

## Explicit non-goals

- **Agent Connection** (§46 lists it) — Slice 13, when connections exist.
- Design Lab token controls (§22's third theme) — Slice 17.
- Persisting client-owned settings beyond the browser session. `sessionStorage` exists only
  so the panel's own reload does not wipe them; closing the tab clears them.
- Persisting the theme (still session-only, per the existing decision).
- §62 live updates — the panel reloads rather than pushing (Slice 16).
- Dashboard widget configuration (Slice 23) and command palette (Slice 21).
- Reading notes back into the app. §79 asks to capture, not to browse.

---

## Revisions

Two reviewers ran against the first draft: one on spec conformance and acceptance
verifiability, one against the actual code. Between them, 38 findings; these changed the
plan's shape:

- **The reseed mechanism was unsound.** `JsonDataStore.reload()` asserted no unit was open,
  but `unitOfWorkFor` queues units that have not yet registered a token — so a queued write
  would have committed against the newly-loaded seed. Replaced with
  `replaceActiveDocument` *inside* the lock, which also dissolved a `CWM_DATA_FILE`
  path bug, the double file write, and a wrong 409-vs-503 claim in the prose.
- **Acceptance step 5 asserted something time cannot do.** Every `overdue-chaos` due date
  but one precedes `SEED_NOW`, so advancing the clock only *adds* overdue work. Rewritten
  with concrete dates in both directions.
- **Nothing re-read the app after a host-state change**, making four acceptance steps
  unobservable. Resolved with an explicit reload (decision 4), which in turn forced the
  `sessionStorage` question the first draft had answered the wrong way in its non-goals.
- **Boundary:** components would have injected a concrete `fetch`-holding class. Now an
  interface + token.
- **Wrong file for the `nestedProjects` flag** — `Sidebar` is deliberately injection-free;
  it belongs in `ShellStore`.
- **`ThemeService` has no public setter** and was missing from the change list entirely.
- **The notes file already has 39 entries with a `slice` field** and `null` (not absent)
  route/project — a naive schema would have rejected or stripped them. Its timestamp must
  be real time, or a note taken while the clock sits on next Friday files itself in the future.
- **Values were never pinned**: §46's four latency presets, the failure-rate ladder and its
  units, and §47's six flag names by name.
- **Layout Mode contradicted the panel-isolation claim** — it writes through the
  work-manager gateway and *is* subject to injection. Stated rather than hidden.
- **Test volume fought §71.** Cut from 22 cases to 18, dropping the ones over deliberately
  disposable code and adding the one that was missing: that an optimistic write actually
  reverts under injected failure.

One finding was **rejected**: that the `empty` seed has no users and would 500 on
`resolveUser`. `empty()` calls `document()` with no overrides and `document()` defaults
`users` to all three personas — confirmed in `prototype/seeds/empty.json`, which carries
`user-demo`, `user-alex` and `user-sam`. Persona ids match across every seed, so the stale-
persona 404 path does not fire on a seed change; the stale *data* problem is real and is
what decision 4 addresses.
