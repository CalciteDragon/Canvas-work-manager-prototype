# Web specs start from empty browser storage

**Question**

How do web specs stay independent when the test runner shares browser storage between spec files?

**Options tested**

- Clear storage in the specs that leak it: rejected. It fixes the known leakers (`project-canvas.spec.ts` turning `gridProjectLayout` off, `shell-store.spec.ts` turning `nestedProjects` off) but not the next spec that writes a flag and forgets.
- Run the web suite with `isolate: true`: rejected. `@angular/build:unit-test` defaults to `false` on purpose, to match Karma/Jasmine. A fresh environment per file would slow every run to fix a problem that is only shared storage.
- One setup file registered through the builder's `setupFiles`, whose `beforeEach` clears `sessionStorage` and `localStorage` before every test: adopted.

**What we learned**

Slice 50 recorded a web failure as a presumed flake under load. Slice 51 traced it to spec order, not load. Under `isolate: false`, spec files in one worker share one jsdom storage. `PrototypeSettings` mirrors §47's flags to `sessionStorage`, so a flag one spec turned off became the default of the next file in that worker. The failure needed both files in the same worker *and* the leaking file first. Vitest's results cache runs the last-failed file first, so even a single-worker rerun alternated red and green. A path-ordered single-worker run reproduced the failure every time, and the setup file turned that run green. The `nestedProjects` leak is latent: no spec has been seen to fail from it.

**Current decision**

`apps/web/src/test-setup.ts` clears both storages before every web test and is registered in `angular.json` under `test.options.setupFiles`. It runs ahead of each spec file's own hooks. The spec tsconfig includes it; the app and Storybook tsconfigs exclude it. The per-spec `sessionStorage.clear()` calls that predate it overlap it and stay. A spec that needs stored state writes it inside its own `beforeEach` or test.

**Confidence**

High. The mechanism was confirmed in the builder and vitest sources, and the fix was shown on a pinned-order reproduction, red twice before it and green twice after.

**Revisit when**

The web suite changes runner or turns on `isolate`, or the app keeps state in another browser store (IndexedDB, cookies) that the setup file does not clear.
