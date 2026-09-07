import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, TaskSchema, type ProjectSection, type Task, type TaskId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { TaskListStore } from '../../../tasks/task-list-store';
import { TaskListSection } from './task-list-section';

const AT = '2026-08-27T16:00:00.000Z';

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
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const onProjectDataChange = vi.fn();
  const fixture = TestBed.createComponent(TaskListSection);
  fixture.componentRef.setInput('section', section());
  fixture.componentRef.setInput('onConfigChange', vi.fn());
  fixture.componentRef.setInput('onProjectDataChange', onProjectDataChange);
  fixture.componentRef.setInput('onProjectHierarchyChange', vi.fn());
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
    expect(query(fixture, '[data-task-archive]')).toBeNull();
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

    query(fixture, '[data-task-archive]')!.click();
    await fixture.whenStable();

    expect(archive).toHaveBeenCalledWith('task-1');
    expect(gateway.argumentTo('tasks.archive')).toBe('task-1');
  });

  it('tells the page a successful archive happened, so the Archived region re-reads', async () => {
    const { fixture, onProjectDataChange } = await render();

    query(fixture, '[data-task-archive]')!.click();
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

    query(fixture, '[data-task-archive]')!.click();
    await fixture.whenStable();

    expect(onProjectDataChange).not.toHaveBeenCalled();
    expect(query(fixture, '[data-tasks-error]')?.textContent).toContain('offline');
  });

  it('disables the row’s archive control while the store reports the write in flight', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1')] });
    let settle = (): void => undefined;
    gateway.tasks.archive = () => new Promise<void>((resolve) => (settle = () => resolve()));
    const { fixture, store } = await render(gateway);

    query(fixture, '[data-task-archive]')!.click();
    fixture.detectChanges();

    // The row cannot paint the outcome itself, so the only honest feedback it can give while
    // the write is out is to refuse a second one.
    expect(store.archivingIds().has('task-1' as TaskId)).toBe(true);
    expect((query(fixture, '[data-task-archive]') as HTMLButtonElement).disabled).toBe(true);

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

    query(fixture, '[data-task-archive]')!.click();
    await fixture.whenStable();

    expect(archive).toHaveBeenCalledWith('task-1');
  });

  it('tells the page after a successful archive', async () => {
    // The row moves from this list into the page's Archived region, which re-reads on the
    // data revision — so a silent success would leave the region a reload behind.
    const { fixture, onProjectDataChange } = await render();

    query(fixture, '[data-task-archive]')!.click();
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

    query(fixture, '[data-task-archive]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(onProjectDataChange).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('[data-task-row]')).toHaveLength(1);
    expect(query(fixture, '[data-tasks-error]')?.textContent).toContain('nope');
  });

  it('disables only the row whose archive is in flight', async () => {
    // Driven through a real pending write rather than a stubbed signal: the disabled state
    // has to survive the store's own change propagation, which is the part that can break.
    let release!: () => void;
    const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1'), task('task-2')] });
    const archive = vi
      .spyOn(gateway.tasks, 'archive')
      .mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const { fixture } = await render(gateway);

    query(fixture, '[data-task-archive]')!.click();
    fixture.detectChanges();

    const controls = [...fixture.nativeElement.querySelectorAll('[data-task-archive]')] as HTMLButtonElement[];
    expect(controls.map((control) => control.disabled)).toEqual([true, false]);
    expect(controls[0]!.textContent).toContain('Archiving');

    release();
    await fixture.whenStable();
    archive.mockRestore();
  });
});
