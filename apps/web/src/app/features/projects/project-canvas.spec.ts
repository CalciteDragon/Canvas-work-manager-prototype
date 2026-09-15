import { DeferBlockState, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import {
  ProjectSchema,
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  TaskSchema,
  type Project,
  type ProjectSection,
  type SectionWriteResult,
  type ResolvedSectionShortcut,
  type SectionId,
  type ShortcutSource,
  type Task,
} from '@cwm/contracts';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { GatewayError } from '../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { ProjectCanvas } from './project-canvas';
import { ProjectPageStore } from './project-page-store';
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

const shortcut = (id: string, position: number, sourceSectionId = 'section-source'): ResolvedSectionShortcut =>
  ResolvedSectionShortcutSchema.parse({
    id,
    pageId: 'page-project-a',
    sourceSectionId,
    position,
    columnSpan: 12,
    collapsed: false,
    createdAt: AT,
    updatedAt: AT,
    source: section(sourceSectionId, 'task-list', 0, { pageId: 'page-source' }),
    sourceProjectId: 'project-a',
    sourceProjectName: 'Website launch',
    sourcePageKind: 'work',
    breadcrumb: ['Website launch', 'Source'],
    availability: 'available',
  });

const shortcutSource: ShortcutSource = {
  sourceSectionId: 'section-source' as SectionId,
  type: 'task-list',
  name: 'Source list',
  projectId: 'project-a' as Project['id'],
  projectName: 'Website launch',
  pageId: 'page-source' as ProjectSection['pageId'],
  pageKind: 'work',
  breadcrumb: ['Website launch', 'Source'],
  alreadyPlaced: false,
};

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
    shortcutsAllowed?: boolean;
    restoreBlocked?: boolean;
    sections?: ProjectSection[];
    shortcuts?: ResolvedSectionShortcut[];
    shortcutSources?: ShortcutSource[];
    tasks?: Task[];
    failWith?: GatewayError;
    failOn?: Record<string, GatewayError>;
    /** The route fragment this canvas was opened with, driveable during the test. */
    fragment?: BehaviorSubject<string | null>;
    /** Holds the section read open, so "the target has not loaded yet" is a real state. */
    sectionsGate?: ReturnType<typeof deferred<void>>;
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
    shortcuts: options.shortcuts,
    shortcutSources: options.shortcutSources,
    progress: { projectId: renderedProject.id, formula: 'count', percentage: renderedTasks.length === 0 ? null : Math.round(renderedTasks.filter(({ status }) => status === 'done').length / renderedTasks.length * 100), completed: renderedTasks.filter(({ status }) => status === 'done').length, total: renderedTasks.length, explanation: renderedTasks.length === 0 ? 'No tasks to measure' : 'Count based' },
    failWith: options.failWith,
    failOn: options.failOn,
  });

  if (options.sectionsGate !== undefined) {
    const list = gateway.sections.list.bind(gateway.sections);
    gateway.sections.list = (projectId, query) => options.sectionsGate!.promise.then(() => list(projectId, query));
  }

  TestBed.configureTestingModule({
    providers: [
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      provideRouter([]),
      // After `provideRouter`, so the canvas reads the fragment a test drives rather than the
      // empty one a router with no navigation reports.
      ...(options.fragment === undefined
        ? []
        : [{ provide: ActivatedRoute, useValue: { fragment: options.fragment.asObservable() } }]),
    ],
  });
  const fixture = TestBed.createComponent(ProjectCanvas);
  fixture.componentRef.setInput('projectId', renderedProject.id);
  fixture.componentRef.setInput('pageId', options.pageId ?? 'page-project-a');
  // The shell owns the project record; the canvas is handed only what it renders with.
  fixture.componentRef.setInput('projectLayoutMode', renderedProject.projectLayoutMode);
  fixture.componentRef.setInput('shortcutsAllowed', options.shortcutsAllowed ?? false);
  fixture.componentRef.setInput('restoreBlocked', options.restoreBlocked ?? false);
  fixture.detectChanges();
  // A gated read is deliberately still in flight, so waiting for stability here would hang:
  // that test resolves the gate itself and waits then.
  if (options.sectionsGate === undefined) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, gateway };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

const queryAll = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];

const completeDeferredBlocks = async (fixture: Awaited<ReturnType<typeof render>>['fixture']): Promise<void> => {
  const blocks = await fixture.getDeferBlocks();
  await Promise.all(blocks.map((block) => block.render(DeferBlockState.Complete)));
  fixture.detectChanges();
};

