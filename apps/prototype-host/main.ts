import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { handleRequest } from './router.ts';

export const DEFAULT_PORT = 4310;

/**
 * Localhost only. The prototype's agent tokens have no security value (spec §51), so
 * nothing here may be reachable off-machine.
 */
export const HOST = '127.0.0.1';

/**
 * Starts the host and resolves once it is listening. Rejects — rather than exiting the
 * process — when the port is taken, so tests and callers can observe the failure.
 * Pass 0 for an ephemeral port.
 */
export function start(port: number = DEFAULT_PORT): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(handleRequest);
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

const isDirectRun =
  process.argv[1] !== undefined &&
  resolvePath(process.argv[1]) === resolvePath(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const server = await start();
    console.log(`prototype-host listening on http://${HOST}:${DEFAULT_PORT}`);

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
        void stop(server)
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
    console.error(`prototype-host failed to start on ${HOST}:${DEFAULT_PORT} — ${reason}`);
    process.exit(1);
  }
}
