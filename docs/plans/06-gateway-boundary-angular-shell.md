# Slice 6 — Gateway boundary + Angular shell

**Status:** done

## Goal

Angular grows a real application shell — top bar, sidebar, routed outlet, design tokens,
two themes — fed entirely through the `WorkManagerGateway` interface, so no component
knows the data came from `localhost:4310`.

## Spec sections

§8 (UI depends on the gateway interface, never on a transport), §9 (the gateway and its
sub-interfaces; `TaskGateway` is pinned verbatim), §10 (`PrototypeWorkManagerGateway` →
`localhost:4310`, swappable for `HttpWorkManagerGateway` without page changes),
§18 (`IdentityProvider` + `PrototypeIdentityProvider`), §19 (Page → Store → Gateway,
Signals), §20 (feature-scoped stores, no mega-store), §21 (design tokens as CSS custom
properties; no scattered literals), §22 (dark + light), §23 (shell layout and sidebar
contents), §65 (frontend feature structure), §68 (route map).

Touched but not implemented: §61 (one route added — `GET /api/me`), §11 (one contract
added — `Identity`).

## Acceptance check

Executable, in order. Nothing else counts as finished.

1. `pnpm --filter web test` exits 0 and covers every case in the test plan below —
   including the gateway's failure paths, the empty-project sidebar, the sidebar's load
   error, and the stale-persona identity path.
2. `pnpm --filter web lint` exits 0. It runs `tsc --noEmit` on both project tsconfigs,
   then `scripts/check-design-tokens.mjs` over `src/`, then `lint:tokens:selftest` —
   chained into `lint` itself so the self-test is not a fourth command anyone must
   remember.
3. That self-test is `node scripts/expect-failure.mjs …`, which spawns the checker against
   `scripts/fixtures/violations/` and passes **only if the checker reports exactly the
   expected set of rule names** — and does not report the `1px` control. A committed,
   re-runnable proof the lint bites. It is a Node
   wrapper rather than a shell one-liner deliberately: `cmd.exe` and `sh` both mangle
   `&& exit 1 || exit 0` into a script that can never fail, and this repo's primary shell
   is PowerShell.
4. `pnpm --filter @cwm/prototype-host test` exits 0 and covers `GET /api/me` (200 with the
   resolved user + workspace; 404 for an unknown `x-prototype-user`) and CORS —
   the latter through a **real server** in `main.test.ts`, since the headers live in
   `createRequestHandler` and are invisible to `resolveRoute`.
5. `pnpm test`, `pnpm lint`, and `pnpm build` all exit 0.
6. **The slice's own "Done when", run for real in a browser**, across three seeds:
   - `pnpm prototype:reset` (`personal-workspace`, one project) → the sidebar lists
     "Personal workspace", the actual name in `.prototype/data.json`, alongside §23's
     items in §23's order: Home / Projects / Calendar / Search / ─── / Settings.
   - `pnpm prototype:seed nested-projects` → the seed is **three levels deep**
     (Home renovation → Kitchen → Cabinets, with Garden also under Home renovation).
     All three levels must render nested inline. Checking only Kitchen-under-renovation
     would pass a tree builder that silently flattens grandchildren.
   - `pnpm prototype:seed empty` → the sidebar renders its empty state, not a blank gap.
     (This seed still has three users and three workspaces, so `/api/me` resolves.)
   - The top bar shows the identity resolved from `GET /api/me`.
   - Toggling the theme changes exactly one thing in the DOM — `data-theme` on `<html>` —
     and every surface repaints. Verified in devtools by watching the attribute; "no
     literal in any component" is item 2's job, not something a browser run can show.
   - Every §68 route loads (placeholder or real) and `/` redirects to `/app`.
   Verified by driving the real browser, not by reasoning about it.
7. Living docs, in this same change:
   - `development.md` marks Slice 6 `done`, **with a one-line note recording the gateway
     narrowing** (decision 1) — the slice text says "stub the rest as interfaces", and
     this plan deliberately does not.
   - This plan carries a Revisions section.
   - `docs/decisions/` gains four entries:
     `2026-08-gateway-surface-grows-with-implementations.md` (which also carries
     decision 4, the `TaskGateway` exception — it is the one a reader questions),
     `2026-08-identity-contract-and-me-route.md`,
     `2026-08-host-cors-over-dev-proxy.md`,
     `2026-08-theme-selection-is-session-only.md`.
   - Friction from step 6 is recorded in `.prototype/notes.json` (AGENTS §3 Step 4 — an
     observation, not a pass condition).

## File-level change list

### `packages/contracts`

- `src/user.ts` — add `IdentitySchema` / `Identity` = `{ user: User; workspace: Workspace }`.
  §18 names the interface but no shape. Documented as a **response composite**, not a §14
  document record: there is no `identities` collection and there must never be one.
- `src/user.test.ts` — tests 41–42. Every file in `packages/contracts/src` has a sibling
  test, and the "no `identities` collection" rule is worth an assertion rather than a
  comment.

### `apps/prototype-host`

- `api/context.ts` — extract `resolveUser(document, request): User`; rebuild
  `resolveActor` on top of it. Today `resolveActor` finds the `User` and discards it,
  returning ids only; `/api/me` needs the whole record. One lookup, one unknown-persona
  404, two callers.
