# Prototype tooling

`apps/web/src/app/prototype` is the development-only surface (§22, §46, §67): the
Ctrl/Cmd+Shift+D development panel and the `/prototype/state` page that share one set of
controls; the Design Lab at `/prototype/design` with its seven live token knobs and its
catalogue of real components; and `PrototypeControlPort`, the interface behind which the
panel reaches the host's rig routes. It changes the rig — persona, seed, date, theme,
layout mode, AI provider, delay, failure rate, flags, notes — never the workspace.

**Code:** `apps/web/src/app/prototype/{control,dev-panel,design-lab}` · **Tests:**
`*.spec.ts` beside each file; `control/testing` fake · **Parent:** [web](../overview.md) ·
**Host side:** [prototype-runtime](../../prototype-host/prototype-runtime/overview.md)

## Responsibilities

- `DevPanel` (the overlay mounted once by `App`) and `StateInspectorPage` both render
  `DevPanelControls`, so no control exists twice; the inspector adds §28's per-project
  layout list, which needs every project.
- `DevPanelStore`: the panel's state, `sessionStorage` for delay, failure and flags
  (not the theme), the **Add Prototype Note** action stamped with `CURRENT_SLICE`, and
  the reload after a host-state change.
- `PrototypeControlPort` / `PrototypeHttpControl`: `/prototype/state`, `seed`, `reset`,
  `clock`, `ai-provider`, `notes` — an interface behind `PROTOTYPE_CONTROL`, separate
  from the work-manager gateway so the panel works at 100 % injected failure.
- `DesignLabPage` / `DesignLabStore`: seven inline custom properties on the document
  element — radius, spacing density, surface contrast, accent, font scale, elevation,
  sidebar width — session-only; a **Copy CSS** export; live panels of real components
  and primitive panels marked *not yet a shared component*.

## Not responsible for

- Network delay, failure rate and flags *taking effect*: `PrototypeSettings` and the
  gateway in [core](../core/overview.md) do that; the panel only writes the settings.
- Layout mode: `ProjectLayoutControl` writes a real project field through the ordinary
  gateway, and the panel says so.
- The theme itself — `ThemeService` in core; the panel's control drives that signal.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
