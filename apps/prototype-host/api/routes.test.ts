import { DashboardResultSchema, IdentitySchema, ProgressResultSchema, ProjectSectionSchema, PrototypeDocumentSchema, ReflectionSchema, SCHEMA_VERSION, ProjectSchema, TaskSchema, TimelineResultSchema } from '@cwm/contracts';
import { ActivityService, DashboardService, ProgressService, PrototypeAIProvider, PrototypeClock, PrototypeIdGenerator, ProjectService, ReflectionService, SectionService, TaskService, TimelineService } from '@cwm/domain';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonMilestoneRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
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
  const sections = new JsonSectionRepository(store);
  const tasks = new JsonTaskRepository(store);
  const activities = new JsonActivityRepository(store);
  const milestones = new JsonMilestoneRepository(store);
  const reflections = new JsonReflectionRepository(store);
  const activity = new ActivityService({ activities, clock, ids });
  const unitOfWork = unitOfWorkFor(store);

  return createApiRoutes({
    store,
    activity,
    projects: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
    sections: new SectionService({ sections, projects, activity, clock, ids, unitOfWork }),
    progress: new ProgressService({ projects, tasks }),
    timeline: new TimelineService({ projects, tasks, milestones }),
    reflections: new ReflectionService({ reflections, projects, activity, clock, ids, unitOfWork }),
    dashboard: new DashboardService({ projects, tasks, clock, ai: new PrototypeAIProvider() }),
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

describe('Slice 10 derived and reflection routes', () => {
  it('serves canonical progress and a derived timeline with actor scoping', async () => {
    const routes = buildRoutes();
    await newTask(routes, { status: 'done', estimate: 3, startAt: '2026-08-20T09:00:00.000Z', dueAt: '2026-08-22T17:00:00.000Z' });
    await call(routes, 'PATCH', `/api/projects/${MINE}`, { body: { targetDate: '2026-08-30', progressFormula: 'weighted' } });

    expect(ProgressResultSchema.parse((await call(routes, 'GET', `/api/projects/${MINE}/progress`)).body)).toMatchObject({ formula: 'weighted', percentage: 100 });
    expect(TimelineResultSchema.parse((await call(routes, 'GET', `/api/projects/${MINE}/timeline`)).body).items.map(({ kind }) => kind)).toEqual(expect.arrayContaining(['project', 'task']));
    expect((await call(routes, 'GET', `/api/projects/${THEIRS}/progress`)).status).toBe(404);
  });

  it('lists, creates, and edits reflections with schema validation', async () => {
    const routes = buildRoutes();
    const created = await call(routes, 'POST', '/api/reflections', { body: { projectId: MINE, body: 'First', prompt: 'What changed?' } });
    expect(created.status).toBe(201);
    const reflection = ReflectionSchema.parse(created.body);
    expect(ReflectionSchema.array().parse((await call(routes, 'GET', `/api/reflections?projectId=${MINE}`)).body)).toHaveLength(1);
    expect(ReflectionSchema.parse((await call(routes, 'PATCH', `/api/reflections/${reflection.id}`, { body: { title: 'Checkpoint' } })).body).title).toBe('Checkpoint');
    expect((await call(routes, 'POST', '/api/reflections', { body: { projectId: MINE, body: '' } })).status).toBe(400);
    expect((await call(routes, 'GET', `/api/reflections?projectId=${THEIRS}`)).status).toBe(404);
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

  it('keeps a comma inside a search term instead of truncating it', async () => {
    const routes = buildRoutes();
    await newTask(routes, { title: 'Design, copy, and QA' });
    await newTask(routes, { title: 'Design only' });

    // Splitting every value on commas would search for "Design" and match both.
    expect((await call(routes, 'GET', '/api/tasks?search=Design,%20copy')).body).toHaveLength(1);
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

describe('persona resolution', () => {
  it('answers 404 for an unknown persona rather than 500', async () => {
    const routes = buildRoutes();

    // A mistyped header is a caller mistake; a 500 here is how a typo costs an hour.
    const result = await call(routes, 'GET', '/api/projects', { user: 'user-nobody' });

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: 'not_found' });
  });

  it('defaults to the first persona in the document', async () => {
    const routes = buildRoutes();

    expect((await call(routes, 'GET', '/api/projects')).body).toEqual([expect.objectContaining({ id: MINE })]);
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

describe('identity route', () => {
  it('serves the default persona and their workspace (§18)', async () => {
    const result = await call(buildRoutes(), 'GET', '/api/me');

    expect(result.status).toBe(200);
    expect(IdentitySchema.parse(result.body).user.id).toBe(PERSONAS[0]!.user.id);
    expect(IdentitySchema.parse(result.body).workspace.id).toBe(PERSONAS[0]!.workspace.id);
  });

  it('takes the workspace from the resolved user, never from the request', async () => {
    const result = await call(buildRoutes(), 'GET', '/api/me', { user: String(PERSONAS[1]!.user.id) });

    expect(IdentitySchema.parse(result.body).workspace.id).toBe(PERSONAS[1]!.workspace.id);
  });

  it('answers 404 for a persona that no longer exists', async () => {
    const result = await call(buildRoutes(), 'GET', '/api/me', { user: 'user-nobody' });

    expect(result.status).toBe(404);
  });
});

describe('section routes', () => {
  const newSection = async (routes: RouteTable, body: unknown = { type: 'rich-text' }, projectId = MINE) =>
    ProjectSectionSchema.parse((await call(routes, 'POST', `/api/projects/${projectId}/sections`, { body })).body);

  it('lists, creates, updates, moves, duplicates and removes a section', async () => {
    const routes = buildRoutes();

    const empty = await call(routes, 'GET', `/api/projects/${MINE}/sections`);
    expect(empty).toMatchObject({ status: 200, body: [] });

    const created = await call(routes, 'POST', `/api/projects/${MINE}/sections`, {
      body: { type: 'rich-text', config: { text: 'Kickoff' } },
    });
    expect(created.status).toBe(201);
    const section = ProjectSectionSchema.parse(created.body);
    expect(section).toMatchObject({ projectId: MINE, type: 'rich-text', position: 0, config: { text: 'Kickoff' } });

    const collapsed = await call(routes, 'PATCH', `/api/sections/${section.id}`, { body: { collapsed: true } });
    expect(ProjectSectionSchema.parse(collapsed.body).collapsed).toBe(true);

    const sibling = await newSection(routes, { type: 'task-list' });
    const moved = await call(routes, 'POST', `/api/sections/${section.id}/move`, { body: { position: 1 } });
    expect(ProjectSectionSchema.parse(moved.body).position).toBe(1);

    const duplicated = await call(routes, 'POST', `/api/sections/${section.id}/duplicate`, {});
    expect(duplicated.status).toBe(201);
    expect(ProjectSectionSchema.parse(duplicated.body)).toMatchObject({ type: 'rich-text', position: 2 });

    const removed = await call(routes, 'DELETE', `/api/sections/${sibling.id}`);
    expect(removed.status).toBe(204);
    const remaining = await call(routes, 'GET', `/api/projects/${MINE}/sections`);
    expect(ProjectSectionSchema.array().parse(remaining.body).map((item) => item.position)).toEqual([0, 1]);
  });

  it('answers the project’s sections in position order', async () => {
    const routes = buildRoutes();
    const first = await newSection(routes, { type: 'rich-text' });
    await newSection(routes, { type: 'task-list' });
    await call(routes, 'POST', `/api/sections/${first.id}/move`, { body: { position: 1 } });

    const result = await call(routes, 'GET', `/api/projects/${MINE}/sections`);

    expect(ProjectSectionSchema.array().parse(result.body).map((item) => item.type)).toEqual([
      'task-list',
      'rich-text',
    ]);
  });

  it('answers 404 for the sections of a project in another workspace', async () => {
    const routes = buildRoutes();

    expect((await call(routes, 'GET', `/api/projects/${THEIRS}/sections`)).status).toBe(404);
    expect(
      (await call(routes, 'POST', `/api/projects/${THEIRS}/sections`, { body: { type: 'rich-text' } })).status,
    ).toBe(404);
  });

  it.each([
    ['PATCH', (id: string) => `/api/sections/${id}`, { collapsed: true }],
    ['DELETE', (id: string) => `/api/sections/${id}`, undefined],
    ['POST', (id: string) => `/api/sections/${id}/move`, { position: 0 }],
    ['POST', (id: string) => `/api/sections/${id}/duplicate`, undefined],
  ])('answers 404 when %s names a section the caller cannot see', async (method, path, body) => {
    const routes = buildRoutes();
    const section = await newSection(routes);

    // Not-found rather than forbidden: a 409 would confirm the section exists.
    expect((await call(routes, method, path(section.id), { body, user: ALEX })).status).toBe(404);
    expect((await call(routes, method, path('section-nope'), { body })).status).toBe(404);
  });

  it('answers 404 for a section that was already removed', async () => {
    const routes = buildRoutes();
    const section = await newSection(routes);
    await call(routes, 'DELETE', `/api/sections/${section.id}`);

    expect((await call(routes, 'DELETE', `/api/sections/${section.id}`)).status).toBe(404);
  });

  it('answers 400 for a column span outside the §27 presets and for a config that is not an object', async () => {
    const routes = buildRoutes();
    const section = await newSection(routes);

    expect(
      (await call(routes, 'POST', `/api/projects/${MINE}/sections`, { body: { type: 'rich-text', columnSpan: 7 } }))
        .status,
    ).toBe(400);
    expect((await call(routes, 'PATCH', `/api/sections/${section.id}`, { body: { config: null } })).status).toBe(400);
    expect((await call(routes, 'POST', `/api/sections/${section.id}/move`, { body: { position: -1 } })).status).toBe(
      400,
    );
  });
});

describe('dashboard route', () => {
  it('answers the derived §24 dashboard for the calling persona', async () => {
    const routes = buildRoutes();
    await newTask(routes, { title: 'Late', dueAt: '2026-08-21T17:00:00.000Z' });

    const result = await call(routes, 'GET', '/api/dashboard');
    const dashboard = DashboardResultSchema.parse(result.body);

    expect(result.status).toBe(200);
    expect(dashboard.today.overdue.map(({ title }) => title)).toEqual(['Late']);
    expect(dashboard.dailyDigest.source).toBe('prototype');
    expect(DashboardResultSchema.parse((await call(routes, 'GET', '/api/dashboard', { user: ALEX })).body).today.overdue).toEqual([]);
  });

  it('passes the configurable ranges through as numbers, not strings', async () => {
    const routes = buildRoutes();
    await newTask(routes, { title: 'Fortnight out', dueAt: '2026-09-04T17:00:00.000Z' });

    expect(DashboardResultSchema.parse((await call(routes, 'GET', '/api/dashboard')).body).upcoming.tasks).toEqual([]);
    const wide = DashboardResultSchema.parse((await call(routes, 'GET', '/api/dashboard?upcomingDays=14')).body);
    expect(wide.upcoming).toMatchObject({ days: 14, throughDate: '2026-09-07' });
    expect(wide.upcoming.tasks.map(({ title }) => title)).toEqual(['Fortnight out']);
  });

  it('rejects a range outside the contract with 400', async () => {
    expect((await call(buildRoutes(), 'GET', '/api/dashboard?upcomingDays=500')).status).toBe(400);
    expect((await call(buildRoutes(), 'GET', '/api/dashboard?recentDays=nope')).status).toBe(400);
  });
});
