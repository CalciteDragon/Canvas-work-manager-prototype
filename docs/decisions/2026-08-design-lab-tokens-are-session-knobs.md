# The Design Lab is a route with live knobs, not a third theme

**Question**

§22 asks for radius, spacing density, surface contrast, accent, font scale, elevation and
sidebar width to be changeable live "without rewriting component CSS", and frames the Design
Lab as a third *theme* alongside Dark and Light. §67 defines it as a route. Which is it, and
what has to change in `_tokens.scss` for seven controls to actually move anything?

**Options tested**

- *A third theme block*: rejected. A knob that only applied inside its own theme could not
  answer "what does this accent look like on the dashboard", which is the entire experiment.
- *A route that writes inline custom properties on `documentElement`*: chosen. The values
  reach the whole shell, and `ThemeService` — which owns `data-theme` — never has to know.
- *Multiplying the existing tokens from outside*: not possible for three of the seven.
  Radius, spacing and font size are *scales*, not single tokens; surface contrast is a
  relationship between colours; and elevation is a multi-length `box-shadow` shorthand that
  nothing outside it can scale.

**What we learned**

**The theme blocks had to be reduced to base literals.** The first structure put the derived
expressions under bare `:root` while `:root[data-theme='light']` re-declared `--color-surface`
and both shadows as literals at higher specificity — so surface contrast and elevation would
have been **silent no-ops in the light theme**. Each theme block now holds only base literals
(`--surface-base`, `--surface-raised-base`, `--surface-sunken-base`, `--shadow-color-sm`,
`--shadow-color-md`, and the background), and every derivation lives once.

**Whole families, never one member each.** All six `--space-*`, three `--radius-*`, four
`--font-size-*`, both `--shadow-*` and **all three `--color-surface*`**. The surface family is
the sharpest case: in light theme `--color-surface` and `--color-surface-raised` are both
`#ffffff`, so converting only the first would make raised cards stop lifting off the page as
the knob moved.

**Appearance is unchanged at the defaults, and that was checked rather than asserted.**
Measured in a browser in both themes: the three surfaces paint exactly `#1b1e24` / `#23272f` /
`#101216` in dark and `#ffffff` / `#ffffff` / `#eceef2` in light; `--space-4` is 16px,
`--radius-md` is 8px, and each shadow keeps its own per-theme alpha. `color-mix(in oklab, X
100%, Y)` is `X` round-tripped through oklab, exact at 8-bit output, and every `calc()`
multiplies by 1.

**Two honest limits, stated rather than discovered later.**

- **Surface contrast is one-directional.** `color-mix()` clamps its percentage to `[0%, 100%]`
  and the default sits at `100%`, so the knob can only *reduce* contrast from today's value.
  Moving the default into the middle of a range would mean shipping a different-looking
  application, which the "appearance unchanged" rule forbids. The control says so in its own
  label rather than leaving a reviewer to wonder why dragging up does nothing.
- **The accent knob moves `--color-accent` alone.** `--color-accent-contrast` is `#0b1220` in
  dark and `#ffffff` in light — near-black on a light blue, white on a mid blue — and **no
  single `color-mix` against the accent produces both**. `--color-accent-surface` (`#202f48`
  dark, `#eff4ff` light) has the same problem: the two are mixed at visibly different
  strengths. Both stay per-theme literals, so accent-tinted surfaces and accent-on-text
  pairings keep their current colours, and dragging the accent far enough *can* produce poor
  contrast on accent-filled controls. This is the one place the "whole families" rule is
  knowingly broken, because the alternative is changing how the application looks today.

**The lab holds no design literals.** A hard-coded `#6ea8fe` in `design-lab-tokens.ts` would
be a design value outside the one file §21 permits, invisible to `check-design-tokens.mjs`,
*and* wrong in light theme. The accent and sidebar-width controls read their position from
`getComputedStyle(documentElement)` instead, and **Reset removes the inline property** rather
than writing a default back, so the stylesheet wins. Verified: reset in dark, switch to light,
and the control shows `#2563eb`.

**Current decision**

A route at `/prototype/design` with a root-provided `DesignLabStore` holding seven values.
Session-only, matching [the theme entry](2026-08-theme-selection-is-session-only.md): §61
defines no route that stores them, and inventing persistence for a knob you are turning in
order to *look at something* is backwards. Root-provided rather than page-provided because a
destroyed store would show defaults in the rail while the shell still rendered the old knobs;
it follows `DevPanelStore`, already root-provided in the same folder. Every `features/` store
stays page-provided.

The catalogue has two visibly labelled kinds of panel. **Live** panels are the real
components — `TaskRow`, `ProjectSectionFrame`, `DashboardWidgetFrame`, the sidebar, the task
drawer, the activity feed — driven by fixtures. **Primitive** panels (buttons, inputs, cards,
project cards, menus) are representative markup marked *not yet a shared component*, because
none of those exist as components: they are token-styled markup inside features, and the
repository has exactly one shared component. That distinction is the useful output — a
primitive everybody keeps re-styling is the evidence for extracting it.

**The §77 pass judged the contrast control, and it is the weakest of the seven.** Even with the
label, dragging up does nothing and there is no motion to explain why, so it reads as broken for
the first few seconds. A control that started in the middle of a range would be honest about
direction — but only by changing how the application looks at rest, which the refactor rule
above forbids. Recorded as a §79 note: the answer is probably a differently-shaped control
rather than a slider, not a different default.

**Confidence**

High on the knob layer, which is measured. Low on the one-directional contrast control's shape.
Low on the accent knob's usefulness while the rest of the accent family does not follow it.

**Revisit when**

Someone uses the accent knob in anger and finds the un-tracking tinted surfaces misleading —
that is the first candidate for a follow-up slice, and it needs a decision about whether the
two themes' accent-contrast pairings can be unified before a mix can derive them. Also revisit
if the primitive panels accumulate enough repeat re-styling to justify extracting a component
library, which is deliberately **not** this slice.
