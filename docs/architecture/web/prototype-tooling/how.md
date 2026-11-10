# How the prototype tooling works

## Runtime flow

1. `App` mounts `<app-dev-panel />` once; `DevPanel` listens for Ctrl/Cmd+Shift+D and
   toggles the eager modal shell. Inside its open branch, `@defer (on immediate)` loads
   `DevPanelControls`; a polite placeholder appears while loading. Close, backdrop, chord
   and focus trap remain available. A chunk error exposes an explicit Reload page control.
   Closing destroys the block; reopening creates a fresh controls view over the existing
   root-provided store. `/prototype/state` lazily loads
   `StateInspectorPage`, which renders the same controls plus the layout list.
2. `DevPanelStore` loads `/prototype/state` through `PROTOTYPE_CONTROL` and reads the
   client-side settings from `PrototypeSettings` (hydrated from `sessionStorage`).
3. A host-side control posts to the host and, on success, reloads the tab; a client-side
   control writes `PrototypeSettings` (persisted to `sessionStorage`) or the
   `ThemeService` (explicit browser choice or Match device); Layout Mode writes `projectLayoutMode` through the ordinary
   gateway, and both the panel control and the inspector's layout list read the confirmed project
   from its `{ project, operation }` answer (Slice 39); the write lands in the person's history like
   any other project edit. The panel and the inspector are outside `ProjectWorkspaceShell`, so they
   get core's inert history reporter: an open project header catches up from the write's live
   frame rather than from a report (Slice 41) — acceptable for prototype tooling.
4. **Add Prototype Note** posts the text with the current route, project and
   `CURRENT_SLICE`; the host stamps real time.
