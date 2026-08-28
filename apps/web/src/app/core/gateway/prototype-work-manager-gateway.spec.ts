import { TestBed } from '@angular/core/testing';
import type { CreateTaskInput, Identity, ProjectId, ReflectionId, SectionId, TaskId } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../identity/identity-provider';
import { GatewayError } from './gateway-error';
import { PrototypeWorkManagerGateway } from './prototype-work-manager-gateway';

const at = '2026-08-01T16:00:00.000Z';

const identity = {
  user: {
    id: 'user-demo',
    name: 'Demo User',
    workspaceId: 'workspace-demo',
    preferences: { theme: 'dark', dashboardWidgets: [] },
    createdAt: at,
  },
  workspace: { id: 'workspace-demo', name: 'Demo', ownerUserId: 'user-demo', createdAt: at },
} as unknown as Identity;

const project = {
  id: 'project-1',
  workspaceId: 'workspace-demo',
  name: 'Personal workspace',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: at,
  updatedAt: at,
};

const projectSection = {
  id: 'section-1',
  projectId: 'project-1',
  type: 'rich-text',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: { text: 'Kickoff' },
  createdAt: at,
  updatedAt: at,
};

const task = {
  id: 'task-1',
  projectId: 'project-1',
  title: 'Water the plants',
  status: 'todo',
  priority: 'medium',
  createdAt: at,
  updatedAt: at,
};

const progress = { projectId: 'project-1', formula: 'count', percentage: 50, completed: 1, total: 2, explanation: '1 of 2 tasks complete' };
const timeline = { projectId: 'project-1', items: [{ id: 'project-1', kind: 'project', title: 'Personal workspace', startDate: '2026-09-30', endDate: '2026-09-30' }] };
const reflection = { id: 'reflection-1', projectId: 'project-1', body: 'A useful note', createdAt: at, updatedAt: at };

// A Response body can only be read once, so every mocked call gets a fresh one.
const jsonResponse = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

const gateway = (): PrototypeWorkManagerGateway => {
  const provider: IdentityProvider = { getCurrentIdentity: () => Promise.resolve(identity) };
  TestBed.configureTestingModule({
    providers: [
      PrototypeWorkManagerGateway,
      { provide: PROTOTYPE_API_BASE_URL, useValue: 'http://host.test' },
      { provide: IDENTITY_PROVIDER, useValue: provider },
    ],
  });
  return TestBed.inject(PrototypeWorkManagerGateway);
};

const lastCall = () => ({
  url: fetchMock.mock.calls.at(-1)?.[0] as string,
  init: fetchMock.mock.calls.at(-1)?.[1] as RequestInit,
});

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('PrototypeWorkManagerGateway — projects', () => {
  it('creates a direct child project through the project gateway', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...project, id: 'project-child', parentProjectId: 'project-1' }, 201));
    await gateway().projects.create({ workspaceId: 'workspace-demo' as never, parentProjectId: 'project-1' as ProjectId, name: 'Child' });
    expect(lastCall().url).toBe('http://host.test/api/projects');
    expect(lastCall().init.method).toBe('POST');
  });
  it('owns the URL, so no component ever does', async () => {
    fetchMock.mockImplementation(jsonResponse([project]));

    const projects = await gateway().projects.list({});

    expect(lastCall().url).toBe('http://host.test/api/projects');
    expect(projects[0]?.name).toBe('Personal workspace');
  });

  it('serializes an array filter as repeated params, the shape the host parses', async () => {
    fetchMock.mockImplementation(jsonResponse([]));

    await gateway().projects.list({ status: ['active', 'planning'] });

    expect(lastCall().url).toBe('http://host.test/api/projects?status=active&status=planning');
  });

  it('sends the persona from the resolved identity', async () => {
    fetchMock.mockImplementation(jsonResponse([]));

    await gateway().projects.list({});

    expect((lastCall().init.headers as Record<string, string>)['x-prototype-user']).toBe('user-demo');
  });

  it('gets one project by id', async () => {
    fetchMock.mockImplementation(jsonResponse(project));

    await gateway().projects.get('project-1' as ProjectId);

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1');
  });

  it('updates a project layout through PATCH and validates the answer (§28)', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...project, projectLayoutMode: 'grid' }));

    const updated = await gateway().projects.update('project-1' as ProjectId, { projectLayoutMode: 'grid' });

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1');
    expect(lastCall().init.method).toBe('PATCH');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ projectLayoutMode: 'grid' });
    expect(updated.projectLayoutMode).toBe('grid');
  });

  it('rejects an updated project body outside the shared contract', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...project, projectLayoutMode: 'canvas' }));

    await expect(
      gateway().projects.update('project-1' as ProjectId, { projectLayoutMode: 'grid' }),
    ).rejects.toBeInstanceOf(GatewayError);
  });
});

