import { DashboardResultSchema, IdentitySchema, ProgressResultSchema, ProjectSectionSchema, PrototypeDocumentSchema, ReflectionSchema, SCHEMA_VERSION, ProjectSchema, TaskSchema, TimelineResultSchema } from '@cwm/contracts';
import { ActivityService, AgentConnectionService, DashboardService, ProgressService, PrototypeAIProvider, PrototypeClock, PrototypeIdGenerator, ProjectPageService, ProjectService, ReflectionService, SectionService, TaskService, TimelineService } from '@cwm/domain';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonProjectPageRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
  JsonTaskRepository,
  JsonUserRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { PERSONAS, buildSeed } from '@cwm/prototype-data';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRoute, type RouteTable } from '../router.ts';
import { createApiRoutes } from './routes.ts';
import { PrototypeAgentAuthenticator } from '../auth/prototype-agent-authenticator.ts';
import { JsonDataStore, type DataStore } from '@cwm/repositories';

const at = '2026-08-01T16:00:00.000Z';

const project = (id: string, workspaceId: unknown) =>
  PrototypeDocumentSchema.shape.projects.element.parse({
    id,
    workspaceId,
    kind: 'root',
    name: `Project ${id}`,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: at,
    updatedAt: at,
  });

const homePage = (projectId: string) =>
  PrototypeDocumentSchema.shape.projectPages.element.parse({
    id: `page-${projectId}`,
    projectId,
    kind: 'home',
    enabled: true,
    createdAt: at,
    updatedAt: at,
  });

const document = (withProjects = true) => {
  const projects = withProjects
    ? [project('project-mine', PERSONAS[0]!.workspace.id), project('project-theirs', PERSONAS[1]!.workspace.id)]
    : [];
  return PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: PERSONAS.slice(0, 2).map((persona) => persona.user),
    workspaces: PERSONAS.slice(0, 2).map((persona) => persona.workspace),
    projects,
    // Every project has one (§26), so it is derived rather than listed twice.
    projectPages: projects.map((candidate) => homePage(candidate.id)),
    sectionShortcuts: [],
    sections: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [],
  });
};

const buildRoutes = (withProjects = true, seeded?: ReturnType<typeof document>): RouteTable =>
  routesFor(new InMemoryDataStore(seeded ?? document(withProjects)));

/**
 * The wiring, over whatever store it is handed. Split out from `buildRoutes` so the
 * persistence case below can point two successive stores at one file — a restart, without a
 * process to restart.
 */
const routesFor = (store: DataStore): RouteTable => {
  const clock = new PrototypeClock(new Date('2026-08-24T16:00:00.000Z'));
  const ids = new PrototypeIdGenerator();
  const projects = new JsonProjectRepository(store);
  const pages = new JsonProjectPageRepository(store);
  const sections = new JsonSectionRepository(store);
  const tasks = new JsonTaskRepository(store);
  const activities = new JsonActivityRepository(store);
  const milestones = new JsonMilestoneRepository(store);
  const reflections = new JsonReflectionRepository(store);
  const agents = new JsonAgentConnectionRepository(store);
  const users = new JsonUserRepository(store);
  const activity = new ActivityService({ activities, projects, agents, users, tasks, milestones, reflections, clock, ids });
  const unitOfWork = unitOfWorkFor(store);
  const connections = new AgentConnectionService({ agents, activity, clock, unitOfWork });
  const sectionService = new SectionService({ sections, pages, projects, tasks, reflections, activity, clock, ids, unitOfWork });

  return createApiRoutes({
    store,
    activity,
    projects: new ProjectService({ projects, pages, activity, clock, ids, unitOfWork }),
    pages: new ProjectPageService({ pages, projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, sections: sectionService, activity, clock, ids, unitOfWork }),
    sections: sectionService,
    progress: new ProgressService({ projects, tasks }),
    timeline: new TimelineService({ projects, tasks, milestones }),
    reflections: new ReflectionService({ reflections, projects, sections: sectionService, activity, clock, ids, unitOfWork }),
    dashboard: new DashboardService({ projects, tasks, activity, clock, ai: new PrototypeAIProvider() }),
    agents: connections,
    authenticator: new PrototypeAgentAuthenticator({ agents, users, connections }),
  });
};

