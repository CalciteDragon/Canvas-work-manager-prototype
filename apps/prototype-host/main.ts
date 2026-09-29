import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import type { AddressInfo } from 'node:net';
import { SimulatedClock } from '@cwm/domain';
import { createToolRegistry } from '@cwm/mcp-tools';
import { createRequestHandler, healthRoutes, type RawRouteTable, type RouteTable } from './router.ts';
import { aiProviderFor, createApi } from './api/services.ts';
import { createApiRoutes } from './api/routes.ts';
import { acquireDataFileOwnership, type DataFileOwnership, type UnitOfWork } from '@cwm/repositories';
import { dataFilePath, loadPersistence } from './persistence/store.ts';
import { PrototypeRuntime } from './prototype/runtime.ts';
import { createPrototypeRoutes } from './prototype/routes.ts';
import { SwitchableAIProvider } from './prototype/switchable-ai-provider.ts';
import { createAuthenticatedMcpHandler, createMcpNodeHandler } from './mcp/handler.ts';
import { createEventStreamHandler } from './events/sse.ts';

export const DEFAULT_PORT = 4310;

/**
 * The host's port, from `CWM_HOST_PORT` — **never** from `PORT`.
 *
 * `PORT` is the most-used variable name in web tooling, and `pnpm dev` runs Angular and the
 * host as two children of one environment. Anything that set `PORT=4200` for Angular used to
 * hand the *host* the web port: the host won the bind, `ng serve` quietly moved elsewhere,
 * and every page load answered `{"error":"not_found"}` in the host's own words — while both
 * processes reported success. It cost real time on four separate occasions before the
 * variable was renamed (`.prototype/notes.json`). A shared, extremely common name is the
 * wrong knob for one of two processes started together.
 *
 * `CWM_HOST_PORT` matches `CWM_DATA_FILE`, and is what the acceptance scripts set to run a
 * second host beside a live `pnpm dev`. An unusable value **throws** rather than falling back
 * to the default: a silent fallback is the same failure as the bug above — the host comes up
 * somewhere you did not ask for and says nothing about it.
 */
export const PORT_VARIABLE = 'CWM_HOST_PORT';

export const configuredPort = (): number => {
  const value = process.env[PORT_VARIABLE];
  if (value === undefined) return DEFAULT_PORT;

  const port = Number(value);
  if (value.trim() === '' || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(`${PORT_VARIABLE} must be a port from 0 to 65535, not "${value}"`);
  }
  return port;
};

/**
 * Localhost only. The prototype's agent tokens have no security value (spec §51), so
 * nothing here may be reachable off-machine.
 */
export const HOST = '127.0.0.1';

/**
 * Starts the host and resolves once it is listening. Rejects — rather than exiting the
 * process — when the port is taken, so tests and callers can observe the failure.
 * Pass 0 for an ephemeral port. `routes` defaults to the health route alone, so a test
 * can start the host without touching a data file; the real entrypoint below adds §61's
 * API on top.
 */
export function start(
  port: number = DEFAULT_PORT,
  routes: RouteTable = healthRoutes,
  rawRoutes: RawRouteTable = {},
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(createRequestHandler(routes, rawRoutes));
    let listening = false;

    // Kept for the server's whole life: without it, any error after a successful
    // listen becomes an uncaught exception.
    server.on('error', (error: Error) => {
      if (listening) {
        console.error(`prototype-host error — ${error.message}`);
        return;
      }
      server.close();
      reject(error);
    });

    server.listen(port, HOST, () => {
      listening = true;
      resolve(server);
    });
  });
}

/**
 * Stops the host. `server.close()` on its own refuses new connections and waits for
 * *in-flight* requests, so `closeAllConnections()` is what makes shutdown prompt —
 * it tears down sockets that are mid-request. (Idle keep-alive sockets are closed by
 * `close()` itself since Node 19.)
 */
