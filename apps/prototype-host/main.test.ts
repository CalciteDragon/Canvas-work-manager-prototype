import { connect, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { start, stop } from './main.ts';

const started: Array<Awaited<ReturnType<typeof start>>> = [];

async function startOnEphemeralPort() {
  const server = await start(0);
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
