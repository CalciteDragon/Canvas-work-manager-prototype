import { TestBed } from '@angular/core/testing';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import {
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type Project,
  type ProjectSection,
  type Task,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { PrototypeSettings } from '../../core/config/prototype-settings';
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

const task = (id: string, status: 'todo' | 'done', sectionId = 'section-tasks'): Task =>
  TaskSchema.parse({
    id,
    projectId: 'project-a',
    sectionId,
    title: `Task ${id}`,
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const render = async (
  options: {
    project?: Project;
    sections?: ProjectSection[];
    tasks?: Task[];
    failWith?: GatewayError;
    failOn?: Record<string, GatewayError>;
  } = {},
) => {
  const renderedProject = options.project ?? project();
  const renderedTasks = options.tasks ?? [task('task-1', 'todo'), task('task-2', 'done')];
  const gateway = new FakeWorkManagerGateway({
    projects: [renderedProject],
    sections: options.sections ?? [
      section('section-text', 'rich-text', 0),
      section('section-tasks', 'task-list', 1),
    ],
    tasks: renderedTasks,
    progress: { projectId: renderedProject.id, formula: 'count', percentage: renderedTasks.length === 0 ? null : Math.round(renderedTasks.filter(({ status }) => status === 'done').length / renderedTasks.length * 100), completed: renderedTasks.filter(({ status }) => status === 'done').length, total: renderedTasks.length, explanation: renderedTasks.length === 0 ? 'No tasks to measure' : 'Count based' },
    failWith: options.failWith,
    failOn: options.failOn,
  });

  TestBed.configureTestingModule({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }, provideRouter([])],
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
      sections: [section('section-unknown', 'unknown-future-type', 0)],
    });

    expect(query(fixture, '[data-unknown-section]')?.textContent).toContain('unknown-future-type');
    expect(query(fixture, '[data-unknown-section-remove]')).toBeNull();
    enterEditMode(fixture);
    // And it must not leave the user stuck with a card they can never get rid of.
    query(fixture, '[data-unknown-section-remove]')!.click();
    await fixture.whenStable();

    // No policy: an unknown type reads as a view, so removing it can never touch data.
    expect(gateway.argumentTo('sections.remove')).toEqual({ id: 'section-unknown', input: {} });
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

  it('gives two Task List sections on one project their own rows', async () => {
    // The inverse of the rule this test used to hold. A shared store was right while a
    // `task-list` merely *queried* the project's tasks; under
    // docs/decisions/2026-09-sections-own-their-data.md it **owns** them, so two lists that
    // rendered the same rows would be the defect rather than the guarantee.
    const { fixture } = await render({
      tasks: [task('task-1', 'todo'), task('task-2', 'done'), task('task-3', 'todo', 'section-tasks-copy')],
      sections: [
        section('section-tasks', 'task-list', 0),
        section('section-tasks-copy', 'task-list', 1),
      ],
    });

    const lists = queryAll(fixture, '[data-section-frame][data-section-type="task-list"]');
    expect(lists).toHaveLength(2);
    expect(lists.map((list) => list.querySelectorAll('[data-task-row]').length)).toEqual([2, 1]);
    expect(lists[1]!.textContent).toContain('Task task-3');
    expect(lists[0]!.textContent).not.toContain('Task task-3');

    // Progress stays a project-wide view: completing in one list moves the header, which
    // reads §39's canonical answer rather than summing whatever the containers hold.
    lists[0]!.querySelector<HTMLElement>('[data-task-complete]')!.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-project-progress]')?.textContent).toContain('67%');
  });

  it('asks how to remove a container that still holds rows, and removes a view outright', async () => {
    const { fixture, gateway } = await render({
      sections: [
        section('section-tasks', 'task-list', 0),
        section('section-tasks-copy', 'task-list', 1),
        section('section-progress', 'progress', 2),
      ],
      failOn: {
        'sections.remove': new GatewayError(
          'rule_violation',
          409,
          'section "section-tasks" still holds 2 tasks; removing it needs a policy of "cascade" or "reassign"',
        ),
      },
    });
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();

    const frames = queryAll(fixture, '[data-section-frame]');
    frames[0]!.querySelector<HTMLElement>('[data-section-remove]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The dialog quotes the domain's own sentence, so the count cannot drift from the rule.
    const dialog = query(fixture, '[data-section-removal-dialog]');
    expect(dialog).not.toBeNull();
    expect(query(fixture, '[data-section-removal-message]')?.textContent).toContain('still holds 2 tasks');
    // A refusal is a question, not an error to park in the page's error line.
    expect(query(fixture, '[data-section-error]')).toBeNull();
    // Reassign is offered only because a second task-list exists to take the rows.
    expect(query(fixture, '[data-section-removal-reassign]')).not.toBeNull();

    query(fixture, '[data-section-removal-cascade]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.filter(({ method }) => method === 'sections.remove').at(-1)?.argument).toMatchObject({
      input: { policy: 'cascade' },
    });
  });

  it('reloads every duplicated Progress section after one changes the canonical formula', async () => {
    const { fixture, gateway } = await render({
      tasks: [
        TaskSchema.parse({ ...task('task-1', 'done'), estimate: 2 }),
        TaskSchema.parse({ ...task('task-2', 'todo'), estimate: 8 }),
      ],
      sections: [
        section('section-progress', 'progress', 0),
        section('section-progress-copy', 'progress', 1),
      ],
    });
    const before = gateway.calls.filter(({ method }) => method === 'progress.get').length;
    const progressSections = queryAll(fixture, '[data-section-frame][data-section-type="progress"]');

    const weighted = [...progressSections[0]!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Weighted');
    expect(weighted).toBeDefined();
    weighted!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const after = gateway.calls.filter(({ method }) => method === 'progress.get').length;
    // One canonical setFormula read, one shared section revision read, and one header
    // recovery from the live self-echo. Duplicate sections must not add a fourth read.
    expect(after - before).toBe(3);
    expect(progressSections.map((region) =>
      [...region.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === 'Weighted')
        ?.getAttribute('aria-pressed'),
    )).toEqual(['true', 'true']);
    expect(progressSections.map((region) => region.textContent)).toEqual([
      expect.stringContaining('2 of 10 estimate points complete'),
      expect.stringContaining('2 of 10 estimate points complete'),
    ]);
    expect(query(fixture, '[data-project-progress]')?.textContent).toContain('20%');
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
        section('section-text-12', 'rich-text', 0, { columnSpan: 12 }),
        section('section-text-8', 'rich-text', 1, { columnSpan: 8 }),
        section('section-text-6', 'rich-text', 2, { columnSpan: 6 }),
        section('section-tasks-4', 'task-list', 3, { columnSpan: 4 }),
      ],
      });

      const canvas = query(fixture, '[data-section-canvas]')!;
      expect(canvas.classList.contains(`section-canvas--${mode}`)).toBe(true);
    expect(queryAll(fixture, '[data-section-item]').map((item) => item.className)).toEqual([
      expect.stringContaining('section-canvas__item--span-12'),
      expect.stringContaining('section-canvas__item--span-8'),
      expect.stringContaining('section-canvas__item--span-6'),
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
        section('section-unknown', 'unknown-future-type', 1),
        section('section-tasks', 'task-list', 2),
      ],
    });

    // Only the section frames: task rows are draggable too now, between containers.
    expect(
      fixture.debugElement
        .queryAll(By.directive(CdkDrag))
        .filter((drag) => (drag.nativeElement as HTMLElement).hasAttribute('data-section-item')),
    ).toHaveLength(3);
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
        section('section-unknown', 'unknown-future-type', 1),
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

  it('does not remount the new project when an old project move rejects', async () => {
    const gate = deferred<ProjectSection>();
    const { fixture, gateway } = await render({
      sections: [
        section('section-text', 'rich-text', 0),
        section('section-tasks', 'task-list', 1),
        section('section-b', 'rich-text', 0, { projectId: 'project-b' }),
      ],
    });
    gateway.sections.move = vi.fn(() => gate.promise);
    gateway.projects.get = vi.fn(async (id) => project({ id }));
    const drop = fixture.componentInstance.drop({
      previousIndex: 0,
      currentIndex: 1,
      item: { data: 'section-text' },
    } as never);
    await fixture.componentInstance.store.load('project-b' as Project['id']);
    fixture.detectChanges();
    const projectBCanvas = query(fixture, '[data-section-canvas]');

    gate.reject(new GatewayError('unreachable', 0, 'old move failed'));
    await drop;
    fixture.detectChanges();

    expect(query(fixture, '[data-section-canvas]')).toBe(projectBCanvas);
  });
});