5. `/prototype/design` lazily loads `DesignLabPage`. Its rail binds each of the nineteen
   `design-lab-tokens.ts` controls to `DesignLabStore`, which sets inline custom
   properties on `documentElement`; Reset removes them; Copy CSS exports the current
   values. The catalogue renders live components over `design-lab-fixtures.ts`, the
   shared Buttons and Inputs primitives, the Object rows panel (six specimens of the global
   `.object-row` with independent controls and title links), the Controls panel (every primitive and state over a pane
   and a sheet, with forced hover, focus and pressed through the shared state mixins), the State
   messages panel (slice 78's loading and `FailureMessage` forms, and slice 79's empty variant,
   alone and with its one action, and archived variant holding the real
   `RestoreStatusChoice`), the other primitive panels' markup, plus a busy-ground plane/lift panel and a transform-only motion demo.
   The plane panel uses the shared `.lift` classes for the side drawer, dialog, menu and page
   popover; the live Drawer panel renders `TaskDetailDrawer` with `contained`, so it remains in
   the catalogue without opening a native top-layer surface. `shared/lifts/lifts.stories.ts`
   exercises native open/Escape/focus-return behaviour separately in a real browser.
   Solid planes writes the same solid backgrounds and disabled filters as the stylesheet fallback;
   reduced motion caps duration tokens at 80 ms. Sheet blur is an opt-in experiment through
   an intermediate property, so real fallback media retain control of the final filter.
   The section-chrome rest-opacity knob exports with Copy CSS; the live section-frame panel
   shows rest and focus specimens, and the header count beside a short and a truncating name
   (Slice 79; the stub content reports its config's `summary` under a `summary: true` definition).
   Its wrapper follows the canvas's quiet defaults on pointer
   and touch. `CURRENT_SLICE` is 81 for captured friction notes.
6. **Slice 81's specimens, while they exist (deleted at its step 3).** `/prototype/navigation/:option`
   lazily loads `NavigationAlternativesPage`. Route inputs: `option` (`a`, `b`, `c`), and the query's
   `at` (the app URL shown), `keys` (`links` or `tree`, Q4), `home` (Q5, default `d`), `q16` (a
   non-current root, default `b`) and `menu=open` (the phone drawer starts open). The page provides
   `SpecimenModel`, which parses `at`, reads the current project's chain and its root's pages through
   `WORK_MANAGER_GATEWAY`, and builds rows from `ShellStore` (injected from `AppShell`, optional so the
   route map's spec can resolve the page alone); options A, B and C turn those into `SpecimenNode`s
   and `SpecimenTree` renders them in either keyboard model. While mounted, the page sets `inert` on
   the shell's top bar and sidebar. Its lift opens with `showPopover({ source })`; the probe in
   `apps/e2e/ux/navigation-alternatives.ts` (run under `ux/slice81-alternatives.config.ts`) found
   that Chromium 151 anchors to the `source` only with `position-anchor: auto` (the initial value is
   `normal`) and does not exempt the `source` from light dismiss, so the page remembers a pointer
   press on an open lift's opener. The same file captures every R1 context in each option (light and
   dark, 1440, 375 with Menu closed and open, `renovation-root` at 1024) and measures activations, Tab
   counts, header height, path rows, small targets, axe and forced colours (each context capture also records
   its own axe scan and, at 375, its small targets); it writes
   `apps/e2e/ux-output/slice81-alternatives/index.json`, from which
   `docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs` (tested by its `.test.mjs`, run with
   `node --test`) writes the comparison sheet `index.html`. The committed summary is
   [`slice81-navigation.md`](../../../roadmap/70-ui-ux/alternatives/slice81-navigation.md).

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PrototypeControlPort`, `PROTOTYPE_CONTROL` | interface / token | The rig port | [API](../../../api/interfaces/PrototypeControlPort.html) |
| `PrototypeHttpControl` | injectable | The adapter | [API](../../../api/injectables/PrototypeHttpControl.html) |
| `DevPanel`, `DevPanelControls` | components | Overlay; shared controls | [API](../../../api/components/DevPanelControls.html) |
| `DevPanelStore` | injectable | Panel state, notes, reload rule | [API](../../../api/injectables/DevPanelStore.html) |
| `CURRENT_SLICE` | const | The slice notes are filed under — bump when a slice starts | [API](../../../api/miscellaneous/variables.html#CURRENT_SLICE) |
| `StateInspectorPage`, `StateInspectorStore`, `ProjectLayoutControl` | component / injectable / component | §68's inspector | [API](../../../api/components/StateInspectorPage.html) |
| `DesignLabPage`, `DesignLabStore` | component / injectable | §67 | [API](../../../api/injectables/DesignLabStore.html) |
| `NavigationAlternativesPage`, `SpecimenModel`, `SpecimenTree` | component / injectable / component | Slice 81's disposable specimens | [API](../../../api/components/NavigationAlternativesPage.html) |
| `DesignLabToken`, `DesignLabExport` | interfaces | A knob as data; the export shape | [API](../../../api/interfaces/DesignLabToken.html) |
| `LivePanels`, `PrimitivePanels`, `ControlPanels`, `PlanePanels`, `SectionCanvasFrame`, `StubSectionContent` | components | The catalogue | [API](../../../api/components/LivePanels.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `PrototypeSettings`, `ThemeService`, `IDENTITY_PROVIDER`,
  `WORK_MANAGER_GATEWAY.projects` (layout mode). Never the other way round.
- [projects](../projects/overview.md) and [tasks](../tasks/overview.md) — the live
  panels render `ProjectSectionFrame`, section contents and `TaskRow` from fixtures.
- [prototype-runtime](../../prototype-host/prototype-runtime/overview.md) — over HTTP.
- [contracts](../../contracts/overview.md) — `prototype.ts` shapes.
- [shell](../core/overview.md) — Slice 81's specimens only: `ShellStore` and `SHELL_NARROW_QUERY`,
  and the [projects](../projects/overview.md) page registry, until step 3 deletes them.

**Depended on by**

- `App` (the composition root) — the only place that references `DevPanel`.
- [testing](../../testing/overview.md) — the e2e specs seed through the same
  `/prototype/*` routes; the milestone walkthrough uses the panel throughout.

## Invariants and lints

- **No control exists twice** — `DevPanelControls` is the one implementation; both
  hosts' specs render it.
- **The panel is reachable while the gateway fails** — `PROTOTYPE_CONTROL` is a separate
  port; asserted by the panel's spec with the gateway at 100 % failure.
- **Explicit themes persist in guarded `localStorage`.** Match device removes the choice;
  persona switching preserves it. Delay, failure and flags use `sessionStorage`.
- **`design-lab-tokens.ts` holds no design literals** — the token lint inspects `.ts`
  `styles`/`template` initialisers, and this file's controls read their starting values
  from the stylesheet at runtime.
- **`CURRENT_SLICE` is a named constant**, so a forgotten bump is a one-line diff rather
  than a literal hidden inside `addNote`.

## Commands

```bash
pnpm dev:web                              # then Ctrl/Cmd+Shift+D, or http://localhost:4200/prototype/state
open http://localhost:4200/prototype/design
pnpm --filter web test -- prototype
```

## Changing it

- **A new control:** its shape in `packages/contracts/src/prototype.ts` if host-side;
  the host route; `PrototypeControlPort` and `PrototypeHttpControl`; the control in
  `DevPanelControls` once; the store method. Decide whether it reloads: it does if it
  changes derived reads everywhere.
- **A new Design Lab knob:** an entry in `design-lab-tokens.ts` naming the custom
  property, with the default read from the stylesheet if it is a design value; the
  knob layer in `_tokens.scss` so both themes move.
- **Starting a slice:** bump `CURRENT_SLICE`.
- **The trap:** a `location.reload()` where a signal would do. Layout mode once
  reloaded; it is a computed now. Reload only for host-state changes.