- `api/routes.ts` — add `GET /api/me`, returning `IdentitySchema`-shaped data: the user
  from `resolveUser`, the workspace from `store.snapshot()`. There is no
  `WorkspaceRepository`, and `routes.ts` already reads the snapshot for the actor — this
  is not a new repository bypass, and the host is deliberately disposable (§71).
- `router.ts` — CORS, entirely inside `createRequestHandler`:
  - **A preflight short-circuit before `readBody` and `resolveRoute`.** This is not
    optional plumbing: `match()` requires `patternMethod === method`, and every pattern is
    `GET`/`POST`/`PATCH`, so `OPTIONS /api/projects` falls through to `NOT_FOUND`. Since
    `x-prototype-user` is a non-simple header, *every* gateway call preflights — a 404
    preflight means no gateway call works in a browser at all. `request.method === 'OPTIONS'`
    answers `204`, no body, no `content-type`, CORS headers only. Consequence, accepted
    and documented in the code: preflight answers 204 for unknown paths too. Fine for a
    disposable host (§71).
  - **Headers written in the single `writeHead`**, so *every* response carries them,
    errors included. Otherwise a 404 or 409 reaches the browser as a CORS failure and the
    gateway maps a real domain error to `unreachable`.
  - Origin allowlist `http://localhost:4200` / `http://127.0.0.1:4200`, reflected only on
    match, with `Vary: Origin` (the response is per-origin and must not be cached across
    them). `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`;
    `Access-Control-Allow-Headers: content-type, x-prototype-user`;
    `Access-Control-Max-Age` so the browser stops preflighting every single call.
  - **`RouteResult` is not changed.** The preflight response never becomes one, so
    `contentType` stays required and a future route still cannot forget it.
- `api/routes.test.ts` — `/api/me`'s three cases (via `resolveRoute`, matching the file's
  existing idiom).
- `main.test.ts` — the CORS cases. It is the only place that starts a real server and
  `fetch`es it. The error-path case uses a **purpose-built** table
  (`{'GET /boom': () => { throw new DomainRuleError('…'); }}`, which `api/errors.ts` maps
  to 409; 404 comes free from any unmatched path), not `createApiRouteTable`. These tests
  are about headers, not the domain — and `loadPersistence` resolves the default data path
  and *seeds it if absent*, so the service-backed table would mutate the developer's real
  `.prototype/data.json` and make the test order-dependent. `main.ts`'s own comment says a
  test must be able to start the host "without touching a data file".

### `apps/web` — core

- `src/app/core/config/prototype-config.ts` — `PROTOTYPE_API_BASE_URL` injection token,
  default `http://localhost:4310`. One place the transport's address lives.
- `src/app/core/gateway/work-manager-gateway.ts` — `ProjectGateway`, `TaskGateway`
  (verbatim §9), `WorkManagerGateway`, and the `WORK_MANAGER_GATEWAY` injection token.
  See decisions 1 and 4 for what is deliberately *not* declared.
- `src/app/core/gateway/gateway-error.ts` — `GatewayError { status, code, message }`.
  The one error type the UI sees; components never learn about `Response`. Transport-level
  failures (`unreachable`, `invalid_response`) carry `status: 0` — there is no HTTP status
  to report, and `0` is the conventional stand-in.
- `src/app/core/gateway/prototype-work-manager-gateway.ts` — `fetch` against the base URL,
  query serialization, contract-schema validation of every response body, HTTP + schema
  failures mapped to `GatewayError`.
  The `x-prototype-user` header comes from `(await identity.getCurrentIdentity()).user.id`
  — **never** from `localStorage` directly. If the gateway read the storage key itself, a
  stale persona would keep 404-ing every call after the identity provider had already
  healed itself, and the two sources could diverge. This also keeps `IdentityProvider` at
  exactly §18's one-method shape.
  `tasks.archive` **validates and then discards** the returned `Task` (the host's route
  returns one) so §9's `Promise<void>` holds without trusting an unchecked body.
- `src/app/core/gateway/prototype-work-manager-gateway.spec.ts`
- `src/app/core/gateway/testing/fake-gateway.ts` — an in-memory `WorkManagerGateway` for
  component and store specs. Its existence is what makes the boundary claim below true by
  construction: no spec may reach for the prototype adapter.
- `src/app/core/gateway/testing/shell-test-providers.ts` — the provider array every
  shell-level spec uses: the two fakes plus `provideRouter([])`. One place, so
  `app.spec.ts`, `app-shell.spec.ts` and `sidebar.spec.ts` cannot drift into three
  different half-configured TestBeds.
- `src/app/core/identity/identity-provider.ts` — the §18 interface + `IDENTITY_PROVIDER`
  token.
- `src/app/core/identity/prototype-identity-provider.ts` — `GET /api/me`, memoized. The
  persona it asks for comes from `localStorage` (Slice 12's dev panel is what will write
  it) and defaults to none, letting the host pick its first user. **A 404 means the stored
  persona no longer exists** (hand-edited storage, or a reseed): clear the key and retry
  once without the header, rather than bricking every call.
  **Only a fulfilled result is memoized** — the cached promise is cleared in `catch` before
  rethrowing. `pnpm dev` starts web and host concurrently, so the very first `/api/me` can
  lose the race to the host's `listen`; a cached rejection would then fail every later
  `getCurrentIdentity()`, and because the gateway derives `x-prototype-user` from it, every
  gateway call with it, until a manual reload.