const call = (
  routes: RouteTable,
  method: string,
  path: string,
  options: { body?: unknown; user?: string; token?: string } = {},
) => {
  const [pathname, search] = path.split('?');
  return resolveRoute(routes, method, pathname ?? path, {
    query: new URLSearchParams(search ?? ''),
    headers: {
      ...(options.user === undefined ? {} : { 'x-prototype-user': options.user }),
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
    },
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
      body: { workspaceId: PERSONAS[0]!.workspace.id, kind: 'root', name: 'Work Manager' },
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
      body: { workspaceId: PERSONAS[0]!.workspace.id, kind: 'root', name: 'Planned', status: 'planning' },
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

  it('creates a task into a named container, moves it with PATCH, and lists by section', async () => {
    const routes = buildRoutes();
    const first = TaskSchema.parse((await call(routes, 'POST', '/api/tasks', { body: { projectId: MINE, title: 'One' } })).body);
    const second = ProjectSectionSchema.parse(
      (await call(routes, 'POST', `/api/projects/${MINE}/sections`, { body: { type: 'task-list' } })).body,
    );

    const named = await call(routes, 'POST', '/api/tasks', {
      body: { projectId: MINE, title: 'Two', sectionId: second.id },
    });
    expect(TaskSchema.parse(named.body).sectionId).toBe(second.id);

    const moved = await call(routes, 'PATCH', `/api/tasks/${first.id}`, { body: { sectionId: second.id } });
    expect(TaskSchema.parse(moved.body).sectionId).toBe(second.id);

    const scoped = await call(routes, 'GET', `/api/tasks?sectionId=${second.id}`);
    expect(TaskSchema.array().parse(scoped.body).map(({ title }) => title).sort()).toEqual(['One', 'Two']);
    expect(TaskSchema.array().parse((await call(routes, 'GET', `/api/tasks?sectionId=${first.sectionId}`)).body)).toEqual([]);
  });

  it('answers 409 when asked to move a task between projects', async () => {
    const routes = buildRoutes();
    const destination = await call(routes, 'POST', '/api/projects', {
      body: { workspaceId: PERSONAS[0]!.workspace.id, kind: 'root', name: 'Destination' },
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

  it('refuses a container that still holds rows, and takes a policy on the query string', async () => {
    const routes = buildRoutes();
    const task = TaskSchema.parse((await call(routes, 'POST', '/api/tasks', { body: { projectId: MINE, title: 'Ship it' } })).body);

    // No policy: 409 naming the count, which is what lets the canvas offer a choice.
    const refused = await call(routes, 'DELETE', `/api/sections/${task.sectionId}`);
    expect(refused).toMatchObject({ status: 409, body: { error: 'rule_violation' } });
    expect(String((refused.body as { message: string }).message)).toContain('holds 1 tasks');

    const cascaded = await call(routes, 'DELETE', `/api/sections/${task.sectionId}?policy=cascade`);
    expect(cascaded.status).toBe(204);
    // Archived, not deleted — the removal is undoable, and the section comes down too, so
    // the row's container still exists to come back to.
    const archived = await call(routes, 'GET', `/api/tasks/${task.id}`);
    expect(TaskSchema.parse(archived.body).archivedAt).toBeDefined();
    expect(TaskSchema.parse(archived.body).archivedWithSectionId).toBe(task.sectionId);
    const canvas = await call(routes, 'GET', `/api/projects/${MINE}/sections`);
    expect(ProjectSectionSchema.array().parse(canvas.body).map((item) => item.id)).not.toContain(task.sectionId);
  });

  it('reassigns rows to another container named on the query string', async () => {
    const routes = buildRoutes();
    const task = TaskSchema.parse((await call(routes, 'POST', '/api/tasks', { body: { projectId: MINE, title: 'Ship it' } })).body);
    const target = await newSection(routes, { type: 'task-list' });

    const removed = await call(
      routes,
      'DELETE',
      `/api/sections/${task.sectionId}?policy=reassign&reassignToSectionId=${target.id}`,
    );

    expect(removed.status).toBe(204);
    expect(TaskSchema.parse((await call(routes, 'GET', `/api/tasks/${task.id}`)).body).sectionId).toBe(target.id);
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

  it('answers 409 for a section that was already removed — the record still exists', async () => {
    const routes = buildRoutes();
    const section = await newSection(routes);

    expect((await call(routes, 'DELETE', `/api/sections/${section.id}`)).status).toBe(204);
    // Removal archives, so the second call is not a 404: the section is there, and removing
    // something already removed is a rule error rather than a second archive.
    const again = await call(routes, 'DELETE', `/api/sections/${section.id}`);
    expect(again).toMatchObject({ status: 409, body: { error: 'rule_violation' } });
  });

  it('restores an archived section and the rows it took down, and retries idempotently', async () => {
    const routes = buildRoutes();
    const task = TaskSchema.parse((await call(routes, 'POST', '/api/tasks', { body: { projectId: MINE, title: 'Ship it' } })).body);
    await call(routes, 'DELETE', `/api/sections/${task.sectionId}?policy=cascade`);

    const restored = await call(routes, 'POST', `/api/sections/${task.sectionId}/restore`);

    expect(restored.status).toBe(200);
    expect(ProjectSectionSchema.parse(restored.body).archivedAt).toBeUndefined();
    expect(TaskSchema.parse((await call(routes, 'GET', `/api/tasks/${task.id}`)).body).archivedAt).toBeUndefined();
    // A retry must not reorder the canvas or invent history.
    expect((await call(routes, 'POST', `/api/sections/${task.sectionId}/restore`)).status).toBe(200);
    expect((await call(routes, 'POST', '/api/sections/section-nope/restore')).status).toBe(404);
  });

  it('answers archived sections only when the query string asks, parsing the boolean', async () => {
    const routes = buildRoutes();
    const section = await newSection(routes);
    await call(routes, 'DELETE', `/api/sections/${section.id}`);

    const live = await call(routes, 'GET', `/api/projects/${MINE}/sections`);
    expect(ProjectSectionSchema.array().parse(live.body)).toEqual([]);
    // `"false"` is a truthy string, so the boolean has to be parsed rather than passed on.
    const explicitlyFalse = await call(routes, 'GET', `/api/projects/${MINE}/sections?includeArchived=false`);
    expect(ProjectSectionSchema.array().parse(explicitlyFalse.body)).toEqual([]);

    const all = await call(routes, 'GET', `/api/projects/${MINE}/sections?includeArchived=true`);
    expect(ProjectSectionSchema.array().parse(all.body).map((item) => item.id)).toEqual([section.id]);
  });

  it('keeps the path project scope when the query string names another', async () => {
    const routes = buildRoutes();
    await newSection(routes);

    // `SectionQuery.projectId` is ignored: a query parameter must not broaden or redirect
    // the scope the route already fixed.
    const result = await call(routes, 'GET', `/api/projects/${MINE}/sections?projectId=${THEIRS}`);
    expect(result.status).toBe(200);
    expect(ProjectSectionSchema.array().parse(result.body).every((item) => item.projectId === MINE)).toBe(true);
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

/** The one seed that has connections, activity, and a project the agents can write to. */
const buildAgentRoutes = (): RouteTable => buildRoutes(true, PrototypeDocumentSchema.parse(buildSeed('agent-heavy')));

describe('agent connections, permissions and activity (§§51, 52, 53, 57)', () => {
  const READWRITE = 'prototype-user-a-readwrite';
  const READONLY = 'prototype-user-a-readonly';

  it('lists only the acting person’s connections, without their tokens', async () => {
    const routes = buildAgentRoutes();

    const response = await call(routes, 'GET', '/api/agent-connections', { user: 'user-demo' });

    expect(response.status).toBe(200);
    const connections = response.body as Array<Record<string, unknown>>;
    expect(connections.map(({ id }) => id)).toEqual(['agent-claude', 'agent-cursor', 'agent-old']);
    // §51's tokens belong to the rig, not the product-shaped API — they ride on
    // /prototype/state instead.
    expect(connections.every((connection) => !('token' in connection))).toBe(true);
  });

  it('carries out §53’s acceptance path: revoke tasks.write, next write fails naming it', async () => {
    const routes = buildAgentRoutes();
    const created = await call(routes, 'POST', '/api/tasks', {
      token: READWRITE,
      body: { projectId: 'project-work-manager', title: 'Configure deployment' },
    });
    expect(created.status).toBe(201);

    const patched = await call(routes, 'PATCH', '/api/agent-connections/agent-claude', {
      user: 'user-demo',
      body: { permissions: ['projects.read', 'tasks.read', 'workspace.read'] },
    });
    expect(patched.status).toBe(200);

    const denied = await call(routes, 'POST', '/api/tasks', {
      token: READWRITE,
      body: { projectId: 'project-work-manager', title: 'Should not exist' },
    });

    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({
      error: 'permission_denied',
      message: 'connection "agent-claude" is missing permission "tasks.write"',
    });
  });

  it('answers 401 once the connection is revoked, with no restart', async () => {
    const routes = buildAgentRoutes();
    expect((await call(routes, 'GET', '/api/tasks', { token: READWRITE })).status).toBe(200);

    await call(routes, 'POST', '/api/agent-connections/agent-claude/revoke', { user: 'user-demo' });

    const after = await call(routes, 'GET', '/api/tasks', { token: READWRITE });
    expect(after.status).toBe(401);
    expect(after.body).toMatchObject({ error: 'unauthorized' });
  });

  it('answers 401 for a token nothing issued, and 401 for a scheme it does not implement', async () => {
    const routes = buildAgentRoutes();

    expect((await call(routes, 'GET', '/api/tasks', { token: 'made-up' })).status).toBe(401);
    expect(
      (
        await resolveRoute(routes, 'GET', '/api/tasks', {
          query: new URLSearchParams(),
          headers: { authorization: 'Basic abc' },
          body: undefined,
        })
      ).status,
    ).toBe(401);
  });

  /**
   * The escalation both plan reviewers found. A connection able to edit connections could
   * hand itself back the permission it was just denied.
   */
  it('refuses a bearer token that tries to widen or revoke a connection', async () => {
    const routes = buildAgentRoutes();

    const widened = await call(routes, 'PATCH', '/api/agent-connections/agent-cursor', {
      token: READWRITE,
      body: { permissions: ['tasks.write'] },
    });
    const revoked = await call(routes, 'POST', '/api/agent-connections/agent-cursor/revoke', { token: READWRITE });
    const listed = await call(routes, 'GET', '/api/agent-connections', { token: READWRITE });

    expect([widened.status, revoked.status, listed.status]).toEqual([403, 403, 403]);
  });

  it('treats a request carrying both a token and a persona header as the agent', async () => {
    const routes = buildAgentRoutes();

    const denied = await call(routes, 'POST', '/api/tasks', {
      token: READONLY,
      user: 'user-demo',
      body: { projectId: 'project-work-manager', title: 'Not allowed' },
    });

    // The persona header would have sailed through; the token is the stronger claim.
    expect(denied.status).toBe(403);
  });

  it('leaves persona requests entirely unaffected', async () => {
    const routes = buildAgentRoutes();

    const created = await call(routes, 'POST', '/api/tasks', {
      user: 'user-demo',
      body: { projectId: 'project-work-manager', title: 'By a person' },
    });

    expect(created.status).toBe(201);
  });

  it('answers §18’s identity as the connection’s owner for a token-only request', async () => {
    const routes = buildAgentRoutes();

    const me = await call(routes, 'GET', '/api/me', { token: READWRITE });

    expect(me.body).toMatchObject({ user: { id: 'user-demo' } });
  });

  it('answers §57’s feed with the names it renders, not just ids', async () => {
    const routes = buildAgentRoutes();

    const feed = await call(routes, 'GET', '/api/activity?limit=3', { user: 'user-demo' });

    expect(feed.status).toBe(200);
    const entries = feed.body as Array<Record<string, unknown>>;
    expect(entries.every((entry) => typeof entry['actorName'] === 'string')).toBe(true);
    expect(entries.map(({ actor }) => actor)).toContain('user');
  });
});

/**
 * §26-27, end to end over HTTP: a root, a nested unit of work, an optional page turned on, and
 * a task and a reflection that each land on the page they were meant to.
 *
 * The slice's acceptance check, written as a route test rather than a curl script so it runs
 * inside `pnpm test` with no server and no port.
 */
describe('page-aware ownership over HTTP (26, 27, 30)', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const workspaceId = PERSONAS[0]!.workspace.id;

  const journey = async (routes: RouteTable) => {
    const root = ProjectSchema.parse(
      (await call(routes, 'POST', '/api/projects', { body: { workspaceId, kind: 'root', name: 'Renovation' } })).body,
    );
    const unit = ProjectSchema.parse(
      (
        await call(routes, 'POST', '/api/projects', {
          body: { workspaceId, kind: 'subproject', parentProjectId: root.id, name: 'Kitchen' },
        })
      ).body,
    );

    const pagesBefore = await call(routes, 'GET', `/api/projects/${root.id}/pages`);
    const enabled = await call(routes, 'PATCH', `/api/projects/${root.id}/pages/reflections`, {
      body: { enabled: true },
    });
    const reflectionsPage = enabled.body as { id: string; kind: string; enabled: boolean };

    // No page named, so the canonical canvas takes it: the root's Home.
    const task = TaskSchema.parse(
      (await call(routes, 'POST', '/api/tasks', { body: { projectId: root.id, title: 'Choose the tiles' } })).body,
    );
    const unitTask = TaskSchema.parse(
      (await call(routes, 'POST', '/api/tasks', { body: { projectId: unit.id, title: 'Measure the wall' } })).body,
    );
    const reflection = ReflectionSchema.parse(
      (
        await call(routes, 'POST', '/api/reflections', {
          body: { projectId: root.id, pageId: reflectionsPage.id, body: 'The first week went well.' },
        })
      ).body,
    );

    return { root, unit, pagesBefore, reflectionsPage, task, unitTask, reflection };
  };

  /**
   * Which of a project's pages holds a section, read back the way a client would — by asking
   * each page for its own canvas, because a canvas *is* a page (§27) and a section list answers
   * one rather than the whole project.
   */
  const pageOfSection = async (routes: RouteTable, projectId: string, sectionId: string) => {
    for (const page of await pagesOf(routes, projectId)) {
      const listed = await call(routes, 'GET', `/api/projects/${projectId}/sections?pageId=${encodeURIComponent(page.id)}`);
      if ((listed.body as Array<{ id: string }>).some(({ id }) => id === sectionId)) return page.id;
    }
    return undefined;
  };

  const pagesOf = async (routes: RouteTable, projectId: string) =>
    (await call(routes, 'GET', `/api/projects/${projectId}/pages`)).body as Array<{ id: string; kind: string }>;

  it('creates a root, a nested unit of work and page-owned rows, and lists the same ownership', async () => {
    const routes = buildRoutes(false);

    const { root, unit, pagesBefore, reflectionsPage, task, unitTask, reflection } = await journey(routes);

    expect((pagesBefore.body as Array<{ kind: string }>).map(({ kind }) => kind)).toEqual(['home']);
    expect(reflectionsPage).toMatchObject({ kind: 'reflections', enabled: true });

    const homeId = (await pagesOf(routes, root.id)).find(({ kind }) => kind === 'home')!.id;
    expect(await pageOfSection(routes, root.id, task.sectionId)).toBe(homeId);
    expect(await pageOfSection(routes, root.id, reflection.sectionId)).toBe(reflectionsPage.id);

    // The unit of work's own canvas is neither of the root's pages.
    const unitPages = await pagesOf(routes, unit.id);
    expect(unitPages.map(({ kind }) => kind)).toEqual(['work']);
    expect(await pageOfSection(routes, unit.id, unitTask.sectionId)).toBe(unitPages[0]!.id);

    // And a section list narrows to one page rather than answering with the whole project.
    const onReflections = await call(
      routes,
      'GET',
      `/api/projects/${root.id}/sections?pageId=${encodeURIComponent(reflectionsPage.id)}`,
    );
    expect((onReflections.body as Array<{ id: string }>).map(({ id }) => id)).toEqual([reflection.sectionId]);
  });

  it('keeps that ownership across a restart, read back from the file it was written to', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-page-ownership-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeFile(path, `${JSON.stringify(document(false), null, 2)}\n`, 'utf8');

    const written = await journey(routesFor(await JsonDataStore.load(path)));

    // A second store over the same file, which is what a restart amounts to here.
    const after = routesFor(await JsonDataStore.load(path));
    const pages = await pagesOf(after, written.root.id);

    expect(pages.map(({ kind }) => kind)).toEqual(['home', 'reflections']);
    expect(await pageOfSection(after, written.root.id, written.reflection.sectionId)).toBe(
      written.reflectionsPage.id,
    );
    expect(await pageOfSection(after, written.root.id, written.task.sectionId)).toBe(
      pages.find(({ kind }) => kind === 'home')!.id,
    );
  });

  it('refuses the denied half, with the status each refusal earns', async () => {
    // With the fixture projects, so there is a real foreign workspace to fail against.
    const routes = buildRoutes(true);
    const { root, unit, reflectionsPage } = await journey(routes);

    // A task list is not something a Reflections page holds: a rule error, so 409.
    expect(
      (
        await call(routes, 'POST', `/api/projects/${root.id}/sections`, {
          body: { type: 'task-list', pageId: reflectionsPage.id },
        })
      ).status,
    ).toBe(409);

    // A sub-project has no pages to configure, and Home cannot be disabled.
    expect(
      (await call(routes, 'PATCH', `/api/projects/${unit.id}/pages/todos`, { body: { enabled: true } })).status,
    ).toBe(409);
    expect(
      (await call(routes, 'PATCH', `/api/projects/${root.id}/pages/home`, { body: { enabled: false } })).status,
    ).toBe(409);

    // A page from another workspace is **not found**, not a conflict, on the write and on the
    // read alike: a 409 would confirm the id exists.
    expect((await call(routes, 'GET', `/api/projects/${THEIRS}/pages`)).status).toBe(404);
    const foreignPageId = (
      (await call(routes, 'GET', `/api/projects/${THEIRS}/pages`, { user: ALEX })).body as Array<{ id: string }>
    )[0]!.id;
    expect(
      (
        await call(routes, 'POST', `/api/projects/${root.id}/sections`, {
          body: { type: 'reflections', pageId: foreignPageId },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(routes, 'GET', `/api/projects/${root.id}/sections?pageId=${encodeURIComponent(foreignPageId)}`))
        .status,
    ).toBe(404);
  });
});
