import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RECEIPT_UNDO } from '../../../../core/history/receipt-undo';
import { ToastSlot } from '../../../../shared/feedback/toast-slot';
import { nameOf, OperationReceiptSchema, ProjectSectionSchema, TaskSchema, type ProjectSection, type Task, type TaskAddResult, type TaskId, type TaskWriteResult } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { TaskListStore } from '../../../tasks/task-list-store';
import { TaskListSection } from './task-list-section';
import { PinnedFailureDirective } from '../../../../shared/feedback/pinned-failure.directive';
import { PIN_CLEARANCE_ATTRIBUTE } from '../../../../shared/feedback/pinned-failure-slot';
import { LiftStack } from '../../../../shared/lifts/lift-stack';

const AT = '2026-08-27T16:00:00.000Z';
const nativeMethods = [
  [HTMLElement.prototype, 'showPopover'],
  [HTMLElement.prototype, 'hidePopover'],
  [HTMLDialogElement.prototype, 'showModal'],
  [HTMLDialogElement.prototype, 'close'],
] as const;
const nativeDescriptors = nativeMethods.map(([prototype, name]) => Object.getOwnPropertyDescriptor(prototype, name));

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  TestBed.resetTestingModule();
  nativeMethods.forEach(([prototype, name], index) => {
    const descriptor = nativeDescriptors[index];
    if (descriptor) Object.defineProperty(prototype, name, descriptor);
    else Reflect.deleteProperty(prototype, name);
  });
  vi.unstubAllGlobals();
});

const section = (): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-tasks',
    projectId: 'project-a',
    pageId: 'page-project-a',
    type: 'task-list',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
  });

const task = (id: string, projectId = 'project-a', sectionId = 'section-tasks'): Task =>
  TaskSchema.parse({
    id,
    projectId,
    sectionId,
    title: `Task ${id}`,
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
  });

