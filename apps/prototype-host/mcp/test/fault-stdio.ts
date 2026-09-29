import { loadPersistence } from '../../persistence/store.ts';
import { startStdio } from '../stdio.ts';

// This executable belongs to the SDK test only. No production environment switch exists.
const mode = process.argv[2];
let pending = true;

await startStdio({
  load: async () => {
    const persistence = await loadPersistence();
    if ((mode === 'fail-create_task' || mode === 'fail-undo_operation') && pending) {
      persistence.store.persist = async () => {
        pending = false;
        throw new Error('slice52 persist fault');
      };
    }
    return persistence;
  },
  afterCall: (name) => {
    if (mode === `drop-${name}` && pending) {
      pending = false;
      process.exit(91);
    }
  },
});
