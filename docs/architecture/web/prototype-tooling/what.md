# What the prototype tooling is made of

## Structure

```mermaid
flowchart TB
  app["App (composition root)"] --> panel["DevPanel<br/>Ctrl/Cmd+Shift+D overlay"]
  route["/prototype/state"] --> inspector["StateInspectorPage<br/>+ ProjectLayoutControl list"]
  panel -. "deferred on opening" .-> controls["DevPanelControls<br/>the one implementation of every control"]
  inspector --> controls
  controls --> dstore["DevPanelStore<br/>sessionStorage; notes; CURRENT_SLICE; reload"]
  inspector --> istore["StateInspectorStore"]
  dstore --> port["PrototypeControlPort<br/>PROTOTYPE_CONTROL"]
  port -. implements .-> http["PrototypeHttpControl<br/>/prototype/state · seed · reset · clock · ai-provider · notes"]
  dstore --> settings["PrototypeSettings (core)<br/>delay · failure · flags"]
  dstore --> theme["ThemeService (core)"]
  layout["ProjectLayoutControl"] --> gw["WorkManagerGateway.projects<br/>projectLayoutMode"]
  route2["/prototype/design"] --> lab["DesignLabPage"]
  lab --> lstore["DesignLabStore (root)<br/>inline design properties and two fallback toggles"]
  lab --> live["LivePanels<br/>real components over design-lab-fixtures; contained task drawer; failed and Adding task rows"]
  lab --> prim["PrimitivePanels<br/>shared buttons, inputs, object rows, field-status and state messages; cards, menus not yet"]
  lab --> controls["ControlPanels<br/>every control primitive and state"]
  lab --> planes["PlanePanels<br/>busy ground, pane, sheets, real contained lift classes, motion"]
  lab --> export["design-lab-export<br/>Copy CSS"]
  lstore --> tokens["design-lab-tokens.ts<br/>nineteen controls, including section-chrome rest opacity"]
```

## The controls

| Control | Where it takes effect | Reloads the tab? |
|---|---|---|
| Persona | host header via `PrototypeIdentityProvider`; a new session | yes |
| Seed | host `/prototype/seed` through the unit-of-work lock | yes |
| Current Date | host `/prototype/clock` (`SimulatedClock.setNow`) | yes |
| AI Provider | host `/prototype/ai-provider` | yes |
| Theme / Match device | `ThemeService`; explicit choice in guarded `localStorage`, Match device clears it | no |
| Layout Mode | a real project field through the gateway | no |
| Network Delay, Failure Rate | `PrototypeSettings` → the gateway adapter; `sessionStorage` | no |
| Feature Flags | `PrototypeSettings`; `sessionStorage`; two of six gate something today | no |
| Agent Connection | read-only roster with copyable tokens, from `/prototype/state` | no |
| Add Prototype Note | host `/prototype/notes` with route, project, `CURRENT_SLICE` | no |

## Inventory

| Part | Path | Role |
|---|---|---|
| `PrototypeControlPort`, `PROTOTYPE_CONTROL` | `control/prototype-control.ts` | The interface and token |
| `PrototypeHttpControl` | `control/prototype-http-control.ts` | The adapter over `/prototype/*` |
| Fake | `control/testing/` | What specs inject |
| `DevPanel`, `DevPanelControls` | `dev-panel/dev-panel.ts`, `dev-panel-controls.ts` | Eager modal shell and deferred shared controls |
| `DevPanelStore`, `CURRENT_SLICE`, `StoredSettings` | `dev-panel/dev-panel-store.ts` | Panel state, notes, reload rule |
| `StateInspectorPage`, `StateInspectorStore`, `ProjectLayoutControl` | `dev-panel/state-inspector-page.ts`, `state-inspector-store.ts`, `project-layout-control.ts` | §68's inspector and §28's list |
| `DesignLabPage`, `DesignLabStore`, `DesignLabToken`, `DesignLabExport` | `design-lab/` | §67 |
| `LivePanels`, `PrimitivePanels`, `ControlPanels`, `PlanePanels`, `SectionCanvasFrame`, `StubSectionContent` | `design-lab/panels/`, `design-lab/section-canvas-frame.ts` | The catalogue; `SectionCanvasFrame` mirrors the canvas wrapper's reveal properties so shared section controls appear correctly |
| Fixtures | `design-lab/design-lab-fixtures.ts` | The data the live panels render |
