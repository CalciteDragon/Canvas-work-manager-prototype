import { TestBed } from '@angular/core/testing';
import {
  ProjectArchiveResultSchema,
  ProjectCompletedWorkResultSchema,
  ProjectJournalResultSchema,
  ResolvedSectionShortcutSchema,
  SectionRemovalResultSchema,
  ShortcutSourceSchema,
  OperationHistorySummarySchema,
  OperationHistoryTransitionResultSchema,
  type CreateTaskInput,
  type Identity,
  type ProjectId,
  type ReflectionId,
  type SectionId,
  type TaskId,
  type OperationActionId,
  type OperationHistoryId,
} from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { PrototypeSettings } from '../config/prototype-settings';
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
  kind: 'root',
  name: 'Personal workspace',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: at,
  updatedAt: at,
};

const projectSection = {
  id: 'section-1',
  projectId: 'project-1',
  pageId: 'page-project-1',
  type: 'rich-text',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: { text: 'Kickoff' },
  createdAt: at,
  updatedAt: at,
};

const removalResult = SectionRemovalResultSchema.parse({
  section: { ...projectSection, archivedAt: at },
  operation: {
    historyId: 'history-1', actionId: 'operation-1', operation: 'section.remove', revision: 1, label: 'Removed Kickoff', createdAt: at,
    expiresAt: '2026-08-02T16:00:00.000Z',
  },
  archiveListed: true,
});
const historySummary = OperationHistorySummarySchema.parse({
  projectId: 'project-1', historyId: 'history-1', revision: 2, undo: null,
  redo: { actionId: 'operation-1', operation: 'section.remove', label: 'Removed Kickoff', expiresAt: '2026-08-02T16:00:00.000Z' },
  blockedBy: null,
});
const transitionResult = OperationHistoryTransitionResultSchema.parse({
  direction: 'undo',
  actionId: 'operation-1',
  result: {
    operation: 'section.remove', outcome: 'restored', section: projectSection,
    placement: { pageId: 'page-project-1', index: 0, strategy: 'index', pageEnabled: true }, restoredRowCount: 0,
  },
  summary: historySummary,
});
const receiptOf = (operation: string, revision: number) => ({
  historyId: 'history-1', actionId: `operation-${revision}`, operation, revision, label: operation, createdAt: at, expiresAt: '2026-08-02T16:00:00.000Z',
});

const task = {
  id: 'task-1',
  projectId: 'project-1',
  sectionId: 'section-1',
  title: 'Water the plants',
  status: 'todo',
  priority: 'medium',
  createdAt: at,
  updatedAt: at,
};

const homePage = {
  id: 'page-project-1',
  projectId: 'project-1',
  kind: 'home',
  enabled: true,
  createdAt: at,
  updatedAt: at,
};

