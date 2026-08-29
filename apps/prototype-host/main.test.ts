import { connect, type AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { DomainRuleError } from '@cwm/domain';
import { DEFAULT_PORT, configuredPort, start, stop } from './main.ts';
import { createMcpNodeHandler } from './mcp/handler.ts';
import { healthRoutes, type RawRouteTable, type RouteTable } from './router.ts';

const started: Array<Awaited<ReturnType<typeof start>>> = [];

async function startOnEphemeralPort(extraRoutes: RouteTable = {}, rawRoutes: RawRouteTable = {}) {
  const server = await start(0, { ...healthRoutes, ...extraRoutes }, rawRoutes);
  started.push(server);
  return { server, port: (server.address() as AddressInfo).port };
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((server) => stop(server)));
});

describe('the prototype host', () => {
  it('serves the health route over real HTTP', async () => {
    const { port } = await startOnEphemeralPort();

    const response = await fetch(`http://127.0.0.1:${port}/prototype/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('delegates /mcp before the JSON router consumes its request body', async () => {
    const raw = vi.fn<RawRouteTable[string]>(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      response.writeHead(202, { 'content-type': 'application/json' });
      response.end(Buffer.concat(chunks));
    });
    const { port } = await startOnEphemeralPort({}, { '/mcp': raw });

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      body: JSON.stringify({ untouched: true }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ untouched: true });
    expect(raw).toHaveBeenCalledOnce();
  });

  it('admits a localhost Host with no browser Origin to the MCP Node adapter', async () => {
    const mcp = createMcpNodeHandler({ fetch: async () => new Response(null, { status: 204 }) });
    const { port } = await startOnEphemeralPort({}, { '/mcp': mcp });

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' });

    expect(response.status).toBe(204);
  });

  it.each([
    ['untrusted Host', { host: 'attacker.example' }],
    ['untrusted browser Origin', { origin: 'https://attacker.example' }],
  ])('rejects an %s before the MCP SDK handler', async (_label, headers) => {
    const fetchHandler = vi.fn(async () => new Response(null, { status: 204 }));
    const mcp = createMcpNodeHandler({ fetch: fetchHandler });
    const { port } = await startOnEphemeralPort({}, { '/mcp': mcp });

    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end();
    });

    expect(status).toBe(403);
    expect(fetchHandler).not.toHaveBeenCalled();
  });

  it('binds to localhost only', async () => {
    const { server } = await startOnEphemeralPort();

    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('rejects with EADDRINUSE instead of hanging or exiting the process', async () => {
    const { port } = await startOnEphemeralPort();

    await expect(start(port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  // Shutdown is tested through stop() rather than through SIGTERM: this is win32,
  // where child.kill('SIGTERM') is TerminateProcess and never runs the handler, so a
  // signal-based test would pass whether or not shutdown works. Ctrl+C itself is
  // verified by hand (plan acceptance check 5).
  //
  // The connection below is deliberately mid-request — headers sent, no terminating
  // blank line — not idle. server.close() alone closes idle sockets but waits on this
  // one, so the test fails if stop() ever loses its closeAllConnections().
  it('shuts down while a connection is mid-request', async () => {
    const { server, port } = await startOnEphemeralPort();
    started.pop();
    const socket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });
    socket.write('GET /prototype/health HTTP/1.1\r\nHost: 127.0.0.1\r\n');

    await stop(server);

    await expect(fetch(`http://127.0.0.1:${port}/prototype/health`)).rejects.toThrow();
    socket.destroy();
  }, 10_000);

  it('resolves the @cwm/contracts workspace package at runtime', () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

/**
 * §10 has the Angular gateway calling `:4310` directly from `:4200`, so the browser needs
 * CORS. These run against a real server rather than `resolveRoute`, because the headers
 * live in `createRequestHandler` and are invisible to the route table.
 */
describe('CORS for the Angular dev server', () => {
  const WEB = 'http://localhost:4200';

  it('answers a preflight with 204 and the allow headers', async () => {
    const { port } = await startOnEphemeralPort();

    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'OPTIONS',
      headers: { origin: WEB, 'access-control-request-method': 'GET' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
    // Removing a section is the one DELETE the gateway makes; without it advertised here
    // the browser rejects the preflight and the remove control silently never fires.
    expect(response.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-prototype-user');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('carries the headers on a real response too', async () => {
    const { port } = await startOnEphemeralPort();

    const response = await fetch(`http://127.0.0.1:${port}/prototype/health`, { headers: { origin: WEB } });

    expect(response.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('does not reflect an origin outside localhost', async () => {
    const { port } = await startOnEphemeralPort();

    const response = await fetch(`http://127.0.0.1:${port}/prototype/health`, {
      headers: { origin: 'https://example.test' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    // …but it still varies by origin, so a cache cannot serve this to an allowed one.
    expect(response.headers.get('vary')).toBe('Origin');
  });

  // Without this the browser hides the body of every failure, and the gateway reports a
  // real domain error as `unreachable`. The route table is purpose-built: these tests are
  // about headers, and loadPersistence() would seed and mutate the developer's data file.
  it('carries the headers on error responses', async () => {
    const { port } = await startOnEphemeralPort({
      'GET /boom': () => {
        throw new DomainRuleError('nope');
      },
    });

    for (const [path, status] of [
      ['/nothing-here', 404],
      ['/boom', 409],
    ] as const) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { origin: WEB } });

      expect(response.status).toBe(status);
      expect(response.headers.get('access-control-allow-origin')).toBe(WEB);
    }
  });
});

/**
 * The host's port is deliberately **not** `PORT`.
 *
 * `PORT` is the most-used variable name in web tooling, and `pnpm dev` runs two processes
 * under one environment: anything that sets `PORT=4200` for Angular used to hand the host
 * the web port, so the host won the bind, `ng serve` moved elsewhere, and every page load
 * answered `{"error":"not_found"}` in the host's own words — while both processes reported
 * success. That cost real time on four separate occasions (see `.prototype/notes.json`).
 */
describe('configuredPort', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to 4310 when nothing asks for anything else', () => {
    delete process.env['CWM_HOST_PORT'];
    delete process.env['PORT'];

    expect(configuredPort()).toBe(DEFAULT_PORT);
  });

  it('obeys CWM_HOST_PORT, so a second host can run beside a live pnpm dev', () => {
    process.env['CWM_HOST_PORT'] = '4399';

    expect(configuredPort()).toBe(4399);
  });

  /** The regression this whole variable exists for. */
  it('ignores PORT completely, even when it is the only thing set', () => {
    process.env['PORT'] = '4200';
    delete process.env['CWM_HOST_PORT'];

    expect(configuredPort()).toBe(DEFAULT_PORT);
  });

  it('still ignores PORT when CWM_HOST_PORT disagrees with it', () => {
    process.env['PORT'] = '4200';
    process.env['CWM_HOST_PORT'] = '4398';

    expect(configuredPort()).toBe(4398);
  });

  it('accepts 0, which is how a test asks for an ephemeral port', () => {
    process.env['CWM_HOST_PORT'] = '0';

    expect(configuredPort()).toBe(0);
  });

  /**
   * A typo used to fall back to 4310 in silence, which is the same symptom as the bug
   * above: the host comes up somewhere you did not ask for and says nothing about it.
   */
  it.each(['not-a-port', '70000', '-1', '43.5', ''])('refuses the unusable value %o rather than defaulting', (value) => {
    process.env['CWM_HOST_PORT'] = value;

    expect(() => configuredPort()).toThrow(/CWM_HOST_PORT/);
  });
});
