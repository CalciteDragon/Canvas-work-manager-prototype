import { createToolRegistry, type ToolRegistry } from '@cwm/mcp-tools';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentAuthenticationError } from '../auth/prototype-agent-authenticator.ts';
import { createApi } from '../api/services.ts';
import { loadPersistence, type Persistence } from '../persistence/store.ts';
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

/** Host-local composition seams for SDK transport tests; direct execution supplies neither. */
export interface StdioStartupHooks {
  load?: () => Promise<Persistence>;
  afterCall?: (name: string) => void | Promise<void>;
}

/** Start the ordinary stdio server, optionally composing a test child's persistence and reply gate. */
export const startStdio = async (hooks: StdioStartupHooks = {}): Promise<void> => {
  const token = process.env['CWM_MCP_TOKEN'];
  if (token === undefined || token.trim() === '') {
    console.error('CWM_MCP_TOKEN is required for the prototype stdio server');
    process.exit(1);
  }
  const load = hooks.load ?? loadPersistence;

  // Definitions are stable for the connection. Calls deliberately reload below: a stdio
  // child is a second process, so its prior JsonDataStore cannot observe a permission edit or
  // revocation written by the HTTP/UI host (§53).
  const definitions = registryFor(createApi(await load()));

  // That reload gives every call its own store, and so its own write lock: two overlapping calls
  // would each read the same history revision and both commit (Slice 45, defect D2). Calls
  // therefore take turns — the next one loads only after the previous call has persisted. The turn
  // is held from resolution until the one `call` the server makes with the resolved registry.
  let turn: Promise<void> = Promise.resolve();
  const resolveInvocation = async () => {
    const previous = turn;
    let release!: () => void;
    turn = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const api = createApi(await load());
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
            release();
          }
        },
      };
      return { registry: serialized, actor };
    } catch (error) {
      release();
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
