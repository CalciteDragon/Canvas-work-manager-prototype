import type { IncomingMessage, ServerResponse } from 'node:http';
import { toErrorResult } from './api/errors.ts';

/**
 * The prototype host's route table. Deliberately disposable (spec §71): no framework,
 * no middleware, no layering. Slice 5 added the §61 API routes; the MCP endpoint (§50)
 * lands in Slice 15 by adding entries here.
 */
export interface RouteResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: unknown;
}

export interface RouteRequest {
  readonly method: string;
  readonly path: string;
  /** Path parameters captured by the pattern, e.g. `:id`. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Parsed JSON body, or `undefined` when the request carried none. */
  readonly body: unknown;
}

export type RouteHandler = (request: RouteRequest) => Promise<RouteResult> | RouteResult;
export type RouteTable = Record<string, RouteHandler>;

const NOT_FOUND: RouteResult = { status: 404, contentType: 'application/json', body: { error: 'not_found' } };

/**
 * `GET /api/tasks/:id` against `/api/tasks/task-1`. An unmatched method on a matched
 * path answers the same 404 rather than a 405 — a deliberate simplification for a
 * disposable host, not an oversight.
 */
const match = (pattern: string, method: string, path: string): Record<string, string> | null => {
  const [patternMethod, patternPath] = pattern.split(' ');
  if (patternMethod !== method || patternPath === undefined) return null;

  const patternSegments = patternPath.split('/');
  const pathSegments = path.split('/');
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (const [index, segment] of patternSegments.entries()) {
    const value = pathSegments[index] ?? '';
    if (segment.startsWith(':')) {
      if (value === '') return null;
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        // A malformed escape like `%ZZ` is a caller mistake, and this runs outside
        // resolveRoute's error mapping — letting the URIError out would make it a 500.
        return null;
      }
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
};

export const healthRoutes: RouteTable = {
  'GET /prototype/health': () => ({ status: 200, contentType: 'application/json', body: { ok: true } }),
};

export async function resolveRoute(
  routes: RouteTable,
  method: string,
  path: string,
  request: Omit<RouteRequest, 'method' | 'path' | 'params'> = {
    query: new URLSearchParams(),
    headers: {},
    body: undefined,
  },
): Promise<RouteResult> {
  for (const [pattern, handler] of Object.entries(routes)) {
    const params = match(pattern, method, path);
    if (params === null) continue;
    try {
      return await handler({ ...request, method, path, params });
    } catch (error) {
      return toErrorResult(error);
    }
  }
  return NOT_FOUND;
}

/** 1 MB is generous for a prototype and stops an unbounded buffer. */
const MAX_BODY_BYTES = 1_000_000;

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RangeError('request body is too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * §10 has the Angular gateway calling `:4310` from `:4200`, so the browser needs CORS.
 * Localhost only — the prototype's tokens have no security value (§51) and nothing here
 * may be usable from a real page.
 *
 * The origin is reflected rather than wildcarded, which makes the response vary by origin;
 * `Vary` says so. `x-prototype-user` is a non-simple header, so *every* gateway call
 * preflights — `Max-Age` is what stops that from doubling the request count.
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4200',
  'http://127.0.0.1:4200',
]);

const corsHeaders = (origin: string | undefined): Record<string, string> => {
  // `Vary` goes on every response, including the ones that get no allow-origin. A cache
  // that stored a header-less response and later served it to :4200 would break CORS for
  // a request that should have worked — unreachable behind localhost with no intermediary,
  // but the header costs nothing and the omission is the textbook shape of that bug.
  if (origin === undefined || !ALLOWED_ORIGINS.has(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, x-prototype-user',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
};

export function createRequestHandler(routes: RouteTable) {
  return async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const cors = corsHeaders(request.headers.origin);

    // Preflight is answered before the route table, not through it: `match()` requires the
    // pattern's method to equal the request's, and no pattern is OPTIONS — so a preflight
    // would 404, and with it every gateway call the browser ever makes. The cost is that
    // an unknown path also preflights 204; acceptable for a disposable host (§71).
    // The unconsumed request body needs no drain — Node dumps it on response finish, and
    // a browser preflight carries none.
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    let result: RouteResult;
    try {
      const raw = await readBody(request);
      result = await resolveRoute(routes, request.method ?? 'GET', url.pathname, {
        query: url.searchParams,
        headers: request.headers,
        // An empty body is "no body", not a parse error: POST /complete carries none.
        body: raw === '' ? undefined : JSON.parse(raw),
      });
    } catch (error) {
      result = toErrorResult(error);
    }

    // CORS goes on every response, errors included: a 404 or 409 without them reaches
    // the browser as a CORS failure, and the gateway reports a real domain error as
    // 'unreachable'.
    response.writeHead(result.status, { ...cors, 'content-type': result.contentType });
    response.end(JSON.stringify(result.body));
  };
}
