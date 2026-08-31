import type { StorybookConfig } from '@storybook/angular-vite';

/**
 * Storybook on **`@storybook/angular-vite`**, not `@storybook/angular`.
 *
 * Storybook ships two Angular frameworks. The stable one is webpack-based and lists
 * `@angular-devkit/build-angular` and `zone.js` as non-optional peers. This repository has
 * neither: `angular.json` uses `@angular/build:application`/`:dev-server`/`:unit-test`, and
 * the app is zoneless. Adopting it would install a second, contradictory build system in
 * order to render components the first one already builds.
 *
 * `angular-vite` is labelled preview. That is an accepted risk, recorded in
 * `docs/decisions/2026-08-storybook-runs-on-the-vite-framework.md` — Storybook's own
 * guidance is to use webpack only for Angular ≤ 20 or unmigratable webpack config, and
 * neither applies here.
 *
 * `@storybook/addon-vitest` is deliberately out of scope: it needs Vitest browser mode and
 * `@vitest/browser-playwright`, which pins vitest to an exact version and would drag the
 * whole workspace off `vitest@4`. `play` functions run in the Storybook UI without it.
 */
const config: StorybookConfig = {
  // Compodoc is off: it is a separate CLI this repository does not install, and with it on
  // (the default) every start fails with `Command "compodoc" not found` before Vite runs.
  // What it buys is auto-generated argTypes documentation, which these stories do not need.
  framework: { name: '@storybook/angular-vite', options: { compodoc: false } },
  stories: ['../src/**/*.stories.ts'],
  addons: ['@storybook/addon-themes'],
};

export default config;
