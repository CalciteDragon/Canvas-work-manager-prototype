# How the web app works

Settings routes `/settings/archived-projects` to `ArchivedProjectsPage` outside project
navigation. Its store reads `projects.archived()` via the gateway, keeps an explicit status per
row, reports the existing project write to history and refreshes after success or refusal. Its
`error()` holds Archive's four failure states in Archive's precedence (Slice 78), said of "this
list": a committed restore whose refresh failed ("Restored “X”, but this list couldn’t refresh.",
Retry refresh), a refused restore ("Couldn’t restore “X”. The list may have changed.", or the
reach sentence for `unreachable`), a stale list ("This list may be out of date.", polite) and a
load failure, each one `FailureMessage` (`data-archived-error`) whose read-only Try again stays
busy on `retryPending()`. Restore stays paused under all four until a read succeeds; the quiet
re-read before a refusal ends in the refusal, and Try again hands a refusal over to its read.
Project frames and reconnects refresh the workspace list. Committed Restore opens one toast
naming the project and resulting status, with Open it and no Undo outside a workspace. Focus
moves to its first action only when the removed Restore control or body still owns focus;
dismissal falls back to a surviving Restore or the heading. Failed Restore, Try again and Retry
refresh retain the existing bounded list-focus recovery, and a person who moved focus elsewhere keeps it. A later
failed read keeps the committed-unrefreshed state so the committed write stays acknowledged.

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

Shared feedback uses `Toast` and root `ToastSlot`. A second claim closes the first; navigation
closes feedback, and modal suppression hides it without dropping it. Status toasts dismiss after
eight unattended seconds; hover, focus and suppression pause and restart that timer. Alerts and
pending Undo never time out. `ReceiptToast` in core composes this presentational layer with the
workspace's inert-default receipt port. The toast docks in the content track with a matching
reserve and becomes solid whenever another lift is open. Its height cap,
`--toast-max-block-size`, is 12rem, and 16rem on touch, where the 44 px actions and a failure's
Details row would otherwise clip the message; the shell's clearance follows the token. A toast given a `detail` (a failure's raw
reason) shows it under a collapsed Details and never announces it.

Failures are a `Failure { sentence, reason }` from `readFailure(error, subject)`,
`headedReadFailure(error)` (for a read whose heading already says "Couldn’t load …") or
`writeFailure(error, sentence)` in `shared/feedback/failure.ts`, which reads `code` and `message`
structurally and imports nothing from `core/`. `FailureMessage` renders one: a region weight in
place of a body, page or widget, or an inline weight on a row or field; the host carries the
caller's `data-*-error` hook, `sentenceId` names the only element a control should describe itself
by, and the reason sits beside it in a native `<details>`. Slice 78 is moving every store to it;
until a store has moved, its own message still ends with the host's reason.

An inline write failure whose sentence is off screen can be pinned to its scroll port's edge.
`PinnedFailureDirective` (`[appPinnedFailure]`, on the row or frame that owns the failure, with
`pinnedFailureSubject` and `pinnedFailureSentence`, the sentence's id) registers each failure
occurrence with the root `PinnedFailures` registry and watches the sentence with an
`IntersectionObserver` rooted at the nearest scrolling ancestor, shrunk by the measured clearance.
`PinnedFailureSlot`, which the app shell renders inside `.workspace`, draws one copy per edge —
the most recent, "and N more" — clear of a stuck `[data-pin-clearance]` control and an open
toast, and centred on the toast's content track. Pressing a copy is the only thing that scrolls:
it brings the sentence (and the control about to take focus, when both fit) into the clear port
and focuses the control whose `aria-describedby` names it (the sentence itself when that control
is disabled). Close dismisses that occurrence only; a replacement failure re-arms. The trap: the
sentence id must be unique and inside the host, and the clearance hook is opt-in, so a sticky
control without it is not measured. What registers: `TaskRow` (canvas Task List rows), Todos rows,
the section and shortcut frames' collapse failures, and the Task List section's drag-receive
banner (on `.task-list-section`, subject the list's name). Read banners, page-level failures and
restore rows do not. The Task List's sticky quick-add carries `data-pin-clearance`.

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

| `Toast` | component | Presentational feedback, live regions and timer | [API](../../api/components/Toast.html) |
| `FailureMessage` | component | One failure form: sentence, optional recovery, reason under Details | [API](../../api/components/FailureMessage.html) |
| `Failure`, `readFailure`, `headedReadFailure`, `writeFailure` | interface / functions | The one error-to-sentence translation | [API](../../api/interfaces/Failure.html) |
| `ToastSlot` | injectable | One visible toast, navigation dismissal and modal suppression | [API](../../api/injectables/ToastSlot.html) |
| `PinnedFailures` | injectable | Registry of off-screen write failures: most recent per edge, occurrence dismissal, clearance | [API](../../api/injectables/PinnedFailures.html) |
| `PinnedFailureDirective` | directive | Registers a reference's failure and watches its sentence in the scroll port | [API](../../api/directives/PinnedFailureDirective.html) |
| `PinnedFailureSlot` | component | Draws the pinned copies at the port's clear edges; press reveals, close dismisses | [API](../../api/components/PinnedFailureSlot.html) |

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
pnpm build                        # ng build with the 850 kB warning / 1100 kB error budgets
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

**Lifts (slice 73).** The global _lifts.scss is imported after controls and supplies the
shared lift/menu classes. Owners use native auto popovers for menus/settings, a manual popover
for desktop task details and modal dialogs for phone details and project edits. Shared
[LiftFocus](../../api/classes/LiftFocus.html) remembers the real opener, preserves focus
moved outside and chooses a named fallback if the opener vanished;
[LiftStack](../../api/injectables/LiftStack.html) coordinates the single transient slot.
[menuKeys](../../api/miscellaneous/functions.html#menuKeys) supplies menu keyboard movement.
Creation dialogs keep their existing CDK traps and join the same stack. Native focus, light
dismissal and inertness require browser checks; unit specs stub native methods.
[RouteFocus](../../api/injectables/RouteFocus.html), started from the composition root,
recovers body focus after eligible navigation without overriding a connected control.
Lift paint and enter/leave motion use tokens; reduced motion crossfades. CSS anchor positioning
has fixed placement fallback. **Trap:** each popover names its opener with `anchor-name` and
`position-anchor` (More in `project-header.scss`, the gear in `project-page-navigation.scss`);
Chromium does not resolve the invoker's implicit anchor, and an unresolved popover lands at the
viewport's top-left. A popover too wide for either side of its opener falls back to the
`--lift-gutter` position, below or above it. `lifts.spec.ts` pins both openers. The shell reserves desktop drawer width outside the lift.