- `src/app/core/identity/prototype-identity-provider.spec.ts`
- `src/app/core/theme/theme-service.ts` — a signal holding the active `Theme`, written to
  `data-theme` on the root element; `seedFrom(identity)` sets it from
  `Identity.user.preferences.theme`, `toggle()` overrides it for the session.
  `AppShell` calls `seedFrom` from an `effect` on `ShellStore.identity` — one named wiring
  point, so the order is not accidental.
  (`core/theme/` is a fifth folder beside §65's `gateway`, `identity`, `config`, `shell`.
  §65's list reads as illustrative; a theme service belongs to no feature, and putting it
  in `shell/` would imply only the shell may use it.)
- `src/app/core/theme/theme-service.spec.ts`
- `src/app/core/shell/shell-store.ts` — the shell's own feature-scoped store (§19, §20):
  `identity`, `projects`, `projectTree`, `loading`, `error` signals over the gateway.
  `projectTree` is **derived view state**, not an entity — no contract counterpart, and it
  must never get one. Its builder carries a **visited-set cycle guard**. Not because
  today's host can serve a cycle — it cannot; `validateDocumentIntegrity` runs
  `assertAcyclic` at load, so a cyclic `data.json` stops the host from starting — but
  because the client walks a parent chain in a list it does not own, and
  `HttpWorkManagerGateway` against a production API (the swap §10 exists to protect)
  carries no such load-time invariant. An unguarded walk renders forever.
  `load()` excludes archived projects — the sidebar is a navigation surface, and
  `ProjectService.list` passes the status filter straight through, so an archived project
  would otherwise sit in the nav. The query is
  `ProjectStatusSchema.options.filter((status) => status !== 'archived')`, not a hardcoded
  list: `ProjectStatusSchema` is documented as "a guess to be tested", and a sixth status
  added later must not silently vanish from the sidebar with no test failing.
  `load()` runs its work inside `inject(PendingTasks).run(...)`. Without it,
  `ApplicationRef.isStable` — and therefore `fixture.whenStable()` — knows nothing about a
  hand-rolled async chain in a zoneless app, and every async shell spec becomes
  microtask-order flaky rather than deterministic.
- `src/app/core/shell/shell-store.spec.ts`
- `src/app/core/shell/app-shell.ts|.html|.scss` — §23's grid: top bar, sidebar, main
  `<router-outlet>`. **Owns `ShellStore`** and passes state down as inputs.
- `src/app/core/shell/app-shell.spec.ts`
- `src/app/core/shell/top-bar/top-bar.ts|.html|.scss` — product name, identity name and
  avatar, theme toggle. `avatar` is an optional **emoji glyph** (`🧭`, `🌤️`, `🌱` in the
  seeds), not an image URL — render it as text, with the name's initial as the fallback.
- `src/app/core/shell/top-bar/top-bar.spec.ts`
- `src/app/core/shell/sidebar/sidebar.ts|.html|.scss` — §23's items with the project list
  and inline-expanding sub-projects, plus empty and error states. **Presentational**:
  inputs for `projectTree`, `loading`, `error`; it injects no gateway and no store, which
  is what keeps §19's `Page → Store → Gateway` chain honest. Nesting is rendered
  **recursively**, not with a fixed two-level template — the `nested-projects` seed is
  three deep.
  Navigating items are `<a [routerLink]>`. "Projects" is a **group header, not a link** —
  §68 defines no `/projects` route, only `/projects/:projectId` — so it toggles the group
  rather than navigating nowhere.
- `src/app/core/shell/sidebar/sidebar.spec.ts`

### `apps/web` — shared, features, prototype (§65)

- `src/app/shared/components/placeholder-page/placeholder-page.ts|.html|.scss` — one
  component saying what a route will become and which slice builds it. Placeholders are
  not feature code, so they live in `shared/` rather than being copy-pasted eight times.
- `src/app/shared/components/placeholder-page/not-found-page.ts` — the `**` target. A
  standalone component rendering `<app-placeholder-page>` in its not-found variant, so the
  wildcard needs no route `data` and therefore no `withComponentInputBinding()`.
- `src/app/features/dashboard/dashboard-page.ts` (Slice 11)
- `src/app/features/projects/project-page.ts` (Slice 8)
- `src/app/features/calendar/calendar-page.ts` (Slice 18)
- `src/app/features/search/search-page.ts` (Slice 10/12)
- `src/app/features/settings/settings-page.ts` (later)
- `src/app/features/settings/agents/agent-connections-page.ts` (Slice 13)
- `src/app/prototype/design-lab/design-lab-page.ts` (Slice 17)
- `src/app/prototype/dev-panel/state-inspector-page.ts` (Slice 12)

  Each is a standalone component rendering `<app-placeholder-page>`. They exist so the §65
  folders are real and the next slice fills one in rather than inventing a location.

### `apps/web` — app wiring, styles, lint

- `src/app/app.ts|.html|.scss` — becomes the shell host: renders `<app-shell>` and drops
  the Slice 1 `SCHEMA_VERSION` proof (its own comment says to delete it in Slice 6).
- `src/app/app.spec.ts` — updated to assert the shell renders, not the `<h1>`.
- `src/app/app.routes.ts` — §68's map: `''` → `/app` with `pathMatch: 'full'` (without it
  the redirect swallows every URL), `/app`, `/projects/:projectId`, `/calendar`, `/search`,
  `/settings`, `/settings/agents`, `/prototype/design`, `/prototype/state`, and `**` →
  `NotFoundPage`. §68 defines no wildcard; the alternative is a blank screen on a typo.
