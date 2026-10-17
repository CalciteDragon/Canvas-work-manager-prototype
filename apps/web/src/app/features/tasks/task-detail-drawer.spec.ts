import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TaskSchema, type Task } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailDrawer } from './task-detail-drawer';

const AT = '2026-08-27T16:00:00.000Z';
const value: Task = TaskSchema.parse({
  id: 'task-a',
  projectId: 'project-a',
  sectionId: 'section-tasks',
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
  it('names its dialog with a focusable heading', async () => {
    const { element } = await render();
    const drawer = element.querySelector('[data-task-drawer]')!;
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('false');
    expect(element.querySelector('h2')?.getAttribute('tabindex')).toBe('-1');
  });
  const titleInput = (element: HTMLElement) => element.querySelector<HTMLInputElement>('[data-task-drawer-title]')!;
  const typeTitle = (element: HTMLElement, title: string) => {
    const control = titleInput(element);
    control.value = title;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    return control;
  };
  const enter = (control: HTMLElement) => control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const blur = (control: HTMLElement) => control.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  const escape = (control: HTMLElement) => control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  it('commits trimmed title on Enter or blur and ignores unchanged text', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.titleChanged.subscribe(emitted);
    enter(titleInput(element));
    expect(emitted).not.toHaveBeenCalled();
    enter(typeTitle(element, '  Revised title  '));
    blur(typeTitle(element, '  Another title  '));
    expect(emitted.mock.calls).toEqual([[{ id: value.id, title: 'Revised title' }], [{ id: value.id, title: 'Another title' }]]);
  });

  it('refuses blank titles and Escape clears the alert and prevents blur or close', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    const closed = vi.fn();
    component.titleChanged.subscribe(emitted);
    component.closed.subscribe(closed);
    const control = typeTitle(element, '   ');
    enter(control);
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('A task title is required.');
    expect(emitted).not.toHaveBeenCalled();
    escape(control);
    blur(control);
    await fixture.whenStable();
    expect(control.value).toBe(value.title);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(emitted).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });

  it('suppresses blur after Enter but a second Enter explicitly retries', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.titleChanged.subscribe(emitted);
    const control = typeTitle(element, 'Revised title');
    enter(control);
    blur(control);
    expect(emitted).toHaveBeenCalledOnce();
    enter(control);
    expect(emitted).toHaveBeenCalledTimes(2);
  });

  it('follows an agent rename on a clean field without a stale blur write', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleChanged.subscribe(emitted);
    fixture.componentRef.setInput('task', { ...value, title: 'Agent title' });
    await fixture.whenStable();
    expect(titleInput(element).value).toBe('Agent title');
    blur(titleInput(element));
    expect(emitted).not.toHaveBeenCalled();
  });

  it('shows the pending response after Escape and the following blur emits nothing', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleChanged.subscribe(emitted);
    const control = typeTitle(element, 'Committed title');
    enter(control);
    escape(control);
    fixture.componentRef.setInput('task', { ...value, title: 'Committed title' });
    await fixture.whenStable();
    expect(control.value).toBe('Committed title');
    blur(control);
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('cleans an acknowledged commit then follows a subsequent agent rename', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleChanged.subscribe(emitted);
    const control = typeTitle(element, 'Committed title');
    control.focus();
    enter(control);
    fixture.componentRef.setInput('task', { ...value, title: 'Committed title' });
    await fixture.whenStable();
    fixture.componentRef.setInput('task', { ...value, title: 'Agent title' });
    await fixture.whenStable();
    expect(control.value).toBe('Agent title');
    enter(control);
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('preserves a dirty same-id draft and resets draft, error and last emission for a new id', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleChanged.subscribe(emitted);
    const control = typeTitle(element, 'Draft');
    enter(control);
    fixture.componentRef.setInput('task', { ...value, title: 'Agent title' });
    await fixture.whenStable();
    expect(control.value).toBe('Draft');
    enter(typeTitle(element, ' '));
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    fixture.componentRef.setInput('task', TaskSchema.parse({ ...value, id: 'task-b' }));
    await fixture.whenStable();
    expect(control.value).toBe(value.title);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    blur(typeTitle(element, 'Draft'));
    expect(emitted.mock.calls).toEqual([[{ id: value.id, title: 'Draft' }], [{ id: 'task-b', title: 'Draft' }]]);
  });

  it('prevents native Escape from closing a dirty sheet, then closes on the next Escape', async () => {
    const { component, element } = await render();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    const control = typeTitle(element, 'Unsaved draft');
    const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    control.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(component.draft()).toBe(value.title);
    expect(closed).not.toHaveBeenCalled();
    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    control.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('closes on Escape outside the title or in a clean title', async () => {
    const { component, element } = await render();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    escape(element.querySelector<HTMLElement>('[data-task-priority]')!);
    escape(titleInput(element));
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('renders as a labelled side drawer with the selected task context', async () => {
    const { element } = await render();
    const drawer = element.querySelector('[data-task-drawer]');

    expect(drawer?.getAttribute('role')).toBe('dialog');
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
