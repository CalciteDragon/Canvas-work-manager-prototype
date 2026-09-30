import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acquireDataFileOwnership } from '@cwm/repositories';

// The host has to load before any spec can call `/prototype/seed`. Refresh the suite's scratch
// document first so an old schema left by yesterday's run cannot prevent today's host from starting.
const source = fileURLToPath(new URL('../../prototype/seeds/empty.json', import.meta.url));
const target = fileURLToPath(new URL('../../.prototype/e2e-data.json', import.meta.url));

// A writer like any other (Slice 54): a leftover e2e host still owning the file is refused loudly,
// and the stale record a hard-killed one left behind is reclaimed.
const ownership = await acquireDataFileOwnership(target, { kind: 'e2e-prepare' });
try {
  await copyFile(source, target);
} finally {
  await ownership.release();
}
