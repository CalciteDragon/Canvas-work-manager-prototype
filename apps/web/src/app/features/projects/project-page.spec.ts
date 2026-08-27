import { TestBed } from '@angular/core/testing';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
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

const section = (
  id: string,
  type: string,
  position: number,
  overrides: Record<string, unknown> = {},
): ProjectSection =>
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
    ...overrides,
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
  options: {
    project?: Project;
    sections?: ProjectSection[];
    tasks?: Task[];
    failWith?: GatewayError;
    failOn?: Record<string, GatewayError>;
  } = {},
) => {
  const gateway = new FakeWorkManagerGateway({
    projects: [options.project ?? project()],
    sections: options.sections ?? [
      section('section-text', 'rich-text', 0),
      section('section-tasks', 'task-list', 1),
    ],
    tasks: options.tasks ?? [task('task-1', 'todo'), task('task-2', 'done')],
    failWith: options.failWith,
    failOn: options.failOn,
  });

  TestBed.configureTestingModule({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
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

const enterEditMode = (fixture: Awaited<ReturnType<typeof render>>['fixture']) => {
  query(fixture, '[data-layout-edit-toggle]')!.click();
  fixture.detectChanges();
};

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
    expect(frames.map((frame) => frame.getAttribute('data-section-type'))).toEqual([
      'rich-text',
      'task-list',
    ]);
    // The two content components, each inside the shared §31 chrome.
    expect(query(fixture, '[data-rich-text-body]')).not.toBeNull();
    expect(query(fixture, '[data-quick-create]')).not.toBeNull();
  });

  it('renders 0% for a project with nothing done, not "Not available"', async () => {
    // `0` is falsy, so an `@if (progress; as …)` binding reads a real zero as "no value" —
    // the one number a progress control most needs to be able to say.
    const { fixture } = await render({ tasks: [task('task-1', 'todo')] });

    expect(fixture.nativeElement.querySelector('[data-project-progress]').textContent).toContain(
      '0%',
    );
    expect(query(fixture, '[data-project-progress-unavailable]')).toBeNull();
  });

  it('says progress is unavailable when the project has no tasks at all', async () => {
    const { fixture } = await render({ tasks: [] });

    expect(query(fixture, '[data-project-progress-unavailable]')).not.toBeNull();
  });

  it('invites the user to add something when the canvas is empty', async () => {
    const { fixture } = await render({ sections: [] });

    expect(query(fixture, '[data-empty-canvas]')?.textContent).toContain('Edit Layout Mode');
    expect(query(fixture, '[data-project-quick-add]')).toBeNull();
    enterEditMode(fixture);
    expect(query(fixture, '[data-project-quick-add]')).not.toBeNull();
    expect(queryAll(fixture, '[data-section-frame]')).toHaveLength(0);
  });

  it('renders a removable fallback for a section type nothing registers', async () => {
    // `data.json` is hand-editable and outlives any one registry, so this is a real state.
    const { fixture, gateway } = await render({
      sections: [section('section-timeline', 'timeline', 0)],
    });

    expect(query(fixture, '[data-unknown-section]')?.textContent).toContain('timeline');
    expect(query(fixture, '[data-unknown-section-remove]')).toBeNull();
    enterEditMode(fixture);
    // And it must not leave the user stuck with a card they can never get rid of.
    query(fixture, '[data-unknown-section-remove]')!.click();
    await fixture.whenStable();

    expect(gateway.argumentTo('sections.remove')).toBe('section-timeline');
  });

  it('adds a section of a chosen registry type from the header’s Quick Add', async () => {
    const { fixture, gateway } = await render();

    enterEditMode(fixture);
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

  it('gives two Task List sections on one project a single shared store', async () => {
    // The plan's single-provision rule, made structural. Two instances would give the header
    // and the sections two different sets of tasks — and duplicating a Task List section is
    // a one-click action this slice ships, so the regression is live.
    const { fixture } = await render({
      sections: [
        section('section-tasks', 'task-list', 0),
        section('section-tasks-copy', 'task-list', 1),
      ],
    });

    const lists = queryAll(fixture, '[data-section-frame][data-section-type="task-list"]');
    expect(lists).toHaveLength(2);
    expect(lists.map((list) => list.querySelectorAll('[data-task-row]').length)).toEqual([2, 2]);

    // Completing in the first list must move the second, and the header, at once.
    lists[0]!
      .querySelector<HTMLElement>('[data-task-complete]')!
      .dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-project-progress]')?.textContent).toContain('100%');
    expect(lists[1]!.querySelectorAll('[data-task-row][aria-busy="false"]')).toHaveLength(2);
  });

  it('shows a not-found project as a visible message rather than an empty canvas', async () => {
    const { fixture } = await render({
      failWith: new GatewayError('not_found', 404, 'no such project'),
    });

    expect(query(fixture, '[data-project-error]')?.textContent).toContain('no such project');
    expect(query(fixture, '[data-section-canvas]')).toBeNull();
  });

  it.each([
    ['flow', 'vertical'],
    ['grid', 'mixed'],
  ] as const)(
    'renders %s from the persisted flag with the supported CDK orientation',
    async (mode, orientation) => {
      const { fixture } = await render({
        project: project({ projectLayoutMode: mode }),
        sections: [
          section('section-text', 'rich-text', 0, { columnSpan: 8 }),
          section('section-tasks', 'task-list', 1, { columnSpan: 4 }),
        ],
      });

      const canvas = query(fixture, '[data-section-canvas]')!;
      expect(canvas.classList.contains(`section-canvas--${mode}`)).toBe(true);
      expect(queryAll(fixture, '[data-section-item]').map((item) => item.className)).toEqual([
        expect.stringContaining('section-canvas__item--span-8'),
        expect.stringContaining('section-canvas__item--span-4'),
      ]);
      const dropList = fixture.debugElement
        .query(By.directive(CdkDropList))
        .injector.get(CdkDropList);
      expect(dropList.orientation).toBe(orientation);
    },
  );

  it('keeps every section, including an unknown type, in the same draggable order', async () => {
    const { fixture } = await render({
      sections: [
        section('section-text', 'rich-text', 0),
        section('section-unknown', 'timeline', 1),
        section('section-tasks', 'task-list', 2),
      ],
    });

    expect(fixture.debugElement.queryAll(By.directive(CdkDrag))).toHaveLength(3);
    expect(
      queryAll(fixture, '[data-section-item]').map((item) => item.dataset['sectionId']),
    ).toEqual(['section-text', 'section-unknown', 'section-tasks']);
  });

  it('keeps layout chrome out of View Mode and closes Quick Add when editing ends', async () => {
    const { fixture } = await render();

    expect(query(fixture, '[data-project-quick-add]')).toBeNull();
    expect(query(fixture, '[data-section-size]')).toBeNull();
    expect(query(fixture, '[data-section-remove]')).toBeNull();
    enterEditMode(fixture);
    expect(query(fixture, '[data-project-quick-add]')).not.toBeNull();
    expect(query(fixture, '[data-section-size]')).not.toBeNull();

    query(fixture, '[data-project-quick-add]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-add-section-menu]')).not.toBeNull();
    query(fixture, '[data-layout-edit-toggle]')!.click();
    fixture.detectChanges();
    enterEditMode(fixture);
    expect(query(fixture, '[data-add-section-menu]')).toBeNull();
  });

  it('dispatches a drop by the dragged section id and complete-list index', async () => {
    const { fixture, gateway } = await render({
      sections: [
        section('section-text', 'rich-text', 0),
        section('section-unknown', 'timeline', 1),
        section('section-tasks', 'task-list', 2),
      ],
    });
    enterEditMode(fixture);

    await fixture.componentInstance.drop({
      previousIndex: 0,
      currentIndex: 2,
      item: { data: 'section-text' },
    } as never);

    expect(gateway.argumentTo('sections.move')).toEqual({
      id: 'section-text',
      input: { position: 2 },
    });
  });

  it('recreates canonical wrappers after a rejected mixed-grid drop', async () => {
    const { fixture } = await render({
      project: project({ projectLayoutMode: 'grid' }),
      failOn: { 'sections.move': new GatewayError('unreachable', 0, 'move did not persist') },
    });
    enterEditMode(fixture);
    const canvas = query(fixture, '[data-section-canvas]')!;
    const [first, second] = queryAll(fixture, '[data-section-item]');
    canvas.insertBefore(second!, first!);

    await fixture.componentInstance.drop({
      previousIndex: 0,
      currentIndex: 1,
      item: { data: 'section-text' },
    } as never);
    fixture.detectChanges();

    expect(
      queryAll(fixture, '[data-section-item]').map((item) => item.dataset['sectionId']),
    ).toEqual(['section-text', 'section-tasks']);
    expect(query(fixture, '[data-section-error]')?.textContent).toContain('move did not persist');
  });
});
