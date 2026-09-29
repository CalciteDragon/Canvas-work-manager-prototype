import { createInterface } from 'node:readline';
import { writeSeedFile } from '@cwm/prototype-data';
import { acquireDataFileOwnership, type DataFileOwnerKind } from '@cwm/repositories';

// Test child for data-file-ownership.test.ts only (Slice 54): another process holding the owner
// file. It prints `owned`, then on stdin `seed` writes the agent-heavy seed under its ownership
// and `release` lets go and exits. Otherwise it holds until it is killed.
const [path, kind] = process.argv.slice(2);
if (path === undefined || kind === undefined) throw new Error('owner-child requires a data path and an owner kind');

const ownership = await acquireDataFileOwnership(path, { kind: kind as DataFileOwnerKind });
process.stdout.write('owned\n');

for await (const line of createInterface({ input: process.stdin })) {
  if (line === 'seed') {
    await writeSeedFile('agent-heavy', { targetPath: path });
    process.stdout.write('seeded\n');
  } else if (line === 'release') {
    await ownership.release();
    process.stdout.write('released\n');
    process.exit(0);
  }
}