const progress = { projectId: 'project-1', formula: 'count', percentage: 50, completed: 1, total: 2, explanation: '1 of 2 tasks complete' };
const timeline = { projectId: 'project-1', items: [{ id: 'project-1', kind: 'project', title: 'Personal workspace', startDate: '2026-09-30', endDate: '2026-09-30' }] };
const todos = {
  projectId: 'project-1',
  items: [
    {
      kind: 'task',
      task: { ...task, dueAt: '2026-09-01T09:00:00.000Z' },
      origin: {
        projectId: 'project-1',
        pageId: 'page-project-1',
        pageKind: 'home',
        breadcrumb: [{ projectId: 'project-1', name: 'Personal workspace' }],
        sectionId: 'section-1',
        sectionName: 'Task List',
      },
    },
  ],
};
const archive = ProjectArchiveResultSchema.parse({
  projectId: 'project-1',
  root: project,
  items: [
    {
      kind: 'task',
      task: { ...task, archivedAt: at },
      origin: {
        projectId: 'project-1',
        pageId: 'page-project-1',
        pageKind: 'home',
        pageEnabled: true,
        breadcrumb: [{ projectId: 'project-1', name: 'Personal workspace' }],
        sectionId: 'section-1',
        sectionName: 'Task List',
      },
      cause: { kind: 'own' },
      restoration: { kind: 'ready', operation: 'restore_task', permission: 'tasks.write' },
    },
  ],
});
const reflection = { id: 'reflection-1', projectId: 'project-1', sectionId: 'section-1', body: 'A useful note', createdAt: at, updatedAt: at };
const shortcut = ResolvedSectionShortcutSchema.parse({
  id: 'shortcut-1',
  pageId: 'page-project-1',
  sourceSectionId: 'section-source',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  createdAt: at,
  updatedAt: at,
  source: { ...projectSection, id: 'section-source', pageId: 'page-project-2', projectId: 'project-2' },
  sourceProjectId: 'project-2',
  sourceProjectName: 'Kitchen',
  sourcePageKind: 'work',
  breadcrumb: ['Personal workspace', 'Kitchen'],
  availability: 'available',
});
const shortcutSource = ShortcutSourceSchema.parse({
  sourceSectionId: 'section-source',
  type: 'rich-text',
  name: 'Rich Text',
  projectId: 'project-2',
  projectName: 'Kitchen',
  pageId: 'page-project-2',
  pageKind: 'work',
  breadcrumb: ['Personal workspace', 'Kitchen'],
  alreadyPlaced: false,
});

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

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('PrototypeWorkManagerGateway — projects', () => {
  it('creates a direct child project through the project gateway', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...project, id: 'project-child', kind: 'subproject', parentProjectId: 'project-1' }, 201));
    await gateway().projects.create({ workspaceId: 'workspace-demo' as never, kind: 'subproject', parentProjectId: 'project-1' as ProjectId, name: 'Child' });
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
    fetchMock.mockImplementationOnce(jsonResponse([reflection])).mockImplementationOnce(jsonResponse({ reflection, operation: receiptOf('reflection.add', 1) }, 201)).mockImplementationOnce(jsonResponse({ reflection: { ...reflection, title: 'Edited' }, operation: receiptOf('reflection.update', 2) }));
    const subject = gateway();
    await subject.reflections.list('project-1' as ProjectId);
    expect(lastCall().url).toBe('http://host.test/api/reflections?projectId=project-1');
    await subject.reflections.create({ projectId: 'project-1' as ProjectId, body: 'A useful note' });
    expect(lastCall().init.method).toBe('POST');
    await subject.reflections.update('reflection-1' as ReflectionId, { title: 'Edited' });
    expect(lastCall().url).toBe('http://host.test/api/reflections/reflection-1');
    expect(lastCall().init.method).toBe('PATCH');
  });

  it('narrows a reflections read to one container and to the archive state asked for', async () => {
    // A section-scoped read that lost its `sectionId` would still answer rows, just the
    // wrong ones — the whole project's, rendered inside one container.
    fetchMock.mockImplementation(jsonResponse([reflection]));
    const subject = gateway();

    await subject.reflections.list('project-1' as ProjectId, {
      sectionId: 'section-1' as SectionId,
      includeArchived: true,
    });
    expect(lastCall().url).toBe(
      'http://host.test/api/reflections?projectId=project-1&sectionId=section-1&includeArchived=true',
    );

    await subject.reflections.list('project-1' as ProjectId);
    expect(lastCall().url).toBe('http://host.test/api/reflections?projectId=project-1');
  });

  it('archives and restores a reflection through matching routes, parsing each answer', async () => {
    // Both lifecycle writes preserve the entity and history receipt.
    fetchMock
      .mockImplementationOnce(jsonResponse({ reflection: { ...reflection, archivedAt: at }, operation: receiptOf('reflection.archive', 3) }))
      .mockImplementationOnce(jsonResponse({ reflection, operation: receiptOf('reflection.restore', 4) }));
    const subject = gateway();

    const archived = await subject.reflections.archive('reflection-1' as ReflectionId);
    expect(lastCall().url).toBe('http://host.test/api/reflections/reflection-1/archive');
    expect(lastCall().init.method).toBe('POST');
    expect(archived.reflection.archivedAt).toBe(at);

    const restored = await subject.reflections.restore('reflection-1' as ReflectionId);
    expect(lastCall().url).toBe('http://host.test/api/reflections/reflection-1/restore');
    expect(lastCall().init.method).toBe('POST');
    expect(restored.reflection.archivedAt).toBeUndefined();
  });

  it('reads §34’s chronology under its root, with the persona header', async () => {
    fetchMock.mockImplementation(jsonResponse(todos));

    const result = await gateway().todos.get('project-1' as ProjectId);

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/todos');
    expect((lastCall().init.headers as Record<string, string>)['x-prototype-user']).toBe('user-demo');
    expect(result.items[0]?.kind).toBe('task');
  });

  it('reads §31’s root-wide archive without depending on a page tab', async () => {
    fetchMock.mockImplementation(jsonResponse(archive));

    const result = await gateway().archive.get('project-1' as ProjectId);

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/archive');
    expect(lastCall().init.method).toBe('GET');
    expect(result.items[0]?.kind).toBe('task');
    expect(result.items[0]?.origin.pageEnabled).toBe(true);
  });

  it('rejects malformed derived and reflection bodies', async () => {
    const subject = gateway();
    fetchMock.mockImplementation(jsonResponse({ projectId: 'project-1' }));
    await expect(subject.progress.get('project-1' as ProjectId)).rejects.toMatchObject({ code: 'invalid_response' });
    fetchMock.mockImplementation(jsonResponse([{ id: 'reflection-1' }]));
    await expect(subject.reflections.list('project-1' as ProjectId)).rejects.toMatchObject({ code: 'invalid_response' });
    // A Todos row whose origin is missing its container is not a row this page can link.
    fetchMock.mockImplementation(jsonResponse({ projectId: 'project-1', items: [{ kind: 'task', task, origin: { projectId: 'project-1', pageId: 'page-project-1', pageKind: 'home', breadcrumb: [{ projectId: 'project-1', name: 'Personal workspace' }] } }] }));
    await expect(subject.todos.get('project-1' as ProjectId)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('PrototypeWorkManagerGateway — sections (§31)', () => {
  it('lists a project’s sections under the project', async () => {
    fetchMock.mockImplementation(jsonResponse([projectSection]));

    const sections = await gateway().sections.list('project-1' as ProjectId);

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections');
    expect(sections[0]?.type).toBe('rich-text');
  });

  it('lists live sections by default and asks for the archived ones only when told', async () => {
    // The project rides in the path, so a `projectId` parameter would be a second answer to
    // the same question — one a caller could contradict.
    fetchMock.mockImplementation(jsonResponse([projectSection]));
    const subject = gateway();

    await subject.sections.list('project-1' as ProjectId);
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections');

    await subject.sections.list('project-1' as ProjectId, { includeArchived: true });
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections?includeArchived=true');
  });

  /**
   * §27: a section belongs to a page. The filter has to survive **three** allowlists — this
   * one, the host route's query parsing, and the object that route forwards to the service —
   * and dropping it in any of them is a 200 with the wrong rows rather than a failure.
   */
  it('narrows the canvas to one page, alongside the archived flag', async () => {
    fetchMock.mockImplementation(jsonResponse([projectSection]));
    const subject = gateway();

    await subject.sections.list('project-1' as ProjectId, { pageId: 'page-project-1' as never });
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections?pageId=page-project-1');

    await subject.sections.list('project-1' as ProjectId, {
      pageId: 'page-project-1' as never,
      includeArchived: true,
    });
    expect(lastCall().url).toBe(
      'http://host.test/api/projects/project-1/sections?pageId=page-project-1&includeArchived=true',
    );
  });

  it('restores through the dedicated route and parses the section and receipt it answers', async () => {
    fetchMock.mockImplementation(jsonResponse({ section: projectSection, operation: receiptOf('section.restore', 1) }));

    const restored = await gateway().sections.restore('section-1' as SectionId);

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1/restore');
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBeUndefined();
    expect(restored.section.id).toBe('section-1');
    expect(restored.operation?.operation).toBe('section.restore');
  });

  it('creates with a JSON body and accepts 201', async () => {
    fetchMock.mockImplementation(jsonResponse({
      section: projectSection,
      operation: receiptOf('section.add', 2),
    }, 201));

    await gateway().sections.create('project-1' as ProjectId, { type: 'rich-text', config: { text: '' } });

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/sections');
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ type: 'rich-text', config: { text: '' } });
  });

  it('updates through PATCH, addressing the section directly', async () => {
    fetchMock.mockImplementation(jsonResponse({
      section: { ...projectSection, collapsed: true },
      operation: receiptOf('section.update', 3),
    }));

    const updated = await gateway().sections.update('section-1' as SectionId, { collapsed: true });

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1');
    expect(lastCall().init.method).toBe('PATCH');
    expect(updated.section.collapsed).toBe(true);
  });

  it('moves through the dedicated route and validates the authoritative section (§32)', async () => {
    fetchMock.mockImplementation(jsonResponse({
      section: { ...projectSection, position: 2 },
      operation: receiptOf('section.move', 4),
    }));

    const moved = await gateway().sections.move('section-1' as SectionId, { position: 2 });

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1/move');
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ position: 2 });
    expect(moved.section.position).toBe(2);
  });

  it('rejects a moved section body outside the shared contract', async () => {
    fetchMock.mockImplementation(jsonResponse({
      section: { ...projectSection, position: -1 },
      operation: null,
    }));

    await expect(gateway().sections.move('section-1' as SectionId, { position: 1 })).rejects.toBeInstanceOf(
      GatewayError,
    );
  });

  it('duplicates with no body and accepts 201', async () => {
    fetchMock.mockImplementation(jsonResponse({
      section: { ...projectSection, id: 'section-2', position: 1 },
      operation: receiptOf('section.add', 1),
    }, 201));

    const copy = await gateway().sections.duplicate('section-1' as SectionId);

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1/duplicate');
    expect(lastCall().init.body).toBeUndefined();
    expect(copy.section.id).toBe('section-2');
    expect(copy.operation.operation).toBe('section.add');
  });

  it('removes through DELETE and validates the returned receipt contract', async () => {
    fetchMock.mockImplementation(jsonResponse(removalResult));

    await expect(gateway().sections.remove('section-1' as SectionId)).resolves.toEqual(removalResult);

    expect(lastCall().url).toBe('http://host.test/api/sections/section-1');
    expect(lastCall().init.method).toBe('DELETE');
  });

  it('summary and transition hit their routes and validate the committed result', async () => {
    const adapter = gateway();
    fetchMock.mockImplementation(jsonResponse(historySummary));
    await expect(adapter.history.summary('project-1' as ProjectId)).resolves.toEqual(historySummary);
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/history');
    expect(lastCall().init.method).toBe('GET');

    fetchMock.mockImplementation(jsonResponse(transitionResult));
    const input = { actionId: 'operation-1' as OperationActionId, direction: 'undo' as const, expectedRevision: 1 };
    await expect(adapter.history.transition('history-1' as OperationHistoryId, input)).resolves.toEqual(transitionResult);

    expect(lastCall().url).toBe('http://host.test/api/history/history-1/transition');
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(lastCall().init.body as string)).toEqual(input);
  });

  /** Slice 33 (Refactor §26.9): edit refusals cross the adapter whole, and never become recovery. */
  it('preserves history refusal details and never invents Archive recovery', async () => {
    const base = { historyId: 'history-1', actionId: 'operation-3', summary: historySummary };
    const refusals = [
      {
        status: 409,
        message: 'history_conflict: Undo of the update on Notes was refused: field-changed: section "Notes" [section-1]',
        details: {
          reason: 'history_conflict', ...base,
          conflicts: [{ entityType: 'section', id: 'section-1', title: 'Notes', problem: 'field-changed', nextStep: 'change-by-hand' }],
        },
      },
      {
        status: 409,
        message: 'history_blocked: project "Kitchen" [project-kitchen] is archived; reactivate it before undoing this operation',
        details: { reason: 'history_blocked', ...base, blockingProjectId: 'project-kitchen', blockingProjectTitle: 'Kitchen' },
      },
      {
        status: 409,
        message: 'history_expired: this action expired at 2026-08-02T16:00:00.000Z; make the change again by hand instead',
        details: { reason: 'history_expired', ...base, expiresAt: '2026-08-02T16:00:00.000Z' },
      },
      {
        status: 409,
        message: 'history_revision_stale: this history is at revision 2, not 1; read the summary and try again',
        details: { reason: 'history_revision_stale', ...base },
      },
      { status: 404, message: 'operationHistory "history-foreign" was not found', details: undefined },
    ] as const;

    const adapter = gateway();
    for (const refusal of refusals) {
      fetchMock.mockImplementation(jsonResponse({
        error: refusal.status === 404 ? 'not_found' : 'rule_violation',
        message: refusal.message,
        ...(refusal.details === undefined ? {} : { details: refusal.details }),
        // A stray success-shaped field on an error must not turn it into a result.
        section: projectSection,
      }, refusal.status));

      const historyId = (refusal.details?.historyId ?? 'history-foreign') as OperationHistoryId;
      const error = await adapter.history.transition(historyId, { actionId: 'operation-3' as OperationActionId, direction: 'undo', expectedRevision: 1 })
        .then(() => null, (thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(GatewayError);
      expect(error).toMatchObject({ code: refusal.status === 404 ? 'not_found' : 'rule_violation', status: refusal.status, message: refusal.message });
      expect((error as GatewayError).details).toEqual(refusal.details);
      expect(JSON.stringify((error as GatewayError).details ?? {})).not.toMatch(/archive|restore_section/i);
    }

    // A 200 whose body is not a transition result is an adapter failure, never a silent success.
    fetchMock.mockImplementation(jsonResponse({ undoId: 'undo-update', operation: 'section.update', outcome: 'restored' }));
    await expect(adapter.history.transition('history-1' as OperationHistoryId, { actionId: 'operation-3' as OperationActionId, direction: 'undo', expectedRevision: 1 }))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects a removal receipt body outside the shared contract', async () => {
    fetchMock.mockImplementation(jsonResponse({ section: projectSection, undo: { undoId: 'undo-1' }, archiveListed: true }));

    await expect(gateway().sections.remove('section-1' as SectionId)).rejects.toMatchObject({
      code: 'invalid_response', status: 0,
    });
  });

  it('rejects a section body that is not its contract (§11)', async () => {
    fetchMock.mockImplementation(jsonResponse({
      section: { ...projectSection, columnSpan: 7 },
      operation: null,
    }));

    await expect(gateway().sections.update('section-1' as SectionId, { columnSpan: 6 })).rejects.toBeInstanceOf(
      GatewayError,
    );
  });
});

