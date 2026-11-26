// Slice 82 step 4a/4b reproduction: MCP as an agent sees it, against the reproduction host on 4320.
// Streamable HTTP session (initialize first, via Client.connect), protocol pinned to 2026-07-28, the fixture
// token prototype-user-a-readwrite (agent-claude, present in the nested-projects seed).
// Usage (repo root): node apps/e2e/ux/walk/repro/c82-mcp.mjs '[["list_archived_projects",{}], ["archive_project",{"projectId":"…"}]]'
// Prints each call's tool name, isError and text content. Disposable rig (plan § File-level change list).
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const HOST = process.env.C82_MCP_HOST ?? 'http://127.0.0.1:4320';
const calls = JSON.parse(process.argv[2] ?? '[]');
const client = new Client({ name: 'c82-repro', version: '0.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
await client.connect(new StreamableHTTPClientTransport(new URL(`${HOST}/mcp`), { authProvider: { token: async () => 'prototype-user-a-readwrite' } }));
for (const [name, args] of calls) {
  const result = await client.callTool({ name, arguments: args ?? {} });
  const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  console.log(JSON.stringify({ tool: name, isError: !!result.isError, text: text.length > 3000 ? `${text.slice(0, 3000)}…` : text }));
}
await client.close();
