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
    sectionId: 'section-tasks',
    title: 'Write the first draft',
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const render = async (
  value: Task = task(),
  inputs: { selected?: boolean; compact?: boolean; pending?: boolean; archiving?: boolean; readOnly?: boolean } = {},
) => {
  TestBed.configureTestingModule({ imports: [TaskRow] });
  const fixture: ComponentFixture<TaskRow> = TestBed.createComponent(TaskRow);
  fixture.componentRef.setInput('task', value);
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('selected', inputs.selected ?? false);
  fixture.componentRef.setInput('compact', inputs.compact ?? false);
  fixture.componentRef.setInput('pending', inputs.pending ?? false);
  fixture.componentRef.setInput('archiving', inputs.archiving ?? false);
  fixture.componentRef.setInput('readOnly', inputs.readOnly ?? false);
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

  it('hides every row mutation in read-only mode and ignores intent methods', async () => {
    const { fixture, component, element } = await render(task(), { readOnly: true });
    const completed = vi.fn();
    const archived = vi.fn();
    const edited = vi.fn();
    component.completionRequested.subscribe(completed);
    component.archiveRequested.subscribe(archived);
    component.titleEdited.subscribe(edited);

    expect(element.querySelector('[data-task-complete]')).toBeNull();
    expect(element.querySelector('[data-task-details]')).toBeNull();
    expect(element.querySelector('[data-task-archive]')).toBeNull();
    expect(element.querySelector('[data-task-title]')?.tagName).toBe('SPAN');

    component.requestCompletion();
    component.requestArchive();
    component.beginEditing();
    fixture.detectChanges();

    expect(completed).not.toHaveBeenCalled();
    expect(archived).not.toHaveBeenCalled();
    expect(edited).not.toHaveBeenCalled();
    expect(component.editing()).toBe(false);
    expect(element.querySelector('[data-task-title-editor]')).toBeNull();
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

  it('discards an Escape draft even when removing the editor dispatches blur', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.titleEdited.subscribe(emitted);

    element.querySelector<HTMLButtonElement>('[data-task-title]')?.click();
    await fixture.whenStable();
    const editor = element.querySelector<HTMLInputElement>('[data-task-title-editor]')!;
    editor.value = 'Discarded draft';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    editor.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await fixture.whenStable();

    expect(emitted).not.toHaveBeenCalled();
    expect(element.querySelector('[data-task-title]')?.textContent).toContain('Write the first draft');
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

  it('emits archive intent with the row’s own id', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.archiveRequested.subscribe(emitted);

    element.querySelector<HTMLButtonElement>('[data-task-archive]')?.click();

    expect(emitted).toHaveBeenCalledWith(task().id);
  });

  it('says an archive is under way and refuses a second one', async () => {
    // A row is archived once. Without the guard a double click would send two requests, and
    // the second would fail against a task the first has already archived.
    const { component, element } = await render(task(), { archiving: true });
    const emitted = vi.fn();
    component.archiveRequested.subscribe(emitted);
    const archive = element.querySelector<HTMLButtonElement>('[data-task-archive]')!;

    expect(archive.disabled).toBe(true);
    expect(archive.textContent?.trim()).toBe('Archiving…');

    archive.click();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('keeps archiving and pending from disabling each other’s control', async () => {
    // The two describe different requests in flight. A row waiting on an archive can still
    // be completed, and a row waiting on a completion can still be archived.
    const archiving = await render(task(), { archiving: true });
    expect(archiving.element.querySelector<HTMLInputElement>('[data-task-complete]')?.disabled).toBe(false);

    TestBed.resetTestingModule();
    const pending = await render(task(), { pending: true });
    expect(pending.element.querySelector<HTMLButtonElement>('[data-task-archive]')?.disabled).toBe(false);
  });

  it('exposes high-priority, selected, and compact states independently', async () => {
    const { element } = await render(task({ priority: 'high' }), { selected: true, compact: true });
    const row = element.querySelector('[data-task-row]')!;

    expect(row.classList.contains('task-row--high-priority')).toBe(true);
    expect(row.classList.contains('task-row--selected')).toBe(true);
    expect(row.classList.contains('task-row--compact')).toBe(true);
  });
});