describe('ProjectCanvas (§27, §31, §32)', () => {
  it('reloads for page inputs without tracking signals read inside the store load', async () => {
    const internalState = signal(0);
    const load = vi.spyOn(ProjectPageStore.prototype, 'load').mockImplementation(async () => {
      internalState();
    });
    try {
      const { fixture } = await render();
      expect(load).toHaveBeenCalledTimes(1);
      internalState.set(1);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(load).toHaveBeenCalledTimes(1);

      fixture.componentRef.setInput('pageId', 'page-next');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(load).toHaveBeenLastCalledWith('project-a', 'page-next', false);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      load.mockRestore();
    }
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

  it('renders duplicate source placements as read-only frames without duplicate task drop lists', async () => {
    const { fixture } = await render({
      shortcutsAllowed: true,
      shortcuts: [shortcut('shortcut-a', 2), shortcut('shortcut-b', 3)],
      tasks: [task('task-source', 'todo', 'section-source')],
    });

    expect(queryAll(fixture, '[data-shortcut-frame]')).toHaveLength(2);
    expect(queryAll(fixture, '[data-shortcut-content]')).toHaveLength(2);
    expect(queryAll(fixture, '#task-list-section-source')).toHaveLength(0);
    expect(queryAll(fixture, '[data-shortcut-content] [data-task-complete]')).toHaveLength(0);
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

    expect(query(fixture, '[data-empty-canvas]')?.textContent).toContain('Add a section');
    expect(query(fixture, '[data-empty-canvas-add]')).not.toBeNull();
    expect(queryAll(fixture, '[data-section-frame]')).toHaveLength(0);
  });

  it('creates the first empty-canvas section at position zero and ignores a repeated submit', async () => {
    const { fixture, gateway } = await render({ sections: [] });
    query(fixture, '[data-empty-canvas-add]')!.click();
    fixture.detectChanges();
    await completeDeferredBlocks(fixture);
    const submit = query(fixture, '[data-create-section-submit]') as HTMLButtonElement;
    submit.click();
    submit.click();
    expect(gateway.calls.filter(({ method }) => method === 'sections.create')).toHaveLength(1);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('sections.create')).toMatchObject({
      input: { type: 'rich-text', pageId: 'page-project-a', position: 0, columnSpan: 12 },
    });
    expect(queryAll(fixture, '[data-section-item]')).toHaveLength(1);
    expect(query(fixture, '[data-section-create-dialog]')).toBeNull();
  });

  it('cancels contextual creation on Cancel and Escape without writing', async () => {
    const { fixture, gateway } = await render({ sections: [] });
    query(fixture, '[data-empty-canvas-add]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-create-section-cancel]')!.click();
    expect(gateway.calls.some(({ method }) => method === 'sections.create')).toBe(false);

    query(fixture, '[data-empty-canvas-add]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-section-create-dialog]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(gateway.calls.some(({ method }) => method === 'sections.create')).toBe(false);
    expect(query(fixture, '[data-section-create-dialog]')).toBeNull();
  });

  it('creates into a grid gap with the widest span that fits the selected row', async () => {
    const { fixture, gateway } = await render({
      project: project({ projectLayoutMode: 'grid' }),
      sections: [
        section('section-wide', 'rich-text', 0, { columnSpan: 8 }),
        section('section-next-row', 'task-list', 1, { columnSpan: 6 }),
      ],
    });
    const gap = query(fixture, 'app-insertion-point[data-insertion-point="gap"] button');
    expect(gap).not.toBeNull();
    gap!.click();
    fixture.detectChanges();
    query(fixture, '[data-create-section-submit]')!.click();
    await fixture.whenStable();

    expect(gateway.argumentTo('sections.create')).toMatchObject({
      input: { position: 1, columnSpan: 4 },
    });
  });

  it('resolves the remembered anchor after a live placement is added', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)],
    });
    fixture.nativeElement.querySelector(
      'app-insertion-point[data-insertion-point="before"][data-before-id="section-tasks"] button',
    ).click();
    fixture.detectChanges();
    const definition = SECTION_REGISTRY.find(({ type }) => type === 'progress')!;
    const result = await fixture.componentInstance.store.addSection(definition, { position: 2 });
    expect(result.ok).toBe(true);
    fixture.detectChanges();

    query(fixture, '[data-create-section-submit]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const creates = gateway.calls.filter(({ method }) => method === 'sections.create');
    expect((creates.at(-1)?.argument as { input: { position: number } }).input.position).toBe(1);
  });

  it('keeps the dialog open and reports when its remembered anchor disappeared', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)],
    });
    fixture.nativeElement.querySelector(
      'app-insertion-point[data-insertion-point="before"][data-before-id="section-tasks"] button',
    ).click();
    fixture.detectChanges();
    gateway.options.sections = [section('section-text', 'rich-text', 0)];
    await fixture.componentInstance.store.load('project-a' as Project['id'], 'page-project-a' as ProjectSection['pageId'], false);
    fixture.detectChanges();

    query(fixture, '[data-create-section-submit]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-create-section-error]')?.textContent).toContain('no longer available');
    expect(query(fixture, '[data-section-create-dialog]')).not.toBeNull();
    expect(gateway.calls.some(({ method }) => method === 'sections.create')).toBe(false);
  });

  it('hides insertion controls when a Home shortcut read leaves the combined order incomplete', async () => {
    const { fixture } = await render({
      shortcutsAllowed: true,
      failOn: { 'shortcuts.list': new GatewayError('unreachable', 0, 'shortcut placements unavailable') },
    });

    expect(query(fixture, '[data-placement-order-incomplete]')).not.toBeNull();
    expect(queryAll(fixture, 'app-insertion-point')).toHaveLength(0);
    expect(query(fixture, '[data-section-drag-handle]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('adds a Home shortcut through the same popup and remembers its insertion position', async () => {
    const { fixture, gateway } = await render({ shortcutsAllowed: true, shortcutSources: [shortcutSource] });
    query(fixture, '[data-insertion-point-button]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-create-shortcut-mode]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    query(fixture, '[data-shortcut-add]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('shortcuts.create')).toMatchObject({
      input: {
        pageId: 'page-project-a',
        sourceSectionId: 'section-source',
        position: 0,
        columnSpan: 12,
      },
    });
    expect(queryAll(fixture, '[data-shortcut-frame]')).toHaveLength(1);
    expect(query(fixture, '[data-section-create-dialog]')).toBeNull();
  });

  it.each(['flow', 'grid'] as const)('previews and commits a snapped width in %s without moving its position', async (mode) => {
    const { fixture, gateway } = await render({ project: project({ projectLayoutMode: mode }) });
    const target = query(fixture, '[data-section-item]')!;
    const handle = query(fixture, 'app-section-resize-handle[data-edge="end"] [data-resize-handle]')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(target.classList).toContain('section-canvas__item--span-8');
    expect(queryAll(fixture, '[data-section-item]').map((item) => item.dataset['sectionId'])).toEqual([
      'section-text',
      'section-tasks',
    ]);

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(gateway.argumentTo('sections.update')).toMatchObject({ id: 'section-text', input: { columnSpan: 8 } });
    expect(target.classList).toContain('section-canvas__item--span-8');
  });

  it('restores the saved width after a rejected resize commit', async () => {
    const { fixture } = await render({
      failOn: { 'sections.update': new GatewayError('unreachable', 0, 'resize could not be saved') },
    });
    const target = query(fixture, '[data-section-item]')!;
    const handle = query(fixture, 'app-section-resize-handle[data-edge="end"] [data-resize-handle]')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(target.classList).toContain('section-canvas__item--span-8');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(target.classList).toContain('section-canvas__item--span-12');
    expect(query(fixture, '[data-section-error]')?.textContent).toContain('resize could not be saved');
  });

  it('moves a section by keyboard, announces its position, and restores focus', async () => {
    const { fixture, gateway } = await render();
    const firstGrip = query(fixture, '[data-section-item] [data-section-drag-handle]')!;
    firstGrip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('sections.move')).toEqual({ id: 'section-text', input: { position: 1 } });
    expect(queryAll(fixture, '[data-section-item]').map((item) => item.dataset['sectionId'])).toEqual([
      'section-tasks',
      'section-text',
    ]);
    expect(query(fixture, '[data-canvas-live-region]')?.textContent).toContain('Moved Rich Text to position 2 of 2');
    expect(document.activeElement).toBe(query(fixture, '[data-section-item][data-section-id="section-text"] [data-section-drag-handle]'));
  });

  it('moves focus from the removed section to Undo, then to the restored heading', async () => {
    const { fixture } = await render();
    const remove = query(fixture, '[data-section-id="section-text"] [data-section-remove]') as HTMLButtonElement;
    remove.focus();
    remove.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await completeDeferredBlocks(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    const undo = query(fixture, '[data-undo-action]') as HTMLButtonElement;
    expect(undo).not.toBeNull();
    expect(document.activeElement).toBe(undo);

    undo.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-section-id="section-text"]')).not.toBeNull();
    expect(document.activeElement).toBe(
      query(fixture, '[data-section-id="section-text"] [data-section-title]'),
    );
  });

  it('does not steal focus when a removal was started outside its section frame', async () => {
    const { fixture } = await render();

    query(fixture, '[data-section-id="section-text"] [data-section-remove]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-undo-action]')).not.toBeNull();
    expect(document.activeElement).not.toBe(query(fixture, '[data-undo-action]'));
  });

  it('returns focus to surviving canvas content when the Undo notice is dismissed', async () => {
    const { fixture } = await render();
    const remove = query(fixture, '[data-section-id="section-text"] [data-section-remove]') as HTMLButtonElement;
    remove.focus();
    remove.click();
    await fixture.whenStable();
    fixture.detectChanges();
    query(fixture, '[data-dismiss-undo-notice]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-undo-notice]')).toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-section-title]'));
  });

  it('dismisses Undo and remove failures independently and focuses the remaining action', async () => {
    const { fixture, gateway } = await render();
    const removeSection = gateway.sections.remove.bind(gateway.sections);
    gateway.sections.remove = async (id, input) => {
      if (id === 'section-tasks') throw new GatewayError('unreachable', 0, 'Task removal response was lost');
      return removeSection(id, input);
    };
    query(fixture, '[data-section-id="section-text"] [data-section-remove]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    query(fixture, '[data-section-id="section-tasks"] [data-section-remove]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-undo-action]')).not.toBeNull();
    expect(query(fixture, '[data-retry-remove]')).not.toBeNull();

    query(fixture, '[data-dismiss-removal-error]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-undo-action]')).not.toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-undo-action]'));

    query(fixture, '[data-section-id="section-tasks"] [data-section-remove]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    query(fixture, '[data-dismiss-undo-notice]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-undo-notice]')).toBeNull();
    expect(query(fixture, '[data-retry-remove]')).not.toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-retry-remove]'));
  });

  it('renders a removable fallback for a section type nothing registers', async () => {
    // `data.json` is hand-editable and outlives any one registry, so this is a real state.
    const { fixture, gateway } = await render({
      sections: [section('section-unknown', 'unknown-future-type', 0)],
    });

    expect(query(fixture, '[data-unknown-section]')?.textContent).toContain('unknown-future-type');
    // It must not leave the user stuck with a card they can never get rid of.
    query(fixture, '[data-unknown-section-remove]')!.click();
    await fixture.whenStable();

    // No policy: an unknown type reads as a view, so removing it can never touch data.
    expect(gateway.argumentTo('sections.remove')).toEqual({ id: 'section-unknown', input: {} });
  });

  it('inserts a named section before the selected anchor from the contextual dialog', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)],
    });
    const beforeTasks = fixture.nativeElement.querySelector(
      'app-insertion-point[data-insertion-point="before"][data-before-id="section-tasks"] button',
    ) as HTMLButtonElement;
    beforeTasks.click();
    fixture.detectChanges();
    const type = query(fixture, '[data-create-section-type]') as HTMLSelectElement;
    type.value = 'rich-text';
    type.dispatchEvent(new Event('change'));
    const name = query(fixture, '[data-create-section-name]') as HTMLInputElement;
    name.value = 'Release notes';
    name.dispatchEvent(new Event('input'));
    query(fixture, '[data-create-section-submit]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('sections.create')).toMatchObject({
      projectId: 'project-a',
      input: { type: 'rich-text', pageId: 'page-project-a', position: 1, columnSpan: 12, title: 'Release notes' },
    });
    expect(queryAll(fixture, '[data-section-item]').map((item) => item.dataset['sectionId'])).toEqual([
      'section-text',
      expect.stringContaining('section'),
      'section-tasks',
    ]);
  });

  // Test 31 of the plan: the same write, on the one canvas whose page is not canonical for
  // the project the caller would otherwise resolve to.
  it('creates on a sub-project’s work page and does not offer shortcut mode', async () => {
    const { fixture, gateway } = await render({
      pageId: 'page-work',
      sections: [section('section-work', 'rich-text', 0, { pageId: 'page-work' })],
    });

    query(fixture, '[data-insertion-point-button]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-create-shortcut-mode]')).toBeNull();
    query(fixture, '[data-create-section-submit]')!.click();
    await fixture.whenStable();

    expect((gateway.argumentTo('sections.create') as { input: { pageId?: string; position?: number } }).input)
      .toMatchObject({ pageId: 'page-work', position: 0 });
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

  it('renames a section inline on Enter and persists the override', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-tasks', 'task-list', 0)],
    });
    query(fixture, '[data-section-title-edit]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;

    input.value = 'Backlog';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.filter(({ method }) => method === 'sections.update').at(-1)?.argument).toMatchObject({
      id: 'section-tasks',
      input: { title: 'Backlog' },
    });
    expect(query(fixture, '.section-frame__title')?.textContent).toContain('Backlog');
    expect(query(fixture, '[data-section-name]')).toBeNull();
  });

  it('leaves the header and the field on the persisted name when a rename fails', async () => {
    // The DOM inconsistency a store-only test cannot see: the write is not optimistic, so a
    // refusal must leave the header *and* the control on what is actually stored.
    const { fixture } = await render({
      sections: [section('section-tasks', 'task-list', 0, { title: 'Backlog' })],
      failOn: { 'sections.update': new GatewayError('unreachable', 0, 'could not reach the prototype host') },
    });
    query(fixture, '[data-section-title-edit]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;

    input.value = 'Shipped';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((query(fixture, '[data-section-name]') as HTMLInputElement).value).toBe('Shipped');
    expect(query(fixture, '[data-section-error]')?.textContent).toContain('could not reach');
  });

  it('asks how to remove a container that still holds rows, and removes a view outright', async () => {
    const { fixture, gateway } = await render({
      sections: [
        section('section-tasks', 'task-list', 0),
        section('section-tasks-copy', 'task-list', 1),
        section('section-progress', 'progress', 2),
      ],
    });
    const remove = gateway.sections.remove.bind(gateway.sections);
    const refusal = new GatewayError(
      'rule_violation',
      409,
      'section "section-tasks" still holds 2 tasks; removing it needs a policy of "cascade" or "reassign"',
      // The discriminator is what opens the dialog at all; without it the store would
      // retain an explicit failed-removal action rather than ask a policy question.
      { reason: 'section_not_empty', liveRowCount: 2 },
    );
    gateway.sections.remove = vi.fn<typeof gateway.sections.remove>(async (id, input) => {
      if (input?.policy === undefined) throw refusal;
      return remove(id, input);
    });
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
    expect(document.activeElement).toBe(query(fixture, '[data-section-removal-cancel]'));

    query(fixture, '[data-section-removal-cascade]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.filter(({ method }) => method === 'sections.remove').at(-1)?.argument).toMatchObject({
      input: { policy: 'cascade' },
    });
    expect(document.activeElement).toBe(query(fixture, '[data-undo-action]'));
  });

  it('reloads every duplicated Progress view after one changes the canonical formula', async () => {
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
    // Each Progress view owns a project-keyed store. They still agree on one project, but the
    // second view performs its own read instead of sharing a canvas-scoped store.
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

  it('shows direct canvas controls without edit mode, Quick Add, size or duplicate controls', async () => {
    const root = await render({ shortcutsAllowed: true });
    expect(query(root.fixture, '[data-section-drag-handle]')).not.toBeNull();
    expect(query(root.fixture, '[data-section-collapse]')).not.toBeNull();
    expect(query(root.fixture, '[data-section-remove]')).not.toBeNull();
    expect(query(root.fixture, '[data-section-size]')).toBeNull();
    expect(query(root.fixture, '[data-section-duplicate]')).toBeNull();
    for (const selector of [
      '[data-layout-edit-toggle]',
      '[data-project-quick-add]',
      '[data-project-add-shortcut]',
      '[data-add-section-menu]',
    ]) {
      expect(query(root.fixture, selector), selector).toBeNull();
    }
    query(root.fixture, '[data-insertion-point-button]')!.click();
    root.fixture.detectChanges();
    expect(query(root.fixture, '[data-create-shortcut-mode]')).not.toBeNull();
    query(root.fixture, '[data-section-create-dialog]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    root.fixture.detectChanges();
    expect(query(root.fixture, '[data-section-create-dialog]')).toBeNull();
  });

  it('sends section and shortcut drops as positions in the same combined sequence', async () => {
    const { fixture, gateway } = await render({
      shortcutsAllowed: true,
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 2)],
      shortcuts: [shortcut('shortcut-a', 1)],
      tasks: [task('task-source', 'todo', 'section-source')],
    });
    await fixture.componentInstance.drop({
      previousIndex: 1,
      currentIndex: 0,
      item: { data: { kind: 'shortcut', id: 'shortcut-a' } },
    } as never);
    expect(gateway.argumentTo('shortcuts.move')).toEqual({
      id: 'shortcut-a',
      input: { position: 0 },
    });

    await fixture.componentInstance.drop({
      previousIndex: 0,
      currentIndex: 2,
      item: { data: { kind: 'section', id: 'section-text' } },
    } as never);
    expect(gateway.argumentTo('sections.move')).toEqual({
      id: 'section-text',
      input: { position: 2 },
    });
  });

  it('dispatches a drop by the dragged section id and complete-list index', async () => {
    const { fixture, gateway } = await render({
      sections: [
        section('section-text', 'rich-text', 0),
        section('section-unknown', 'unknown-future-type', 1),
        section('section-tasks', 'task-list', 2),
      ],
    });
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
    const gate = deferred<SectionWriteResult>();
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

describe('ProjectCanvas — Archive boundary (§31, §32)', () => {
  it('does not render a page-local archive region, even when an archived section is returned', async () => {
    const { fixture } = await render({
      sections: [section('section-text', 'rich-text', 0), section('section-backlog', 'task-list', 2, { archivedAt: AT })],
    });

    expect(query(fixture, '[data-archived-region]')).toBeNull();
  });
});

/**
 * §34's Todos rows link to the container that owns them, so a canvas has to be able to arrive at
 * one: `/projects/:id/pages/home#section-<id>`. The router's global anchor scrolling cannot do
 * this — the app scrolls its own region, and the section may not have loaded, or may be collapsed.
 */
describe('ProjectCanvas — arriving at a container (§27, §34)', () => {
  const frameFor = (fixture: Awaited<ReturnType<typeof render>>['fixture'], id: string) =>
    queryAll(fixture, '[data-section-item]').find((item) => item.dataset['sectionId'] === id)!;

  it('waits for the section to load, then focuses its heading', async () => {
    const sectionsGate = deferred<void>();
    const { fixture } = await render({ fragment: new BehaviorSubject<string | null>('section-section-tasks'), sectionsGate });
    // Nothing to focus yet, and nothing claimed to be missing while the read is in flight.
    expect(query(fixture, '[data-section-target-missing]')).toBeNull();

    sectionsGate.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

    const heading = frameFor(fixture, 'section-tasks').querySelector('[data-section-title]');
    expect(document.activeElement).toBe(heading);
    expect(frameFor(fixture, 'section-tasks').getAttribute('id')).toBe('section-section-tasks');
  });

  it('opens a collapsed target for the visit, and writes nothing to get there', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1, { collapsed: true })],
      fragment: new BehaviorSubject<string | null>('section-section-tasks'),
    });

    const frame = frameFor(fixture, 'section-tasks');
    expect(frame.querySelector('[data-section-content]')).not.toBeNull();
    expect(frame.querySelector('[data-section-collapse]')!.getAttribute('aria-expanded')).toBe('true');
    // Arrival is a read: no layout was persisted to open it.
    expect(gateway.calls.some(({ method }) => method === 'sections.update')).toBe(false);
  });

  it('releases the transient open state when the reader collapses that container', async () => {
    const { fixture, gateway } = await render({
      sections: [section('section-tasks', 'task-list', 0, { collapsed: true })],
      fragment: new BehaviorSubject<string | null>('section-section-tasks'),
    });

    (frameFor(fixture, 'section-tasks').querySelector('[data-section-collapse]') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(frameFor(fixture, 'section-tasks').querySelector('[data-section-content]')).toBeNull();
    // The ordinary canonical operation, not a second collapse mechanism.
    expect(gateway.calls.some(({ method }) => method === 'sections.update')).toBe(true);
  });

  it('follows a second target and forgets the first', async () => {
    const fragment = new BehaviorSubject<string | null>('section-section-tasks');
    const { fixture } = await render({ fragment });

    fragment.next('section-section-text');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(frameFor(fixture, 'section-text').querySelector('[data-section-title]'));
  });

  it('leaves the canvas usable when the fragment names nothing on this page', async () => {
    for (const fragment of ['section-section-gone', 'section-"]:not(*)', 'notes']) {
      TestBed.resetTestingModule();
      const { fixture } = await render({ fragment: new BehaviorSubject<string | null>(fragment) });

      // Every section still rendered; only a fragment that *looks* like a target says anything.
      expect(queryAll(fixture, '[data-section-frame]')).toHaveLength(2);
      expect(query(fixture, '[data-section-target-missing]') === null).toBe(!fragment.startsWith('section-'));
    }
  });
});
