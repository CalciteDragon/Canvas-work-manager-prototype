import type { WorkspaceId } from '@cwm/contracts';
import type { DataStore } from '@cwm/repositories';
import { corsHeaders, type RawRouteHandler } from '../router.ts';
import type { LiveEventHub } from './hub.ts';

/**
 * How long a browser waits before reconnecting itself, in milliseconds. Sent once at the
 * top of the stream so the retry cadence is the host's decision rather than each browser's
 * default.
 */
export const RETRY_MS = 2_000;

/**
 * A comment line every so often. Nothing on localhost buffers a response, so this is not
 * about proxies — it is what makes a half-open socket surface as a write error instead of a
 * stream that is silently dead until the next mutation.
 */
export const HEARTBEAT_INTERVAL_MS = 15_000;

export interface EventStreamOptions {
  heartbeatMs?: number;
}

const json = (status: number, cors: Record<string, string>, body: unknown) => ({
  status,
  headers: { ...cors, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * §62's `GET /prototype/events`.
 *
 * A **raw** mount, because a route table that returns one `RouteResult` cannot hold a socket
 * open. That has two consequences this handler owns rather than inherits: CORS goes on every
 * response it writes, and a non-GET — preflight included — gets its own 405 rather than the
 * router's `OPTIONS` branch. `EventSource` issues no preflight, so nothing legitimate lands
 * there.
 *
 * `?user=` scopes the stream to one persona's workspace. It deliberately does **not** reuse
 * `resolveUser`: that helper defaults an absent value to the first user because a REST call
 * needs *an* actor, and a stream needs none — absent means "everything", which is what a
 * `curl` debugging this wants. An unknown id is a 404 rather than a silent unfiltered
 * stream. Resolving once at connect time is safe because every seed builds its users from
 * the same persona list, so a reseed never moves an id to another workspace.
 *
 * There is no authentication, like every other `/prototype/*` route (§51). The filter is
 * noise reduction, not access control.
 */
export const createEventStreamHandler = (
  hub: LiveEventHub,
  store: DataStore,
  options: EventStreamOptions = {},
): RawRouteHandler => {
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS;

  return (request, response) => {
    const cors = corsHeaders(request.headers.origin);

    if ((request.method ?? 'GET') !== 'GET') {
      const { status, headers, body } = json(405, { ...cors, allow: 'GET' }, { error: 'method_not_allowed' });
      response.writeHead(status, headers);
      response.end(body);
      return;
    }

    const requested = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('user');
    let workspaceId: WorkspaceId | undefined;
    if (requested !== null) {
      const user = store.snapshot().users.find(({ id }) => id === requested);
      if (user === undefined) {
        const { status, headers, body } = json(404, cors, { error: 'not_found', message: `no persona "${requested}"` });
        response.writeHead(status, headers);
        response.end(body);
        return;
      }
      workspaceId = user.workspaceId;
    }

    response.writeHead(200, {
      ...cors,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    response.write(`retry: ${RETRY_MS}\n\n`);

    const unsubscribe = hub.subscribe((event) => response.write(`data: ${JSON.stringify(event)}\n\n`), workspaceId);
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), heartbeatMs);
    heartbeat.unref();

    // `stop()` already tears the socket down with `closeAllConnections()`; this is what
    // stops the timer and the subscription from outliving it. Without it every reload of a
    // browser tab leaks one of each for the life of the host.
    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
};
