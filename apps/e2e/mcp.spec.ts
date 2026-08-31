import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { PROTOTYPE_HOST, seed, setClock } from './seed';

/**
 * §69 calls this one of the most important tests in the prototype: an agent writes through
 * the real MCP server, and the open page moves without a reload (§62). So it uses a **real**
 * `@modelcontextprotocol/client` over the real Streamable HTTP transport, not a `fetch`
 * shaped like one.
 *
 * `project-work-manager` is named rather than assumed — it is the only project in the
 * `agent-heavy` seed carrying a `recent-activity` section, which is what the attribution
 * half of this test reads.
 *
 * The token is inlined with this comment rather than imported: `packages/prototype-data` is
 * source-only (`exports` points at `src/index.ts`), and Playwright does not transpile
 * dependencies reached through `node_modules`. `agent-tokens.ts` says the string is meant
 * to be pasted.
 */
const TOKEN = 'prototype-user-a-readwrite';
const PROJECT = 'project-work-manager';
const PINNED_NOW = '2026-09-15T12:00:00.000Z';

test('an agent’s task appears in the open page without a reload, attributed to Claude', async ({ page }) => {
  await seed('agent-heavy');
  await setClock(PINNED_NOW);

  // Registered *before* `goto`: `page.goto` resolving does not mean the SSE handshake
  // completed, and without this wait the test is flaky rather than wrong.
  const streamOpen = page.waitForResponse(
    (response) => response.url().includes('/prototype/events') && response.status() === 200,
  );
  await page.goto(`/projects/${PROJECT}`);
  await expect(page.locator('[data-project-name]')).toBeVisible();
  await streamOpen;

  const client = new Client(
    { name: 'cwm-e2e', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), {
      authProvider: { token: async () => TOKEN },
    }),
  );

  try {
    const result = await client.callTool({
      name: 'create_task',
      arguments: { projectId: PROJECT, title: 'Written by an agent, mid-session' },
    });
    expect(result.isError).not.toBe(true);
  } finally {
    await client.close();
  }

  // No reload anywhere in this test — Slice 16's stream is what moves the page.
  await expect(page.locator('[data-task-title]', { hasText: 'Written by an agent, mid-session' })).toBeVisible({
    timeout: 15_000,
  });

  const entry = page.locator('[data-activity-entry]').first();
  await expect(entry).toContainText('Written by an agent, mid-session');
  await expect(entry.locator('[data-activity-actor]')).toContainText('Claude');
});
