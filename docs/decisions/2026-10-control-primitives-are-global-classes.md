# Control primitives are global classes over native elements

**Question**

How should slice 72 build §21's shared control primitives: buttons in four ranks, icon button,
tool, field, select, checkbox and radio, pill and link? Today there are six button heights, four
field treatments and browser-default controls beside app-styled ones (TH04, TH05 in the UI/UX
overhaul's [themes](../roadmap/70-ui-ux/themes.json)).

**Options tested**

- *Global classes in `apps/web/src/styles/_controls.scss`, applied to native elements in
  templates* (`<button class="button button--primary">`). There is no JavaScript. Native
  keyboard, form and Playwright `check()` behaviour stays intact. Storybook already loads
  `styles.scss`. The classes are cheap to throw away (§77). **Kept.**
- *Attribute components* (`button[appButton]` with a typed `variant`, the Angular Material shape).
  They give compile-time variant checks, but they add JavaScript to every chunk and a second
  surface to maintain, with the initial bundle 21 kB under its 1050 kB ceiling. Rejected for the
  prototype.

**What we learned**

Angular's emulated encapsulation makes a component's `button {…}` (0,1,1) and `.x {…}` (0,2,0)
outrank a global `.button` (0,1,0). Adopting a primitive therefore means *deleting* the component
rule that painted the control, not overriding it. The slice plan's adoption checks exist for this.

**Current decision**

Primitives are classes in `_controls.scss`, which uses tokens only and is imported after `base`.
Component styles may position a primitive (grid placement, gaps, inline size, margins) but never
paint it. Checkboxes, radios and selects stay native elements, styled with `appearance: none`, and
return to `appearance: auto` in forced colours. The user chose this at slice 72 planning
(2026-10-14).

**Confidence**

Medium. It was chosen at planning. The bundle cost and the specificity cleanup are measured when
slice 72 closes, and this entry is then amended with the numbers.

**Revisit when**

The MVP needs compile-time variant checking, or a primitive needs behaviour that a class cannot
carry (a menu or listbox, slice 3).
