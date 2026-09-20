import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ProjectSchema,
  TaskSchema,
  type ProjectId,
  type ProjectPageId,
  type ProjectTodoItem,
  type SectionId,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { TodosPage } from './todos-page';

const AT = '2026-08-27T16:00:00.000Z';
const ROOT = 'project-renovation' as ProjectId;

const taskItem = (
  id: string,
  overrides: Record<string, unknown> = {},
  origin: Record<string, unknown> = {},
): ProjectTodoItem => ({
  kind: 'task',
  task: TaskSchema.parse({
    id,
    projectId: ROOT,
    sectionId: 'section-week',
    title: `Task ${id}`,
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }),
  origin: {
    projectId: ROOT,
    pageId: 'page-project-renovation' as ProjectPageId,
    pageKind: 'home',
    breadcrumb: [{ projectId: ROOT, name: 'Home renovation' }],
    sectionId: 'section-week' as SectionId,
    sectionName: 'This week',
    ...origin,
  } as Extract<ProjectTodoItem, { kind: 'task' }>['origin'],
});

const subprojectItem = (id: string, overrides: Record<string, unknown> = {}): ProjectTodoItem => ({
  kind: 'subproject',
  project: ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    kind: 'subproject',
    parentProjectId: ROOT,
    name: 'Kitchen',
    status: 'active',
    targetDate: '2026-09-01',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }) as Extract<ProjectTodoItem, { kind: 'subproject' }>['project'],
  origin: {
    projectId: id as ProjectId,
    pageId: `page-${id}` as ProjectPageId,
    pageKind: 'work',
    breadcrumb: [
      { projectId: ROOT, name: 'Home renovation' },
      { projectId: id as ProjectId, name: 'Kitchen' },
    ],
  },
});

const MIXED: ProjectTodoItem[] = [
  taskItem('task-early', { dueAt: '2026-09-01T09:00:00.000Z' }),
  subprojectItem('project-kitchen'),
  taskItem('task-nested', { projectId: 'project-kitchen' as ProjectId, dueAt: '2026-09-02T12:00:00.000Z', sectionId: 'section-kitchen' }, {
    projectId: 'project-kitchen' as ProjectId,
    pageId: 'page-project-kitchen' as ProjectPageId,
    pageKind: 'work',
    sectionId: 'section-kitchen' as SectionId,
    sectionName: 'Task List',
    breadcrumb: [
      { projectId: ROOT, name: 'Home renovation' },
      { projectId: 'project-kitchen' as ProjectId, name: 'Kitchen' },
    ],
  }),
  taskItem('task-cancelled', { status: 'cancelled', dueAt: '2026-09-03T12:00:00.000Z' }),
  taskItem('task-undated'),
];

interface RenderOptions {
  items?: ProjectTodoItem[];
  restoreBlocked?: boolean;
  failWith?: GatewayError;
  completeRejects?: GatewayError;
  gateComplete?: boolean;
}