describe('PrototypeWorkManagerGateway — Slice 10 reads and reflections', () => {
  it('validates progress and timeline read models', async () => {
    fetchMock.mockImplementationOnce(jsonResponse(progress)).mockImplementationOnce(jsonResponse(timeline));
    const subject = gateway();
    expect((await subject.progress.get('project-1' as ProjectId)).percentage).toBe(50);
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/progress');
    expect((await subject.timeline.get('project-1' as ProjectId)).items[0]?.kind).toBe('project');
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/timeline');
  });

  it('lists, creates, and updates reflections with encoded paths and bodies', async () => {
    fetchMock.mockImplementationOnce(jsonResponse([reflection])).mockImplementationOnce(jsonResponse(reflection, 201)).mockImplementationOnce(jsonResponse({ ...reflection, title: 'Edited' }));
    const subject = gateway();
    await subject.reflections.list('project-1' as ProjectId);
    expect(lastCall().url).toBe('http://host.test/api/reflections?projectId=project-1');
    await subject.reflections.create({ projectId: 'project-1' as ProjectId, body: 'A useful note' });
    expect(lastCall().init.method).toBe('POST');
    await subject.reflections.update('reflection-1' as ReflectionId, { title: 'Edited' });
    expect(lastCall().url).toBe('http://host.test/api/reflections/reflection-1');
    expect(lastCall().init.method).toBe('PATCH');
  });

  it('rejects malformed derived and reflection bodies', async () => {
    const subject = gateway();
    fetchMock.mockImplementation(jsonResponse({ projectId: 'project-1' }));
    await expect(subject.progress.get('project-1' as ProjectId)).rejects.toMatchObject({ code: 'invalid_response' });
    fetchMock.mockImplementation(jsonResponse([{ id: 'reflection-1' }]));
    await expect(subject.reflections.list('project-1' as ProjectId)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('PrototypeWorkManagerGateway — sections (§31)', () => {
  it('lists a project’s sections under the project', async () => {
    fetchMock.mockImplementation(jsonResponse([projectSection]));

    const sections = await gateway().sections.list('project-1' as ProjectId);

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections');
    expect(sections[0]?.type).toBe('rich-text');
  });

  it('creates with a JSON body and accepts 201', async () => {
    fetchMock.mockImplementation(jsonResponse(projectSection, 201));

    await gateway().sections.create('project-1' as ProjectId, { type: 'rich-text', config: { text: '' } });

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections');
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ type: 'rich-text', config: { text: '' } });
  });

  it('updates through PATCH, addressing the section directly', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...projectSection, collapsed: true }));

    const updated = await gateway().sections.update('section-1' as SectionId, { collapsed: true });

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1');
    expect(lastCall().init.method).toBe('PATCH');
    expect(updated.collapsed).toBe(true);
  });

  it('moves through the dedicated route and validates the authoritative section (§32)', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...projectSection, position: 2 }));

    const moved = await gateway().sections.move('section-1' as SectionId, { position: 2 });

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1/move');
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ position: 2 });
    expect(moved.position).toBe(2);
  });

  it('rejects a moved section body outside the shared contract', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...projectSection, position: -1 }));

    await expect(gateway().sections.move('section-1' as SectionId, { position: 1 })).rejects.toBeInstanceOf(
      GatewayError,
    );
  });

  it('duplicates with no body and accepts 201', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...projectSection, id: 'section-2', position: 1 }, 201));

    const copy = await gateway().sections.duplicate('section-1' as SectionId);

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1/duplicate');
    expect(lastCall().init.body).toBeUndefined();
    expect(copy.id).toBe('section-2');
  });

  it('removes through DELETE and tolerates the host’s empty 204', async () => {
    // Reading `.json()` off a 204 throws; the remove path must not go looking for a body.
    fetchMock.mockImplementation(() => new Response(null, { status: 204 }));

    await expect(gateway().sections.remove('section-1' as SectionId)).resolves.toBeUndefined();

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1');
    expect(lastCall().init.method).toBe('DELETE');
  });

  it('rejects a section body that is not its contract (§11)', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...projectSection, columnSpan: 7 }));

    await expect(gateway().sections.update('section-1' as SectionId, { columnSpan: 6 })).rejects.toBeInstanceOf(
      GatewayError,
    );
  });
});