- `src/app/app.routes.spec.ts` — every §68 path resolves; `/` redirects; the wildcard
  renders. Uses `provideRouter(routes)` + `RouterTestingHarness`, which does not depend on
  `App` owning an outlet — it moves into `AppShell`.
- `src/app/app.config.ts` — provides `PROTOTYPE_API_BASE_URL`, `IDENTITY_PROVIDER`,
  `WORK_MANAGER_GATEWAY`. **The only file naming a concrete adapter.**
- `src/styles/_tokens.scss` — §21's categories as custom properties, plus §22's light
  overrides. The single file allowed to hold literals. Dark on `:root`, light on
  `:root[data-theme='light']` — specificity (0,2,0) beats (0,1,0), so the override wins by
  rule rather than by source order.
- `src/styles/_base.scss` — element defaults, expressed only in tokens.
- `src/styles.scss` — imports both.
- `scripts/check-design-tokens.mjs` — takes `--root` like `check-no-direct-date.mjs` does.
  Walks `.scss`, `.html`, **and `.ts`** under the root — `angular.json` sets
  `inlineStyleLanguage: "scss"`, so a component can hide literals in an inline `styles:`
  array or a `style="…"` attribute, and a `.scss`-only walk would see neither. For `.ts`
  it reuses `check-no-direct-date.mjs`'s TypeScript AST-walk idiom to read the `styles` and
  `template` properties rather than grepping whole files; `*.spec.ts` is excluded.
  **Rules apply to declaration values only, never to whole files.** In `.scss`, the value
  side of a declaration. In `.html` (and in an inline `template`), only `style="…"`
  attribute values and `<style>` blocks. In `.ts`, only `styles` array entries. Scoping it
  this way is what the justification above actually requires, and it is what stops
  `class="surface-tan"`, the word "Silver" in body copy, and `<svg width="24">` from
  crying wolf — a checker with false positives gets worked around, and its self-test then
  encodes the noise. Comments are stripped first.
  Bans: `#hex`,
  `rgb(`/`rgba(`, `hsl(`/`hsla(`, the CSS named colors, and raw `px` lengths in
  `padding`/`margin`/`gap`/`inset`/`border-radius`/`box-shadow`/`width`/`font-size`
  — AGENTS §1 bans literal colors, spacing **and radii**, and §22's Design Lab controls
  name "sidebar width" and "font scale", which are exactly the literals the shell would
  otherwise hardcode. `1px` is allowed (hairline borders); `_tokens.scss` is exempt.
- `scripts/fixtures/violations/` — one fixture per banned category (hex, `rgb(`, `hsl(`,
  a named color, a `px` length) across a stylesheet, a template and a component, **plus a
  `1px` border control that must not be reported**.
- `scripts/expect-failure.mjs` — spawns another script with `spawnSync(process.execPath, …)`
  and inverts the exit code. No shell semantics, so it behaves the same in PowerShell,
  `cmd` and `sh`. It asserts the exact **set of rule names** reported, not a total count:
  a count stays green when one rule silently stops matching while another gains a false
  positive, which is the regression the self-test exists to catch. That requires
  `check-design-tokens.mjs` to print one `path:line:col rule-name` line per finding —
  a little more than `check-no-direct-date.mjs`'s stderr format, and the reason for it.
- `package.json` — `lint` becomes `tsc … && tsc … && node scripts/check-design-tokens.mjs
  && pnpm lint:tokens:selftest`, plus the `lint:tokens:selftest` script itself. Chaining
  means the root `pnpm -r --if-present lint` picks the self-test up for free.

## Test plan

Written first, each named with what it proves.

Setup rules, so no spec can drift from another:

- Every component and store spec provides fake `WORK_MANAGER_GATEWAY` and
  `IDENTITY_PROVIDER` through `TestBed`. Shell-level specs — `app.spec.ts`,
  `app-shell.spec.ts`, `sidebar.spec.ts` — additionally provide `provideRouter([])`.
  `AppShell` renders `<router-outlet>` and embeds `Sidebar`, so `RouterOutlet` and
  `RouterLink` inject `Router`, `ActivatedRoute`, `ChildrenOutletContexts` and
  `LocationStrategy`; without them the fixture throws at creation and takes every test in
  the file with it. `App` is worse — it has no providers at all today, and rendering
  `<app-shell>` instantiates the whole subtree. One
  `core/gateway/testing/shell-test-providers.ts` returns the array, and all three use it.
- The app is zoneless, so specs `await fixture.whenStable()` rather than calling
  `detectChanges()`. That is only a valid synchronization point because `ShellStore.load()`
  runs inside `PendingTasks.run` — `ApplicationRef.isStable` tracks the scheduler and
  `PendingTasks`, not an arbitrary promise chain, so without it `whenStable()` can resolve
  before the store has written a single signal.
- Specs that touch shared jsdom globals reset them: `localStorage.clear()` and
  `document.documentElement.removeAttribute('data-theme')` in `afterEach`, since one
  `document` and one storage are shared across every test in a file.

**`prototype-work-manager-gateway.spec.ts`** (fake `fetch`)

1. `projects.list` requests `GET {base}/api/projects` — the adapter, not a component, owns
   the URL.
