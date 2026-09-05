import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SEED_NAMES, buildSeed } from '../../packages/prototype-data/src/seeds';

const dir = fileURLToPath(new URL('../../prototype/seeds/', import.meta.url));
for (const name of SEED_NAMES) {
  await writeFile(`${dir}${name}.json`, `${JSON.stringify(buildSeed(name), null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${name}\n`);
}
