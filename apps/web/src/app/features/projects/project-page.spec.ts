import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type Project,
  type ProjectSection,
  type Task,
} from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { ProjectPage } from './project-page';

const AT = '2026-08-27T16:00:00.000Z';

const project = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: 'project-a',
    workspaceId: 'workspace-demo',
    name: 'Website launch',
    icon: '🚀',
    status: 'on_hold',
    targetDate: '2026-09-30',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const section = (id: string, type: string, position: number): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId: 'project-a',
    type,
    position,
    columnSpan: 12,
    collapsed: false,
    config: type === 'rich-text' ? { text: 'Launch week notes' } : {},
    createdAt: AT,
    updatedAt: AT,
  });

const task = (id: string, status: 'todo' | 'done'): Task =>
  TaskSchema.parse({
    id,
    projectId: 'project-a',
    title: `Task ${id}`,
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

const render = async (
  options: { sections?: ProjectSection[]; tasks?: Task[]; failWith?: GatewayError } = {},
) => {
  const gateway = new FakeWorkManagerGateway({
    projects: [project()],
    sections: options.sections ?? [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)],
    tasks: options.tasks ?? [task('task-1', 'todo'), task('task-2', 'done')],
    failWith: options.failWith,
  });

  TestBed.configureTestingModule({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
  const fixture = TestBed.createComponent(ProjectPage);
  fixture.componentRef.setInput('projectId', 'project-a');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

const queryAll = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];

describe('ProjectPage (§26)', () => {
  it('renders §26’s header: icon, name, status, progress and target date', async () => {
    const { fixture } = await render();

    expect(query(fixture, '[data-project-icon]')?.textContent).toContain('🚀');
    expect(query(fixture, '[data-project-name]')?.textContent).toContain('Website launch');
    expect(query(fixture, '[data-project-status]')?.textContent).toContain('on hold');
    expect(query(fixture, '[data-project-progress]')?.textContent).toContain('50%');
    expect(query(fixture, '[data-project-target-date]')?.textContent).toContain('2026-09-30');
  });

  it('renders every registered section inside one frame, in position order', async () => {
    const { fixture } = await render();

    const frames = queryAll(fixture, '[data-section-frame]');
    expect(frames.map((frame) => frame.getAttribute('data-section-type'))).toEqual(['rich-text', 'task-list']);
    // The two content components, each inside the shared §31 chrome.
    expect(query(fixture, '[data-rich-text-body]')).not.toBeNull();
    expect(query(fixture, '[data-quick-create]')).not.toBeNull();
  });

  it('renders 0% for a project with nothing done, not "Not available"', async () => {
    // `0` is falsy, so an `@if (progress; as …)` binding reads a real zero as "no value" —
    // the one number a progress control most needs to be able to say.
    const { fixture } = await render({ tasks: [task('task-1', 'todo')] });

    expect(fixture.nativeElement.querySelector('[data-project-progress]').textContent).toContain('0%');
    expect(query(fixture, '[data-project-progress-unavailable]')).toBeNull();
  });

  it('says progress is unavailable when the project has no tasks at all', async () => {
    const { fixture } = await render({ tasks: [] });

    expect(query(fixture, '[data-project-progress-unavailable]')).not.toBeNull();
  });

  it('invites the user to add something when the canvas is empty', async () => {
    const { fixture } = await render({ sections: [] });

    expect(query(fixture, '[data-empty-canvas]')).not.toBeNull();
    expect(queryAll(fixture, '[data-section-frame]')).toHaveLength(0);
  });

  it('renders a removable fallback for a section type nothing registers', async () => {
    // `data.json` is hand-editable and outlives any one registry, so this is a real state.
    const { fixture, gateway } = await render({ sections: [section('section-timeline', 'timeline', 0)] });

    expect(query(fixture, '[data-unknown-section]')?.textContent).toContain('timeline');
    // And it must not leave the user stuck with a card they can never get rid of.
    query(fixture, '[data-unknown-section-remove]')!.click();
    await fixture.whenStable();

    expect(gateway.argumentTo('sections.remove')).toBe('section-timeline');
  });

  it('adds a section of a chosen registry type from the header’s Quick Add', async () => {
    const { fixture, gateway } = await render();

    query(fixture, '[data-project-quick-add]')!.click();
    fixture.detectChanges();
    const richText = queryAll(fixture, '[data-add-section]').find(
      (button) => button.getAttribute('data-section-type') === 'rich-text',
    );
    richText!.click();
    await fixture.whenStable();

    expect(gateway.argumentTo('sections.create')).toEqual({
      projectId: 'project-a',
      input: { type: 'rich-text', config: { text: '' } },
    });
  });

  it('shows a not-found project as a visible message rather than an empty canvas', async () => {
    const { fixture } = await render({ failWith: new GatewayError('not_found', 404, 'no such project') });

    expect(query(fixture, '[data-project-error]')?.textContent).toContain('no such project');
    expect(query(fixture, '[data-section-canvas]')).toBeNull();
  });
});