describe('PrototypeWorkManagerGateway — tasks (§9, verbatim)', () => {
  it('serializes a TaskQuery in the shapes the host parses', async () => {
    fetchMock.mockImplementation(jsonResponse([]));

    await gateway().tasks.list({ status: ['todo', 'blocked'], priority: ['high'], includeArchived: true });

    expect(lastCall().url).toBe(
      'http://host.test/api/tasks?status=todo&status=blocked&priority=high&includeArchived=true',
    );
  });

  it('gets one task by id', async () => {
    fetchMock.mockImplementation(jsonResponse(task));

    await gateway().tasks.get('task-1' as TaskId);

    expect(lastCall().url).toBe('http://host.test/api/tasks/task-1');
  });

  // The host answers 201 here, not 200 — a `status !== 200` check would break on create.
  it('creates with a JSON body and accepts 201', async () => {
    fetchMock.mockImplementation(jsonResponse(task, 201));
    const input = { projectId: 'project-1', title: 'Water the plants' } as CreateTaskInput;

    const created = await gateway().tasks.create(input);

    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBe(JSON.stringify(input));
    expect((lastCall().init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(created.id).toBe('task-1');
  });

  it('updates through PATCH', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...task, title: 'Water the ferns' }));

    await gateway().tasks.update('task-1' as TaskId, { title: 'Water the ferns' });

    expect(lastCall().url).toBe('http://host.test/api/tasks/task-1');
    expect(lastCall().init.method).toBe('PATCH');
  });

  it('completes with no body — the host route carries none', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...task, status: 'done', completedAt: at }));

    const completed = await gateway().tasks.complete('task-1' as TaskId);

    expect(lastCall().url).toBe('http://host.test/api/tasks/task-1/complete');
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBeUndefined();
    expect(completed.status).toBe('done');
  });

  // §9 pins `Promise<void>`, but the host returns the task. Validate, then discard —
  // the adapter never passes an unchecked body on, even one it throws away.
  it('archives and resolves void', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...task, archivedAt: at }));

    await expect(gateway().tasks.archive('task-1' as TaskId)).resolves.toBeUndefined();
  });
});

