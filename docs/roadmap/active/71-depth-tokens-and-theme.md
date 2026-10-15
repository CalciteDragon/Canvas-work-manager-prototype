<!-- plan id="71" status="active" summary="Redesign slice 1 under 70: Depth plane/glass/motion/focus/z-index/breakpoint/weight tokens, Lab knobs, measured blur spike, theme follows device and persists" -->
# Slice 71 — Depth tokens, Lab knobs, blur spike and device theme

## Goal

Put direction B "Depth" into the token layer and the plane containers, after a measured blur spike answers the blur budget, and make the theme follow the device and persist.

## Spec sections

§21 (token families for planes, glass, motion, focus, z-index, breakpoints and weights; no literals),
§22 (dark and light, the device preference, the explicit choice persisting, Lab knobs for glass and
motion), §67 (Lab plane and lift specimens over busy backing, transparency and motion toggles),
§69 (verification), §77 (design-first use), §79 (friction notes). The umbrella
[70](70-ui-ux-overhaul.md) and the [overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7
apply. Governing decisions:
- [Depth direction](../../decisions/2026-10-frosted-glass-depth-direction.md), with its contrast amendment
- [theme follows device](../../decisions/2026-10-theme-follows-device-and-persists.md)
- [split accents](../../decisions/2026-10-accents-stay-split-per-theme.md)
- [scaffolding stays](../../decisions/2026-10-prototype-scaffolding-stays-for-now.md)

## Build

The work runs in three parts with a user checkpoint between A and B:

- **A, the blur spike (measure only, no product change).** It answers the Depth entry's open
  budget question.
- **Checkpoint.** The result goes to the user, who picks the sheet-blur rule.
- **B, tokens, planes, focus ring and Lab.** The chosen rule is applied.
- **C, the device theme.** This is a behaviour change, so tests come first. C does not depend on A
  and may be built while the checkpoint waits.

## Done when

The blur question has a measured, user-chosen answer recorded as a decision. Both themes paint
Depth's palette and planes from tokens alone. Solid fallbacks hold under reduced transparency,
without `backdrop-filter` and in forced colours. One focus ring is drawn everywhere. The Lab
tunes planes, blur and motion live. The theme follows the device and an explicit choice
survives a reload. Each closed finding has a before/after pair on a sheet the user accepts at
Gate 2.

## Do not

- Restyle primitives: buttons, fields, selects, checkboxes, pills and tools belong to slice 2.
- Turn the drawer, dialogs or the More menu into lifts (slice 3). Lift tokens and Lab specimens
  only.
- Animate anything in product surfaces (slices 3–4). Motion tokens and the Lab demo only.
- Change layout, spacing, content widths or the dashboard grid (TH01 page findings belong to
  slices 5–7).
- Touch TH12 scaffolding beyond its repaint.
- Raise tints or dull the look for contrast. Contrast is measured and reported, not gated.

<!-- ───────────── Written when the slice starts ───────────── -->

## Findings closed

Ids are from [themes.json](../70-ui-ux/themes.json) and
[reproduction.json](../70-ui-ux/reproduction.json).

| Finding | Theme | Closed by |
|---|---|---|
| W2-002 | TH03 | Theme follows `prefers-color-scheme`; an explicit choice persists across reload |
| L2-017 | TH03 | One disabled opacity, one disabled cursor and one scrim token, adopted at every site that defines its own |
| L2-018 | TH03 | z-index and font-weight tokens and one breakpoint set, adopted at every site; the TS shell query agrees with the SCSS breakpoint by test |
| L5-022, W3-002 | TH03 | One focus ring: a base `:focus-visible` rule from focus tokens replaces the browser ring, and the 15 component outline declarations (14 files) use the same tokens |
| L1-031 | TH01 | The project header and section frames sit on the same sheet plane |

**Advanced, not closed (stay open, owner named):**

- L2-016 (TH03): the undefined `--font-weight-medium` becomes defined. The unequal group-heading
  styles remain, owned by slice 7.
- L5-006 (TH01): a field-line token is defined. Adoption on inputs is slice 2.
- TH02: no finding closes. Selection rings and current-place indicators are slices 2, 6 and 7.

The other TH01 findings (L1-001, -002, -003, -005, -008, -019, -022, -025, -030, L2-011) are layout,
not paint, and stay open for slices 3, 5, 6 and 7. L1-025 (Lab nesting) is not claimed, though the
Lab gains a panel.

## Acceptance check

**A, blur spike.** Pre-registered before measuring.

1. Build the web app for production. Serve it statically with
   `apps/e2e/ux/walk/static.mjs` on **4201**. Run one isolated host from `env.sh` on **4321** with
   scratch data. Never use 4200 or 4310.
2. `node apps/e2e/ux/spike/blur-spike.mjs` loads **busy-week** (`project-launch` Work canvas) and
   **agent-heavy** (`project-work-manager` Work canvas and `/app`). It measures five variants
   injected with `page.addStyleTag`, using Depth's Gate 1 values. No product source changes.
   - **V0** today's styling;
   - **V1** Depth planes, solid (the fallback);
   - **V2** blurred panes, translucent sheets without blur;
   - **V3** blurred panes, every sheet blurred (B as mocked);
   - **V4** blurred panes, only sheets intersecting the viewport ± one viewport height blurred,
     toggled by an injected `IntersectionObserver`.
3. Each variant × surface runs in two environments:
   - 1440×900 desktop;
   - 375×812 with `isMobile`, `hasTouch`, DPR 3 and CDP CPU throttling at 4×.

   Each run scrolls the main scroll region top to bottom at a fixed speed, then opens and closes
   the task drawer. It records:
   - the measured vsync interval (median rAF delta on an idle page before the run);
   - rAF frame intervals: p50, p95, and the share of **long frames** (more than 1.5× vsync) and
     **dropped frames** (more than 2× vsync);
   - dropped frames from a CDP trace (`devtools.timeline` frame events) as a second count that
     does not rely on rAF alone;
   - CDP `Performance.getMetrics` deltas for layout, style recalc and task duration;
   - the number of elements with a non-`none` computed `backdrop-filter`;
   - the WebGL renderer string, so a software (SwiftShader) run is labelled pessimistic.

   Each cell runs three times and the median is kept. At most two browsers run at once.

   **Known limit, stated in the result.** CPU throttling slows the main thread. Blur cost is
   mostly raster and compositor work, which throttling barely touches. DPR 3 is the raster-load
   proxy for a phone. This is not a real phone, and the result says so.
4. **Pre-registered reading.**
   - **Sanity gate first.** V0 must show at most 2 % long frames in each environment. If it
     does not, the environment is too noisy, and the result reports that rather than ranking
     variants.
   - A variant is "smooth" at 1440 when its long frames are at most 2 % and its dropped frames
     at most 0.5 %.
   - On 375 it is smooth when its long frames are at most 5 % and its dropped frames at most 2 %.
   - The spike recommends the most expressive smooth variant. The user decides.
5. The output is `docs/roadmap/70-ui-ux/blur-spike.json` (created by the spike): environment, method, numbers per
   cell and the recommendation. Raw traces go to the git-ignored `ux-output/`. The user sees a
   one-screen table and paired captures of V2, V3 and V4. **Implementation of B does not start
   until the user has chosen.**

**B, tokens, planes, focus and Lab.**

6. `apps/web/src/styles/_tokens.scss` defines, in both themes:
   - the plane families: ground solid and art, and pane, sheet and lift each with a tint, an alpha,
     a solid colour, a blur, a derived background and a derived filter;
   - the lift shadow and the field line;
   - focus ring colour, width and offset;
   - duration fast, base and slow, ease-out and ease-in;
   - z-index layers, font weights, disabled opacity and scrim.

   Breakpoints live in a CSS-free partial, `_breakpoints.scss` (see open question 3). It keeps
   **today's values exactly** (40rem, 48rem and 60rem for `@media`; 42rem for the `task-list`
   container; the Lab's 18rem column), named, not merged. Merging them would change reflow at
   widths the capture never tests. Components reach it by a relative `@use`, with no
   `angular.json` change, so Storybook needs none either. Base
   literals take **Depth's Gate 1 values as shown**: text, muted, accent, success, danger, plus the
   solid surfaces, so unconverted cards read as Depth's solid fallback. Accents stay split per theme.
   Derived values are written once under `:root`, as the file already requires.
7. Fallbacks are resolved **inside the tokens file**. `@media (prefers-reduced-transparency: reduce)`,
   `@supports not (backdrop-filter: blur(1px))` and `@media (forced-colors: active)` set every
   plane's background to its solid colour and its filter to `none`.
   `@media (prefers-reduced-motion: reduce)` caps the duration tokens at 80 ms.
   Components only ever write `background: var(--plane-*-background)` and
   `backdrop-filter: var(--plane-*-filter)`.
8. Adoption, paint only:
   - ground on `body` in `_base.scss`;
   - panes on the top bar, the global sidebar and the project navigation column;
   - sheets on the section frame, the shortcut frame, the dashboard widget frame and the project
     header, under the blur rule chosen at the checkpoint.

   Every other surface changes only through the retuned base literals.
9. **Layout invariance.**
   - **Harness first.** The capture's `layout` collector (`apps/e2e/ux/capture.ts`) today records
     only controls and three scroll regions. It must first also record the plane containers: top
     bar, sidebar, project navigation, project header, section frame, shortcut frame and widget
     frame. Each is keyed by selector and index. This harness change lands and is committed
     before the "before" run.
   - **Capture at commits.** The output folder is keyed by `HEAD`, so "after" is captured only
     from a commit, never from uncommitted work.
   - **Diff.** `build-sheet.mjs` compares boxes cell by cell and ignores colour fields. No box
     moves or resizes by more than 1 px except the rows listed under "Capture scope". Any other
     difference is a defect.
10. **Focus ring.**
    - `grep -rnE "outline:.*(--color-accent|--border-focus)" apps/web/src/app --include=*.scss`
      returns nothing. All 15 outline declarations, in 14 files, use `--focus-ring-*`.
    - With keyboard Tab in both themes, these each show the same ring (equal computed `outline`),
      recorded in the sheet: the More button, a sidebar link, a nav item and a dialog field.
11. **Fallbacks, demonstrated.**
    - **Real emulation.** Busy-week 1440 is captured in both themes twice: under Playwright's
      `forcedColors: 'active'`, and under CDP-emulated `prefers-reduced-transparency: reduce`.
      Each shows solid planes, with computed `backdrop-filter: none` on every plane.
    - **No `backdrop-filter`.** A browser cannot be made to fail `@supports`, so this is proved
      in the built CSS. The `@supports not (…)` block in `dist/` assigns exactly the same
      declarations as the reduced-transparency block, compared by a script. Its capture is
      labelled *simulated*.
12. **Lab.** `/prototype/design` has knobs for:
    - pane, sheet and lift tint (per-theme colour, read from the stylesheet like the accent) and
      alpha;
    - the three blur radii;
    - ground-art strength;
    - motion scale.

    Two toggles sit with the knobs. *Solid planes* covers both reduced transparency and the
    no-filter fallback, because the two resolve identically; §67 is corrected to say so. *Reduced
    motion* is the second.

    Moving a knob changes the shell outside the Lab. Reset removes every inline property. The
    Lab's CSS export (`design-lab-export.ts`) includes the new knobs and base literals.

    A plane panel shows the ground, a pane, stacked sheets and the four lift specimens (drawer,
    dialog, menu, toast) over a busy backing. Its motion demo respects the reduced-motion toggle.
13. **Contrast reported, not gated.** The before/after sheet lists:
    - axe `color-contrast` **violation and incomplete** counts per theme, before and after. Axe
      marks translucent backgrounds incomplete, so violations alone would flatter "after";
    - the worst-case composite contrast, per theme, from the token values with the Gate 1 model,
      for:
      - text and muted text on pane, sheet and lift;
      - accent text on accent fills;
      - the accent and the focus ring as non-text indicators (3:1) over each plane;
    - every serious axe result that remains, listed as an **accepted exception** under the
      contrast amendment, never omitted.
14. **Bundle.** `pnpm --filter web build` keeps the initial total ≤ 1050 kB, and the number is
    recorded.

**C, device theme.**

15. Starting from empty storage, the app paints in two ways:
    - `colorScheme: 'light'` emulation paints light, and `'dark'` paints dark;
    - changing the emulated scheme while open repaints live.

    Toggling in the top bar, then reloading, keeps the choice, even against the device. "Match
    device" (open question 1) returns to following the device and survives a reload. A persona
    switch no longer changes the theme. A `localStorage` that throws still themes, for the
    session only.

    The decision offers the persona's preference as a possible first-visit default. This slice
    answers **no**: no persona default at all, until a demonstration needs one. Both are recorded
    in the theme decision's amendment.

    `ThemeService` applies the theme when it is constructed, through an app initializer, on every
    route including `/prototype/design`, so nothing depends on the shell's removed effect.

**Whole slice.**

16. `pnpm test` (offline), then `pnpm lint` (which includes `docs:check`), sequentially. Then the
    **full** `pnpm e2e`.

    Playwright emulates `light` by default, and nine specs read or toggle `data-theme`.
    `apps/e2e/playwright.config.ts` therefore sets `colorScheme: 'dark'` in `use`. That keeps the
    persona-era starting theme, so existing specs run unedited. `theme.spec.ts` overrides it per
    test.

    The capture config inherits the same setting. Its theme axis already drives the toggle.
17. The before/after sheet is built by `tooling/build-sheet.mjs` and published privately. The user
    accepts it at Gate 2.
18. The app is used on busy-week and nested-projects as a person, and any friction is recorded in
    `.prototype/notes.json`. `CURRENT_SLICE` = 71.

## Capture scope

- **Must change (paint):** every cell. The palette and planes are app-wide.
- **Must not change (geometry):** every recorded layout box (acceptance 9). Exceptions, if the
  sheet plane's padding or radius alters a box, are listed here before capture and justified.
  Product boxes have no exceptions: radius does not move boxes and padding is untouched.
  The Design Lab intentionally adds knobs after the existing seven and a specimen panel after
  the existing catalogue. Its rail and scroll-region height grow, and new controls/plane
  specimens add boxes; those Lab-only additions are reported separately by the sheet.
- **Visual acceptance pairs (one screen).** Each pair is shown before and after:

  | Surface | Seed and setting | Shows |
  |---|---|---|
  | `project-launch` Work canvas | busy-week 1440, dark and light | Ground, panes, sheets, L1-031 |
  | `/app` | agent-heavy 1440, dark | Widget sheets |
  | Kitchen | nested-projects, 375 touch, light | Phone panes |
  | Tab stops | — | Focus-ring strip, L5-022 / W3-002 |
  | `/prototype/design` | dark and light | Lab planes |
  | Busy-week | fallbacks | Three solid captures (acceptance 11) |
  | Device theme | light emulation, then reload | Toggle persists (W2-002) |

  L2-017 and L2-018 are code findings. Their evidence is the token lint, which gains rules that
  fail on literal z-index, literal `@media`/`@container` lengths, literal `font-weight` numbers,
  and any literal `opacity` other than 0 or 1 outside the tokens file (which covers the disabled dims, the two scrims at 60 % and 72 %, and the 0.35 drag placeholder, each given a token). Each
  rule has a fixture, and `pnpm --filter web lint` is green over `src/`. The output is pasted
  into the sheet.

- **Storybook.** No new stories. Every existing story renders through the global tokens, so it
  shows the repaint. The Lab plane panel is the token-level view (protocol §7.1). The 19 story
  files must still build: `pnpm --filter web storybook:build` is run once.

## Behaviour vs. appearance

- **Appearance:** parts A and B. Every existing web, e2e and Storybook test stays green without
  edits. A test that fails because of a repaint is a defect in the slice, not in the test.
- **Behaviour:** part C (§77). Test, implementation and doc change together:
  - `ThemeService` follows the device and persists;
  - `AppShell` stops seeding from the persona;
  - the dev panel and Settings gain "Match device".

  The tests that change on purpose are named in the test plan.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/ux/spike/blur-spike.mjs` | create | Part A driver: starts its own static server on 4201 and host on 4321 (no `walkd`, so the only browsers are its own two), loads the seeds, runs variants and environments, collects metrics and medians, writes JSON; outside every test command. Never run alongside `ux:capture`, which also uses 4201 |
| `apps/e2e/ux/capture.ts` | modify | Layout collector also records the plane containers, keyed by selector and index (acceptance 9) |
| `apps/e2e/ux/harness.test.mjs` | modify | Red first: a layout record carries keyed plane-container boxes |
| `apps/e2e/playwright.config.ts` | modify | `colorScheme: 'dark'` default (acceptance 16) |
| `apps/e2e/ux/spike/variants.css` | create | Disposable V1–V4 stylesheets with Depth's Gate 1 values (e2e, outside the web token lint) |
| `docs/roadmap/70-ui-ux/blur-spike.json` | create | Durable spike result and recommendation |
| `apps/web/src/styles/_tokens.scss` | modify | Depth base literals; the plane, glass, lift, field-line, focus, motion, z-index, weight, opacity and scrim families; the fallback media and supports blocks |
| `apps/web/src/styles/_breakpoints.scss` | create | CSS-free Sass variables for the breakpoints (open question 3) |
| `apps/web/src/styles/_base.scss` | modify | Ground on `body`; base `:focus-visible` from the focus tokens |
| `apps/web/scripts/check-design-tokens.mjs`, `scripts/fixtures/violations/*`, `scripts/expect-failure.mjs` | modify, create | Allow literals in `_breakpoints.scss` only. New rules, each with a failing fixture and an `EXPECTED` entry: literal z-index; literal `@media`/`@container` length, including range syntax; literal `font-weight` number; literal `opacity` other than 0 or 1. A Node check, also run by this script, asserts each constant in `core/layout/breakpoints.ts` equals the `_breakpoints.scss` value it names |
| `apps/web/src/app/core/shell/app-shell.scss`, `core/shell/top-bar/top-bar.scss`, `core/shell/sidebar/sidebar.scss`, `features/projects/project-page-navigation.scss` | modify | Pane plane; z-index, breakpoint and weight tokens |
| `features/projects/sections/section-frame/project-section-frame.scss`, `features/projects/shortcuts/shortcut-frame.scss`, `features/dashboard/widgets/widget-frame/dashboard-widget-frame.scss`, `features/projects/project-header.scss` | modify | Sheet plane (and the chosen blur rule); focus tokens |
| The other `.scss` files that hold a z-index, `@media` width, outline, disabled opacity, scrim or `font-weight` number (about 20, enumerated by the lint's first red run) | modify | Mechanical token adoption, no visual intent beyond unifying |
| `apps/web/src/app/core/shell/app-shell.ts`, `features/projects/project-workspace-shell.ts` | modify | The two TS media queries keep their different values: `SHELL_NARROW_QUERY` (48rem) and `NARROW` (60rem). Each imports its own named constant; the persona-seed effect is removed |
| `apps/web/src/app/core/layout/breakpoints.ts` | create | One named TS constant per breakpoint that TS uses (48rem shell, 60rem project column). Agreement with `_breakpoints.scss` is checked in Node by the token lint, because web specs run bundled and their tsconfig excludes `node` types |
| `apps/web/src/app/app.config.ts` | modify | App initializer that constructs `ThemeService` (adapter wiring untouched) |
| `apps/web/src/app/core/theme/theme-service.ts`, `theme-service.spec.ts` | modify | Preference `device / dark / light`, a guarded `localStorage`, a live `prefers-color-scheme` listener removed on destroy, sole owner of `data-theme` |
| `apps/web/src/app/core/shell/app-shell.spec.ts`, `core/shell/top-bar/top-bar.spec.ts`, `core/shell/top-bar/top-bar.ts` | modify | The seeding test is replaced (§77); toggle persistence; the stale session-only doc comment |
| `apps/web/src/app/features/settings/settings-page.ts`; `settings-page.spec.ts` | modify; create | Appearance choice: Match device, Dark, Light (open question 1). Native radios until slice 2 restyles them |
| `apps/web/src/app/prototype/dev-panel/dev-panel-controls.ts`, `.html`, `.spec.ts` | modify | Theme control offers `device`; `aria-pressed` follows the stored preference; persona switch no longer implies a theme |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 71` |
| `apps/web/src/app/prototype/design-lab/design-lab-tokens.ts`, `design-lab-store.ts`, `design-lab-store.spec.ts` | modify | New knobs and the two toggles; the stale session-only comment |
| `apps/web/src/app/prototype/design-lab/design-lab-export.ts` | modify | Export carries the new knobs and base literals |
| `apps/web/src/app/prototype/design-lab/panels/plane-panels.ts`, `.html`, `.scss`; `design-lab-page.html`, `design-lab-page.ts`, `design-lab-page.spec.ts` | create, modify | The plane, lift and motion specimen panel over busy backing; the page spec counts the new knobs |
| `apps/e2e/theme.spec.ts` | create | Device scheme, live change, persistence across reload, Match device |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs` | create | Reusable before/after sheet: pairs, layout diff, axe contrast counts, composite contrast from token values, and the acceptance 11 check that the built `@supports` fallback assigns the same declarations as the reduced-transparency block (keyed on declarations, not condition text, which the build may rewrite) |
| `docs/decisions/2026-10-depth-blur-budget.md`, `docs/decisions/README.md` | create, modify | The checkpoint's answer, indexed |
| `docs/decisions/2026-10-frosted-glass-depth-direction.md` | modify | Dated amendment: the blur question answered, with a link |
| `docs/roadmap/70-ui-ux/direction.md` | modify, conditional | Only if the user picks V3 or V4: the "two persistent layers" budget is amended to the chosen rule |
| `docs/decisions/2026-10-breakpoints-beside-the-tokens.md` | create | Breakpoints in a CSS-free partial beside `_tokens.scss`, and why (open question 3) |
| `docs/decisions/2026-10-theme-follows-device-and-persists.md` | modify | Amendment: the control shape, no persona first-visit default |
| `docs/decisions/2026-08-development-panel-surface.md`, `2026-08-design-lab-tokens-are-session-knobs.md`, `2026-10-accents-stay-split-per-theme.md` | modify | Dated amendments: the persona no longer repaints; the Lab gains glass and motion knobs; accent AA is reported, not gated, under the contrast amendment |
| Spec §21, §67 | modify | §21: the AA sentence matches the contrast amendment (reported, not gated), and breakpoints sit beside the tokens. §67: one solid-planes toggle covers reduced transparency and no filter |
| `README.md`, `docs/guides/first-milestone-walkthrough.md` | modify | Persona-seeded theme text replaced by device-following and persistence |
| `docs/architecture/web/overview.md`, `why.md`, `what.md`, `how.md` | modify | Planes, fallback location, the breakpoint partial, the lint's new rules |
| `docs/architecture/web/core/overview.md`, `how.md`, `what.md`, `why.md` | modify | ThemeService's new behaviour and storage |
| `docs/architecture/web/prototype-tooling/overview.md`, `why.md`, `how.md`, `what.md` | modify | Lab knobs and plane panel; dev-panel theme |
| `docs/architecture/testing/how.md`, `what.md` | modify | The spike script and the sheet builder, outside the test commands |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Pointer to slice 71 under the handoff (no other edits) |
| `.prototype/notes.json` | modify | Friction from real use only |

## Test plan — tests first

**Behaviour (part C).** Each test is written red first.

| Test | Proves |
|---|---|
| `theme-service.spec`: follows the device with no stored choice | A light `matchMedia` stub with empty storage gives `light` |
| `theme-service.spec`: repaints when the device changes | A change event updates `data-theme` with no reload |
| `theme-service.spec`: an explicit choice persists and wins | `set('dark')` under a light device survives a new service instance |
| `theme-service.spec`: Match device clears the choice | Storage is emptied and the device rule resumes |
| `theme-service.spec`: storage that throws still themes | Session-only fallback, with no exception |
| `theme-service.spec`: ignores a malformed stored value | Garbage in storage means follow the device |
| `theme-service.spec`: no `matchMedia` (jsdom) | Falls back to dark, with no exception |
| `theme-service.spec`: listener removed on destroy | The media listener does not leak |
| `theme-service.spec`: applies on construction | `data-theme` is set without any shell, which covers `/prototype/design` |
| `app-shell.spec`: loading an identity does not change the theme | Replaces "seeds the theme from the loaded identity" (§77) |
| `top-bar.spec`: the toggle persists | A second instance reads the stored choice |
| `dev-panel-controls.spec`: offers device, dark and light | The option list changes on purpose |
| `dev-panel-controls.spec`: pressed state follows the preference | With a light device and no choice, `device` is pressed, not `light` |
| `settings-page.spec`: the appearance choice reflects and sets the preference | Radio state follows the service; choosing writes it |
| Token-lint fixture: a `breakpoints.ts` value that disagrees with `_breakpoints.scss` | The TS and SCSS breakpoints cannot drift (L2-018); watched red first |
| `design-lab-store.spec`: toggles write and reset their knob properties | Reset removes them |
| `design-lab-export` spec: the export includes the plane, blur and motion knobs | No silent drop |
| `apps/e2e/ux/harness.test.mjs`: the layout record has keyed plane boxes | Acceptance 9 can see the planes |
| `e2e theme.spec.ts` | Real browser: emulated scheme, live change, reload persistence, Match device |

**Lint.** Watch each fixture fail first.

| Test | Proves |
|---|---|
| `check-design-tokens` fixture: literal z-index | Rule catches it |
| fixture: `@media (max-width: 48rem)` in a component | Rule catches it |
| fixture: `@media (width <= 60rem)` and `@container x (width < 42rem)` | Range syntax and container queries are caught |
| fixture: `font-weight: 600` | Rule catches it |
| fixture: `opacity: 0.5` and `opacity: 60%`; `opacity` of `0`, `1`, `0%` and `100%` passes; custom properties such as `--canvas-chrome-opacity: 0` are not inspected | Rule catches literals without selector context. The breakpoint check skips cleanly when its two files are absent under `--root`, so the self-test's `EXPECTED` set stays exact |
| `_breakpoints.scss` is allowed | No false positive |

**Not unit-tested, on purpose.** Appearance is judged by the capture diff (protocol §7.2), not by
snapshots. The following are proven by acceptance 9–13:
- the plane look;
- the fallbacks;
- the focus-ring equality;
- layout invariance.

The spike script is a measurement, not a test.

## Boundaries touched

- **No literals in components.** Every new value lives in `_tokens.scss`. Breakpoints are the one
  exception, in a CSS-free sibling, and the lint is extended to enforce that. Components write
  `var()` only, and the fallbacks live in the tokens file, so no component carries media logic for
  glass.
- **`ThemeService` stays the only owner of `data-theme`.** Settings, the top bar and the dev panel
  call it. `localStorage` access is wrapped.
- **`core/` never imports `prototype/`.** The Lab knobs are in `prototype/` and write inline
  properties, as today. The dev panel calls the core service, in the existing direction.
- **No `if (prototypeMode)`.**
- **No contract, domain, host or persistence change.** `UserPreferences.theme` stays in the
  contract and the seeds, unread by the web.
- **Spike code is e2e tooling,** outside `pnpm test` and `pnpm e2e`, and on rig ports only.

## Explicit non-goals

- Primitives, lifts, motion in product surfaces, layout and spacing, navigation, and copy
  (slices 2–9).
- Raising any tint for contrast.
- A `UserPreferences` write route.
- Removing `UserPreferences.theme`.
- A pre-boot inline script for the theme. The pre-JS paint uses the dark ground, as today.
  Revisit only if the flash is seen in use.
- A Lab contrast readout. Contrast is reported on the sheet.
- Snapshot tests of appearance.

## Open questions

**Answered 2026-10-14:** the user approved the plan and every default below. These are
questions 1, 3 and 4, and the "no persona first-visit default" in acceptance 15. Each is recorded
in the decision entries the change list names, when its part lands. Only question 2, the blur
rule, stays open until the checkpoint after part A.

1. **"Match device" control shape** (the theme decision leaves it to this slice). Default:
   - the top-bar button stays a dark/light flip that sets an explicit choice;
   - `/settings` gains an **Appearance** group with *Match device · Dark · Light*;
   - the dev panel's Theme control gains `device`.

   The alternative is a three-state top-bar control, which needs the slice 3 menu primitive.
2. **The blur rule:** answered at the checkpoint after part A (2026-10-14). The user chose
   V2: panes blur; translucent sheets do not. See the
   [decision](../../decisions/2026-10-depth-blur-budget.md).
3. **Breakpoints outside `_tokens.scss`.** Sass `@use` of the tokens file from a component would
   copy the whole `:root` block into every component stylesheet, and custom properties cannot
   appear in `@media`. Default: a CSS-free `_breakpoints.scss` beside the tokens. Because §21's
   correction and direction.md both say "every value lives in `_tokens.scss`", this gets a
   decision entry and a §21 correction, not just a note.
4. **Depth's accent values.** Depth's demo nudged the accents (dark `#ff9f6b` → `#ffad7f`, light
   `#2563eb` → `#1f4fd0`). Default: take them as shown, per the "demo tints as shown" decision.
   They stay split per theme.

## Revisions

- **Round 1 (2026-10-14):** A fresh reviewer returned 18 findings (12 substantive). Each
  substantive one was checked against the code, and all held.
  - **Layout invariance.** The capture recorded no plane-container boxes, and its output folder
    is keyed by `HEAD`. The collector is extended with a red harness test, and "after" is
    captured only from a commit.
  - **e2e.** Playwright defaults to light, and nine specs touch `data-theme`. Now: the full
    `pnpm e2e` with `colorScheme: 'dark'` set in config.
  - **Breakpoints.** A second TS breakpoint was missed (`project-workspace-shell.ts`).
    Breakpoints keep today's values, including `@container`, and the lint covers range syntax.
  - **Fallbacks.** `@supports` cannot be emulated, so the built CSS is proved instead and the
    capture is labelled simulated.
  - **Spike.** The thresholds are now relative to the measured vsync, with a V0 sanity gate. A
    trace-based dropped-frame count was added, and the limits of CPU throttling are stated.
  - **Docs and spec.** The breakpoint partial gets a decision and a §21 correction. The change
    list gains the forgotten documents (README, the walkthrough guide, three decision
    amendments, the overview and why files) and the Lab export.
  - **Lab toggles.** The two Lab toggles versus §67's three is resolved by one toggle and a §67
    correction. Tint knobs were added.
  - **Contrast reporting.** Axe "incomplete" counts are reported, so are accent and focus ring
    3:1 against each plane, and every remaining serious result is listed as an accepted
    exception.
  - **Minor.** Wrong counts and file names were corrected, and theme failure-path tests were
    added. Settings radios are native until slice 2. Storybook gets no new stories, with the
    reason stated. The spike gets its own ports and no `walkd`.
- **Round 2 (2026-10-14):** The same reviewer confirmed round 1 resolved and found three new substantive problems, all verified.
  - The two TS breakpoints differ (48rem and 60rem), so each keeps its own named constant.
  - A vitest spec cannot read `.scss` (bundled run, no `node` types), so the agreement moves into the Node token lint.
  - The token lint sees only declarations, never selectors, and the scrims hold no literal colour. One rule replaces both: no literal `opacity` other than 0 or 1.
  - Minors: the outline count, the Storybook script name, and naming where the `@supports` comparison lives.
- **Round 3 (2026-10-14):** No substantive findings; all round-2 items confirmed against the code. Two notes folded into the lint test row: the opacity rule allows `100%` and `0%` and ignores custom properties, and the breakpoint check skips when its files are absent under the self-test root.

## Next-chat handoff — implementation

**State (2026-10-14).** Part A is implemented and measured; `CURRENT_SLICE` is 71.
The 90-run matrix recommends **V2**, blurred panes with translucent unblurred sheets.
Every V0 cell passed the sanity gate, and V2 passed every smoothness threshold. V3 and
V4 failed the desktop thresholds. These are pessimistic SwiftShader/software-compositor
measurements, not physical-phone results. The [result JSON](../70-ui-ux/blur-spike.json)
retains per-run metrics and trace references. Paired dark/light captures and the local
checkpoint sheet are in git-ignored `apps/e2e/ux-output/spike/`.

**Acceptance deviations:** the two specified projects are seed roots, so their canonical
canvas is labelled Home, not Work. The exact requested project routes were measured.
Dashboard task titles have no drawer action: its cells measure scroll only; both canonical
canvas surfaces exercise the real drawer. The host is launched with `env.sh`'s port/data
configuration directly, without its extra walkthrough daemon/browser.

**Review and verification:** the diff reviewer confirmed no substantive findings after
fixing V4's marker, its scroll-region observer root and duplicate scheduler trace-event
counting. A smoke run also exposed and fixed the Windows `--import` URL. Production build:
1,020.99 kB initial, below 1,050 kB. `pnpm test`: 2,969 workspace tests and nine root tooling
tests passed; sequential `pnpm lint` passed. Raw traces include independent `DroppedFrame`
events. All scratch servers were stopped after the run.
The final checkpoint documents also passed `pnpm docs:check`. Full e2e, Storybook and
before/after product captures remain for parts B/C; no whole-slice completion is claimed.

**Checkpoint answered (2026-10-14):** the user chose **V2**, recorded in the
[blur decision](../../decisions/2026-10-depth-blur-budget.md). No part B token work or part C
theme behaviour has started. Next: C may proceed independently,
then the layout collector must land in a commit before the before-capture. Slice 71 remains
active and no findings are claimed closed yet.

**Read first:**
1. AGENTS.md.
2. This plan, in full.
3. The umbrella's "Operational traps" in [70](70-ui-ux-overhaul.md).
4. The [Depth](../../decisions/2026-10-frosted-glass-depth-direction.md) and
   [theme](../../decisions/2026-10-theme-follows-device-and-persists.md) decisions.
5. The `how.md` of web, web/core and web/prototype-tooling.

**Order:**
1. Bump `CURRENT_SLICE` to 71.
2. **Part A, the spike**: acceptance steps 1–5. Then **stop and bring the result to the user**,
   with a table and paired captures of V2, V3 and V4.
3. Part C may be built test-first while the user decides.
4. Then the capture-harness change (acceptance 9). Commit it, and take the "before" capture.
5. Part B, under the chosen blur rule.
6. Re-capture from a commit, build the sheet and hold Gate 2.

**Traps:**
- Never use 4200/4310. The spike uses 4201 and 4321, so never run it alongside `ux:capture`,
  which also uses 4201.
- In rig routes, use `route.fallback()`, never `route.continue()`.
- Run at most about four browsers (8 GB), and serve a static production build.
- The initial bundle is 1.02 MB against a 1050 kB ceiling.
- Run `pnpm lint` (with `docs:check`) after `pnpm test`, never at the same time.
- Do not link files that do not exist yet. `docs:check` fails on a link to a future file, as it
  did on `blur-spike.json` in this plan.

**Continuation, 2026-10-14 — capture foundation.** Added a browser-serializable plane-box collector with selector/index keys (top bar, sidebar, project navigation/header, section, shortcut, widget). Its fixture failed with an empty collector, then all three harness tests passed. The capture rig now serves the production build statically on 4201 with its scratch host on 4321, and a first subset capture can create its own index. Additional files: `apps/e2e/ux/layout.mjs`, `apps/e2e/ux-capture.config.ts`. Theme and baseline capture precede product paint.

**Implementation review, 2026-10-14.** Device behavior was driven red (nine expected failures) then green (51 targeted tests). The plane collector and theme changes were committed before the baseline; baseline product commit is `ce91566904b2dca14ac68222255df32346b96d57`. A pre-existing e2e ownership record prompted a separate capture document: `.prototype/ux-data.json`; `prepare-data.ts --capture`, the capture package hook/config and gitignore now own it. Review found and fixed a Lab inline filter outranking fallback media (an intermediate variable now preserves final fallback control), and a CSS export freezing derived ambient art (exports its base colors instead). The sheet reviewer demonstrated and fixed false passes for missing cells/numeric geometry and Lab shell/catalogue movement; six tooling regressions protect them. Additional file: `docs/roadmap/70-ui-ux/tooling/build-sheet.test.mjs`. Independent theme and token/plane boundary reviews returned no remaining substantive findings. Runtime, bundle, geometry and final visual gates still require their measured results.

**Continuation, 2026-10-14 — Gate 2 evidence.** The verification harness had labelled some light captures as dark: resetting CDP media emulation repainted the device-followed theme. It now locks each theme through the real top-bar toggle (observed both ways), then asserts `data-theme` at every capture and the computed focus-ring colour on every ring. Both the after (`3724307`) and the baseline (`ce91566`, rebuilt from its exported source) strips were regenerated. The 182-cell matrix used separate per-theme contexts and was unaffected. The sheet first reported four Lab geometry failures. Each was the original seven knobs moving up 19.5 px, because the rail hint lost its stale "session-only, like the theme" clause. The sheet now accepts only one uniform shift of those seven knobs and reports it as a Lab change. Two regressions cover it, so uneven movement still fails. Result: 182 pairs, **0 geometry failures**, 12 reported Lab changes. Axe `color-contrast` totals by theme, before → after: dark violations 142 → 142, incomplete 189 → 2,648; light violations 0 → 0, incomplete 189 → 2,648. The incomplete rise is axe declining to judge translucent backgrounds. The e2e typecheck now excludes the git-ignored `ux-output/` and `test-results/`, after an extracted baseline copy broke `pnpm lint`.

**Whole-slice verification, 2026-10-14.** `pnpm test` is green: every workspace suite and the 9 root tooling tests. In an earlier run the host stdio test timed out under CPU contention; it passed 7/7 alone and again in the clean rerun. `pnpm lint` is green, `docs:check` included. In the full `pnpm e2e`, 111 of 112 passed. The one failure was a host 500 while seeding, from a Windows `EPERM` on the JSON repository's atomic rename (`e2e-data.json.tmp`). That is a disposable-infrastructure file-lock flake. `archived-projects.spec.ts` then passed 4/4 alone. `pnpm --filter web storybook:build` passes. The production initial total is **1,028.94 kB**, under the 1,050 kB ceiling. The Gate 2 sheet was built by `build-sheet.mjs` from `ce91566` → `3724307` and published privately. **Gate 2 is awaiting the user's acceptance; the slice is not complete until then.**
