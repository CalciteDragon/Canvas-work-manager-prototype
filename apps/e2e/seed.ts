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
const HOST = 'http://127.0.0.1:4310';

/** The prototype's fake persona header (§48). No security value; the host binds locally. */
const PERSONA_HEADERS = { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' };

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

export { HOST as PROTOTYPE_HOST };