const render = async (
  gateway = new FakeWorkManagerGateway({ tasks: [task('task-1'), task('task-2')] }),
  readOnly = false,
) => {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const onProjectDataChange = vi.fn();
  const fixture = TestBed.createComponent(TaskListSection);
  fixture.componentRef.setInput('section', section());
  fixture.componentRef.setInput('onConfigChange', vi.fn());
  fixture.componentRef.setInput('onProjectDataChange', onProjectDataChange);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  // The section provides its own store now — a container owns its rows, so it loads them.
  const store = fixture.debugElement.injector.get(TaskListStore);
  return { fixture, store, gateway, onProjectDataChange };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('TaskListSection (§30, §66)', () => {
  it('keeps its pending Undo toast when a live refresh returns the deleted task first', async () => {
    let resolveUndo!: (value: { tone: 'status'; message: string }) => void;
    const undo = vi.fn(() => new Promise<{ tone: 'status'; message: string }>(resolve => { resolveUndo = resolve; }));
    TestBed.configureTestingModule({ providers: [{ provide: RECEIPT_UNDO, useValue: {
      offer: () => 'ready', undo, writeSequence: signal(0), generation: signal(0),
    } }] });
    const { fixture, store, gateway } = await render();
    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    const action = query(fixture, '[data-toast-undo]')!;
    action.focus();
    const pending = fixture.componentInstance.undoDelete();
    gateway.tasks.list = async () => [task('task-1'), task('task-2')];
    await store.refresh();
    fixture.detectChanges();
    expect(fixture.componentInstance.toast.pendingUndo()).toBe(true);
    expect(fixture.componentInstance.toast.state()?.message).toBe('Archived “Task task-1”.');
    resolveUndo({ tone: 'status', message: 'Undone: Archived “Task task-1”.' });
    await pending;
    await fixture.whenStable();
    expect(fixture.componentInstance.toast.state()?.message).toBe('Undone: Archived “Task task-1”.');
    expect(document.activeElement).toBe(query(fixture, '[data-toast-dismiss]'));
  });

  it('offers one receipt Undo for a descendant-owned task and lands lost Delete focus on it', async () => {
    const undo = vi.fn(async () => ({ tone: 'status' as const, message: 'Undone: Archived “Task task-1”.' }));
    TestBed.configureTestingModule({ providers: [{ provide: RECEIPT_UNDO, useValue: {
      offer: () => 'ready', undo, writeSequence: signal(0), generation: signal(0),
    } }] });
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1', 'project-child')] });
    const { fixture } = await render(gateway);
    const announcement = query(fixture, '[role=status]');
    expect(announcement?.textContent).toBe('');
    const claim = vi.spyOn(TestBed.inject(ToastSlot), 'claim');
    const remove = query(fixture, '[data-task-delete]')!;
    remove.focus(); remove.click();
    await fixture.whenStable();
    const action = query(fixture, '[data-toast-undo]')!;
    expect(document.activeElement).toBe(action);
    expect(query(fixture, '[data-toast-open]')?.textContent).toContain('Archived “Task task-1”.');
    expect(claim).toHaveBeenCalledOnce();
    expect(query(fixture, '[role=status]')).toBe(announcement);
    action.click();
    await fixture.whenStable();
    expect(undo).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-child', feedback: 'own' }));
    expect(document.activeElement).toBe(query(fixture, '[data-toast-dismiss]'));
    query(fixture, '[data-toast-dismiss]')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(query(fixture, '[data-quick-task-title]'));
  });

  it('lands row Delete focus on the toast when a live refresh closes the deleted task’s drawer first', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    let release!: () => void;
    const original = gateway.tasks.archive;
    gateway.tasks.archive = (id) => new Promise((resolve) => { release = () => { void original(id).then(resolve); }; });
    const { fixture, store } = await render(gateway);
    query(fixture, 'button[data-task-title]')!.click();
    await fixture.whenStable();
    expect(query(fixture, '[data-task-drawer]')).not.toBeNull();
    const reads: Array<() => void> = [];
    gateway.tasks.list = () => new Promise((resolve) => reads.push(() => resolve([])));
    const remove = query(fixture, '[data-task-delete]') as HTMLButtonElement;
    remove.focus(); remove.click();
    fixture.detectChanges();
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(store.selectedTaskId()).toBe('task-1');
    // Focus can still be lost to the body while Delete waits (here, simulated).
    const stand = document.body.appendChild(document.createElement('input'));
    stand.focus(); stand.remove();
    expect(document.activeElement).toBe(document.body);
    // The live event of the same write asks for a re-read; the store coalesces it until the
    // write settles, so it is answered, and rendered, before Delete's own re-read.
    await store.refresh();
    release();
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    reads[0]!();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.autoDetectChanges();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.selectedTaskId()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve));
    reads[1]!();
    await fixture.whenStable();
    expect(document.activeElement?.closest('[data-toast]')).not.toBeNull();
  });

  it('keeps focus moved elsewhere while Delete is pending', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    let release!: () => void;
    const original = gateway.tasks.archive;
    gateway.tasks.archive = (id) => new Promise((resolve) => { release = () => { void original(id).then(resolve); }; });
    const { fixture } = await render(gateway);
    const remove = query(fixture, '[data-task-delete]')!;
    remove.focus(); remove.click();
    const input = query(fixture, '[data-quick-task-title]')!;
    input.focus();
    release();
    await fixture.whenStable();
    expect(query(fixture, '[data-toast-open]')).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('does not reclaim feedback after the section was destroyed during Delete', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    let release!: () => void;
    const original = gateway.tasks.archive;
    gateway.tasks.archive = (id) => new Promise((resolve) => { release = () => { void original(id).then(resolve); }; });
    const { fixture } = await render(gateway);
    const claim = vi.spyOn(TestBed.inject(ToastSlot), 'claim');
    const write = fixture.componentInstance.archive('task-1' as TaskId);
    fixture.destroy();
    release();
    await write;
    expect(claim).not.toHaveBeenCalled();
  });
  it('opens a modal sheet on narrow screens and closes with title focus at a breakpoint change', async () => {
    let changed!: (event: { matches: boolean }) => void;
    const removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: (_type: string, listener: typeof changed) => { changed = listener; },
      removeEventListener,
    })));
    const { fixture, store } = await render();
    const title = query(fixture, 'button[data-task-title]')!;
    title.click();
    await fixture.whenStable();
    expect(query(fixture, 'dialog.lift--sheet')?.getAttribute('aria-modal')).toBe('true');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    changed({ matches: false });
    await fixture.whenStable();
    expect(store.selectedTaskId()).toBeNull();
    expect(document.activeElement).toBe(title);
    fixture.destroy();
    expect(removeEventListener).toHaveBeenCalledWith('change', changed);
  });
  it('focuses the drawer heading after a title selection and has no drawer column', async () => {
    const { fixture } = await render();
    query(fixture, 'button[data-task-title]')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(query(fixture, '[data-task-drawer] h2'));
    expect(query(fixture, '.task-workspace--drawer-open')).toBeNull();
    expect(query(fixture, '[data-task-drawer]')?.getAttribute('popover')).toBe('manual');
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();
  });

  it('clears selection on a lift-stack close and reopens the same row', async () => {
    const { fixture, store } = await render();
    const title = query(fixture, 'button[data-task-title]')!;
    title.click();
    await fixture.whenStable();
    TestBed.inject(LiftStack).open(vi.fn());
    await fixture.whenStable();
    expect(store.selectedTaskId()).toBeNull();
    title.click();
    await fixture.whenStable();
    expect(query(fixture, '[data-task-drawer]')).not.toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-task-drawer] h2'));
  });

  it('hands focus to quick-create when the selected task vanishes during refresh', async () => {
    const { fixture, store, gateway } = await render();
    query(fixture, 'button[data-task-title]')!.click();
    await fixture.whenStable();
    query(fixture, '[data-task-drawer-title]')!.focus();
    gateway.tasks.list = async () => [];
    await store.refresh();
    await fixture.whenStable();
    expect(store.selectedTaskId()).toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-quick-task-title]'));
  });

  it('leaves focus on the next lift after its stack closes the drawer', async () => {
    const { fixture, store } = await render();
    query(fixture, 'button[data-task-title]')!.click();
    await fixture.whenStable();
    const nextItem = document.createElement('button');
    fixture.nativeElement.append(nextItem);
    TestBed.inject(LiftStack).open(vi.fn());
    nextItem.focus();
    await fixture.whenStable();
    expect(store.selectedTaskId()).toBeNull();
    expect(document.activeElement).toBe(nextItem);
  });
  it('reopens through the row, resets its checkbox and tells the page only after success', async () => {
    const completed = { ...task('task-1'), status: 'done' as const, completedAt: AT };
    const gateway = new FakeWorkManagerGateway({ tasks: [completed] });
    gateway.tasks.update = vi.fn(async () => ({ task: task('task-1'), operation: null }));
    const { fixture, onProjectDataChange } = await render(gateway);
    const box = query(fixture, '[data-task-complete]') as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(gateway.tasks.update).toHaveBeenCalledWith('task-1', { status: 'todo' });
    expect(box.checked).toBe(false);
    expect(onProjectDataChange).toHaveBeenCalledOnce();
  });

  it('does not notify the page for a refused reopen or a completion answered in another section', async () => {
    const { fixture, store, onProjectDataChange } = await render();
    vi.spyOn(store, 'reopen').mockResolvedValue(false);
    await fixture.componentInstance.reopen('task-1' as TaskId);
    expect(onProjectDataChange).not.toHaveBeenCalled();
    let release!: (applied: boolean) => void;
    vi.spyOn(store, 'complete').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const completion = fixture.componentInstance.complete('task-1' as TaskId);
    fixture.componentRef.setInput('section', { ...section(), id: 'section-other' });
    fixture.detectChanges();
    release(true);
    await completion;
    expect(onProjectDataChange).not.toHaveBeenCalled();
  });

  it('does not notify the page for a reopen answered after the section changes', async () => {
    const { fixture, store, onProjectDataChange } = await render();
    let release!: (applied: boolean) => void;
    vi.spyOn(store, 'reopen').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const reopening = fixture.componentInstance.reopen('task-1' as TaskId);
    fixture.componentRef.setInput('section', { ...section(), id: 'section-other' });
    fixture.detectChanges();
    release(true);
    await reopening;
    expect(onProjectDataChange).not.toHaveBeenCalled();
  });

  it('selects by title, edits through the drawer and returns Close focus to the title', async () => {
    const { fixture, gateway } = await render();
    const title = query(fixture, 'button[data-task-title]') as HTMLButtonElement;
    title.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const editor = query(fixture, '[data-task-drawer-title]') as HTMLInputElement;
    editor.value = 'Renamed task';
    editor.dispatchEvent(new Event('input'));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(gateway.argumentTo('tasks.update')).toEqual({ id: 'task-1', input: { title: 'Renamed task' } });
    const close = query(fixture, '[data-close-drawer]') as HTMLButtonElement;
    close.focus();
    close.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-task-drawer]')).toBeNull();
    expect(document.activeElement).toBe(title);
  });

  it('returns drawer Close focus to quick-create when the selected row has gone', async () => {
    const { fixture, store } = await render();
    store.selectTask('task-1' as TaskId);
    fixture.detectChanges();
    const close = query(fixture, '[data-close-drawer]') as HTMLButtonElement;
    close.focus();
    fixture.componentInstance.closeDrawer();
    vi.spyOn(store, 'tasks').mockReturnValue([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).toBe(query(fixture, '[data-quick-task-title]'));
  });

  it('keeps a refused title draft and explicit Enter retries it without a duplicate blur write', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    let reject!: (error: unknown) => void;
    gateway.tasks.update = vi.fn(() => new Promise<TaskWriteResult>((_, refuse) => { reject = refuse; }));
    const { fixture } = await render(gateway);
    query(fixture, 'button[data-task-title]')!.click();
    fixture.detectChanges();
    const editor = query(fixture, '[data-task-drawer-title]') as HTMLInputElement;
    editor.value = 'Retain this draft';
    editor.dispatchEvent(new Event('input'));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    fixture.detectChanges();
    // Optimistic (Slice 75): the drawer and the row agree on the new title while it saves.
    expect(query(fixture, '[data-task-drawer] h2')?.textContent).toBe('Retain this draft');
    reject(new GatewayError('conflict', 409, 'Title refused'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(editor.value).toBe('Retain this draft');
    expect(query(fixture, '[data-task-drawer] h2')?.textContent).toBe('Task task-1');
    expect(query(fixture, '[data-field-status="title"]')?.textContent?.trim()).toBe('Not saved. Try again.');
    expect(query(fixture, '[data-field-details="title"]')?.textContent).toContain('Title refused');
    expect(query(fixture, '[data-tasks-error]')).toBeNull();
    editor.dispatchEvent(new FocusEvent('blur'));
    expect(gateway.tasks.update).toHaveBeenCalledOnce();
    gateway.tasks.update = vi.fn(async () => ({ task: { ...task('task-1'), title: 'Retain this draft' }, operation: null }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(gateway.tasks.update).toHaveBeenCalledOnce();
    expect(query(fixture, '[data-task-drawer] h2')?.textContent).toBe('Retain this draft');
  });

  it('asks the gateway for only its own container’s tasks', async () => {
    const { gateway } = await render();

    expect(gateway.argumentTo('tasks.list')).toEqual({ sectionId: section().id, includeArchived: false });
  });

  it('renders Slice 7’s task rows rather than a second implementation of them', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelectorAll('[data-task-row]')).toHaveLength(2);
    expect(query(fixture, '[data-task-complete]')).not.toBeNull();
  });

  it('renders source rows read-only with no form, drawer, or task drop list', async () => {
    const { fixture, gateway } = await render(undefined, true);

    expect(fixture.nativeElement.querySelectorAll('[data-task-row]')).toHaveLength(2);
    expect(query(fixture, '[data-quick-create]')).toBeNull();
    expect(query(fixture, '[data-task-complete]')).toBeNull();
    expect(query(fixture, '[data-task-details]')).toBeNull();
    expect(query(fixture, '[data-task-delete]')).toBeNull();
    expect(query(fixture, '[data-task-title-editor]')).toBeNull();
    expect(query(fixture, '#task-list-section-tasks')).toBeNull();

    await fixture.componentInstance.complete('task-1' as TaskId);
    await fixture.componentInstance.archive('task-1' as TaskId);
    expect(gateway.calls.filter(({ method }) => method === 'tasks.complete' || method === 'tasks.archive')).toHaveLength(0);
  });

  it('quick-creates into the section’s project through the injected store', async () => {
    const { fixture, gateway } = await render();

    const input = query(fixture, '[data-quick-task-title]') as HTMLInputElement;
    input.value = 'Draft the release note';
    query(fixture, '[data-quick-create]')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    // The container is named: this list owns the row, and leaving it to the domain would
    // resolve to the project's *first* task list, which need not be this one.
    expect(gateway.argumentTo('tasks.create')).toEqual({
      projectId: 'project-a',
      sectionId: section().id,
      title: 'Draft the release note',
    });
  });

  it('completes a task through the store, not through a gateway of its own', async () => {
    const { fixture, gateway } = await render();

    query(fixture, '[data-task-complete]')!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(gateway.argumentTo('tasks.complete')).toBe('task-1');
  });

  it('says so when its container holds no tasks yet', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({ tasks: [] }));

    expect(query(fixture, '[data-tasks-empty]')).not.toBeNull();
  });

  it('archives a task through the store, so row, section and store are one path', async () => {
    const { fixture, store, gateway } = await render();
    const archive = vi.spyOn(store, 'archive');

    const firstDelete = query(fixture, '[data-task-delete]') as HTMLButtonElement;
    firstDelete.focus();
    firstDelete.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(archive).toHaveBeenCalledWith('task-1');
    expect(gateway.argumentTo('tasks.archive')).toBe('task-1');
    expect(document.activeElement).toBe(query(fixture, '[data-toast-open-archive]'));
  });

  it('announces a committed Delete outside the rows, including the final completed row', async () => {
    const completed = { ...task('task-1'), status: 'done' as const, completedAt: AT };
    const gateway = new FakeWorkManagerGateway({ tasks: [completed] });
    let release!: () => void;
    const original = gateway.tasks.archive;
    gateway.tasks.archive = (id) => new Promise((resolve, reject) => {
      release = () => {
        gateway.tasks.list = async () => [];
        original(id).then(resolve, reject);
      };
    });
    const { fixture } = await render(gateway);

    query(fixture, '[data-task-delete]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-toast-open]')).toBeNull();
    release();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-task-row]')).toBeNull();
    const cue = query(fixture, '[data-toast-open]');
    expect(query(fixture, '[role=status]')?.textContent).toContain('Archived');
    expect(cue?.textContent).toContain('Task task-1');
    expect(cue?.textContent).toContain('Archived');
    expect(cue?.textContent).toContain('Open archive');
    expect(cue?.textContent).not.toContain('header');
  });

  it('clears committed feedback on another Delete attempt and never announces refusal', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1'), task('task-2')] });
    const { fixture } = await render(gateway);
    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    expect(query(fixture, '[data-toast-open]')).not.toBeNull();

    gateway.tasks.archive = async () => { throw new GatewayError('permission_denied', 403, 'No task grant'); };
    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-toast-open]')).toBeNull();
    expect(query(fixture, '[data-task-error]')?.textContent).toContain('No task grant');
  });

  it('keeps a committed cue when the follow-up read fails', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const { fixture } = await render(gateway);
    gateway.tasks.list = async () => { throw new GatewayError('unreachable', 0, 'Read failed'); };

    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-toast-open]')?.textContent).toContain('Archived');
    // Quiet reconciliation leaves the old row until a later live read; the archive verdict
    // still comes from the committed write, and must not be recast as a failed Delete.
    expect(query(fixture, '[data-tasks-error]')).toBeNull();
  });

  it('withdraws the archive cue when a fresh list contains the restored task', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const { fixture, store } = await render(gateway);
    gateway.tasks.list = async () => [];
    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    expect(query(fixture, '[data-toast-open]')).not.toBeNull();

    gateway.tasks.list = async () => [task('task-1')];
    await store.refresh();
    fixture.detectChanges();
    expect(query(fixture, '[data-toast-open]')).toBeNull();
  });

  it('does not announce a transport refusal or a late commit from another section', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const { fixture } = await render(gateway);
    gateway.tasks.archive = async () => { throw new GatewayError('unreachable', 0, 'Offline'); };
    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    expect(query(fixture, '[data-toast-open]')).toBeNull();

    let release!: () => void;
    gateway.tasks.archive = () => new Promise((resolve) => {
      release = () => resolve({ task: task('task-1'), operation: null });
    });
    query(fixture, '[data-task-delete]')!.click();
    fixture.componentRef.setInput('section', { ...section(), id: 'section-other' });
    fixture.detectChanges();
    release();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-toast-open]')).toBeNull();
  });

  it('tells the page a successful archive happened, so projections can refresh', async () => {
    const { fixture, onProjectDataChange } = await render();

    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();

    expect(onProjectDataChange).toHaveBeenCalled();
  });

  it('leaves the page alone when the archive fails, because nothing moved', async () => {
    const { fixture, onProjectDataChange } = await render(
      new FakeWorkManagerGateway({
        tasks: [task('task-1')],
        failOn: { 'tasks.archive': new GatewayError('unreachable', 0, 'offline') },
      }),
    );

    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();

    expect(onProjectDataChange).not.toHaveBeenCalled();
    expect(query(fixture, '[data-task-error]')?.textContent).toContain('offline');
  });

  it('marks the row’s archive control unavailable while the store reports the write in flight', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    let settle = (): void => undefined;
    gateway.tasks.archive = () => new Promise((resolve) => (settle = () => resolve({ task: task('task-1'), operation: null })));
    const { fixture, store } = await render(gateway);

    query(fixture, '[data-task-delete]')!.click();
    fixture.detectChanges();

    // The row cannot paint the outcome itself, so the only honest feedback it can give while
    // the write is out is to refuse a second one.
    expect(store.archivingIds().has('task-1' as TaskId)).toBe(true);
    expect(query(fixture, '[data-task-delete]')?.getAttribute('aria-disabled')).toBe('true');

    settle();
    await fixture.whenStable();
  });

  it('renders only what its own container owns, so two lists differ', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({ tasks: [task('task-1'), task('task-elsewhere', 'project-a', 'section-other')] }),
    );

    expect(fixture.nativeElement.textContent).toContain('Task task-1');
    expect(fixture.nativeElement.textContent).not.toContain('Task task-elsewhere');
  });
});

