import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, TaskSchema, type ProjectSection, type Task } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { TaskListStore } from '../../../tasks/task-list-store';
import { TaskListSection } from './task-list-section';

const AT = '2026-08-27T16:00:00.000Z';

const section = (): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-tasks',
    projectId: 'project-a',
    type: 'task-list',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
  });

const task = (id: string, projectId = 'project-a'): Task =>
  TaskSchema.parse({
    id,
    projectId,
    title: `Task ${id}`,
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
  });

const render = async () => {
  const gateway = new FakeWorkManagerGateway({ tasks: [task('task-1'), task('task-2')] });
  TestBed.configureTestingModule({
    providers: [TaskListStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const store = TestBed.inject(TaskListStore);
  await store.load('project-a' as Task['projectId']);

  const fixture = TestBed.createComponent(TaskListSection);
  fixture.componentRef.setInput('section', section());
  fixture.componentRef.setInput('onConfigChange', vi.fn());
  fixture.componentRef.setInput('onProjectDataChange', vi.fn());
  fixture.detectChanges();
  return { fixture, store, gateway };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('TaskListSection (§30, §66)', () => {
  it('asks the gateway for only its own project’s tasks', async () => {
    const { gateway } = await render();

    expect(gateway.argumentTo('tasks.list')).toEqual({ projectId: 'project-a', includeArchived: false });
  });

  it('renders Slice 7’s task rows rather than a second implementation of them', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelectorAll('[data-task-row]')).toHaveLength(2);
    expect(query(fixture, '[data-task-complete]')).not.toBeNull();
  });

  it('quick-creates into the section’s project through the injected store', async () => {
    const { fixture, gateway } = await render();

    const input = query(fixture, '[data-quick-task-title]') as HTMLInputElement;
    input.value = 'Draft the release note';
    query(fixture, '[data-quick-create]')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(gateway.argumentTo('tasks.create')).toEqual({
      projectId: 'project-a',
      title: 'Draft the release note',
    });
  });

  it('completes a task through the store, not through a gateway of its own', async () => {
    const { fixture, gateway } = await render();

    query(fixture, '[data-task-complete]')!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(gateway.argumentTo('tasks.complete')).toBe('task-1');
  });

  it('says so when the project has no tasks yet', async () => {
    const gateway = new FakeWorkManagerGateway({ tasks: [] });
    TestBed.configureTestingModule({
      providers: [TaskListStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
    });
    await TestBed.inject(TaskListStore).load('project-a' as Task['projectId']);

    const fixture = TestBed.createComponent(TaskListSection);
    fixture.componentRef.setInput('section', section());
    fixture.componentRef.setInput('onConfigChange', vi.fn());
    fixture.componentRef.setInput('onProjectDataChange', vi.fn());
    fixture.detectChanges();

    expect(query(fixture, '[data-tasks-empty]')).not.toBeNull();
  });
});
