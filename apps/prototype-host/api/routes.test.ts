import { PrototypeDocumentSchema, SCHEMA_VERSION, ProjectSchema, TaskSchema } from '@cwm/contracts';
import { ActivityService, PrototypeClock, PrototypeIdGenerator, ProjectService, TaskService } from '@cwm/domain';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonProjectRepository,
  JsonTaskRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { PERSONAS } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { resolveRoute, type RouteTable } from '../router.ts';
import { createApiRoutes } from './routes.ts';

const at = '2026-08-01T16:00:00.000Z';

const project = (id: string, workspaceId: unknown) =>
  PrototypeDocumentSchema.shape.projects.element.parse({
    id,
    workspaceId,
    name: `Project ${id}`,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: at,
    updatedAt: at,
  });

const document = (withProjects = true) =>
  PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: PERSONAS.slice(0, 2).map((persona) => persona.user),
    workspaces: PERSONAS.slice(0, 2).map((persona) => persona.workspace),
    projects: withProjects
      ? [project('project-mine', PERSONAS[0]!.workspace.id), project('project-theirs', PERSONAS[1]!.workspace.id)]
      : [],
    sections: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [],
  });

const buildRoutes = (withProjects = true): RouteTable => {
  const store = new InMemoryDataStore(document(withProjects));
  const clock = new PrototypeClock(new Date('2026-08-24T16:00:00.000Z'));
  const ids = new PrototypeIdGenerator();
  const projects = new JsonProjectRepository(store);
  const tasks = new JsonTaskRepository(store);
  const activities = new JsonActivityRepository(store);
  const activity = new ActivityService({ activities, clock, ids });
  const unitOfWork = unitOfWorkFor(store);

  return createApiRoutes({
    store,
    activity,
    projects: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
  });
};

const call = (routes: RouteTable, method: string, path: string, options: { body?: unknown; user?: string } = {}) => {
  const [pathname, search] = path.split('?');
  return resolveRoute(routes, method, pathname ?? path, {
    query: new URLSearchParams(search ?? ''),
    headers: options.user === undefined ? {} : { 'x-prototype-user': options.user },
    body: options.body,
  });
};

const MINE = 'project-mine';
const THEIRS = 'project-theirs';
const ALEX = PERSONAS[1]!.user.id as unknown as string;

const newTask = async (routes: RouteTable, overrides = {}) => {
  const result = await call(routes, 'POST', '/api/tasks', {
    body: { projectId: MINE, title: 'Configure deployment', ...overrides },
  });
  return TaskSchema.parse(result.body);
};

describe('project routes', () => {
  it('creates a project with 201 and a contract-valid body', async () => {
    const routes = buildRoutes();

    const result = await call(routes, 'POST', '/api/projects', {
      body: { workspaceId: PERSONAS[0]!.workspace.id, name: 'Work Manager' },
    });

    expect(result.status).toBe(201);
    expect(() => ProjectSchema.parse(result.body)).not.toThrow();
  });

  it('rejects a schema-invalid body with 400 and issues', async () => {
    const routes = buildRoutes();

    const result = await call(routes, 'POST', '/api/projects', { body: { name: '' } });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_request' });
    expect((result.body as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  });

  it('applies query filters from the query string', async () => {
    const routes = buildRoutes();
    await call(routes, 'POST', '/api/projects', {
      body: { workspaceId: PERSONAS[0]!.workspace.id, name: 'Planned', status: 'planning' },
    });

    const active = await call(routes, 'GET', '/api/projects?status=active');
    const both = await call(routes, 'GET', '/api/projects?status=active,planning');

    expect(active.body).toHaveLength(1);
    expect(both.body).toHaveLength(2);
  });

  it('returns 404 for an unknown id and for another workspace’s id', async () => {
    const routes = buildRoutes();

    expect((await call(routes, 'GET', '/api/projects/project-nope')).status).toBe(404);
    expect((await call(routes, 'GET', `/api/projects/${THEIRS}`)).status).toBe(404);
    expect((await call(routes, 'GET', `/api/projects/${THEIRS}`, { user: ALEX })).status).toBe(200);
  });

  it('updates through PATCH', async () => {
    const routes = buildRoutes();

    const result = await call(routes, 'PATCH', `/api/projects/${MINE}`, { body: { name: 'Renamed' } });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ name: 'Renamed' });
  });
});

