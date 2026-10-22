import { Router, provideRouter } from '@angular/router';
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
  TestBed.configureTestingModule({ imports: [TaskRow], providers: [provideRouter([])] });
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
  it('emits completion or reopen and resets the native box to its model', async () => {
    const { fixture, component, element } = await render();
    const completed = vi.fn();
    component.completionRequested.subscribe(completed);
    const checkbox = element.querySelector<HTMLInputElement>('[data-task-complete]')!;
    checkbox.click();
    expect(completed).toHaveBeenCalledWith(task().id);
    expect(checkbox.checked).toBe(false);
    fixture.componentRef.setInput('task', task({ status: 'done', completedAt: AT }));
    await fixture.whenStable();
    const reopened = vi.fn();
    component.reopenRequested.subscribe(reopened);
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.getAttribute('aria-label')).toBe('Reopen task Write the first draft');
    checkbox.click();
    expect(reopened).toHaveBeenCalledWith(task().id);
    expect(checkbox.checked).toBe(true);
  });

  it('keeps a pending checkbox focusable, refuses intents and resets it', async () => {
    const { component, element } = await render(task({ status: 'done', completedAt: AT }), { pending: true });
    const emitted = vi.fn();
    component.reopenRequested.subscribe(emitted);
    const checkbox = element.querySelector<HTMLInputElement>('[data-task-complete]')!;
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.getAttribute('aria-disabled')).toBe('true');
    checkbox.focus();
    checkbox.click();
    expect(document.activeElement).toBe(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(emitted).not.toHaveBeenCalled();
  });

  it('selects once from title or background and leaves nested controls alone', async () => {
    const { fixture, component, element } = await render();
    const emitted = vi.fn();
    component.selectedRequested.subscribe(emitted);
    const title = element.querySelector<HTMLButtonElement>('[data-task-title]')!;
    expect(title.getAttribute('aria-label')).toBe('Write the first draft, open details');
    title.click();
    expect(emitted).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('selected', true);
    await fixture.whenStable();
    expect(title.getAttribute('aria-current')).toBe('true');
    expect(title.hasAttribute('aria-pressed')).toBe(false);
    title.click();
    element.querySelector<HTMLElement>('.task-row__metadata')!.click();
    expect(emitted).toHaveBeenCalledTimes(3);
    element.querySelector<HTMLInputElement>('[data-task-complete]')!.click();
    element.querySelector<HTMLButtonElement>('[data-task-delete]')!.click();
    expect(emitted).toHaveBeenCalledTimes(3);
    expect(element.querySelector('[data-task-row]')?.getAttribute('data-task-id')).toBe(task().id);
  });

  it('ignores moved mouse or pen gestures, allows touch slop and keyboard activation', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.selectedRequested.subscribe(emitted);
    const title = element.querySelector<HTMLElement>('[data-task-title]')!;
    const down = (pointerType: string) => {
      const event = new Event('pointerdown', { bubbles: true });
      Object.defineProperties(event, { pointerType: { value: pointerType }, clientX: { value: 10 }, clientY: { value: 10 } });
      title.dispatchEvent(event);
    };
    down('mouse');
    title.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 16, clientY: 10 }));
    down('pen');
    element.querySelector<HTMLElement>('.task-row__metadata')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 10, clientY: 16 }));
    expect(emitted).not.toHaveBeenCalled();
    down('touch');
    title.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 16, clientY: 10 }));
    expect(emitted).toHaveBeenCalledOnce();
    down('mouse');
    title.click(); // Native keyboard activation has detail 0, regardless of old pointer data.
    expect(emitted).toHaveBeenCalledTimes(2);
  });

  it('ignores a gesture-created text selection but permits a selection left beforehand', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.selectedRequested.subscribe(emitted);
    const background = element.querySelector<HTMLElement>('.task-row__metadata')!;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    background.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const range = document.createRange();
    range.selectNodeContents(background);
    selection.addRange(range);
    background.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(emitted).not.toHaveBeenCalled();
    background.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    background.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    element.querySelector<HTMLElement>('[data-task-title]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(emitted).toHaveBeenCalledTimes(2);
    selection.removeAllRanges();
  });

  it('removes Details and inline title editing', async () => {
    const { element } = await render();
    element.querySelector<HTMLButtonElement>('[data-task-title]')!.click();
    expect(element.querySelector('[data-task-details]')).toBeNull();
    expect(element.querySelector('[data-task-title-editor]')).toBeNull();
  });

  it('recognizes a new row text selection even when a selection previously existed elsewhere', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.selectedRequested.subscribe(emitted);
    const selection = window.getSelection()!;
    const outside = document.createElement('span');
    outside.textContent = 'Outside selection';
    document.body.append(outside);
    const previous = document.createRange();
    previous.selectNodeContents(outside);
    selection.removeAllRanges();
    selection.addRange(previous);
    const background = element.querySelector<HTMLElement>('.task-row__metadata')!;
    background.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const range = document.createRange();
    range.selectNodeContents(background);
    selection.removeAllRanges();
    selection.addRange(range);
    background.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(emitted).not.toHaveBeenCalled();
    selection.removeAllRanges();
    outside.remove();
  });

  it('keeps cancelled-task completion available in a Task List', async () => {
    const { component, element } = await render(task({ status: 'cancelled' }));
    const emitted = vi.fn();
    component.completionRequested.subscribe(emitted);
    const checkbox = element.querySelector<HTMLInputElement>('[data-task-complete]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    expect(emitted).toHaveBeenCalledWith(task().id);
    expect(checkbox.checked).toBe(false);
  });

  it('keeps read-only rows free of mutation and selection', async () => {
    const { component, element } = await render(task(), { readOnly: true });
    const selected = vi.fn();
    const deleted = vi.fn();
    component.selectedRequested.subscribe(selected);
    component.deleteRequested.subscribe(deleted);
    expect(element.querySelector('[data-task-complete]')).toBeNull();
    expect(element.querySelector('[data-task-delete]')).toBeNull();
    expect(element.querySelector('[data-task-title]')?.tagName).toBe('SPAN');
    element.querySelector<HTMLElement>('[data-task-row]')!.click();
    component.requestDelete();
    expect(selected).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
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

  it('offers an icon-only Delete button and emits the row’s own id', async () => {
    const { component, element } = await render();
    const emitted = vi.fn();
    component.deleteRequested.subscribe(emitted);

    const remove = element.querySelector<HTMLButtonElement>('[data-task-delete]')!;
    expect(remove.getAttribute('aria-label')).toBe('Delete task Write the first draft');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.textContent?.trim()).toBe('');
    remove.click();

    expect(emitted).toHaveBeenCalledWith(task().id);
  });

  it('keeps Delete focusable but unavailable while its archive write is under way', async () => {
    // A row is archived once. Without the guard a double click would send two requests, and
    // the second would fail against a task the first has already archived. Slice 75's pending
    // vocabulary: aria-disabled, never disabled, so keyboard focus stays on the control.
    const { component, element } = await render(task(), { archiving: true });
    const emitted = vi.fn();
    component.deleteRequested.subscribe(emitted);
    const remove = element.querySelector<HTMLButtonElement>('[data-task-delete]')!;

    expect(remove.disabled).toBe(false);
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(element.querySelector('[data-task-row]')?.getAttribute('aria-busy')).toBe('true');

    remove.click();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('keeps archiving and pending from disabling each other’s control', async () => {
    // The two describe different requests in flight. A row waiting on an archive can still
    // be completed, and a row waiting on a completion can still be archived.
    const archiving = await render(task(), { archiving: true });
    expect(archiving.element.querySelector<HTMLInputElement>('[data-task-complete]')?.disabled).toBe(false);

    TestBed.resetTestingModule();
    const pending = await render(task(), { pending: true });
    expect(pending.element.querySelector<HTMLButtonElement>('[data-task-delete]')?.disabled).toBe(false);
    expect(pending.element.querySelector('[data-task-delete]')?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('shows a failed write on the row and links it to the checkbox', async () => {
    const { fixture, element } = await render();
    expect(element.querySelector('[data-task-error]')).toBeNull();
    expect(element.querySelector('[data-task-complete]')?.hasAttribute('aria-describedby')).toBe(false);

    fixture.componentRef.setInput('error', 'Couldn’t complete “Write the first draft”. Try again. Offline');
    await fixture.whenStable();
    const message = element.querySelector<HTMLElement>('[data-task-error]')!;
    expect(message.getAttribute('role')).toBe('alert');
    expect(message.textContent).toContain('Couldn’t complete “Write the first draft”. Try again.');
    expect(message.id).not.toBe('');
    expect(element.querySelector('[data-task-complete]')?.getAttribute('aria-describedby')).toBe(message.id);
    expect(element.querySelector('[data-task-row]')?.classList.contains('task-row--failed')).toBe(true);
  });

  it('keeps a read-only row free of a write error', async () => {
    const { fixture, element } = await render(task(), { readOnly: true });
    fixture.componentRef.setInput('error', 'Ignored');
    await fixture.whenStable();
    expect(element.querySelector('[data-task-error]')).toBeNull();
  });

  it('exposes high-priority, selected, and compact states independently', async () => {
    const { element } = await render(task({ priority: 'high' }), { selected: true, compact: true });
    const row = element.querySelector('[data-task-row]')!;

    expect(row.classList.contains('task-row--high-priority')).toBe(true);
    expect(row.classList.contains('task-row--selected')).toBe(true);
    expect(row.classList.contains('task-row--compact')).toBe(true);
  });
});


it('links a read-only projection to its owner without selecting (§34, slice 77)', async () => {
 const {fixture,component,element}=await render(task(),{readOnly:true});
 fixture.componentRef.setInput('link',{route:['/projects','project-a'],fragment:'section-section-tasks'});
 await fixture.whenStable();
 vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
 const selected=vi.fn(); component.selectedRequested.subscribe(selected);
 const title=element.querySelector<HTMLAnchorElement>('a[data-task-title]')!;
 expect(title).not.toBeNull();
 expect(title.getAttribute('href')).toBe('/projects/project-a#section-section-tasks');
 title.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 title.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 element.querySelector<HTMLElement>('[data-task-row]')!.click();
 expect(selected).not.toHaveBeenCalled();
 expect(element.querySelector('[data-task-complete]')).toBeNull();
 expect(element.querySelector('[data-task-delete]')).toBeNull();
});
