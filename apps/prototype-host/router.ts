import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The prototype host's route table. Deliberately disposable (spec §71): no framework,
 * no middleware, no layering. The real API routes (§61) land in Slice 5 and the MCP
 * endpoint (§50) in Slice 15 — both by adding entries here.
 */
export interface RouteResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: unknown;
}

const routes: Record<string, () => RouteResult> = {
  'GET /prototype/health': () => ({
    status: 200,
    contentType: 'application/json',
    body: { ok: true },
  }),
};

export function resolveRoute(method: string, path: string): RouteResult {
  const handler = routes[`${method} ${path}`];
  if (handler === undefined) {
    return { status: 404, contentType: 'application/json', body: { error: 'not_found' } };
  }
  return handler();
}

export function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const result = resolveRoute(request.method ?? 'GET', path);

  response.writeHead(result.status, { 'content-type': result.contentType });
  response.end(JSON.stringify(result.body));
}