const render = async (options: RenderOptions = {}) => {
  const items = options.items ?? MIXED;
  let releaseCompletion: (() => void) | undefined;
  const todosGet = vi.fn(async (projectId: ProjectId) => {
    if (options.failWith !== undefined) throw options.failWith;
    return { projectId, items };
  });
  const complete = vi.fn(async (id: string) => {
    if (options.gateComplete === true) await new Promise<void>((resolve) => (releaseCompletion = resolve));
    if (options.completeRejects !== undefined) throw options.completeRejects;
    const row = items.find((item) => item.kind === 'task' && item.task.id === id);
    return {
      task: { ...(row as Extract<ProjectTodoItem, { kind: 'task' }>).task, status: 'done', completedAt: AT },
      operation: null,
    };
  });
  const update = vi.fn(async (id: ProjectId) => {
    if (options.completeRejects !== undefined) throw options.completeRejects;
    const row = items.find((item) => item.kind === 'subproject' && item.project.id === id);
    return { ...(row as Extract<ProjectTodoItem, { kind: 'subproject' }>).project, status: 'completed', completedAt: AT };
  });
  const gateway = {
    todos: { get: todosGet },
    tasks: { complete },
    projects: { update },
  } as unknown as WorkManagerGateway;
  const dataChanged = vi.fn();
  const hierarchyChanged = vi.fn();

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
    ],
  });
  const fixture = TestBed.createComponent(TodosPage);
  fixture.componentRef.setInput('projectId', ROOT);
  fixture.componentRef.setInput('pageId', 'page-todos' as ProjectPageId);
  fixture.componentRef.setInput('projectLayoutMode', 'flow');
  fixture.componentRef.setInput('shortcutsAllowed', false);
  fixture.componentRef.setInput('restoreBlocked', options.restoreBlocked ?? false);
  fixture.componentRef.setInput('onProjectDataChange', dataChanged);
  fixture.componentRef.setInput('onProjectHierarchyChange', hierarchyChanged);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, todosGet, complete, update, dataChanged, hierarchyChanged, release: () => releaseCompletion?.() };
};

type Fixture = Awaited<ReturnType<typeof render>>['fixture'];