describe('task routes', () => {
  it('creates, reads, updates, completes and archives a task', async () => {
    const routes = buildRoutes();
    const task = await newTask(routes);

    expect((await call(routes, 'GET', `/api/tasks/${task.id}`)).body).toMatchObject({ id: task.id });

    const patched = await call(routes, 'PATCH', `/api/tasks/${task.id}`, { body: { priority: 'high' } });
    expect(patched.body).toMatchObject({ priority: 'high' });

    const completed = await call(routes, 'POST', `/api/tasks/${task.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ status: 'done' });
    expect((completed.body as { completedAt?: string }).completedAt).toBeDefined();

    const archived = await call(routes, 'POST', `/api/tasks/${task.id}/archive`);
    expect((archived.body as { archivedAt?: string }).archivedAt).toBeDefined();
  });

  it('returns 404 on every :id route for an unknown id', async () => {
    const routes = buildRoutes();

    expect((await call(routes, 'GET', '/api/tasks/task-nope')).status).toBe(404);
    expect((await call(routes, 'PATCH', '/api/tasks/task-nope', { body: { title: 'x' } })).status).toBe(404);
    expect((await call(routes, 'POST', '/api/tasks/task-nope/complete')).status).toBe(404);
    expect((await call(routes, 'POST', '/api/tasks/task-nope/archive')).status).toBe(404);
  });

  it('answers 409 rule_violation when completing an archived task', async () => {
    const routes = buildRoutes();
    const task = await newTask(routes);
    await call(routes, 'POST', `/api/tasks/${task.id}/archive`);

    const result = await call(routes, 'POST', `/api/tasks/${task.id}/complete`);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: 'rule_violation' });
  });

  it('parses repeated and comma-separated status filters, and the includeArchived flag', async () => {
    const routes = buildRoutes();
    const done = await newTask(routes, { title: 'Done one' });
    await call(routes, 'POST', `/api/tasks/${done.id}/complete`);
    const filed = await newTask(routes, { title: 'Filed' });
    await call(routes, 'POST', `/api/tasks/${filed.id}/archive`);
    await newTask(routes, { title: 'Open' });

    expect(await call(routes, 'GET', '/api/tasks?status=todo&status=done')).toMatchObject({ status: 200 });
    expect((await call(routes, 'GET', '/api/tasks?status=todo,done')).body).toHaveLength(2);
    expect((await call(routes, 'GET', '/api/tasks?includeArchived=true')).body).toHaveLength(3);
  });

  it('rejects a malformed query string with 400', async () => {
    const routes = buildRoutes();

    const result = await call(routes, 'GET', '/api/tasks?status=nonsense');

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_request' });
  });

  it('answers 409 when asked to move a task between projects', async () => {
    const routes = buildRoutes();
    const destination = await call(routes, 'POST', '/api/projects', {
      body: { workspaceId: PERSONAS[0]!.workspace.id, name: 'Destination' },
    });
    const task = await newTask(routes);

    const result = await call(routes, 'PATCH', `/api/tasks/${task.id}`, {
      body: { projectId: (destination.body as { id: string }).id },
    });

    expect(result.status).toBe(409);
  });
});

describe('activity route', () => {
  it('returns the events newest-first, scoped to the caller', async () => {
    const routes = buildRoutes();
    const task = await newTask(routes);
    await call(routes, 'POST', `/api/tasks/${task.id}/complete`);

    const result = await call(routes, 'GET', '/api/activity');
    const actions = (result.body as Array<{ action: string; actor: string }>).map((event) => event.action);

    expect(actions[0]).toBe('task.completed');
    expect(actions).toContain('task.created');
    expect((result.body as Array<{ actor: string }>).every((event) => event.actor === 'user')).toBe(true);
    expect((await call(routes, 'GET', '/api/activity?limit=1')).body).toHaveLength(1);
    expect((await call(routes, 'GET', '/api/activity', { user: ALEX })).body).toEqual([]);
  });

  it('rejects a limit past the cap with 400', async () => {
    expect((await call(buildRoutes(), 'GET', '/api/activity?limit=5000')).status).toBe(400);
  });
});

describe('empty workspace', () => {
  it('answers [] rather than failing — the first thing Slice 6’s UI will see', async () => {
    const routes = buildRoutes(false);

    expect((await call(routes, 'GET', '/api/projects')).body).toEqual([]);
    expect((await call(routes, 'GET', '/api/tasks')).body).toEqual([]);
    expect((await call(routes, 'GET', '/api/activity')).body).toEqual([]);
  });
});