describe('PrototypeWorkManagerGateway — shortcuts (§27)', () => {
  it('serializes the destination page and round-trips all placement routes', async () => {
    fetchMock
      .mockImplementationOnce(jsonResponse([shortcut]))
      .mockImplementationOnce(jsonResponse([shortcutSource]))
      .mockImplementationOnce(jsonResponse({ shortcut, operation: receiptOf('shortcut.add', 1) }, 201))
      .mockImplementationOnce(jsonResponse({ shortcut: { ...shortcut, collapsed: true }, operation: receiptOf('shortcut.update', 2) }))
      .mockImplementationOnce(jsonResponse({ shortcut: { ...shortcut, position: 2 }, operation: null }))
      .mockImplementationOnce(jsonResponse({
        shortcutId: shortcut.id,
        projectId: 'project-1',
        pageId: shortcut.pageId,
        operation: receiptOf('shortcut.remove', 3),
      }));
    const subject = gateway();

    expect(await subject.shortcuts.list('project-1' as ProjectId, { pageId: 'page-project-1' as never })).toEqual([
      shortcut,
    ]);
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/shortcuts?pageId=page-project-1');

    expect(await subject.shortcuts.sources('project-1' as ProjectId, { pageId: 'page-project-1' as never })).toEqual([
      shortcutSource,
    ]);
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/shortcut-sources?pageId=page-project-1');

    await subject.shortcuts.create('project-1' as ProjectId, {
      pageId: 'page-project-1' as never,
      sourceSectionId: 'section-source' as SectionId,
    });
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/shortcuts');
    expect(lastCall().init.method).toBe('POST');

    await subject.shortcuts.update('shortcut-1' as never, { collapsed: true });
    expect(lastCall().url).toBe('http://host.test/api/shortcuts/shortcut-1');
    expect(lastCall().init.method).toBe('PATCH');

    await subject.shortcuts.move('shortcut-1' as never, { position: 2 });
    expect(lastCall().url).toBe('http://host.test/api/shortcuts/shortcut-1/move');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ position: 2 });

    // A move that changed nothing answers the placement and a null receipt rather than a 204.
    const removed = await subject.shortcuts.remove('shortcut-1' as never);
    expect(lastCall().url).toBe('http://host.test/api/shortcuts/shortcut-1');
    expect(lastCall().init.method).toBe('DELETE');
    expect(removed).toMatchObject({ shortcutId: shortcut.id, operation: { operation: 'shortcut.remove' } });
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
    fetchMock.mockImplementation(jsonResponse({ task, operation: receiptOf('task.add', 1) }, 201));
    const input = { projectId: 'project-1', title: 'Water the plants' } as CreateTaskInput;

    const created = await gateway().tasks.create(input);

    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBe(JSON.stringify(input));
    expect((lastCall().init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(created.task.id).toBe('task-1');
  });

  it('updates through PATCH', async () => {
    fetchMock.mockImplementation(jsonResponse({ task: { ...task, title: 'Water the ferns' }, operation: receiptOf('task.update', 2) }));

    await gateway().tasks.update('task-1' as TaskId, { title: 'Water the ferns' });

    expect(lastCall().url).toBe('http://host.test/api/tasks/task-1');
    expect(lastCall().init.method).toBe('PATCH');
  });

  it('completes with no body — the host route carries none', async () => {
    fetchMock.mockImplementation(jsonResponse({ task: { ...task, status: 'done', completedAt: at }, operation: receiptOf('task.update', 3) }));

    const completed = await gateway().tasks.complete('task-1' as TaskId);

    expect(lastCall().url).toBe('http://host.test/api/tasks/task-1/complete');
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBeUndefined();
    expect(completed.task.status).toBe('done');
  });

  // Archive preserves the shared write envelope, including its operation receipt.
  it('archives and preserves the row and operation receipt', async () => {
    fetchMock.mockImplementation(jsonResponse({ task: { ...task, archivedAt: at }, operation: receiptOf('task.archive', 4) }));

    await expect(gateway().tasks.archive('task-1' as TaskId)).resolves.toEqual({ task: { ...task, archivedAt: at }, operation: receiptOf('task.archive', 4) });
  });

  // Restore is the undo archive lacks, and it does hand the row back: the caller that
  // reverses an archive needs the restored task, not a second read to find it.
  it('restores through the dedicated route and answers the task', async () => {
    fetchMock.mockImplementation(jsonResponse({ task, operation: receiptOf('task.restore', 5) }));

    const restored = await gateway().tasks.restore('task-1' as TaskId);

    expect(lastCall().url).toBe('http://host.test/api/tasks/task-1/restore');
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBeUndefined();
    expect(restored.task.id).toBe('task-1');
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

  it('preserves the untrusted details a 409 carries, and preserves their absence', async () => {
    // The adapter keeps wire data as it found it; the feature that branches on it owns the
    // validation. Without this the host and store tests both pass while the real removal
    // dialog never sees the discriminator it opens on.
    const adapter = gateway();
    fetchMock.mockImplementation(
      jsonResponse(
        { error: 'rule_violation', message: 'still holds 3 tasks', details: { reason: 'section_not_empty', liveRowCount: 3 } },
        409,
      ),
    );
    await expect(adapter.sections.remove('section-1' as SectionId)).rejects.toMatchObject({
      code: 'rule_violation',
      details: { reason: 'section_not_empty', liveRowCount: 3 },
    });

    fetchMock.mockImplementation(jsonResponse({ error: 'rule_violation', message: 'nope' }, 409));
    const bare = await adapter.sections
      .remove('section-1' as SectionId)
      .then(() => null, (thrown: unknown) => thrown as GatewayError);
    expect(bare?.details).toBeUndefined();
    expect(bare).toBeInstanceOf(GatewayError);
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
    dailyDigest: { lines: ['Nothing is scheduled for today.'], source: 'prototype', generatedAt: at },
    funFact: 'Context switching costs more time than the switch itself takes.',
    recentAgentActivity: [],
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

/**
 * §63's injection point. It lives here rather than on the host because what it exists to
 * exercise is the *optimistic* path in the stores — paint, then revert — and a host that
 * returned a real 500 would be testing the host's error envelope instead.
 */
describe('PrototypeWorkManagerGateway — prototype latency and failure (§63)', () => {
  it('fails every call at rate 1, without reaching the network', async () => {
    const subject = gateway();
    TestBed.inject(PrototypeSettings).setFailureRate(1);

    // A non-empty query on purpose: `list({ status: [] })` short-circuits before the
    // request is built, so it would prove nothing about injection.
    await expect(subject.projects.list({ status: ['active'] })).rejects.toMatchObject({ code: 'unreachable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets every call through at rate 0', async () => {
    fetchMock.mockImplementation(jsonResponse([project]));
    const subject = gateway();
    TestBed.inject(PrototypeSettings).setFailureRate(0);

    await expect(subject.projects.list({ status: ['active'] })).resolves.toHaveLength(1);
  });

  it('waits the configured delay before the fetch', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(jsonResponse([project]));
    const subject = gateway();
    TestBed.inject(PrototypeSettings).setNetworkDelay(3000);

    const pending = subject.projects.list({ status: ['active'] });
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('PrototypeWorkManagerGateway — project pages (§26)', () => {
  it('lists a project’s pages under the project', async () => {
    fetchMock.mockImplementation(jsonResponse([homePage]));

    const pages = await gateway().pages.list('project-1' as ProjectId);

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/pages');
    expect(lastCall().init.method).toBe('GET');
    expect(pages[0]?.kind).toBe('home');
  });

  /**
   * Addressed by **kind**, not by page id: enabling a page for the first time is what creates
   * the record, so there is no id to name yet. Only `enabled` travels in the body.
   */
  it('toggles an optional page by kind, sending only the new state', async () => {
    const todos = { ...homePage, id: 'page-todos', kind: 'todos', enabled: true };
    fetchMock.mockImplementation(jsonResponse({ page: todos, operation: receiptOf('page.add', 1) }));

    const result = await gateway().pages.setEnabled('project-1' as ProjectId, { kind: 'todos', enabled: true });

    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/pages/todos');
    expect(lastCall().init.method).toBe('PATCH');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ enabled: true });
    expect(result.page).toMatchObject({ kind: 'todos', enabled: true });
    expect(result.operation).toMatchObject({ operation: 'page.add', revision: 1 });
  });

  /** A toggle already where it was asked to go answers the page and no receipt (§31). */
  it('parses the null receipt a no-op toggle answers', async () => {
    fetchMock.mockImplementation(jsonResponse({ page: { ...homePage, id: 'page-todos', kind: 'todos' }, operation: null }));

    const result = await gateway().pages.setEnabled('project-1' as ProjectId, { kind: 'todos', enabled: true });

    expect(result.operation).toBeNull();
    expect(result.page.kind).toBe('todos');
  });

  /**
   * The envelope is validated, not trusted: a host answering the bare page it used to send is a
   * contract break the browser has to notice rather than paint.
   */
  it('rejects a malformed toggle response', async () => {
    fetchMock.mockImplementation(jsonResponse({ ...homePage, id: 'page-todos', kind: 'todos' }));

    await expect(gateway().pages.setEnabled('project-1' as ProjectId, { kind: 'todos', enabled: true })).rejects.toBeTruthy();
  });

  it('surfaces a refused toggle as a GatewayError the UI can show', async () => {
    fetchMock.mockImplementation(
      jsonResponse({ error: { code: 'conflict', message: 'the home page is required and cannot be disabled' } }, 409),
    );

    await expect(
      gateway().pages.setEnabled('project-1' as ProjectId, { kind: 'home', enabled: false }),
    ).rejects.toBeInstanceOf(GatewayError);
  });
});

describe('PrototypeWorkManagerGateway — Reflections journal (§36)', () => {
  it('reads the root journal projection and completed-work picker through separate routes', async () => {
    fetchMock.mockImplementationOnce(jsonResponse(ProjectJournalResultSchema.parse({ projectId: 'project-1', items: [] })));
    fetchMock.mockImplementationOnce(jsonResponse(ProjectCompletedWorkResultSchema.parse({ projectId: 'project-1', candidates: [] })));

    const subject = gateway();
    await expect(subject.journal.get('project-1' as ProjectId)).resolves.toMatchObject({ projectId: 'project-1', items: [] });
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/journal');
    expect(lastCall().init.method).toBe('GET');

    await expect(subject.journal.completedWork('project-1' as ProjectId)).resolves.toMatchObject({ projectId: 'project-1', candidates: [] });
    expect(lastCall().url).toBe('http://host.test/api/projects/project-1/completed-work');
    expect(lastCall().init.method).toBe('GET');
  });
});
