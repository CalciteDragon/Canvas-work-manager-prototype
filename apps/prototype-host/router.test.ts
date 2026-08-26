import { describe, expect, it } from 'vitest';
import { resolveRoute } from './router.ts';

describe('resolveRoute', () => {
  it('answers GET /prototype/health with a JSON ok', () => {
    expect(resolveRoute('GET', '/prototype/health')).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { ok: true },
    });
  });

  it('answers an unknown path with a JSON 404 rather than throwing', () => {
    const result = resolveRoute('GET', '/nope');

    expect(result.status).toBe(404);
    expect(result.contentType).toBe('application/json');
    expect(result.body).toEqual({ error: 'not_found' });
  });

  it('matches on method as well as path', () => {
    expect(resolveRoute('POST', '/prototype/health').status).toBe(404);
  });
});