2. `projects.list({status:[…]})` serializes repeated `status` params — the query reaches
   the host in the shape `routes.ts` parses.
3. `projects.list` sends `x-prototype-user` taken from the resolved identity — the persona
   travels with every call.
4. After the identity provider clears a stale persona, the next `projects.list` sends the
   **resolved default** user id, not the stale one — proves the header is derived from
   `getCurrentIdentity()` and is therefore self-healing.
5. `tasks.complete(id)` issues `POST /api/tasks/{id}/complete` with no body — the §9 method
   the host's no-body route expects.
6. `tasks.create(input)` sends a JSON body with `content-type` and accepts **201** — the
   host returns 201, not 200, so a `status !== 200` check would break here.
7. `tasks.archive(id)` validates the returned `Task` and resolves `void` — §9 pins the
   return type; the adapter still does not trust an unchecked body.
8. `tasks.list` serializes a `TaskQuery` in the shapes `queryObject` actually parses —
   repeated `status` and `priority`, and a boolean `includeArchived`. §70 keeps the gateway
   *and its tests*, and §71's disposable list does not cover it, so no method decision 4
   keeps ships untested.
9. `tasks.update(id, input)` issues `PATCH /api/tasks/{id}` with a JSON body.
10. A 404 body `{error:'not_found'}` rejects with `GatewayError{status:404, code:'not_found'}`.
11. A 409 `{error:'rule_violation'}` rejects with `code:'rule_violation'` — the failure
    Slice 7's optimistic completion (§63) must revert on, and the likeliest one.
12. A non-JSON body (empty 204, or an HTML error page) still produces a `GatewayError`, not
    a raw `SyntaxError` out of `response.json()`.
13. A 200 body failing `ProjectSchema` rejects with `code:'invalid_response'`, `status: 0`
    — contracts are enforced at the boundary (§11), not trusted.
14. A `fetch` rejection (host stopped) becomes `code:'unreachable'`, `status: 0` — the path
    §63 depends on.

**`prototype-identity-provider.spec.ts`**

15. Calls `GET /api/me` once for two `getCurrentIdentity()` calls — memoized.
16. A **rejected** `/api/me` is not memoized: the next `getCurrentIdentity()` refetches and
    resolves. `pnpm dev` starts both processes at once, so losing the race to the host's
    `listen` must not brick the session.
17. Sends `x-prototype-user` when a persona is stored, omits it when not — the host default
    is reachable and Slice 12 has its hook.
18. A stored persona the host 404s on is cleared from `localStorage` and retried once
    without the header, resolving the default identity — a stale key cannot brick the app.

**`theme-service.spec.ts`**

19. `seedFrom` an identity preferring `light` sets `data-theme="light"` on the root element.
20. `toggle()` flips the attribute and the signal — §22's two themes, nothing else.

**`shell-store.spec.ts`** (fake gateway, no HTTP)

21. `load()` populates `identity` and `projects` and clears `loading`.
22. `projectTree` nests **two levels** — a grandchild under a child under a root — matching
    the `nested-projects` seed. A one-level assertion would pass a builder that flattens
    grandchildren.
23. A child whose parent is absent from the list still appears at the top level — a
    filtered list cannot make a project invisible.
24. A parent cycle (`a.parent = b`, `b.parent = a`) terminates and renders both — proves
    the visited-set guard holds for a list the client does not own, which is exactly what a
    production adapter will hand it.
25. The query `load()` sends omits `archived` and contains every other
    `ProjectStatusSchema` option — so adding a sixth status cannot silently drop it from
    the sidebar.
26. A rejecting `projects.list` sets `error`, leaves `projects` empty and `loading` false.
27. A rejecting `getCurrentIdentity` also reaches a settled error state — the shell must
    not hang on `loading` when identity is what failed.

**`sidebar.spec.ts`** (inputs only — no gateway, no store. It does provide
`provideRouter([])`, which `RouterLink` needs for `Router` and the root `ActivatedRoute`;
an empty route array is fine because `RouterLink` does not validate its target.)

28. Renders Home, Projects, Calendar, Search, Settings — §23's items, in §23's order.
29. Each navigating item's generated `href` is its §68 route: Home → `/app`, Calendar →
    `/calendar`, Search → `/search`, Settings → `/settings`, a project → `/projects/{id}`.
    Asserted on `href`, not on a `routerLink` attribute — `routerLink` is an input and is
    not reflected into the DOM. Proves the items go somewhere, not that five strings render.
30. "Projects" is a `<button>` with no `href`, and activating it flips `aria-expanded` and
    toggles the group — §68 has no `/projects`, and a `<div (click)>` would pass a bare
    "not an anchor" assertion while being unreachable by keyboard.
31. A three-level `projectTree` renders all three levels nested — the recursion, not a
    fixed template depth.
32. An empty tree renders an empty state, not a blank gap.
33. An `error` input renders the error, not an infinite spinner.

**`top-bar.spec.ts`**

34. Renders the identity's name and emoji avatar; falls back to the name's initial when
    `avatar` is absent (it is optional in `UserSchema`).

**`app-shell.spec.ts`**

35. Renders a top bar, a sidebar, and a `<router-outlet>` — §23's three regions.
36. With no `data-theme` on the root before the fixture stabilizes, loading an identity
    preferring `light` leaves `data-theme="light"` after — asserted as a **transition**, so
    a leaked attribute from an earlier test cannot make it pass. Proves the
    `ShellStore` → `ThemeService` wiring, which tests 19–20 alone do not.

