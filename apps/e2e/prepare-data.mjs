import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The host has to load before any spec can call `/prototype/seed`. Refresh the suite's scratch
// document first so an old schema left by yesterday's run cannot prevent today's host from starting.
const source = fileURLToPath(new URL('../../prototype/seeds/empty.json', import.meta.url));
const target = fileURLToPath(new URL('../../.prototype/e2e-data.json', import.meta.url));

await copyFile(source, target);
