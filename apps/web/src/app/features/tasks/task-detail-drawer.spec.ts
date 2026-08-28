import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TaskSchema, type Task } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailDrawer } from './task-detail-drawer';

const AT = '2026-08-27T16:00:00.000Z';
const value: Task = TaskSchema.parse({
  id: 'task-a',
  projectId: 'project-a',
  title: 'Write the first draft',
  description: 'Use the research notes.',
  status: 'todo',
  priority: 'medium',
  dueAt: '2026-09-03T23:59:59.999Z',
  createdAt: AT,
  updatedAt: AT,
});

const render = async () => {
  TestBed.configureTestingModule({ imports: [TaskDetailDrawer] });
  const fixture: ComponentFixture<TaskDetailDrawer> = TestBed.createComponent(TaskDetailDrawer);
  fixture.componentRef.setInput('task', value);
  await fixture.whenStable();
  return { fixture, component: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
};

describe('TaskDetailDrawer', () => {
  it('renders as a labelled side drawer with the selected task context', async () => {
    const { element } = await render();
    const drawer = element.querySelector('[data-task-drawer]');

    expect(drawer?.getAttribute('role')).toBe('complementary');
    expect(drawer?.getAttribute('aria-labelledby')).toBe('task-drawer-title');
    expect(element.querySelector('#task-drawer-title')?.textContent).toContain(value.title);
    expect(element.querySelector('[data-task-description]')?.textContent).toContain('research notes');
    expect(element.querySelector<HTMLSelectElement>('[data-task-priority]')?.value).toBe('medium');
    expect(element.querySelector<HTMLInputElement>('[data-task-due-date]')?.value).toBe('2026-09-03');
    expect(element.querySelector<HTMLInputElement>('[data-task-estimate]')?.value).toBe('');
  });

  it('emits priority, due-date set/clear, and close intent', async () => {
    const { component, element } = await render();
    const priority = vi.fn();
    const dueDate = vi.fn();
    const closed = vi.fn();
    const estimate = vi.fn();
    component.priorityChanged.subscribe(priority);
    component.dueDateChanged.subscribe(dueDate);
    component.closed.subscribe(closed);
    component.estimateChanged.subscribe(estimate);

    const priorityControl = element.querySelector<HTMLSelectElement>('[data-task-priority]')!;
    priorityControl.value = 'high';
    priorityControl.dispatchEvent(new Event('change', { bubbles: true }));

    const dueControl = element.querySelector<HTMLInputElement>('[data-task-due-date]')!;
    dueControl.value = '2026-09-10';
    dueControl.dispatchEvent(new Event('change', { bubbles: true }));
    dueControl.value = '';
    dueControl.dispatchEvent(new Event('change', { bubbles: true }));
    element.querySelector<HTMLButtonElement>('[data-close-drawer]')?.click();
    const estimateControl = element.querySelector<HTMLInputElement>('[data-task-estimate]')!;
    estimateControl.value = '5'; estimateControl.dispatchEvent(new Event('change', { bubbles: true }));
    estimateControl.value = ''; estimateControl.dispatchEvent(new Event('change', { bubbles: true }));

    expect(priority).toHaveBeenCalledWith({ id: value.id, priority: 'high' });
    expect(dueDate.mock.calls).toEqual([
      [{ id: value.id, dueDate: '2026-09-10' }],
      [{ id: value.id, dueDate: '' }],
    ]);
    expect(closed).toHaveBeenCalledOnce();
    expect(estimate.mock.calls).toEqual([[{ id: value.id, estimate: 5 }], [{ id: value.id, estimate: null }]]);
  });
});