const query = (fixture: Fixture, selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
const queryAll = (fixture: Fixture, selector: string) =>
  [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];
const rowFor = (fixture: Fixture, id: string) =>
  queryAll(fixture, '[data-todo-row]').find((row) => row.getAttribute('data-todo-id') === id)!;

describe('TodosPage (§34)', () => {
  it('renders the chronology it was given, with dates, status and origin', async () => {
    const { fixture } = await render();

    const rows = queryAll(fixture, '[data-todo-row]');
    // The order is the query's; the page never re-sorts what it was handed.
    expect(rows.map((row) => row.getAttribute('data-todo-id'))).toEqual([
      'task-early',
      'project-kitchen',
      'task-nested',
      'task-cancelled',
      'task-undated',
    ]);
    // UTC, as stored: the calendar day of the instant, with no local conversion.
    expect(rowFor(fixture, 'task-early').querySelector('[data-todo-due]')?.textContent?.trim()).toBe('2026-09-01');
    expect(rowFor(fixture, 'project-kitchen').querySelector('[data-todo-due]')?.textContent?.trim()).toBe('2026-09-01');
    expect(rowFor(fixture, 'task-undated').querySelector('[data-todo-due]')?.textContent?.trim()).toBe('No due date');
    expect(rowFor(fixture, 'task-cancelled').querySelector('[data-todo-status]')?.textContent?.trim()).toBe('Cancelled');
    expect(rowFor(fixture, 'task-nested').querySelector('[data-todo-origin]')?.textContent).toContain('Kitchen');
    expect(rowFor(fixture, 'task-nested').querySelector('[data-todo-origin]')?.textContent).toContain('Task List');
  });

  it('links each row to the canonical canvas that owns it', async () => {
    const { fixture } = await render();

    const href = (id: string) => rowFor(fixture, id).querySelector('[data-todo-link]')?.getAttribute('href');

    // A root's task opens Home at its own container. The fragment is the *element* id — the
    // section id under a fixed prefix — because a raw id is not a safe DOM id on its own.
    expect(href('task-early')).toBe('/projects/project-renovation/pages/home#section-section-week');
    // …a unit of work's task opens that unit's single canvas, which is not a tab (§26).
    expect(href('task-nested')).toBe('/projects/project-kitchen#section-section-kitchen');
    // …and a unit of work opens itself.
    expect(href('project-kitchen')).toBe('/projects/project-kitchen');
  });

  it('completes each kind and tells the shell what moved', async () => {
    const { fixture, complete, update, dataChanged, hierarchyChanged } = await render();

    (rowFor(fixture, 'task-early').querySelector('[data-todo-complete]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(complete).toHaveBeenCalledWith('task-early');
    expect(rowFor(fixture, 'task-early').querySelector('[data-todo-status]')?.textContent?.trim()).toBe('Done');
    expect(dataChanged).toHaveBeenCalledTimes(1);
    expect(hierarchyChanged).not.toHaveBeenCalled();

    (rowFor(fixture, 'project-kitchen').querySelector('[data-todo-complete]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(update).toHaveBeenCalledWith('project-kitchen', { status: 'completed' });
    // A unit of work completing moves the work tree as well as the root's progress.
    expect(hierarchyChanged).toHaveBeenCalledTimes(1);
  });

  it('offers a labelled native control that a keyboard reaches, and none on a finished row', async () => {
    const { fixture, complete } = await render();

    const control = rowFor(fixture, 'task-early').querySelector('[data-todo-complete]') as HTMLButtonElement;
    expect(control.tagName).toBe('BUTTON');
    expect(control.getAttribute('aria-label')).toContain('Task task-early');
    control.focus();
    expect(document.activeElement).toBe(control);

    // §34 keeps a cancelled row on the list and leaves it exactly as it is.
    expect(rowFor(fixture, 'task-cancelled').querySelector('[data-todo-complete]')).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it('freezes every control while one completion is in flight, and while the shell blocks writes', async () => {
    const inFlight = await render({ gateComplete: true });
    (rowFor(inFlight.fixture, 'task-early').querySelector('[data-todo-complete]') as HTMLButtonElement).click();
    inFlight.fixture.detectChanges();

    const controls = queryAll(inFlight.fixture, '[data-todo-complete]') as HTMLButtonElement[];
    expect(controls.every((control) => control.disabled)).toBe(true);
    inFlight.release();

    const blocked = await render({ restoreBlocked: true });
    expect((queryAll(blocked.fixture, '[data-todo-complete]') as HTMLButtonElement[]).every((c) => c.disabled)).toBe(true);
  });

  it('reports a rejected completion, restores the row and does not tell the shell', async () => {
    const { fixture, dataChanged } = await render({ completeRejects: new GatewayError('conflict', 409, 'the task is archived') });

    (rowFor(fixture, 'task-early').querySelector('[data-todo-complete]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-todo-write-error]')?.textContent).toContain('archived');
    expect(rowFor(fixture, 'task-early').querySelector('[data-todo-status]')?.textContent?.trim()).toBe('To do');
    expect(dataChanged).not.toHaveBeenCalled();
    // Retryable: the control is back rather than stuck pending.
    expect((rowFor(fixture, 'task-early').querySelector('[data-todo-complete]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps an unreadable page, an empty one and a full one distinct', async () => {
    const failed = await render({ failWith: new GatewayError('unreachable', 0, 'the host is not answering') });
    expect(query(failed.fixture, '[data-todos-error]')?.textContent).toContain('not answering');
    expect(query(failed.fixture, '[data-todos-empty]')).toBeNull();
    expect(query(failed.fixture, '[data-todos-list]')).toBeNull();

    (query(failed.fixture, '[data-todos-retry]') as HTMLButtonElement).click();
    await failed.fixture.whenStable();
    expect(failed.todosGet).toHaveBeenCalledTimes(2);

    const empty = await render({ items: [] });
    expect(query(empty.fixture, '[data-todos-empty]')).not.toBeNull();
    expect(query(empty.fixture, '[data-todos-list]')).toBeNull();
    expect(query(empty.fixture, '[data-todos-error]')).toBeNull();
  });

  it('offers no way to create, reorder or configure anything (§34)', async () => {
    const { fixture } = await render();

    for (const selector of [
      '[data-project-quick-add]',
      '[data-layout-edit-toggle]',
      '[cdkDrag]',
      '[data-section-frame]',
      'input',
      'select',
    ]) {
      expect(query(fixture, selector), selector).toBeNull();
    }
  });
});
