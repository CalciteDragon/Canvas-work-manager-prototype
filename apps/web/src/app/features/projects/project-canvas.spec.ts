import { TestBed } from '@angular/core/testing';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
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
import { ProjectCanvas } from './project-canvas';
import { SECTION_REGISTRY } from './sections/registry';

const AT = '2026-08-27T16:00:00.000Z';

const project = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: 'project-a',
    workspaceId: 'workspace-demo',
    kind: 'root',
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
    pageId: 'page-project-a',
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
    pageId?: string;
    restoreBlocked?: boolean;
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
  const fixture = TestBed.createComponent(ProjectCanvas);
  fixture.componentRef.setInput('projectId', renderedProject.id);
  fixture.componentRef.setInput('pageId', options.pageId ?? 'page-project-a');
  // The shell owns the project record; the canvas is handed only what it renders with.
  fixture.componentRef.setInput('projectLayoutMode', renderedProject.projectLayoutMode);
  fixture.componentRef.setInput('restoreBlocked', options.restoreBlocked ?? false);
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

describe('ProjectCanvas (§27, §31, §32)', () => {
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

  // Acceptance 3, as a test rather than a claim: §30 says Home and a work canvas take "all
  // registered types", including ones registered after that sentence was written — so the case
  // iterates the registry instead of naming seven types it would then have to be kept in step
  // with. Both canvases, because a sub-project's page is the one whose id is not canonical.
  it.each([
    ['a root’s Home', 'page-project-a'],
    ['a sub-project’s work canvas', 'page-work'],
  ])('mounts a frame for every registered section type on %s', async (_case, pageId) => {
    const { fixture } = await render({
      pageId,
      sections: SECTION_REGISTRY.map((definition, index) =>
        section(`section-${definition.type}`, definition.type, index, { pageId }),
      ),
    });

    expect(
      queryAll(fixture, '[data-section-frame]').map((frame) => frame.getAttribute('data-section-type')),
    ).toEqual(SECTION_REGISTRY.map(({ type }) => type));
    expect(queryAll(fixture, '[data-unknown-section]')).toHaveLength(0);
  });

  // §63 on the one toggle a person can fail in this slice: 25.3 ships no page-enable control,
  // so the collapse toggle is it.
  it('rolls a failed collapse back onto the canvas and names the reason', async () => {
    const { fixture } = await render({
      sections: [section('section-text', 'rich-text', 0)],
      failOn: { 'sections.update': new GatewayError('unreachable', 0, 'the host is not running') },
    });
    const collapse = query(fixture, '[data-section-collapse]')!;

    collapse.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-section-error]')?.textContent).toContain('the host is not running');
    // Still expanded: the write never landed, so nothing on the canvas moved.
    expect(query(fixture, '[data-section-collapse]')?.getAttribute('aria-expanded')).toBe('true');
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

  it('adds a section of a chosen registry type from Quick Add', async () => {
    const { fixture, gateway } = await render();

    enterEditMode(fixture);
    query(fixture, '[data-project-quick-add]')!.click();
    fixture.detectChanges();
    const richText = queryAll(fixture, '[data-add-section]').find(
      (button) => button.getAttribute('data-section-type') === 'rich-text',
    );
    richText!.click();
    await fixture.whenStable();

    // The registry's default config *and* the canvas's own page: §27 resolves an unnamed
    // write onto the project's canonical page, which is the wrong answer for any other page
    // a root shows.
    expect(gateway.argumentTo('sections.create')).toEqual({
      projectId: 'project-a',
      input: { type: 'rich-text', pageId: 'page-project-a', config: { text: '' } },
    });
  });

  // Test 31 of the plan: the same write, on the one canvas whose page is not canonical for
  // the project the caller would otherwise resolve to.
  it('creates on a sub-project’s work page, not on the root’s Home', async () => {
    const { fixture, gateway } = await render({
      pageId: 'page-work',
      sections: [section('section-work', 'rich-text', 0, { pageId: 'page-work' })],
    });

    enterEditMode(fixture);
    query(fixture, '[data-project-quick-add]')!.click();
    fixture.detectChanges();
    queryAll(fixture, '[data-add-section]')
      .find((button) => button.getAttribute('data-section-type') === 'rich-text')!
      .click();
    await fixture.whenStable();

    expect((gateway.argumentTo('sections.create') as { input: { pageId?: string } }).input.pageId)
      .toBe('page-work');
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

    // Completing in one list moves §39's canonical answer, which the *header* renders — and
    // the header belongs to the shell now. The canvas's job is to say so, which it does
    // through `onProjectDataChange`; `project-workspace-shell.spec.ts` asserts the other end.
    let reported = 0;
    fixture.componentRef.setInput('onProjectDataChange', () => (reported += 1));
    lists[0]!.querySelector<HTMLElement>('[data-task-complete]')!.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(reported).toBeGreaterThan(0);
  });

  it('names a section from the frame’s Settings panel, and resets the field when the write fails', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-tasks', 'task-list', 0)],
    });
    enterEditMode(fixture);
    query(fixture, '[data-section-config]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;

    input.value = 'Backlog';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.filter(({ method }) => method === 'sections.update').at(-1)?.argument).toMatchObject({
      id: 'section-tasks',
      input: { title: 'Backlog' },
    });
    expect(query(fixture, '.section-frame__title')?.textContent).toContain('Backlog');
    expect((query(fixture, '[data-section-name]') as HTMLInputElement).value).toBe('Backlog');
  });

  it('leaves the header and the field on the persisted name when a rename fails', async () => {
    // The DOM inconsistency a store-only test cannot see: the write is not optimistic, so a
    // refusal must leave the header *and* the control on what is actually stored.
    const { fixture } = await render({
      sections: [section('section-tasks', 'task-list', 0, { title: 'Backlog' })],
      failOn: { 'sections.update': new GatewayError('unreachable', 0, 'could not reach the prototype host') },
    });
    enterEditMode(fixture);
    query(fixture, '[data-section-config]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;

    input.value = 'Shipped';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '.section-frame__title')?.textContent).toContain('Backlog');
    expect((query(fixture, '[data-section-name]') as HTMLInputElement).value).toBe('Backlog');
    expect(query(fixture, '[data-section-error]')?.textContent).toContain('could not reach');
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
          // The discriminator is what opens the dialog at all; without it the store would
          // rethrow and this would render the page's error line instead.
          { reason: 'section_not_empty', liveRowCount: 2 },
        ),
      },
    });
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();

    const frames = queryAll(fixture, '[data-section-frame]');
    frames[0]!.querySelector<HTMLElement>('[data-section-remove]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The count is the domain's, so it cannot drift from the rule; the sentence is the UI's,
    // so it says "2 tasks" rather than naming a section id and a policy vocabulary.
    const dialog = query(fixture, '[data-section-removal-dialog]');
    expect(dialog).not.toBeNull();
    expect(query(fixture, '[data-section-removal-message]')?.textContent).toContain(
      'It still holds 2 tasks.',
    );
    expect(dialog?.textContent).toContain('Remove “Task List”?');
    expect(dialog?.textContent).not.toContain('section-tasks');
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
    // One canonical setFormula read and one shared section revision read. Duplicate sections
    // must not add a third — and the header's own recovery read is the shell's now.
    expect(after - before).toBe(2);
    expect(progressSections.map((region) =>
      [...region.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === 'Weighted')
        ?.getAttribute('aria-pressed'),
    )).toEqual(['true', 'true']);
    expect(progressSections.map((region) => region.textContent)).toEqual([
      expect.stringContaining('2 of 10 estimate points complete'),
      expect.stringContaining('2 of 10 estimate points complete'),
    ]);

  });

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

  it('does not remount the new canvas when the page left behind rejects a move', async () => {
    const gate = deferred<ProjectSection>();
    const { fixture, gateway } = await render({
      sections: [
        section('section-text', 'rich-text', 0),
        section('section-tasks', 'task-list', 1),
        section('section-b', 'rich-text', 0, { pageId: 'page-b' }),
      ],
    });
    gateway.sections.move = vi.fn(() => gate.promise);
    const drop = fixture.componentInstance.drop({
      previousIndex: 0,
      currentIndex: 1,
      item: { data: 'section-text' },
    } as never);
    // The user moved on to another page of the same project — the identity the rollback
    // has to compare against is the page, not only the project.
    fixture.componentRef.setInput('pageId', 'page-b');
    fixture.detectChanges();
    // Not `whenStable()`: the rejected move below is still registered with `PendingTasks`, so
    // waiting for stability here would wait for the very thing this test has not released yet.
    // A few microtask turns are enough for the new page's own list to land, and the canvas is
    // absent until it does — loading, error and empty are one chain now.
    for (let pass = 0; pass < 4; pass += 1) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    const pageBCanvas = query(fixture, '[data-section-canvas]');
    expect(pageBCanvas).not.toBeNull();

    gate.reject(new GatewayError('unreachable', 0, 'old move failed'));
    await drop;
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-section-canvas]')).toBe(pageBCanvas);
  });
});

