import { readFile } from 'node:fs/promises';
import { SimulatedClock } from '@cwm/domain';
import { startStdio } from '../stdio.ts';

// SDK test child only: the sidecar carries the exact removal receipt from the client.
const [sidecar, mode] = process.argv.slice(2);
if (sidecar === undefined || !['first', 'reopen'].includes(mode ?? '')) {
  throw new Error('clock-stdio requires a sidecar path and first/reopen mode');
}
const clock = new SimulatedClock();
const advance = async () => clock.setNow(new Date(Date.parse((await readFile(sidecar, 'utf8')).trim()) + 1_000));
if (mode === 'reopen') await advance();
let advanced = false;
await startStdio({
  clock,
  afterCall: async (name) => {
    if (mode === 'first' && name === 'get_operation_history' && !advanced) {
      advanced = true;
      await advance();
    }
  },
});
