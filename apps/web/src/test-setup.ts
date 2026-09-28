import { beforeEach } from 'vitest';

/**
 * Every web test starts from an empty browser session.
 *
 * `@angular/build:unit-test` runs vitest with `isolate: false`, so spec files that share a worker
 * share one jsdom `sessionStorage` and `localStorage`. `PrototypeSettings` mirrors §47's flags to
 * `sessionStorage`, so a spec that turned a flag off and never cleared it changed the defaults
 * of whichever file ran next in that worker — a failure that came and went with scheduling
 * (docs/decisions/2026-09-web-specs-start-with-empty-storage.md).
 *
 * Registered through `setupFiles` in `angular.json`, which runs this file ahead of each spec file,
 * so this hook runs before that file's own. The per-spec `sessionStorage.clear()` calls that
 * predate it now overlap it and are left alone by design.
 */
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