**`app.routes.spec.ts`**

37. Each §68 path resolves to a component.
38. `/` redirects to `/app`, and `/calendar` does **not** (i.e. `pathMatch: 'full'` holds).
39. An unknown path renders `NotFoundPage`.

**`app.spec.ts`** (updated)

40. `App` renders `<app-shell>`.

**Contracts** — `packages/contracts/src/user.test.ts` (every file in that package has a
sibling test; a newly exported schema does not get to be the exception)

41. `IdentitySchema` parses `{ user, workspace }` and rejects a bare `User`.
42. `PrototypeDocumentSchema.shape` has no `identities` key — turns "there must never be an
    `identities` collection" from prose into an assertion.

**Host** — `api/routes.test.ts` (via `resolveRoute`)

43. `GET /api/me` returns the first user and their workspace when no header is sent.
44. `GET /api/me` with `x-prototype-user: user-alex` returns Alex and Alex's workspace —
    the workspace comes from the user, never the request (`context.ts`'s rule).
45. `GET /api/me` with an unknown persona → 404 (the case test 18 relies on).

**Host** — `main.test.ts` (real server, real `fetch`; CORS is invisible to `resolveRoute`)

46. `OPTIONS /api/projects` from an allowed origin → 204, with allow-origin, allow-methods
    (`GET, POST, PATCH, OPTIONS`), allow-headers, `Vary: Origin`, and **no body or
    `content-type`**.
47. `GET /api/projects` from an allowed origin carries `access-control-allow-origin` **and
    `Vary: Origin`** — the header is only load-bearing if it is on the real response too,
    not just on the preflight.
48. A **disallowed** origin gets no allow-origin header — "localhost only" is otherwise an
    unverified claim.
49. A **404 and a 409** response carry the CORS headers too — otherwise the browser hides
    the real body and the gateway's error mapping (tests 10–11) never sees it in practice.
    Run against a purpose-built table with a throwing route, not the service-backed one.

## Boundaries touched

| Boundary (§1 / AGENTS) | How this slice stays on the right side |
|---|---|
| Components depend on gateway *interfaces* | Components inject `WORK_MANAGER_GATEWAY`, typed `WorkManagerGateway`. `app.config.ts` is the only file importing `PrototypeWorkManagerGateway`. Specs use `core/gateway/testing/fake-gateway.ts`, so no spec can reach for the adapter either. Verified by grep at review time. |
| Components never see HTTP | `fetch`, `Response`, headers and status codes exist only inside `core/gateway/`. The UI sees `GatewayError`. |
| §19's `Page → Store → Gateway` | Only `ShellStore` touches the gateway. `Sidebar` and `TopBar` are input-driven and inject neither store nor gateway. |
| Contracts defined once | The gateway parses responses with `@cwm/contracts` schemas. `Identity` is added *to* contracts. `projectTree` is derived view state and stays out of contracts on purpose. |
| Domain untouched | No domain code changes. The host route reads a snapshot, as `routes.ts` already does for the actor; no new service, no repository bypass. |
| No literal colors/spacing/radii | `_tokens.scss` is the only file with literals, enforced by `check-design-tokens.mjs` over `.scss`, `.html` and `.ts` in `pnpm lint`, and proven to bite by the chained self-test. |
| No scattered `if (prototypeMode)` | Adapter choice happens once, in `app.config.ts`. |
| No mega-store (§20) | `ShellStore` owns only the shell's own state. Slices 7–11 add their own. |

## Explicit non-goals

From the slice's *Do not*: no global mega-store, no project page.

Deferred deliberately:

- Task UI of any kind (Slice 7) — the `TaskGateway` methods exist and are tested, but
  nothing renders a task. See decision 4 for why this one is *not* trimmed.
- Section registry, layout modes, dashboard widgets, calendar, search results, agent
  connections, dev-panel behavior, Design Lab controls — every §68 route those own is a
  placeholder.
- Persona **switching** UI (Slice 12). The identity provider reads a stored persona; only
  the dev panel will write it.
- Persisting a theme change back to `UserPreferences` — needs a write route §61 does not
  define. Session-only; decision 5.
- Live updates (§62, Slice 16). The shell loads once.
- Mobile/responsive layout. §23 is desktop-first.

## Decisions this plan makes

Entries 1–3 and 5 become `docs/decisions/` files (acceptance item 7).

**1. The gateway surface grows with its implementations.**
The slice text says "stub the rest as interfaces without implementations". This plan does
not: `WorkManagerGateway` carries `projects` and `tasks` only, with a doc comment naming
§9's other six and the slice each arrives in. Six interfaces nothing implements would force
the adapter to fake six members, and §9 says an interface "similar to" the sketch — it pins
only `TaskGateway`. A deliberate divergence from `development.md`, recorded there per
AGENTS §2 rule 2.

**2. `Identity = { user, workspace }` in contracts, served by `GET /api/me`.**
§18 names the interface, not the type, and the host has no route for it. `workspace` is not
speculative: `CreateProjectInputSchema` requires a `workspaceId`, so the UI will need it,
and `resolveActor` already derives it from the resolved user rather than the request.

**3. CORS on the host, not an Angular dev-server proxy.**
A `:4200` proxy would hide the cross-origin request the production adapter must also make.
Because `x-prototype-user` is non-simple, *every* gateway call preflights — a proxy would
defer discovering a broken preflight until the day `HttpWorkManagerGateway` lands, the
exact swap §10 exists to protect. Fixed origin allowlist, no credentials, no
configurability (§71).

**4. `ProjectGateway` is `list` + `get`; `TaskGateway` is implemented in full.**
These look inconsistent and are not. `ProjectGateway` has no shape in §9, so decision 1's
principle applies and a method arrives with the code that calls it: the shell lists
projects, the project page (Slice 8) gets one, `create`/`update` wait for the UI that
writes. `TaskGateway` is different on two counts — §9 pins it verbatim as the one gateway
it fully specifies, and `development.md`'s Slice 6 build list says in as many words that
"only `projects` and `tasks` need real methods this slice." Narrowing it would diverge from
both, to save four small methods that Slice 7 consumes immediately.
(Note for Slice 8: project archiving needs no new route — `PATCH /api/projects/:id` with
`status:'archived'` already enforces the archive guard in `ProjectService.update`.)

**5. Theme selection is session-only.**
`seedFrom(identity)` reads `UserPreferences.theme`; `toggle()` does not write back. §61
defines no user-write route and inventing one is Slice 12's business at the earliest.
Slice 12's dev panel also lists Theme among its controls: when it lands, the top-bar toggle
is a candidate to be superseded rather than duplicated. Slice 6 still needs *a* switcher —
its "Done when" requires theme switching to work.

## Revisions

**Round 1** (subagent, against the first draft) returned 20 findings; all were checked
against the code and all held.

- Acceptance step 6 was unrunnable — `pnpm prototype:reset` seeds `personal-workspace`,
  which has **no** sub-project. Split across three seeds, adding the `empty` sidebar state.
- The lint self-test could not live in the jsdom component runner. It became a committed
  fixture directory plus a script, and the checker gained `--root`.
- The token check was scoped to `.scss` only, which `inlineStyleLanguage: "scss"` makes a
  hole; it now walks `.html` and `.ts` too, and covers radii and shadows, not just colors.
- `Sidebar` was specced with a fake *gateway*, inverting §19. It is now presentational and
  `AppShell` owns `ShellStore` — which also turned "every component spec provides a fake"
  from an assertion into `core/gateway/testing/fake-gateway.ts`.
- CORS headers must be written in `createRequestHandler`'s single `writeHead`, or a
  404/409 reaches the browser as a CORS failure and the gateway reports `unreachable`.
- Identity had no failure path: a stale `localStorage` persona 404s every call.
- Theme seeding had no named wiring point and no test that the wiring exists.
- The sidebar would have listed archived projects, and "Projects" had nowhere to go.
- Gateway coverage gained the 409 and non-JSON-body paths; `status: 0` pinned for
  transport-level errors.
- The four open questions became decisions; `ProjectGateway` was trimmed to `list` + `get`.

**Round 2** returned 18 more. Three were blocking, and the first was a real defect the
first draft would have shipped:

- **The preflight would have 404'd.** `match()` requires the pattern's method to equal the
  request's, and no pattern is `OPTIONS` — so `OPTIONS /api/projects` never reaches a
  handler. Combined with `x-prototype-user` forcing a preflight on *every* call, the whole
  browser acceptance run was unreachable. `createRequestHandler` now short-circuits
  `OPTIONS` before `readBody` and `resolveRoute`.
- The CORS tests were assigned to `router.test.ts`, which drives `resolveRoute` and cannot
  observe `createRequestHandler` at all. They moved to `main.test.ts`, the only file that
  starts a real server.
- `lint:tokens:selftest` as a shell one-liner can never fail: `&& exit 1 || exit 0` swallows
  its own failure in both `cmd` and `sh`. It became `scripts/expect-failure.mjs`.
- Making `RouteResult.contentType` optional was checked and would not have broken any
  existing route or test — but it would have let a future route silently serve JSON with no
  content-type. Dropped: with the preflight handled outside the route table, `RouteResult`
  needs no change at all.
- The gateway would have read the persona from `localStorage` independently of the identity
  provider, so a stale key kept 404-ing after the provider healed itself. The header now
  derives from `getCurrentIdentity()`.
- `sidebar.spec.ts` "inputs only, no providers" would have failed on `RouterLink`'s
  injection of `Router`, taking all six sidebar tests with it — and `routerLink` is an
  input, not a reflected attribute, so the assertion had to move to `href`.
- The `**` wildcard had no component, and binding route `data` to `PlaceholderPage`'s
  inputs would have required `withComponentInputBinding()`. A `NotFoundPage` component
  avoids both.
- The `nested-projects` seed is **three** levels (Home renovation → Kitchen → Cabinets),
  not two. Acceptance and tests 19/28 now assert the recursion.
- `projectTree` had no cycle guard, though `ProjectService.assertParentIsUsable` exists
  precisely because a document can contain one.
- Smaller: the self-test now chains into `lint` so the root `-r` sweep picks it up;
  `resolveUser` is extracted so `/api/me` and `resolveActor` share one lookup and one 404;
  `Vary: Origin` and `Access-Control-Max-Age` added; light theme moved to
  `:root[data-theme='light']` so it wins on specificity rather than source order; the token
  ban extended to `width`/`font-size` (§22 names "sidebar width" and "font scale") with
  `1px` allowed and `*.spec.ts` excluded; theme specs reset the root attribute; `core/theme/`
  documented as a deliberate fifth `core/` folder.

**Round 3** returned 13, and a NOT READY verdict on four of them. It also verified two
things empirically rather than by argument — that a Node server answering `OPTIONS` without
draining the request stream keeps the keep-alive connection healthy, and that
`@angular/router@22.1.3` binds `[attr.href]` from `router.serializeUrl` with no navigation
required, so test 29's `href` assertion is writable. What changed:

- `app.spec.ts` and `app-shell.spec.ts` would have failed at TestBed setup exactly as
  `sidebar.spec.ts` would have in round 2 — `RouterOutlet` and the embedded `Sidebar` need
  router providers, and `App` currently has none at all. Hence
  `core/gateway/testing/shell-test-providers.ts`.
- **`await fixture.whenStable()` does not await `ShellStore.load()`.** In a zoneless app
  `isStable` tracks the scheduler and `PendingTasks`, not an arbitrary promise chain, so
  four async specs — including test 36's transition assertion — would have been
  microtask-order flaky. `load()` now runs inside `PendingTasks.run`, which is the right
  thing for the real app regardless.
- The cycle guard's stated *reason* was false: `validateDocumentIntegrity` runs
  `assertAcyclic` at load, so a cyclic `data.json` stops the host from starting and can
  never reach a client. The guard stays — the real reason is that the client walks a list
  it does not own and a production API carries no such invariant — but a false code comment
  is a stale doc (AGENTS §2 rule 6).
- Test 49 would have built its route table with `createApiRouteTable(await loadPersistence())`,
  which resolves the default data path and seeds it if absent — mutating the developer's
  real `.prototype/data.json` and making the test order-dependent, against `main.ts`'s own
  stated intent. It now uses a throwing route instead; the test is about headers.
- `PrototypeIdentityProvider` memoized *rejections*, so losing the startup race to the
  host's `listen` — likely, since `pnpm dev` starts both at once — would have bricked every
  gateway call until reload. The same class of bug as round 1's stale persona, on the other
  branch. Test 16.
- The token checker's `.html` rule was file-wide, which would have flagged
  `class="surface-tan"`, the word "Silver" in body copy, and `<svg width="24">`. Rules are
  now scoped to declaration values, `style` attributes and `<style>` blocks only. Its
  self-test asserts the exact set of rule names plus a `1px` control that must not fire,
  since a total count stays green when one rule breaks and another gains a false positive.
- Smaller: `IdentitySchema` had no contract test in a package where every file has one;
  `tasks.list`/`get`/`update` shipped untested under decision 4 and now do not; the status
  query is derived from `ProjectStatusSchema.options` rather than hardcoded; "Projects" is
  pinned as a keyboard-operable `<button>` with `aria-expanded`; `Vary: Origin` is asserted
  on the real response, not just the preflight; decision 4 gets a decision-log entry, since
  it is the one every reviewer has questioned.

Two round-2 findings were **not** adopted. The reviewer proposed trimming `TaskGateway` to
`list`/`get` by decision 4's own principle, and moving the whole token-lint tool out of the
slice on size grounds. `development.md`'s build list says "only `projects` and `tasks` need
real methods this slice" and §9 pins `TaskGateway` verbatim, so trimming it diverges from
both documents to save four methods Slice 7 consumes immediately; and the slice text says
"No literal color or spacing values in component styles **from here on**", which is a rule
that needs enforcement at the moment it starts applying, not one slice later. The size
observation stands on its own, though: this is the largest slice so far, and it is one
implementation-order note rather than a scope cut — build the boundary (contracts, host
route, CORS, gateway, identity) green before any component exists, then the shell on top.

Round 3 agreed with both rejections and sharpened the first: decision 1's principle is
derived from the *absence* of a pinned shape in §9, so it cannot govern the one interface
§9 pins verbatim. Its only real cost was three untested methods, which is a test to write
rather than a divergence to record — now tests 8–9.

## What running it changed

Step 6 of the acceptance check found two things the 54 passing specs did not.

**A boundary hole.** With the host stopped, the sidebar rendered "Failed to fetch" — the
browser's own words. The gateway maps every transport failure to a `GatewayError`, but
`PrototypeIdentityProvider` did not — and since every gateway call awaits
`getCurrentIdentity()` first, the identity provider is the failure a user actually meets.
Each spec mocked the layer under test, so none of them could see it. Fixed, with three
tests: an unreachable host, a non-`Identity` body, and a non-404 status.

**Two pieces of workflow friction**, both recorded in `.prototype/notes.json` and both
Slice 12's territory (§46, §76): the host obeys a bare `PORT`, so any tool that sets
`PORT=4200` to launch the web app takes `:4310` from the host — and the browser then shows
the host's own `{"error":"not_found"}` at `:4200`, which reads like an app routing bug.
And reseeding while the app runs changes nothing on screen, because the host reads
`data.json` once at startup and holds it. Neither is fixed here.

The rest of step 6 passed as written: `/` redirects to `/app`; the sidebar lists the
project names actually in `data.json`; `nested-projects` renders Cabinets inside Kitchen
inside Home renovation; `empty` renders its empty state; every §68 route loads and an
unknown path renders `NotFoundPage`; and the theme toggle changes exactly two things in
the DOM — `data-theme` on `<html>` and the toggle's own label — while every surface
repaints.
