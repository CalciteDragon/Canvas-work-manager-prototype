# How the web app works

Settings routes `/settings/archived-projects` to `ArchivedProjectsPage` outside project
navigation. Its store reads `projects.archived()` via the gateway, keeps an explicit status per
row, reports the existing project write to history and refreshes after success or refusal. It
keeps an acknowledged success when only the following read fails and offers a read-only Retry.
Project frames and reconnects refresh the workspace list. When Restore or Retry owned focus and
focus is lost once it settles, the page moves it to Retry while an error blocks the list; else,
after Restore, to the enabled status selector now at the restored row's place (the next row, a
revealed child, or the previous row) and, after Retry, to the first enabled status selector; else
to the heading. Focus moved elsewhere during the request stays there. A later failed read keeps
a "Restore succeeded" error, so the committed write stays reported; any other error is replaced.

## Runtime flow

1. `pnpm dev:web` runs `ng serve` (`@angular/build:dev-server`) on `:4200`.
   `main.ts` bootstraps `App` with `appConfig`, which provides the router with
   component-input binding and the four adapters behind their tokens.
2. `App` renders `AppShell` and mounts `DevPanel` once, so Ctrl/Cmd+Shift+D works on
   every route; its controls are deferred until the modal opens. `AppShell` owns `ShellStore`, which loads the project tree through the
   gateway and renders `Sidebar` and `TopBar` as presentational children.
3. `PrototypeIdentityProvider` reads `GET /api/me`; an app initializer constructs
   `ThemeService`, which applies the device or saved browser theme as `data-theme` on `<html>`;
   `PrototypeLiveUpdates` opens the `EventSource`
   scoped to the persona.
4. A route activates a page component, which provides its store; the store reads through
   `WORK_MANAGER_GATEWAY` and subscribes to `LIVE_UPDATES`. Writes paint optimistically
   where §63 asks, guarded by an in-flight counter so a live frame cannot overwrite them. Task
   and reflection stores receive strict `{ task|reflection, operation }` write envelopes and
   unwrap the row they render.
5. A frame arrives; each store routes on `type`, `projectId` and `rootProjectId` and
   re-reads quietly. Compound task/reflection Add transitions also refresh section existence on
   open project surfaces. A `prototype.reloaded` frame reloads the tab.

Markdown rendering escapes HTML, disables images and retains markdown-it unsafe-link
validation; Angular sanitizes the `innerHTML` binding again. Headings nest under the section
title, links get safe new-tab attributes, and table alignment uses classes.
`ViewEncapsulation.None` reaches inserted markup with every style scoped beneath
`.markdown-renderer`, using design tokens including `--font-mono`. The parser loads lazily.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `App` | component | Composition root of the view | [API](../../api/components/App.html) |
| `appConfig` | const | The only file naming concrete adapters | [API](../../api/miscellaneous/variables.html#appConfig) |
| `routes` | const | §68's map | [API](../../api/miscellaneous/variables.html#routes) |
| `AppShell` | component | §23's layout; owns `ShellStore` | [API](../../api/components/AppShell.html) |
| `WorkManagerGateway` | interface | The one dependency every store has | [API](../../api/interfaces/WorkManagerGateway.html) |
| `ArchivedProjectsPage` | component | Settings recovery route | [API](../../api/components/ArchivedProjectsPage.html) |
| `ArchivedProjectsStore` | injectable | Workspace-scoped recovery state, retry and live refresh | [API](../../api/injectables/ArchivedProjectsStore.html) |
| `SECTION_REGISTRY`, `DASHBOARD_WIDGET_REGISTRY`, `PROJECT_PAGE_REGISTRY` | consts | The three open-ended lists | [API](../../api/miscellaneous/variables.html#SECTION_REGISTRY) |
| `MarkdownRenderer`, `renderMarkdown` | component / function | Safe source presentation | [API](../../api/components/MarkdownRenderer.html) |
| `Icon` | component | Shared decorative SVG marks (`shared/components/icon`) | [API](../../api/components/Icon.html) |

Each subsystem's `how.md` lists its own.

## Dependencies

**Depends on**

- `markdown-it` 15, imported only by the lazy shared renderer.

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
  `expect-failure.mjs` proving the lint catches its fixtures. In a `.ts` file, `styles:` is read
  as CSS and every other string as markup, so a story decorator is checked like a template; a
  `${…}` inside a `style` attribute or a `<style>` block must name a module-scope string `const`
  that no parameter or inner variable shadows, or it fails as `unresolved-style`.
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


**Controls (slice 72).** A control takes its look from a class in `_controls.scss`; the component's SCSS keeps only layout (grid placement, gaps, inline size, margins). Emulated encapsulation makes a component's `button {…}` (0,1,1) and `.x {…}` (0,2,0) beat a global `.button` (0,1,0), so adopting a primitive means **deleting** the component's control paint, never overriding it. Each control class sets `--control-fill`, `--control-edge`, `--control-ink` and their hover/pressed partners; `_control-states.scss` holds the hover, pressed, field-hover and focus-ring mixins that the real states and the Design Lab's forced specimens both include, so a specimen cannot drift. Every interactive primitive is at least `--size-target-min` and grows to `--size-hit-target` under the app's touch query; heights follow the density knob, targets never do. Forced colours returns checkbox, radio and select to `appearance: auto`.

Depth planes use only --plane-*-background/filter in container styles. `_tokens.scss` resolves solid fallbacks for reduced transparency, unsupported backdrop filters and forced colors, and caps reduced-motion durations at 80ms. `_breakpoints.scss` holds CSS-free Sass constants; the token lint checks the two TS queries against it and rejects literal z-index, weight, query lengths and non-endpoint opacity.
