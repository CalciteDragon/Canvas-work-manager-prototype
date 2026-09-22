# How the prototype tooling works

## Runtime flow

1. `App` mounts `<app-dev-panel />` once; `DevPanel` listens for Ctrl/Cmd+Shift+D and
   toggles the overlay, which renders `DevPanelControls`. `/prototype/state` lazily loads
   `StateInspectorPage`, which renders the same controls plus the layout list.
2. `DevPanelStore` loads `/prototype/state` through `PROTOTYPE_CONTROL` and reads the
   client-side settings from `PrototypeSettings` (hydrated from `sessionStorage`).
3. A host-side control posts to the host and, on success, reloads the tab; a client-side
   control writes `PrototypeSettings` (persisted to `sessionStorage`) or the
   `ThemeService` signal; Layout Mode writes `projectLayoutMode` through the ordinary
   gateway, and both the panel control and the inspector's layout list read the confirmed project
   from its `{ project, operation }` answer (Slice 39); the write lands in the person's history like
   any other project edit.
4. **Add Prototype Note** posts the text with the current route, project and
   `CURRENT_SLICE`; the host stamps real time.
5. `/prototype/design` lazily loads `DesignLabPage`. Its rail binds each of the seven
   `design-lab-tokens.ts` controls to `DesignLabStore`, which sets inline custom
   properties on `documentElement`; Reset removes them; Copy CSS exports the current
   values. The catalogue renders live components over `design-lab-fixtures.ts` and the
   primitive panels' markup.

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
| `DesignLabToken`, `DesignLabExport` | interfaces | A knob as data; the export shape | [API](../../../api/interfaces/DesignLabToken.html) |
| `LivePanels`, `PrimitivePanels`, `SectionCanvasFrame`, `StubSectionContent` | components | The catalogue | [API](../../../api/components/LivePanels.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `PrototypeSettings`, `ThemeService`, `IDENTITY_PROVIDER`,
  `WORK_MANAGER_GATEWAY.projects` (layout mode). Never the other way round.
- [projects](../projects/overview.md) and [tasks](../tasks/overview.md) — the live
  panels render `ProjectSectionFrame`, section contents and `TaskRow` from fixtures.
- [prototype-runtime](../../prototype-host/prototype-runtime/overview.md) — over HTTP.
- [contracts](../../contracts/overview.md) — `prototype.ts` shapes.

**Depended on by**

- `App` (the composition root) — the only place that references `DevPanel`.
- [testing](../../testing/overview.md) — the e2e specs seed through the same
  `/prototype/*` routes; the milestone walkthrough uses the panel throughout.

## Invariants and lints

- **No control exists twice** — `DevPanelControls` is the one implementation; both
  hosts' specs render it.
- **The panel is reachable while the gateway fails** — `PROTOTYPE_CONTROL` is a separate
  port; asserted by the panel's spec with the gateway at 100 % failure.
- **The theme is not in `sessionStorage`**; delay, failure and flags are.
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