/**
 * §47's `gridProjectLayout`. The flag gates what is *rendered*, not what is stored — the
 * project keeps its own choice, so turning the flag back on restores it rather than
 * needing a data fix.
 */
describe('ProjectPage — the gridProjectLayout flag (§47)', () => {
  it('renders a grid project as grid while the flag is on', async () => {
    const { fixture } = await render({ project: project({ projectLayoutMode: 'grid' }) });

    expect(query(fixture, '[data-section-canvas]')?.classList).toContain('section-canvas--grid');
    expect(query(fixture, '[data-layout-name]')?.textContent).toContain('Grid layout');
  });

  it('renders the same project as flow when the flag is off', async () => {
    const { fixture } = await render({ project: project({ projectLayoutMode: 'grid' }) });

    // Set after rendering, and the canvas re-renders: the flag is a signal, so this is
    // the no-reload behaviour the panel promises.
    TestBed.inject(PrototypeSettings).setFlag('gridProjectLayout', false);
    fixture.detectChanges();

    const canvas = query(fixture, '[data-section-canvas]');
    expect(canvas?.classList).toContain('section-canvas--flow');
    expect(canvas?.classList).not.toContain('section-canvas--grid');
    expect(query(fixture, '[data-layout-name]')?.textContent).toContain('Flow layout');
  });
});

