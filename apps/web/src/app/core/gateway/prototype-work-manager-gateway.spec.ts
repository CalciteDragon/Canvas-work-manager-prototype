import { TestBed } from '@angular/core/testing';
import type { CreateTaskInput, Identity, ProjectId, TaskId } from '@cwm/contracts';
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

const task = {
  id: 'task-1',
  projectId: 'project-1',
  title: 'Water the plants',
  status: 'todo',
  priority: 'medium',
  createdAt: at,
  updatedAt: at,
};

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