/**
 * §47's `gridProjectLayout`. The flag gates what is *rendered*, not what is stored — the
 * project keeps its own choice, so turning the flag back on restores it rather than
 * needing a data fix.
 */
describe('ProjectCanvas — the gridProjectLayout flag (§47)', () => {
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

describe('ProjectCanvas — Archived (§31, §32)', () => {
  const archivedSection = () =>
    section('section-backlog', 'task-list', 2, { title: 'Backlog', archivedAt: AT });

  it('hides the region entirely when nothing has been removed', async () => {
    const { fixture } = await render();

    expect(query(fixture, '[data-archived-region]')).toBeNull();
  });

  it('shows the region in View Mode, because the undo is content and not layout chrome', async () => {
    // §32 gates the remove control, and this deliberately sits on the other side of that
    // line: hiding the undo behind Edit Layout Mode would hide it exactly when someone
    // needs it, right after a removal they did not mean.
    const { fixture } = await render({
      sections: [section('section-text', 'rich-text', 0), archivedSection()],
    });

    expect(query(fixture, '[data-section-remove]')).toBeNull();
    expect(query(fixture, '[data-archived-region]')).not.toBeNull();
    expect(query(fixture, '[data-archived-section]')?.textContent).toContain('Backlog');
  });

  it('restores a section and paints it back onto the canvas without a reload', async () => {
    const gatewaySections = [section('section-text', 'rich-text', 0), archivedSection()];
    const { fixture, gateway } = await render({ sections: gatewaySections });
    expect(queryAll(fixture, '[data-section-frame]')).toHaveLength(1);

    // The host answers the restore, and the reconcile that follows re-reads the canvas —
    // which is what makes the new frame appear.
    gateway.options.sections = [
      section('section-text', 'rich-text', 0),
      section('section-backlog', 'task-list', 1, { title: 'Backlog' }),
    ];
    query(fixture, '[data-archived-section-restore]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(queryAll(fixture, '[data-section-frame]')).toHaveLength(2);
    expect(query(fixture, '[data-archived-region]')).toBeNull();
  });
});