describe('ProjectPage — §26’s More menu (§81)', () => {
  const openMore = async (fixture: Awaited<ReturnType<typeof render>>['fixture']) => {
    query(fixture, '[data-project-more]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('opens the More menu, closes it on Escape, and closes Quick add when it opens', async () => {
    const { fixture } = await render();
    expect(query(fixture, '[data-project-more]')?.hasAttribute('disabled')).toBe(false);

    enterEditMode(fixture);
    query(fixture, '[data-project-quick-add]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-add-section-menu]')).not.toBeNull();

    await openMore(fixture);
    // The two popovers render into the same row, so they must never overlap.
    expect(query(fixture, '[data-project-more-menu]')).not.toBeNull();
    expect(query(fixture, '[data-add-section-menu]')).toBeNull();
    expect(queryAll(fixture, '[data-project-status-option]').map((button) => button.getAttribute('data-status'))).toEqual([
      'planning',
      'active',
      'on_hold',
      'completed',
    ]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-project-more-menu]')).toBeNull();
  });

  // The template-layer companion to the store's revert test: the store spec cannot see that
  // `writeError` was accidentally routed to `errorState`, which would blank the page.
  it('keeps the header rendered while showing a failed rename', async () => {
    const { fixture } = await render({
      failOn: { 'projects.update': new GatewayError('unreachable', 0, 'the prototype host is not running') },
    });
    await openMore(fixture);

    const name = query(fixture, '[data-project-rename-input]') as HTMLInputElement;
    name.value = 'Website relaunch';
    query(fixture, '[data-project-rename-submit]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-project-write-error]')?.textContent).toContain('not running');
    expect(query(fixture, '[data-project-name]')?.textContent).toContain('Website launch');
    expect(query(fixture, '[data-project-error]')).toBeNull();
  });

  it('asks for confirmation before archiving', async () => {
    const { fixture } = await render();
    await openMore(fixture);

    expect(query(fixture, '[data-project-archive-confirm]')).toBeNull();
    query(fixture, '[data-project-archive]')!.click();
    fixture.detectChanges();

    expect(query(fixture, '[data-project-archive-confirm]')).not.toBeNull();
  });

  it('writes nothing when the confirmation is cancelled', async () => {
    const { fixture, gateway } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openMore(fixture);

    query(fixture, '[data-project-archive]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-project-archive-cancel]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.some(({ method }) => method === 'projects.update')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(query(fixture, '[data-project-name]')).not.toBeNull();
  });

  it('leaves the project page only after the archive resolves', async () => {
    const { fixture, gateway } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openMore(fixture);

    query(fixture, '[data-project-archive]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-project-archive-confirm-yes]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('projects.update')).toEqual({ id: 'project-a', input: { status: 'archived' } });
    expect(navigate).toHaveBeenCalledWith(['/app']);
  });

  it('stays put and names the reason when the domain refuses an archive', async () => {
    const { fixture } = await render({
      failOn: { 'projects.update': new GatewayError('conflict', 409, 'archive or complete the 2 active sub-projects first') },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openMore(fixture);

    query(fixture, '[data-project-archive]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-project-archive-confirm-yes]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(query(fixture, '[data-project-write-error]')?.textContent).toContain('active sub-projects');
  });

  it('clears a target date back to the header’s "No target date" branch', async () => {
    const { fixture, gateway } = await render();
    await openMore(fixture);

    query(fixture, '[data-project-target-date-clear]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('projects.update')).toEqual({ id: 'project-a', input: { targetDate: null } });
    expect(query(fixture, '[data-project-target-date]')?.textContent).toContain('No target date');
  });
});
