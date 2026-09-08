/**
 * Slice 12's `/prototype/*` control surface, called from the Node test process before each
 * spec navigates. Each spec seeds the host itself, so a run depends on no leftover state
 * and running it twice in a row passes both times.
 *
 * **`127.0.0.1`, not `localhost`.** These run in Node, where `localhost` can resolve to
 * `::1` while the host binds `127.0.0.1` only — the exact trap `playwright.config.ts`
 * avoids one layer up, waiting to be reintroduced by copying the browser's
 * `PROTOTYPE_API_BASE_URL` string.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const HOST = 'http://127.0.0.1:4310';

/** The prototype's fake persona header (§48). No security value; the host binds locally. */
const PERSONA_HEADERS = { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' };

export type Persona = 'user-demo' | 'user-alex' | 'user-sam';

export const jsonRequest = async <T = unknown>(
  path: string,
  options: { method?: string; persona?: Persona; body?: unknown } = {},
): Promise<T> => {
  const response = await fetch(`${HOST}${path}`, {
    method: options.method ?? 'GET',
    headers: { ...PERSONA_HEADERS, 'x-prototype-user': options.persona ?? 'user-demo' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} answered ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body as T;
};

export const api = {
  get: <T = unknown>(path: string, persona: Persona = 'user-demo') => jsonRequest<T>(path, { persona }),
  post: <T = unknown>(path: string, body: unknown, persona: Persona = 'user-demo') =>
    jsonRequest<T>(path, { method: 'POST', body, persona }),
  patch: <T = unknown>(path: string, body: unknown, persona: Persona = 'user-demo') =>
    jsonRequest<T>(path, { method: 'PATCH', body, persona }),
  delete: <T = unknown>(path: string, persona: Persona = 'user-demo') =>
    jsonRequest<T>(path, { method: 'DELETE', persona }),
};

const post = async (path: string, body: unknown): Promise<void> => {
  const response = await fetch(`${HOST}${path}`, {
    method: 'POST',
    headers: PERSONA_HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} answered ${response.status}: ${await response.text()}`);
  }
};

export const seed = (name: string): Promise<void> => post('/prototype/seed', { seed: name });

/** §45's simulated clock, so the dashboard's date arithmetic is deterministic. */
export const setClock = (now: string | null): Promise<void> => post('/prototype/clock', { now });

/** A real MCP client for the live HTTP journey, not a fetch-shaped protocol imitation. */
export const connectMcp = async (token: string, name = 'cwm-e2e'): Promise<Client> => {
  const client = new Client(
    { name, version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${HOST}/mcp`), {
      authProvider: { token: async () => token },
    }),
  );
  return client;
};

export { HOST as PROTOTYPE_HOST };
