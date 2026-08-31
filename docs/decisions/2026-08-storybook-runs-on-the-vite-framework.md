# Storybook runs on the Vite framework, not the webpack one

**Question**

Slice 17 asks for "Storybook (Angular integration)". Storybook 10.5 ships two Angular
frameworks. Which one does a zoneless Angular 22 application on `@angular/build` use?

**Options tested**

- *`@storybook/angular`* (stable, webpack-based): rejected. It lists
  `@angular-devkit/build-angular` and `zone.js` as **non-optional** peers. This repository
  has neither — `angular.json` uses `@angular/build:application` / `:dev-server` /
  `:unit-test`, and the app is zoneless. Adopting it means installing a second,
  contradictory build system in order to render components the first one already builds.
  Storybook's own guidance is to use webpack only for Angular ≤ 20 or unmigratable webpack
  config, and neither applies.
- *`@storybook/angular-vite`* (labelled preview): chosen. Confirmed at install rather than
  taken on trust — it peers on `@angular/build >=21 <23` (we are on 22.1.6) and marks
  `zone.js` and `@angular/cli` optional.
- *Defer Storybook entirely and ship only the Design Lab*: held in reserve as the fallback
  if angular-vite could not render a story the application renders. It did render them, so
  the fallback was not taken.

**What we learned**

**It works, and the spike was worth doing first.** Both story sets render in a browser, in
both toolbar themes, with the application's real stylesheets; the `TaskRow` completion `play`
function reports PASS in the UI runner. Nothing about the story format is framework-specific
— CSF, `applicationConfig`, `moduleMetadata` and `play` are identical across the two — so
these stories survive a framework change if one is ever forced.

**Two failures no amount of planning would have found**, both silent in their own way:

- **Compodoc is on by default.** It is a separate CLI this repository does not install, so
  every start died with `Command "compodoc" not found` before Vite ran. Turned off in
  `main.ts`. What it buys is auto-generated argTypes documentation, which these stories do
  not need.
- **`@analogjs/vite-plugin-angular` looks for a tsconfig at exactly `.storybook/tsconfig.json`.**
  A component outside its TypeScript program renders as *"Component 'TaskRow' is not
  resolved"* — the `templateUrl` is never compiled, and the message blames "a configuration
  issue" without naming the file. The plan had put the type-check config at
  `apps/web/tsconfig.storybook.json`; it moved to `.storybook/tsconfig.json` and now serves
  both consumers, the plugin and `pnpm lint`'s third `tsc --noEmit` pass.

**The dependency cost is nine packages, not two.** pnpm's isolated `node_modules` does not
hoist, so every non-optional peer must be a *direct* devDependency of `apps/web` even though
the lockfile already carries it transitively via `@angular/build`. `@angular/animations` had
to be **pinned exactly** to `@angular/core`'s resolved version: at a caret range it resolved
one patch ahead and `pnpm peers check` reported a genuine mismatch in both directions.

`@storybook/addon-vitest` is deliberately out of scope. It needs Vitest browser mode and
`@vitest/browser-playwright`, which pins vitest to an exact version and would drag the whole
workspace off `vitest@4`. `play` functions run in the Storybook UI without it.

**Current decision**

`@storybook/angular-vite@10.5.10`, Compodoc off, `.storybook/tsconfig.json` as the single
config for the plugin and the lint pass. Stories live beside their components (§65) and are
excluded from `tsconfig.app.json`, which type-checks with `"types": []` and cannot resolve
`@storybook/*`.

Every Storybook package is pinned by exact version in `pnpm-workspace.yaml`'s
`minimumReleaseAgeExclude`. That list has a real maintenance cost: Storybook releases weekly,
so a resolve that moves forward has to regenerate the entries.

**Confidence**

High that it works today. Medium that it keeps working — the framework is preview, and the
exclude list has to be maintained by hand.

**Revisit when**

A Storybook or Angular upgrade breaks rendering, or `@storybook/angular-vite` leaves preview
(at which point this entry becomes history rather than a risk). Also revisit if headless
story tests are ever missed enough to reopen the `addon-vitest` question — that is a slice of
its own, not a config change.