describe('PrototypeWorkManagerGateway — failures the UI has to see', () => {
  it('maps 404 to a not_found GatewayError', async () => {
    fetchMock.mockImplementation(jsonResponse({ error: 'not_found', message: 'no such project' }, 404));

    await expect(gateway().projects.get('project-x' as ProjectId)).rejects.toMatchObject({
      name: 'GatewayError',
      code: 'not_found',
      status: 404,
    });
  });

  // The failure Slice 7's optimistic completion (§63) has to revert on.
  it('maps 409 to a rule_violation GatewayError', async () => {
    fetchMock.mockImplementation(jsonResponse({ error: 'rule_violation', message: 'task is archived' }, 409));

    await expect(gateway().tasks.complete('task-1' as TaskId)).rejects.toMatchObject({
      code: 'rule_violation',
      status: 409,
    });
  });

  it('does not let a non-JSON error body escape as a SyntaxError', async () => {
    fetchMock.mockImplementation(() => new Response('<html>gateway timeout</html>', { status: 504 }));

    const error = await gateway().projects.list({}).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(GatewayError);
  });

  it('rejects a 200 body that does not match its contract (§11)', async () => {
    fetchMock.mockImplementation(jsonResponse([{ id: 'project-1', name: 'Half a project' }]));

    await expect(gateway().projects.list({})).rejects.toMatchObject({ code: 'invalid_response', status: 0 });
  });

  it('reports an unreachable host rather than leaking the fetch rejection (§63)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(gateway().projects.list({})).rejects.toMatchObject({ code: 'unreachable', status: 0 });
  });
});

// Found in review: an empty array filter serialized to nothing, so the host saw no filter
// at all and answered with *everything* — the exact inverse of what the caller asked for,
// and of what the same query does in-process.
describe('PrototypeWorkManagerGateway — a filter that matches nothing', () => {
  it('answers [] for an empty status array without asking the host', async () => {
    fetchMock.mockImplementation(jsonResponse([project]));

    await expect(gateway().projects.list({ status: [] })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does the same for an empty task filter', async () => {
    fetchMock.mockImplementation(jsonResponse([task]));

    await expect(gateway().tasks.list({ priority: [] })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still sends a query that has a non-empty filter beside an absent one', async () => {
    fetchMock.mockImplementation(jsonResponse([]));

    await gateway().projects.list({ status: ['active'] });

    expect(lastCall().url).toBe('http://host.test/api/projects?status=active');
  });
});

// Found in review: replacing TaskSchema with z.unknown() left every archive test green,
// so the "validate, then discard" comment was a claim nothing backed.
describe('PrototypeWorkManagerGateway — archive still validates what it discards', () => {
  it('rejects an archive response that is not a Task', async () => {
    fetchMock.mockImplementation(jsonResponse({ id: 'task-1' }));

    await expect(gateway().tasks.archive('task-1' as TaskId)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});

describe('PrototypeWorkManagerGateway — dashboard (§24)', () => {
  const dashboard = {
    generatedAt: at,
    today: { date: '2026-08-24', overdue: [], dueToday: [], inProgress: [] },
    upcoming: { days: 7, throughDate: '2026-08-31', tasks: [] },
    activeProjects: [],
    recentProgress: { days: 7, sinceDate: '2026-08-17', tasks: [] },
    dailyDigest: { title: 'Daily digest', lines: ['Nothing is scheduled for today.'], source: 'prototype', generatedAt: at },
    funFact: 'Context switching costs more time than the switch itself takes.',
  };

  it('asks for the dashboard with no parameters when nothing configures a range', async () => {
    fetchMock.mockImplementation(jsonResponse(dashboard));

    expect((await gateway().dashboard.get({})).funFact).toContain('Context switching');
    expect(lastCall().url).toBe('http://host.test/api/dashboard');
  });

  it('sends only the ranges a widget actually configures', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...dashboard, upcoming: { ...dashboard.upcoming, days: 14 } }));
    const subject = gateway();

    await subject.dashboard.get({ upcomingDays: 14 });
    expect(lastCall().url).toBe('http://host.test/api/dashboard?upcomingDays=14');
    await subject.dashboard.get({ upcomingDays: 14, recentDays: 30 });
    expect(lastCall().url).toBe('http://host.test/api/dashboard?upcomingDays=14&recentDays=30');
  });

  it('refuses a body that is not the contract', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...dashboard, dailyDigest: { ...dashboard.dailyDigest, lines: [] } }));

    await expect(gateway().dashboard.get({})).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
