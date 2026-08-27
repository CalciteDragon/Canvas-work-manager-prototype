import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ProjectSchema, TaskSchema, type Project, type Task, type UpdateTaskInput } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../core/gateway/work-manager-gateway';
import { TasksPage } from './tasks-page';

const AT = '2026-08-27T16:00:00.000Z';
const project: Project = ProjectSchema.parse({
  id: 'project-a',
  workspaceId: 'workspace-demo',
  name: 'Project A',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});

const makeTask = (overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id: 'task-a',
    projectId: project.id,
    title: 'Write the first draft',
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const render = async (
  options: {
    complete?: WorkManagerGateway['tasks']['complete'];
    projects?: Project[];
    projectLoadError?: GatewayError;
  } = {},
) => {
  let current = makeTask();
  const gateway: WorkManagerGateway = {
    projects: {
      list: vi.fn(async () => {
        if (options.projectLoadError !== undefined) throw options.projectLoadError;
        return options.projects ?? [project];
      }),
      get: vi.fn(async () => project),
    },
    tasks: {
      list: vi.fn(async () => [current]),
      get: vi.fn(async () => current),
      create: vi.fn(async (input) => makeTask({ id: 'task-created', ...input })),
      update: vi.fn(async (_id, input: UpdateTaskInput) => {
        current = makeTask({
          ...current,
          ...input,
          dueAt: input.dueAt === null ? undefined : (input.dueAt ?? current.dueAt),
        });
        return current;
      }),
      complete:
        options.complete ?? vi.fn(async () => (current = makeTask({ ...current, status: 'done', completedAt: AT }))),
      archive: vi.fn(async () => undefined),
    },
  };

  TestBed.configureTestingModule({
    imports: [TasksPage],
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const fixture: ComponentFixture<TasksPage> = TestBed.createComponent(TasksPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, component: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, gateway };
};

describe('TasksPage', () => {
  it('loads tasks and projects on entry and quick-creates into the selected project', async () => {
    const { fixture, element, gateway } = await render();

    expect(element.querySelector('[data-project-choice]')?.textContent).toContain('Project A');
    expect(element.querySelectorAll('[data-task-row]')).toHaveLength(1);

    const title = element.querySelector<HTMLInputElement>('[data-quick-task-title]')!;
    title.value = '  New task  ';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    element.querySelector<HTMLFormElement>('[data-quick-create]')?.dispatchEvent(new Event('submit', { bubbles: true }));
    await fixture.whenStable();

    expect(gateway.tasks.create).toHaveBeenCalledWith({ projectId: project.id, title: 'New task' });
    expect(element.querySelectorAll('[data-task-row]')).toHaveLength(2);
    expect(element.querySelector('#task-drawer-title')?.textContent).toContain('New task');
    expect(title.value).toBe('');
  });

  it('wires inline title editing, detail selection, priority, and due date to the store', async () => {
    const { fixture, element, gateway } = await render();

    element.querySelector<HTMLButtonElement>('[data-task-title]')?.click();
    await fixture.whenStable();
    const title = element.querySelector<HTMLInputElement>('[data-task-title-editor]')!;
    title.value = 'Revised title';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    title.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await fixture.whenStable();

    element.querySelector<HTMLButtonElement>('[data-task-details]')?.click();
    await fixture.whenStable();
    const priority = element.querySelector<HTMLSelectElement>('[data-task-priority]')!;
    priority.value = 'high';
    priority.dispatchEvent(new Event('change', { bubbles: true }));
    const dueDate = element.querySelector<HTMLInputElement>('[data-task-due-date]')!;
    dueDate.value = '2026-09-10';
    dueDate.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();

    expect(vi.mocked(gateway.tasks.update).mock.calls.map(([, input]) => input)).toEqual([
      { title: 'Revised title' },
      { priority: 'high' },
      { dueAt: '2026-09-10T23:59:59.999Z' },
    ]);
  });

  it('renders optimistic completion, then rollback and a visible error when persistence fails', async () => {
    const result = deferred<Task>();
    const { fixture, element } = await render({ complete: vi.fn(() => result.promise) });

    element.querySelector<HTMLInputElement>('[data-task-complete]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-task-row]')?.classList.contains('task-row--completed')).toBe(true);

    result.reject(new GatewayError('unreachable', 0, 'could not reach the prototype host'));
    await fixture.whenStable();

    expect(element.querySelector('[data-task-row]')?.classList.contains('task-row--completed')).toBe(false);
    expect(element.querySelector('[data-tasks-error]')?.textContent).toContain('could not reach the prototype host');
  });

  it('explains that quick create needs a project when the seed has none', async () => {
    const { element } = await render({ projects: [] });

    expect(element.querySelector('[data-no-projects]')?.textContent).toContain('seed with a project');
    expect(element.querySelector<HTMLButtonElement>('[data-quick-create] button')?.disabled).toBe(true);
    expect(element.querySelector('[data-tasks-empty]')).toBeNull();
  });

  it('renders a distinct load failure instead of an impossible empty-state instruction', async () => {
    const { element } = await render({
      projectLoadError: new GatewayError('unreachable', 0, 'could not reach the prototype host'),
    });

    expect(element.querySelector('[data-task-load-failed]')?.textContent).toContain('Try reloading');
    expect(element.querySelector('[data-no-projects]')).toBeNull();
    expect(element.querySelector('[data-tasks-empty]')).toBeNull();
  });
});
