import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TaskSchema, type Task } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { TaskRow } from './task-row';

const AT = '2026-08-27T16:00:00.000Z';
const NOW = Date.parse(AT);

const task = (overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id: 'task-a',
    projectId: 'project-a',
    title: 'Write the first draft',
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const render = async (
  value: Task = task(),
  inputs: { selected?: boolean; compact?: boolean; pending?: boolean } = {},
) => {
  TestBed.configureTestingModule({ imports: [TaskRow] });
  const fixture: ComponentFixture<TaskRow> = TestBed.createComponent(TaskRow);
  fixture.componentRef.setInput('task', value);
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('selected', inputs.selected ?? false);
  fixture.componentRef.setInput('compact', inputs.compact ?? false);
  fixture.componentRef.setInput('pending', inputs.pending ?? false);
  await fixture.whenStable();
  return { fixture, component: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
};

describe('TaskRow', () => {
  it('emits completion intent immediately and disables a pending checkbox', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.completionRequested.subscribe(emitted);

    element.querySelector<HTMLInputElement>('[data-task-complete]')?.click();

    expect(emitted).toHaveBeenCalledWith(task().id);

    fixture.componentRef.setInput('pending', true);
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('[data-task-complete]')?.disabled).toBe(true);
  });

  it('commits a trimmed inline title', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleEdited.subscribe(emitted);

    element.querySelector<HTMLButtonElement>('[data-task-title]')?.click();
    await fixture.whenStable();
    const editor = element.querySelector<HTMLInputElement>('[data-task-title-editor]')!;
    expect(document.activeElement).toBe(editor);
    expect(editor.getAttribute('aria-label')).toContain('Write the first draft');
    editor.value = '  Revised title  ';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await fixture.whenStable();

    expect(emitted).toHaveBeenCalledWith({ id: task().id, title: 'Revised title' });
    expect(element.querySelector('[data-task-title-editor]')).toBeNull();
  });

  it('keeps editing and emits nothing for a blank title', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleEdited.subscribe(emitted);

    element.querySelector<HTMLButtonElement>('[data-task-title]')?.click();
    await fixture.whenStable();
    const editor = element.querySelector<HTMLInputElement>('[data-task-title-editor]')!;
    editor.value = '   ';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();

    expect(emitted).not.toHaveBeenCalled();
    expect(element.querySelector('[data-task-title-editor]')).not.toBeNull();
    expect(element.querySelector('[data-title-error]')?.textContent).toContain('required');
  });

  it('exposes the normal state only for an unmodified row', async () => {
    const { element } = await render();
    expect(element.querySelector('[data-task-row]')?.classList.contains('task-row--normal')).toBe(true);
  });

  it('exposes overdue without marking a completed past-due task overdue', async () => {
    const overdue = await render(task({ dueAt: '2026-08-20T23:59:59.999Z' }));
    expect(overdue.element.querySelector('[data-task-row]')?.classList.contains('task-row--overdue')).toBe(true);

    TestBed.resetTestingModule();
    const completed = await render(
      task({ status: 'done', completedAt: AT, dueAt: '2026-08-20T23:59:59.999Z' }),
    );
    const row = completed.element.querySelector('[data-task-row]')!;
    expect(row.classList.contains('task-row--completed')).toBe(true);
    expect(row.classList.contains('task-row--overdue')).toBe(false);
  });

  it('exposes high-priority, selected, and compact states independently', async () => {
    const { element } = await render(task({ priority: 'high' }), { selected: true, compact: true });
    const row = element.querySelector('[data-task-row]')!;

    expect(row.classList.contains('task-row--high-priority')).toBe(true);
    expect(row.classList.contains('task-row--selected')).toBe(true);
    expect(row.classList.contains('task-row--compact')).toBe(true);
  });
});
