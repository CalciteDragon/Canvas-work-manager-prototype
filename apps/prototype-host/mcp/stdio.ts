import { createToolRegistry, type ToolRegistry } from '@cwm/mcp-tools';
import type { SimulatedClock } from '@cwm/domain';
import { acquireDataFileOwnership, DataFileInUseError, type DataFileOwnership, type DataFileOwnerRecord } from '@cwm/repositories';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentAuthenticationError } from '../auth/prototype-agent-authenticator.ts';
import { createApi } from '../api/services.ts';
import { dataFilePath, loadPersistence, type Persistence } from '../persistence/store.ts';
import { createWorkManagerMcpServer } from './server.ts';

const registryFor = (api: ReturnType<typeof createApi>): ToolRegistry =>
  createToolRegistry({
    projects: api.projects,
    pages: api.pages,
    todos: api.todos,
    archive: api.archive,
    archivedProjects: api.archivedProjects,
    journal: api.journal,
    tasks: api.tasks,
    reflections: api.reflections,
    sections: api.sections,
    shortcuts: api.shortcuts,
    dashboard: api.dashboard,
    workspace: api.workspace,
    history: api.history,
  });

/** Host-local composition seams for SDK transport tests; direct execution supplies none. */
export interface StdioStartupHooks {
  /** A test child's one moving clock, shared by startup and every per-call API. */
  clock?: SimulatedClock;
  load?: () => Promise<Persistence>;
  afterCall?: (name: string) => void | Promise<void>;
}

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/** Stdout carries the protocol, so an operator-facing line goes to stderr. */
const announceWait = (owner: DataFileOwnerRecord): void => {
  process.stderr.write(`canvas-work-manager stdio waiting for data file owned by ${owner.kind} pid ${owner.pid}
`);
};

/**
 * The ownership this process holds right now, if any: set while a turn (or first-run seeding)
 * holds the data file, cleared when it lets go. The one exit listener releases it, which covers a
 * child that exits mid-turn — without adding a listener per call.
 */
let held: DataFileOwnership | undefined;

const hold = async (path: string, skipHosts: boolean): Promise<DataFileOwnership> => {
  held = await acquireDataFileOwnership(path, {
    kind: 'stdio',
    waitMs: 5_000,
    onWait: announceWait,
    // A host never releases soon: a call behind one is refused at once rather than stalled.
    skipWaitForKinds: skipHosts ? ['http-host'] : [],
  });
  return held;
};

const letGo = async (ownership: DataFileOwnership | undefined): Promise<void> => {
  if (ownership === undefined) return;
  if (held === ownership) held = undefined;
  await ownership.release();
};

/**
 * Definitions come from a plain read, so a stdio child starts and lists tools while a host owns
 * the file. Only a missing file needs a writer — the seeding `load()` — and a refused acquisition
 * there usually means a host starting at the same moment won and seeded it, so start-up re-checks
 * and reads the file it wrote.
 */
const loadDefinitions = async (path: string, load: () => Promise<Persistence>): Promise<Persistence> => {
  if (await exists(path)) return load();
  let seeding: DataFileOwnership | undefined;
  try {
    seeding = await hold(path, false);
  } catch (error) {
    if (!(error instanceof DataFileInUseError) || !(await exists(path))) throw error;
  }
  try {
    return await load();
  } finally {
    await letGo(seeding);
  }
};

/** Start the ordinary stdio server, optionally composing a test child's clock, persistence and reply gate. */
export const startStdio = async (hooks: StdioStartupHooks = {}): Promise<void> => {
  const token = process.env['CWM_MCP_TOKEN'];
  if (token === undefined || token.trim() === '') {
    console.error('CWM_MCP_TOKEN is required for the prototype stdio server');
    process.exit(1);
  }
  const load = hooks.load ?? loadPersistence;
  const path = dataFilePath();
  process.on('exit', () => held?.releaseSync());

  // Definitions are stable for the connection. Calls deliberately reload below: a stdio
  // child is a second process, so its prior JsonDataStore cannot observe a permission edit or
  // revocation written by the HTTP/UI host (§53).
  const definitions = registryFor(createApi(await loadDefinitions(path, load), { clock: hooks.clock }));

  // That reload gives every call its own store, and so its own write lock: two overlapping calls
  // would each read the same history revision and both commit (Slice 45, defect D2). Calls
  // therefore take turns — the next one loads only after the previous call has persisted. The turn
  // is held from resolution until the one `call` the server makes with the resolved registry.
  //
  // Other processes take turns through the data file's owner record (Slice 54): each turn owns the
  // file from before its load until after its call, and is refused with `data_file_in_use:` while
  // a host owns it. Ownership is let go before the turn, or this process's next call would wait on
  // its own record.
  let turn: Promise<void> = Promise.resolve();
  const resolveInvocation = async () => {
    const previous = turn;
    let releaseTurn!: () => void;
    turn = new Promise((resolve) => {
      releaseTurn = resolve;
    });
    let ownership: DataFileOwnership | undefined;
    const release = async () => {
      try {
        await letGo(ownership);
      } finally {
        releaseTurn();
      }
    };
    await previous;
    try {
      ownership = await hold(path, true);
      const api = createApi(await load(), { clock: hooks.clock });
      const actor = await api.authenticator!.authenticate(`Bearer ${token}`);
      if (actor === null) throw new AgentAuthenticationError();
      const registry = registryFor(api);
      const serialized: ToolRegistry = {
        ...registry,
        call: async (name, input, caller) => {
          try {
            const result = await registry.call(name, input, caller);
            await hooks.afterCall?.(name);
            return result;
          } finally {
            await release();
          }
        },
      };
      return { registry: serialized, actor };
    } catch (error) {
      await release();
      throw error;
    }
  };

  serveStdio(() => createWorkManagerMcpServer(definitions, resolveInvocation), {
    onerror: (error) => console.error(`canvas-work-manager stdio error — ${error.message}`),
  });
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startStdio();
}
