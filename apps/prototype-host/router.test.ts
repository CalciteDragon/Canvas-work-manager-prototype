import { describe, expect, it } from 'vitest';
import { healthRoutes, resolveRoute, type RouteTable } from './router.ts';

const routes: RouteTable = {
  ...healthRoutes,
  'GET /api/tasks/:id': (request) => ({
    status: 200,
    contentType: 'application/json',
    body: { id: request.params['id'] },
  }),
  'POST /api/boom': () => {
    throw new Error('handler exploded');
  },
};

describe('resolveRoute', () => {
  it('answers GET /prototype/health with a JSON ok', async () => {
    expect(await resolveRoute(routes, 'GET', '/prototype/health')).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { ok: true },
    });
  });

  it('answers an unknown path with a JSON 404 rather than throwing', async () => {
    const result = await resolveRoute(routes, 'GET', '/nope');

    expect(result.status).toBe(404);
    expect(result.contentType).toBe('application/json');
    expect(result.body).toEqual({ error: 'not_found' });
  });

  it('matches on method as well as path', async () => {
    expect((await resolveRoute(routes, 'POST', '/prototype/health')).status).toBe(404);
  });

  it('captures a path parameter, decoded', async () => {
    expect((await resolveRoute(routes, 'GET', '/api/tasks/task%2F1')).body).toEqual({ id: 'task/1' });
  });

  it('does not match a pattern segment against an empty or extra segment', async () => {
    expect((await resolveRoute(routes, 'GET', '/api/tasks/')).status).toBe(404);
    expect((await resolveRoute(routes, 'GET', '/api/tasks/task-1/extra')).status).toBe(404);
  });

  it('answers 404 rather than 405 for a wrong method on a matched path', async () => {
    expect((await resolveRoute(routes, 'DELETE', '/api/tasks/task-1')).status).toBe(404);
  });

  it('turns a thrown handler error into a mapped result instead of rejecting', async () => {
    const result = await resolveRoute(routes, 'POST', '/api/boom');

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'internal_error' });
  });
});
