import { createToolRegistry, type ToolRegistry } from '@cwm/mcp-tools';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { AgentAuthenticationError } from '../auth/prototype-agent-authenticator.ts';
import { createApi } from '../api/services.ts';
import { loadPersistence } from '../persistence/store.ts';
import { createWorkManagerMcpServer } from './server.ts';

const registryFor = (api: ReturnType<typeof createApi>): ToolRegistry =>
  createToolRegistry({
    projects: api.projects,
    pages: api.pages,
    todos: api.todos,
    archive: api.archive,
    tasks: api.tasks,
    reflections: api.reflections,
    sections: api.sections,
    shortcuts: api.shortcuts,
    dashboard: api.dashboard,
    workspace: api.workspace,
  });

const token = process.env['CWM_MCP_TOKEN'];
if (token === undefined || token.trim() === '') {
  console.error('CWM_MCP_TOKEN is required for the prototype stdio server');
  process.exit(1);
}

// Definitions are stable for the connection. Calls deliberately reload below: a stdio
// child is a second process, so its prior JsonDataStore cannot observe a permission edit or
// revocation written by the HTTP/UI host (§53).
const definitions = registryFor(createApi(await loadPersistence()));
const resolveInvocation = async () => {
  const api = createApi(await loadPersistence());
  const actor = await api.authenticator!.authenticate(`Bearer ${token}`);
  if (actor === null) throw new AgentAuthenticationError();
  return { registry: registryFor(api), actor };
};

serveStdio(() => createWorkManagerMcpServer(definitions, resolveInvocation), {
  onerror: (error) => console.error(`canvas-work-manager stdio error — ${error.message}`),
});