describe('TaskListSection — the per-row Archive control (§34)', () => {
  it('carries a row’s archive intent through to the store', async () => {
    // The row, the wrapper and the store are three separate pieces; this is the only place
    // that proves they are actually wired to each other.
    const { fixture, store } = await render();
    const archive = vi.spyOn(store, 'archive');

    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();

    expect(archive).toHaveBeenCalledWith('task-1');
  });

  it('tells the page after a successful archive', async () => {
    // The row moves out of this live list; the shell callback lets the owner refresh its
    // projections without coupling this section to the root Archive store.
    const { fixture, onProjectDataChange } = await render();

    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();

    expect(onProjectDataChange).toHaveBeenCalled();
  });

  it('says nothing to the page when the archive fails, and keeps the row', async () => {
    const { fixture, onProjectDataChange } = await render(
      new FakeWorkManagerGateway({
        tasks: [task('task-1')],
        failOn: { 'tasks.archive': new GatewayError('rule_violation', 409, 'nope') },
      }),
    );

    query(fixture, '[data-task-delete]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(onProjectDataChange).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('[data-task-row]')).toHaveLength(1);
    expect(query(fixture, '[data-task-error]')?.textContent).toContain('Couldn’t delete');
    expect(query(fixture, '[data-tasks-error]')).toBeNull();
  });

  it('marks only the row whose Delete archive is in flight', async () => {
    // Driven through a real pending write rather than a stubbed signal: the disabled state
    // has to survive the store's own change propagation, which is the part that can break.
    let release!: () => void;
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1'), task('task-2')] });
    const archive = vi
      .spyOn(gateway.tasks, 'archive')
      .mockReturnValue(new Promise((resolve) => (release = () => resolve({ task: task('task-1'), operation: null }))));
    const { fixture } = await render(gateway);

    query(fixture, '[data-task-delete]')!.click();
    fixture.detectChanges();

    const controls = [...fixture.nativeElement.querySelectorAll('[data-task-delete]')] as HTMLButtonElement[];
    expect(controls.map((control) => control.getAttribute('aria-disabled'))).toEqual(['true', null]);
    expect(controls[0]!.getAttribute('aria-label')).toBe('Delete task ' + task('task-1').title);

    release();
    await fixture.whenStable();
    archive.mockRestore();
  });
});

describe('TaskListSection quick-add feedback (Slice 75, §34, §63)', () => {
  const submit = (fixture: Awaited<ReturnType<typeof render>>['fixture'], title: string): HTMLInputElement => {
    const input = query(fixture, '[data-quick-task-title]') as HTMLInputElement;
    input.focus();
    input.value = title;
    query(fixture, '[data-quick-create]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    return input;
  };
  const held = (gateway: FakeWorkManagerGateway) => {
    let answer!: (value: TaskAddResult) => void;
    let refuse!: (error: unknown) => void;
    const create = vi.fn(() => new Promise<TaskAddResult>((yes, no) => {
      answer = yes;
      refuse = no;
    }));
    gateway.tasks.create = create as unknown as typeof gateway.tasks.create;
    return { create, answer: (value: TaskAddResult) => answer(value), refuse: (error: unknown) => refuse(error) };
  };
  const added = (id: string, title: string): TaskAddResult => ({
    task: { ...task(id), title },
    operation: OperationReceiptSchema.parse({
      historyId: 'history-a', actionId: `action-${id}`, revision: 1, operation: 'task.add', label: 'Added',
      createdAt: AT, expiresAt: '2026-08-28T16:00:00.000Z',
    }),
  });

  it('paints a pending row at once, clears and keeps focus in the field, and marks Add task busy', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const pending = held(gateway);
    const { fixture } = await render(gateway);

    const input = submit(fixture, 'Order tiles');
    expect(query(fixture, '[data-task-pending]')?.textContent).toContain('Order tiles');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    const button = query(fixture, '[data-quick-create] button[type="submit"]')!;
    expect(button.textContent?.trim()).toBe('Adding…');
    expect(button.getAttribute('aria-disabled')).toBe('true');

    pending.answer(added('task-new', 'Order tiles'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-task-pending]')).toBeNull();
    expect(query(fixture, '[data-task-id="task-new"]')).not.toBeNull();
    expect(query(fixture, '[data-quick-create-status]')?.textContent?.trim()).toBe('Added “Order tiles”.');
    expect(button.textContent?.trim()).toBe('Add task');
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('keeps a second draft in the field while the first add is pending', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const pending = held(gateway);
    const { fixture } = await render(gateway);

    submit(fixture, 'Order tiles');
    const input = submit(fixture, 'Second');
    expect(input.value).toBe('Second');
    expect(pending.create).toHaveBeenCalledTimes(1);
    pending.answer(added('task-new', 'Order tiles'));
    await fixture.whenStable();
  });

  it('replaces the empty state with the pending row, outside the drag list', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [] });
    const pending = held(gateway);
    const { fixture } = await render(gateway);
    expect(query(fixture, '[data-tasks-empty]')).not.toBeNull();

    submit(fixture, 'Order tiles');
    expect(query(fixture, '[data-tasks-empty]')).toBeNull();
    const row = query(fixture, '[data-task-pending]')!;
    expect(row.closest('[cdkdrag], .cdk-drag')).toBeNull();
    pending.answer(added('task-new', 'Order tiles'));
    await fixture.whenStable();
  });

  it('returns a failed title to an empty field and names it beside the form', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const pending = held(gateway);
    const { fixture } = await render(gateway);

    const input = submit(fixture, 'Order tiles');
    pending.refuse(new GatewayError('unreachable', 0, 'offline'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe('Order tiles');
    const message = query(fixture, '[data-quick-create-error] [data-failure-sentence]')!;
    expect(message.textContent?.trim()).toBe('Couldn’t add “Order tiles”. Try again.');
    expect(message.getAttribute('role')).toBe('alert');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
    // The reason is a closed Details beside the described sentence (Slice 78).
    expect(query(fixture, '[data-quick-create-error] details')?.textContent).toContain('offline');
    expect(message.textContent).not.toContain('offline');
    expect(query(fixture, '[data-tasks-error]')).toBeNull();
  });

  it('never overwrites a draft typed while the failed add was pending', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const pending = held(gateway);
    const { fixture } = await render(gateway);

    const input = submit(fixture, 'Order tiles');
    input.value = 'Something newer';
    pending.refuse(new GatewayError('unreachable', 0, 'offline'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe('Something newer');
    expect(query(fixture, '[data-quick-create-error]')?.textContent).toContain('Order tiles');
  });

  it('refuses an empty title on the field, sends nothing, and clears the message on typing', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const pending = held(gateway);
    const { fixture } = await render(gateway);

    const input = submit(fixture, '   ');
    fixture.detectChanges();
    expect(pending.create).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(query(fixture, '[data-quick-create-error] [data-failure-sentence]')?.textContent?.trim()).toBe('Enter a task title.');
    expect(query(fixture, '[data-quick-create-error] details')).toBeNull();
    expect(document.activeElement).toBe(input);

    input.value = 'O';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(query(fixture, '[data-quick-create-error]')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows a failed read in the banner with Try again, never the empty sentence, and keeps quick-add enabled (Slice 78)', async () => {
    const options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = {
      tasks: [],
      failOn: { 'tasks.list': new GatewayError('unreachable', 0, 'host down') },
    };
    const gateway = new FakeWorkManagerGateway(options);
    const { fixture } = await render(gateway);

    expect(query(fixture, '[data-tasks-error] [data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t reach your workspace, so this task list didn’t load.');
    expect(query(fixture, '[data-tasks-error] details')?.textContent).toContain('host down');
    expect(query(fixture, '[data-tasks-empty]')).toBeNull();
    expect(query(fixture, '[data-quick-task-title]')?.hasAttribute('disabled')).toBe(false);
    expect(query(fixture, '[data-quick-create] button[type="submit"]')?.getAttribute('aria-disabled')).toBeNull();

    options.failOn = {};
    query(fixture, '[data-tasks-error] [data-recovery="try-again"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-tasks-error]')).toBeNull();
    expect(query(fixture, '[data-tasks-empty]')).not.toBeNull();
  });

  it('shows a drag-receive failure in the banner with no Try again, beside an intact list (§34)', async () => {
    const { fixture, store } = await render(new FakeWorkManagerGateway({
      tasks: [task('task-1'), task('task-2')],
      failOn: { 'tasks.update': new GatewayError('internal_error', 500, 'move refused') },
    }));

    await store.receive('task-elsewhere' as TaskId, section().id);
    fixture.detectChanges();

    expect(query(fixture, '[data-tasks-receive-error] [data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t move the task into this list. Try again.');
    expect(query(fixture, '[data-tasks-receive-error] [data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(query(fixture, '[data-tasks-receive-error] details')?.textContent).toContain('move refused');
    expect(query(fixture, '[data-tasks-receive-error] [data-recovery]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-task-row]')).toHaveLength(2);
  });

  it('pins a drag-receive failure by its banner sentence, never the read banner (Slice 78, §24)', async () => {
    const { fixture, store } = await render(new FakeWorkManagerGateway({
      tasks: [task('task-1')],
      failOn: { 'tasks.update': new GatewayError('internal_error', 500, 'move refused') },
    }));
    const pinned = fixture.debugElement.queryAll(By.directive(PinnedFailureDirective))
      .find((candidate) => candidate.nativeElement.matches('.task-list-section'))!;
    const pin = pinned.injector.get(PinnedFailureDirective);
    expect(pin.appPinnedFailure()).toBeNull();

    await store.receive('task-elsewhere' as TaskId, section().id);
    fixture.detectChanges();
    const sentence = query(fixture, '[data-tasks-receive-error] [data-failure-sentence]')!;
    expect(pin.appPinnedFailure()).toBe(store.receiveError());
    expect(pin.pinnedFailureSubject()).toBe(nameOf(section()));
    expect(pin.pinnedFailureSentence()).toBe(sentence.id);
    expect(sentence.id).not.toBe('');
  });

  it('registers no pin for a failed read, and marks the sticky quick-add as the top edge’s clearance', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({ failOn: { 'tasks.list': new GatewayError('internal_error', 500, 'read refused') } }));
    expect(query(fixture, '[data-tasks-error]')).not.toBeNull();
    for (const pinned of fixture.debugElement.queryAll(By.directive(PinnedFailureDirective))) {
      expect(pinned.injector.get(PinnedFailureDirective).appPinnedFailure()).toBeNull();
    }
    expect(query(fixture, '[data-quick-create]')!.hasAttribute(PIN_CLEARANCE_ATTRIBUTE)).toBe(true);
  });

  it('shows a failed completion on its row, not as a section banner', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({
      tasks: [task('task-1'), task('task-2')],
      failOn: { 'tasks.complete': new GatewayError('unreachable', 0, 'offline') },
    }));
    const rows = fixture.nativeElement.querySelectorAll('[data-task-row]') as NodeListOf<HTMLElement>;
    (rows[1]!.querySelector('[data-task-complete]') as HTMLInputElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const refreshed = fixture.nativeElement.querySelectorAll('[data-task-row]') as NodeListOf<HTMLElement>;
    expect(refreshed[0]!.querySelector('[data-task-error]')).toBeNull();
    expect(refreshed[1]!.querySelector('[data-task-error]')?.textContent).toContain('Couldn’t complete “Task task-2”');
    expect(query(fixture, '[data-tasks-error]')).toBeNull();
  });

  it('brings a new row into view without moving focus out of the field', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    const pending = held(gateway);
    const scrolled: Element[] = [];
    const scroll = vi.fn(function (this: Element) { scrolled.push(this); });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    const { fixture } = await render(gateway);

    const input = submit(fixture, 'Order tiles');
    pending.answer(added('task-new', 'Order tiles'));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(scrolled.some((element) => element.getAttribute('data-task-id') === 'task-new')).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(input);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('renders no pending row or row error in a read-only list', async () => {
    const { fixture, store } = await render(new FakeWorkManagerGateway({ tasks: [task('task-1')] }), true);
    expect(query(fixture, '[data-quick-create]')).toBeNull();
    expect(store.pendingCreate()).toBeNull();
    expect(query(fixture, '[data-task-error]')).toBeNull();
  });
});


it('keeps order fixed during drag and explains cross-list movement (slice 77, §34)', async () => {
 const {fixture}=await render();
 const list=fixture.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
 expect(list.sortingDisabled).toBe(true);
 const drag=fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag);
 drag.started.emit({source:drag,event:new MouseEvent('mousedown')}); fixture.detectChanges();
 expect(query(fixture,'[data-task-drag-hint]')?.textContent).toContain("Order within a list can't be changed yet.");
 drag.ended.emit({source:drag,distance:{x:0,y:0},dropPoint:{x:0,y:0},event:new MouseEvent('mouseup')}); fixture.detectChanges();
 expect(query(fixture,'[data-task-drag-hint]')).toBeNull();
});
it('links a shortcut task to its source and distinguishes the empty source (slice 77)', async () => {
 const {fixture}=await render(undefined,true);
 fixture.componentRef.setInput('sourceLink',{route:['/projects','project-a'],fragment:'section-section-tasks'}); await fixture.whenStable();
 expect(query(fixture,'a[data-task-title]')?.getAttribute('href')).toBe('/projects/project-a#section-section-tasks');
 TestBed.resetTestingModule();
 const empty=await render(new FakeWorkManagerGateway(),true);
 expect(query(empty.fixture,'[data-tasks-empty]')?.textContent).toBe('The source has no tasks yet.');
});
