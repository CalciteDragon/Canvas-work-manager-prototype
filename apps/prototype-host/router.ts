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
      params[segment.slice(1)] = decodeURIComponent(value);
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

export function createRequestHandler(routes: RouteTable) {
  return async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
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

    response.writeHead(result.status, { 'content-type': result.contentType });
    response.end(JSON.stringify(result.body));
  };
}