export function stop(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/**
 * The host's hold on its data file (Slice 54): acquired before the file is loaded and kept for the
 * host's lifetime. `drained` turns true once shutdown has waited out every queued write, and only
 * then may the file be handed to another writer.
 */
export interface HostOwnership {
  handle: DataFileOwnership;
  drained: boolean;
}

const DRAINED = Symbol('drained');

/**
 * Stops the host and hands its data file back. `stop()`'s `closeAllConnections()` does not cancel
 * a unit of work that is mid-persist, so the write queue is drained **before** the release —
 * otherwise a waiting writer could load the file before the host's rename lands.
 *
 * The drain throws a sentinel: `runUnitOfWork` persists after any callback that returns, so a
 * no-op callback would rewrite the file on every Ctrl+C. A throwing one still waits for the
 * queue's tail but skips the persist.
 */
export async function shutdownHost(parts: {
  server: Server;
  mcp: { close(): Promise<void> };
  unitOfWork: UnitOfWork;
  ownership: HostOwnership;
}): Promise<void> {
  const stopped = await Promise.allSettled([stop(parts.server), parts.mcp.close()]);
  await parts.unitOfWork.run(() => {
    throw DRAINED;
  }).catch((error: unknown) => {
    if (error !== DRAINED) throw error;
  });
  parts.ownership.drained = true;
  await parts.ownership.handle.release();
  const failure = stopped.find((result) => result.status === 'rejected');
  if (failure !== undefined) throw failure.reason;
}

/**
 * The `process.on('exit')` release. On the 2 s give-up path the drain has not finished and a
 * threadpool rename may still be in flight, so the record is left for pid-based reclaim instead.
 * A failure here is swallowed: a throw in an exit listener only prints a trace, and the record is
 * reclaimable by pid anyway.
 */
export function releaseOnExit(ownership: HostOwnership): void {
  if (!ownership.drained) return;
  try {
    ownership.handle.releaseSync();
  } catch {
    // Left for pid-based reclaim.
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolvePath(process.argv[1]) === resolvePath(fileURLToPath(import.meta.url));

if (isDirectRun) {
  // Resolved before the try, and reused by the failure message below: `configuredPort` now
  // throws on an unusable value, and calling it again from the catch would throw a second
  // time — losing the very message that explains the first.
  let port = DEFAULT_PORT;
  let ownership: HostOwnership | undefined;
  try {
    port = configuredPort();
    // One writer per data file: acquired before the load, so first-run seeding happens under it
    // too. The wait covers a `tsx watch` restart whose old child is still exiting, or a stdio
    // call's turn. The line goes to stdout, where the harnesses already read the listening line.
    const handle = await acquireDataFileOwnership(dataFilePath(), {
      kind: 'http-host',
      waitMs: 5_000,
      onWait: (owner) => console.log(`prototype-host waiting for data file owned by ${owner.kind} pid ${owner.pid}`),
    });
    const held: HostOwnership = { handle, drained: false };
    ownership = held;
    process.on('exit', () => releaseOnExit(held));
    // Loading the data file after the port means a broken or missing document fails the
    // start loudly, rather than surfacing as a 500 on the first request.
    const persistence = await loadPersistence();

    // The clock and the AI provider are built here, not inside `createApi`, because the
    // development panel has to hold the *same instances* the services are wired with —
    // that is what lets §46 move the date or swap the provider without a restart.
    const aiProviderMode = process.env['PROTOTYPE_AI_PROVIDER'] === 'real' ? 'real' : 'mock';
    const clock = new SimulatedClock();
    const ai = new SwitchableAIProvider(aiProviderFor(process.env['PROTOTYPE_AI_PROVIDER']));
    const runtime = new PrototypeRuntime({ persistence, clock, ai, aiProvider: aiProviderMode });
    const api = createApi(persistence, { clock, ai });
    const registry = createToolRegistry({
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
    const mcp = createAuthenticatedMcpHandler({ registry, authenticator: api.authenticator! });

    const server = await start(port, {
      ...healthRoutes,
      ...createPrototypeRoutes(runtime, {}, api.events),
      ...createApiRoutes(api),
    }, {
      '/mcp': createMcpNodeHandler(mcp),
      // §62. A raw mount because a route table returning one result cannot hold a socket
      // open. Shutdown needs nothing extra: `stop()`'s `closeAllConnections()` destroys the
      // mid-request socket and the handler's own `close` listener clears its heartbeat.
      '/prototype/events': createEventStreamHandler(api.events, persistence.store),
    });
    const actualPort = (server.address() as AddressInfo).port;
    console.log(`prototype-host listening on http://${HOST}:${actualPort} — data ${persistence.path}`);

    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        // A second Ctrl+C while the first stop() is still pending would close an
        // already-closing server and reject; and a close that never settles would
        // hang the terminal. Neither may keep the shell hostage.
        if (stopping) {
          process.exit(0);
        }
        stopping = true;
        const giveUp = setTimeout(() => process.exit(0), 2000).unref();
        void shutdownHost({ server, mcp, unitOfWork: persistence.unitOfWork, ownership: held })
          .catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`prototype-host did not shut down cleanly — ${reason}`);
          })
          .finally(() => {
            clearTimeout(giveUp);
            process.exit(0);
          });
      });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`prototype-host failed to start on ${HOST}:${port} — ${reason}`);
    // Nothing is queued before the host listens, so the file can be handed back at once.
    await ownership?.handle.release().catch(() => undefined);
    process.exit(1);
  }
}
