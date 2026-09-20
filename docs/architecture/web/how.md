# How the web app works

## Runtime flow

1. `pnpm dev:web` runs `ng serve` (`@angular/build:dev-server`) on `:4200`.
   `main.ts` bootstraps `App` with `appConfig`, which provides the router with
   component-input binding and the four adapters behind their tokens.
2. `App` renders `AppShell` and mounts `DevPanel` once, so Ctrl/Cmd+Shift+D works on
   every route. `AppShell` owns `ShellStore`, which loads the project tree through the
   gateway and renders `Sidebar` and `TopBar` as presentational children.
3. `PrototypeIdentityProvider` reads `GET /api/me`; `ThemeService` applies the persona's
   theme as `data-theme` on `<html>`; `PrototypeLiveUpdates` opens the `EventSource`
   scoped to the persona.
4. A route activates a page component, which provides its store; the store reads through
   `WORK_MANAGER_GATEWAY` and subscribes to `LIVE_UPDATES`. Writes paint optimistically
   where §63 asks, guarded by an in-flight counter so a live frame cannot overwrite them. Task
   and reflection stores receive strict `{ task|reflection, operation }` write envelopes and
   unwrap the row they render.
5. A frame arrives; each store routes on `type`, `projectId` and `rootProjectId` and
   re-reads quietly. Compound task/reflection Add transitions also refresh section existence on
   open project surfaces. A `prototype.reloaded` frame reloads the tab.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `App` | component | Composition root of the view | [API](../../api/components/App.html) |
| `appConfig` | const | The only file naming concrete adapters | [API](../../api/miscellaneous/variables.html#appConfig) |
| `routes` | const | §68's map | [API](../../api/miscellaneous/variables.html#routes) |
| `AppShell` | component | §23's layout; owns `ShellStore` | [API](../../api/components/AppShell.html) |
| `WorkManagerGateway` | interface | The one dependency every store has | [API](../../api/interfaces/WorkManagerGateway.html) |
| `SECTION_REGISTRY`, `DASHBOARD_WIDGET_REGISTRY`, `PROJECT_PAGE_REGISTRY` | consts | The three open-ended lists | [API](../../api/miscellaneous/variables.html#SECTION_REGISTRY) |

Each subsystem's `how.md` lists its own.

## Dependencies

**Depends on**

- [contracts](../contracts/overview.md) — every type the gateway returns and every input
  a form builds; `zod` for the `GatewayError.details` parse.
- [prototype-host](../prototype-host/overview.md) — over HTTP only, at
  `PROTOTYPE_API_BASE_URL` (`http://127.0.0.1:4310`); never an import.
- `@angular/core`, `common`, `forms`, `router`, `platform-browser`; `@angular/cdk`
  (drag-drop, overlay); `rxjs` for the router only.

**Depended on by**

- [testing](../testing/overview.md) — Storybook renders its components; Playwright
  drives it.

## Invariants and lints

- **No component names a transport.** `fetch`, URLs and status codes exist in
  `core/gateway/prototype-work-manager-gateway.ts`, `core/identity/prototype-identity-provider.ts`,
  `core/live/prototype-live-updates.ts` and `prototype/control/prototype-http-control.ts`
  only. A reviewer's boundary pass checks this.
- **`core/` does not import `prototype/`.** The dev panel attaches at `App`.
- **No literal colours, spacing or radii in component styles** (§21) —
  `scripts/check-design-tokens.mjs` in `pnpm --filter web lint`, with
  `expect-failure.mjs` proving the lint catches its fixtures.
- **One flag service** (§47) — `PrototypeSettings`; there is no `if (prototypeMode)`.
- **Registries are pinned** — `registry.spec.ts` in sections, widgets and pages fails on
  an unlisted or reordered entry.
- **Optimistic writes are guarded** — a store increments `pendingWrites` around a write
  and defers live re-reads behind it.
- **`LIVE_UPDATES` is provided** — `app.spec.ts` asserts the token is not on its inert
  default, because forgetting it leaves a silently dead app.

## Commands

```bash
pnpm dev:web                      # ng serve on :4200
pnpm --filter web test            # ng test --no-watch (vitest under @angular/build)
pnpm --filter web lint            # tsc on app, spec and storybook configs; the token lint and its self-test
pnpm build                        # ng build with the 850 kB warning / 1050 kB error budgets
pnpm storybook                    # :6006
pnpm storybook:build              # apps/web/storybook-static (git-ignored)
```

## Changing it

- **A new section type:** a folder under `features/projects/sections/`, a component
  implementing `SectionContentComponent`, one line in `SECTION_REGISTRY`; if it owns rows,
  `SECTION_OWNERSHIP` in contracts. See [projects](projects/how.md).
- **A new widget:** a folder under `features/dashboard/widgets/`, one line in
  `DASHBOARD_WIDGET_REGISTRY`, `queryFrom` if it needs a query. See
  [dashboard](dashboard/how.md).
- **A new gateway method:** the interface in `work-manager-gateway.ts`, the adapter, the
  fake in `core/gateway/testing`, and the host route — in that order, each with its test.
- **The trap:** an inline arrow in a template passed as a callback input to a component
  mounted through `NgComponentOutlet`. `setInput` runs every change-detection pass and
  only `Object.is` stops a re-render; in a zoneless app a fresh arrow each pass is a
  self-feeding loop. Pass class-property arrows, build input records in `computed()`.
