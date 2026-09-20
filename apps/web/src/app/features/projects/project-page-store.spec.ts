import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  TaskSchema,
  type SectionRemovalResult,
  type Project,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type ResolvedSectionShortcut,
  type SectionAddResult,
  type SectionId,
  type SectionWriteResult,
  type Task,
  type OperationActionId,
  type OperationHistoryId,
  type OperationHistoryTransitionResult,
  type OperationReceipt,
  type UndoResult,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { emptyDashboard } from '../../core/gateway/testing/fake-gateway';
import {
  WORK_MANAGER_GATEWAY,
  type WorkManagerGateway,
} from '../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { FakeLiveUpdates } from '../../core/live/testing/fake-live-updates';
import { TaskListStore } from '../tasks/task-list-store';
import { ProjectPageStore } from './project-page-store';
import type { SectionDefinition } from './sections/registry';

const AT = '2026-08-27T16:00:00.000Z';
const PROJECT = 'project-a' as ProjectId;
const PAGE = `page-${PROJECT}` as ProjectPageId;
const OTHER_PAGE = 'page-project-b' as ProjectPageId;

const project = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: PROJECT,
    workspaceId: 'workspace-demo',
    kind: 'root',
    name: 'Website launch',
    icon: '🚀',
    status: 'active',
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
    projectId: PROJECT,
    pageId: `page-${PROJECT}`,
    type,
    position,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const task = (id: string, status: 'todo' | 'done' = 'todo'): Task =>
  TaskSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-tasks',
    title: `Task ${id}`,
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

const shortcut = (
  id: string,
  position: number,
  overrides: Record<string, unknown> = {},
): ResolvedSectionShortcut =>
  ResolvedSectionShortcutSchema.parse({
    id,
    pageId: PAGE,
    sourceSectionId: `source-${id}`,
    position,
    columnSpan: 12,
    collapsed: false,
    createdAt: AT,
    updatedAt: AT,
    source: section(`source-${id}`, 'rich-text', 0, {
      projectId: 'project-source',
      pageId: `page-source-${id}`,
    }),
    sourceProjectId: 'project-source',
    sourceProjectName: 'Source project',
    sourcePageKind: 'work',
    breadcrumb: ['Website launch', 'Source project'],
    availability: 'available',
    ...overrides,
  });

/** Every receipt in these specs comes from one history, ordered by revision as the host orders it. */
const HISTORY = 'history-test' as OperationHistoryId;
let testReceiptSequence = 0;
const receipt = (id: string): OperationReceipt => ({
  historyId: HISTORY,
  actionId: id as OperationActionId,
  operation: 'section.remove',
  revision: ++testReceiptSequence,
  label: `Removed ${id}`,
  createdAt: AT,
  expiresAt: '2026-08-28T16:00:00.000Z',
});
const addReceipt = (id: string): OperationReceipt => ({
  historyId: HISTORY,
  actionId: id as OperationActionId,
  operation: 'section.add',
  revision: ++testReceiptSequence,
  label: `Added ${id}`,
  createdAt: AT,
  expiresAt: '2026-08-28T16:00:00.000Z',
});

/** The spec's stand-in for the host's Undo executor, keyed by the action a transition names. */
type UndoExecute = (actionId: OperationActionId) => Promise<UndoResult>;

/** Refusal details as the host sends them: the history, the named action and the current summary. */
const historyDetails = (actionId: string, details: Record<string, unknown>, summary: Record<string, unknown> = {}) => ({
  historyId: HISTORY,
  actionId,
  summary: { projectId: PROJECT, historyId: HISTORY, revision: 1, undo: null, redo: null, blockedBy: null, ...summary },
  ...details,
});

type LegacySectionOverrides = Omit<Partial<WorkManagerGateway['sections']>, 'create' | 'update' | 'move'> & {
  create?: (...args: Parameters<WorkManagerGateway['sections']['create']>) => Promise<ProjectSection | SectionAddResult>;
  update?: (...args: Parameters<WorkManagerGateway['sections']['update']>) => Promise<ProjectSection | SectionWriteResult>;
  move?: (...args: Parameters<WorkManagerGateway['sections']['move']>) => Promise<ProjectSection | SectionWriteResult>;
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

const setup = (
  options: {
    sections?: ProjectSection[];
    shortcuts?: ResolvedSectionShortcut[];
    tasks?: Task[];
    projectGet?: WorkManagerGateway['projects']['get'];
    projectUpdate?: WorkManagerGateway['projects']['update'];
    sectionOverrides?: LegacySectionOverrides;
    shortcutList?: WorkManagerGateway['shortcuts']['list'];
    shortcutOverrides?: Partial<WorkManagerGateway['shortcuts']>;
    taskList?: WorkManagerGateway['tasks']['list'];
    undoExecute?: UndoExecute;
  } = {},
) => {
  // Mutated by the write fakes, so a spec sees what a re-listing host would answer.
  let sections = options.sections ?? [
    section('section-text', 'rich-text', 0),
    section('section-tasks', 'task-list', 1),
  ];
  let shortcuts = options.shortcuts ?? [];
  const removedSections = new Map<OperationActionId, ProjectSection>();
  const sectionOverrides = options.sectionOverrides ?? {};
  const { create: ignoredCreate, update: ignoredUpdate, move: ignoredMove, ...otherSectionOverrides } = sectionOverrides;
  void ignoredCreate;
  void ignoredUpdate;
  void ignoredMove;
  const defaultCreate = async (_projectId: ProjectId, input: Parameters<WorkManagerGateway['sections']['create']>[1]): Promise<SectionAddResult> => {
    const created = section(`section-${sections.length}`, input.type, sections.length, { config: input.config });
    sections = [...sections, created];
    return { section: created, operation: addReceipt(`undo-create-${created.id}`) };
  };
  const defaultUpdate = async (id: SectionId, input: Parameters<WorkManagerGateway['sections']['update']>[1]): Promise<SectionWriteResult> => {
    const updated = { ...sections.find((item) => item.id === id)!, ...input } as ProjectSection;
    sections = sections.map((item) => (item.id === id ? updated : item));
    return { section: updated, operation: null };
  };
  const defaultMove = async (id: SectionId, input: Parameters<WorkManagerGateway['sections']['move']>[1]): Promise<SectionWriteResult> => ({
    section: { ...sections.find((item) => item.id === id)!, position: input.position },
    operation: null,
  });
  const undoExecute: UndoExecute = options.undoExecute ?? vi.fn(async (actionId: OperationActionId): Promise<UndoResult> => {
    const original = removedSections.get(actionId);
    if (original === undefined) throw new GatewayError('not_found', 404, `no such history action "${actionId}"`);
    const restored = { ...original };
    delete restored.archivedAt;
    const next = [...sections];
    next.splice(Math.min(restored.position, next.length), 0, restored);
    sections = next.map((item, position) => ({ ...item, position }));
    removedSections.delete(actionId);
    const saved = sections.find(({ id }) => id === restored.id)!;
    return {
      operation: 'section.remove',
      outcome: 'restored',
      section: saved,
      placement: { pageId: saved.pageId, index: saved.position, strategy: 'index', pageEnabled: true },
      restoredRowCount: 0,
    };
  });
  const normalizeCreate = (result: ProjectSection | SectionAddResult): SectionAddResult =>
    'section' in result ? result : { section: result, operation: addReceipt(`undo-create-${result.id}`) };
  const normalizeWrite = (result: ProjectSection | SectionWriteResult): SectionWriteResult =>
    'section' in result ? result : { section: result, operation: null };

  const gateway: WorkManagerGateway = {
    // Slice 11 added `dashboard` to the boundary; nothing on the project page reads it.
    dashboard: { get: vi.fn(async () => emptyDashboard()) },
    // Slice 13 added these two for the same reason.
    agents: { list: vi.fn(async () => []), setPermissions: vi.fn(), revoke: vi.fn() },
    // Slice 25.2 added `pages`; nothing here reads it until the workspace shell lands (25.3).
    pages: { list: vi.fn(async () => []), setEnabled: vi.fn() },
    activity: { list: vi.fn(async () => []) },
    // Slice 25.5 added `todos`; this store reads a canvas, never the chronology.
    todos: { get: vi.fn(async () => ({ projectId: PROJECT, items: [] })) },
    archive: { get: vi.fn(async () => ({ projectId: PROJECT, root: project() as Extract<Project, { kind: 'root' }>, items: [] })) },
    journal: { get: vi.fn(async () => ({ projectId: PROJECT, items: [] })), completedWork: vi.fn(async () => ({ projectId: PROJECT, candidates: [] })) },
    history: {
      summary: vi.fn(async (projectId) => ({ projectId, historyId: HISTORY, revision: testReceiptSequence, undo: null, redo: null, blockedBy: null })),
      transition: vi.fn(async (_historyId, input): Promise<OperationHistoryTransitionResult> => ({
        direction: 'undo',
        actionId: input.actionId,
        result: await undoExecute(input.actionId),
        summary: { projectId: PROJECT, historyId: HISTORY, revision: ++testReceiptSequence, undo: null, redo: null, blockedBy: null },
      })),
    },
    projects: {
      list: vi.fn(async () => [project()]),
      get: options.projectGet ?? vi.fn(async () => project()),
      create: vi.fn(),
      // The host's `null` clears / `undefined` leaves alone rule, so a spec clearing a
      // target date sees what the real adapter answers rather than a `null` the contract
      // forbids.
      update:
        options.projectUpdate ??
        vi.fn(async (_id, input) => {
          const next: Record<string, unknown> = { ...project(), updatedAt: '2026-08-28T09:00:00.000Z' };
          for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue;
            if (value === null) delete next[key];
            else next[key] = value;
          }
          return next as Project;
        }),
    },
    sections: {
      list: sectionOverrides.list ?? vi.fn(async () => [...sections]),
      create: vi.fn(async (...args: Parameters<WorkManagerGateway['sections']['create']>) =>
        normalizeCreate(await (sectionOverrides.create ?? defaultCreate)(...args))),
      update: vi.fn(async (...args: Parameters<WorkManagerGateway['sections']['update']>) =>
        normalizeWrite(await (sectionOverrides.update ?? defaultUpdate)(...args))),
      move: vi.fn(async (...args: Parameters<WorkManagerGateway['sections']['move']>) =>
        normalizeWrite(await (sectionOverrides.move ?? defaultMove)(...args))),
      duplicate: vi.fn(async (id) => {
        const original = sections.find((item) => item.id === id)!;
        const copy = {
          ...original,
          id: `${id}-copy` as SectionId,
          position: original.position + 1,
        };
        sections = [
          ...sections.map((item) =>
            item.position > original.position ? { ...item, position: item.position + 1 } : item,
          ),
          copy,
        ];
        return copy;
      }),
      remove: vi.fn(async (id) => {
        const original = sections.find((item) => item.id === id)!;
        const actionId = `undo-${id}` as OperationActionId;
        sections = sections
          .filter((item) => item.id !== id)
          .map((item, position) => ({ ...item, position }));
        removedSections.set(actionId, original);
        const result: SectionRemovalResult = {
          section: { ...original, archivedAt: AT },
          operation: receipt(actionId),
          archiveListed: true,
        };
        return result;
      }),
      restore: vi.fn(async (id) => sections.find((item) => item.id === id)!),
      ...otherSectionOverrides,
    },
    shortcuts: {
      list:
        options.shortcutList ??
        vi.fn(async () => [...shortcuts]),
      sources: vi.fn(async () => []),
      create: vi.fn(async (_projectId, input) => {
        const created = shortcut(`shortcut-${shortcuts.length + 1}`, shortcuts.length, {
          pageId: input.pageId,
          sourceSectionId: input.sourceSectionId,
        });
        shortcuts = [...shortcuts, created];
        return created;
      }),
      update: vi.fn(async (id, input) => {
        const current = shortcuts.find((item) => item.id === id)!;
        const updated = { ...current, ...input };
        shortcuts = shortcuts.map((item) => (item.id === id ? updated : item));
        return updated;
      }),
      move: vi.fn(async (id, input) => {
        const current = shortcuts.find((item) => item.id === id)!;
        const updated = { ...current, position: input.position };
        shortcuts = shortcuts.map((item) => (item.id === id ? updated : item));
        return updated;
      }),
      remove: vi.fn(async (id) => {
        shortcuts = shortcuts.filter((item) => item.id !== id);
      }),
      ...options.shortcutOverrides,
    } as WorkManagerGateway['shortcuts'],
    tasks: {
      list:
        options.taskList ??
        vi.fn(async () => options.tasks ?? [task('task-1'), task('task-2', 'done')]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      complete: vi.fn(async (id: string) => ({ task: task(id, 'done'), operation: null })),
      archive: vi.fn(),
      restore: vi.fn(),
    } as unknown as WorkManagerGateway['tasks'],
    progress: { get: vi.fn(async () => { const items = options.tasks ?? [task('task-1'), task('task-2', 'done')]; const done = items.filter(({status}) => status === 'done').length; return { projectId: PROJECT, formula: 'count' as const, percentage: items.length === 0 ? null : Math.round(done / items.length * 100), completed: done, total: items.length, explanation: items.length === 0 ? 'No tasks to measure' : 'Count based' }; }) },
    timeline: { get: vi.fn(async () => ({ projectId: PROJECT, items: [] })) },
    reflections: { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() },
  };

  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [
      TaskListStore,
      ProjectPageStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  return { store: TestBed.inject(ProjectPageStore), tasks: TestBed.inject(TaskListStore), gateway, live };
};

const definition = (overrides: Partial<SectionDefinition> = {}): SectionDefinition => ({
  type: 'rich-text',
  kind: 'view',
  displayName: 'Rich Text',
  icon: '📝',
  createDefaultConfig: () => ({ text: '' }),
  // Satisfies the content contract `SectionDefinition.component` requires; never rendered.
  component: class {
    readonly section = undefined;
    readonly onConfigChange = undefined;
    readonly onProjectDataChange = undefined;
    readonly onProjectHierarchyChange = undefined;
    readonly projectDataRevision = undefined;
    readonly projectHierarchyRevision = undefined;
    readonly readOnly = undefined;
  },
  ...overrides,
});
describe('ProjectPageStore (§19, §26)', () => {
  it('does not read shortcut placements when the routed page does not allow them', async () => {
    const { store, gateway, live } = setup({ shortcuts: [shortcut('shortcut-hidden', 0)] });

    await store.load(PROJECT, PAGE, false);
    expect(gateway.shortcuts.list).not.toHaveBeenCalled();
    expect(store.shortcuts()).toEqual([]);

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();
    expect(gateway.shortcuts.list).not.toHaveBeenCalled();
    expect(store.shortcuts()).toEqual([]);
  });

  it('loads its page’s sections in position order, and reads no rows itself', async () => {
    const { store, gateway } = setup({
      sections: [section('section-tasks', 'task-list', 1), section('section-text', 'rich-text', 0)],
    });

    await store.load(PROJECT, PAGE);

    // Ordering is the store's job — the canvas renders what it is handed.
    expect(store.sections().map(({ id }) => id)).toEqual(['section-text', 'section-tasks']);
    // A container owns its rows, so the Task List section reads them; this store does not.
    expect(gateway.tasks.list).not.toHaveBeenCalled();
    expect(store.error()).toBeNull();
  });

  it('merges sections and shortcuts into one ordered placement list', async () => {
    const { store } = setup({
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 2)],
      shortcuts: [shortcut('shortcut-a', 1)],
    });

    await store.load(PROJECT, PAGE);

    expect(store.placements().map((placement) => [placement.kind, placement.kind === 'section' ? placement.section.id : placement.shortcut.id])).toEqual([
      ['section', 'section-text'],
      ['shortcut', 'shortcut-a'],
      ['section', 'section-tasks'],
    ]);
  });

  it('renders an empty placement list for a page with neither sections nor shortcuts', async () => {
    const { store } = setup({ sections: [], shortcuts: [] });

    await store.load(PROJECT, PAGE);

    expect(store.placements()).toEqual([]);
  });

  it('does not let a late shortcut response from the previous page write into the new page', async () => {
    const previous = deferred<ResolvedSectionShortcut[]>();
    const current = deferred<ResolvedSectionShortcut[]>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other, pageId: OTHER_PAGE })],
        ),
      },
      shortcutList: vi.fn(async (projectId: ProjectId) => {
        if (projectId === PROJECT) {
          await previous.promise;
          return [shortcut('shortcut-previous', 1)];
        }
        await current.promise;
        return [];
      }),
    });

    const oldLoad = store.load(PROJECT, PAGE);
    const newLoad = store.load(other, OTHER_PAGE);
    current.resolve([]);
    await newLoad;
    previous.reject(new GatewayError('unreachable', 0, 'old shortcut read failed'));
    await oldLoad;

    expect(store.shortcuts()).toEqual([]);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
    expect(store.orderComplete()).toBe(true);
  });

  it('keeps a successfully loaded section canvas when the placement read fails, and reports it', async () => {
    const { store } = setup({
      shortcutList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'shortcut read failed');
      }),
    });

    await store.load(PROJECT, PAGE);

    expect(store.sections()).toHaveLength(2);
    expect(store.placements().every((placement) => placement.kind === 'section')).toBe(true);
    expect(store.sectionError()).toContain('shortcut read failed');
    expect(store.error()).toBeNull();
  });

  it('marks the combined order incomplete on a load or refreshSections read failure and recovers', async () => {
    const { store, live } = setup({
      shortcutList: vi.fn()
        .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'load shortcut read failed'))
        .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'refresh shortcut read failed'))
        .mockResolvedValue([shortcut('shortcut-a', 2)]),
    });

    await store.load(PROJECT, PAGE);
    expect(store.orderComplete()).toBe(false);
    expect(store.sectionError()).toContain('load shortcut read failed');

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();
    expect(store.orderComplete()).toBe(false);
    expect(store.sectionError()).toContain('refresh shortcut read failed');

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();
    expect(store.orderComplete()).toBe(true);
    expect(store.sectionError()).toBeNull();
  });

  it('updates orderComplete on refreshShortcuts and reconcileSections reads', async () => {
    const shortcutReads = vi.fn()
      .mockResolvedValueOnce([shortcut('shortcut-a', 2)])
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'shortcut refresh failed'))
      .mockResolvedValueOnce([shortcut('shortcut-a', 2)])
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'shortcut reconcile failed'))
      .mockResolvedValue([shortcut('shortcut-a', 2)]);
    const { store, live } = setup({
      shortcuts: [shortcut('shortcut-a', 2)],
      shortcutList: shortcutReads,
    });
    await store.load(PROJECT, PAGE);
    expect(store.orderComplete()).toBe(true);

    const descendantChanged = {
      type: 'project.updated' as const,
      entityType: 'project' as const,
      entityId: 'project-source',
      projectId: 'project-source' as ProjectId,
      rootProjectId: PROJECT,
    };
    live.emit(descendantChanged);
    await settleLive();
    expect(store.orderComplete()).toBe(false);

    live.emit(descendantChanged);
    await settleLive();
    expect(store.orderComplete()).toBe(true);

    expect(await store.moveSection('section-text' as SectionId, 1)).toBe(true);
    expect(store.orderComplete()).toBe(false);

    live.emit(descendantChanged);
    await settleLive();
    expect(store.orderComplete()).toBe(true);
  });

  it('keeps orderComplete true on a page that does not allow shortcuts', async () => {
    const { store, gateway } = setup({
      shortcutList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'must not read shortcuts');
      }),
    });

    await store.load(PROJECT, PAGE, false);

    expect(store.orderComplete()).toBe(true);
    expect(gateway.shortcuts.list).not.toHaveBeenCalled();
  });

  it('refuses section and shortcut moves while Home has an incomplete combined order', async () => {
    const { store, gateway } = setup({
      shortcuts: [shortcut('shortcut-a', 2)],
      shortcutList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'shortcut placements unavailable');
      }),
    });
    await store.load(PROJECT, PAGE, true);
    const original = store.placements();

    expect(store.orderComplete()).toBe(false);
    expect(await store.moveSection('section-text' as SectionId, 1)).toBe(false);
    expect(await store.moveShortcut('shortcut-a' as ResolvedSectionShortcut['id'], 0)).toBe(false);
    expect(gateway.sections.move).not.toHaveBeenCalled();
    expect(gateway.shortcuts.move).not.toHaveBeenCalled();
    expect(store.placements()).toEqual(original);
  });

  it('keeps a failed section read loud and paints no placements even when shortcuts answer', async () => {
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          throw new GatewayError('not_found', 404, 'canvas read failed');
        }),
      },
      shortcuts: [shortcut('shortcut-a', 0)],
    });

    await store.load(PROJECT, PAGE);

    expect(store.placements()).toEqual([]);
    expect(store.error()).toContain('canvas read failed');
  });

  it('keeps the rest of the canvas when one container’s rows cannot be read', async () => {
    const { store, tasks } = setup({
      taskList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
      }) as unknown as WorkManagerGateway['tasks']['list'],
    });

    await store.load(PROJECT, PAGE);
    await tasks.load(section('section-tasks', 'task-list', 1));

    // One container's failure must not blank the Rich Text section beside it.
    expect(store.sections()).toHaveLength(2);
    expect(store.error()).toBeNull();
    expect(tasks.error()).toContain('could not reach');
  });

  it('ignores a slower earlier page load, so two clicks cannot mix two canvases', async () => {
    const other = 'project-b' as ProjectId;
    const gates = new Map<string, () => void>();
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) => {
          await new Promise<void>((resolve) => gates.set(projectId, resolve));
          return projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other, pageId: OTHER_PAGE })];
        }),
      },
    });

    const first = store.load(PROJECT, PAGE);
    const second = store.load(other, OTHER_PAGE);
    // The first click's response lands last — the shape that leaves A's sections under B.
    gates.get(other)!();
    await second;
    gates.get(PROJECT)!();
    await first;

    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
  });

  it('reports a write that succeeded as a success even when the re-read fails', async () => {
    let listCalls = 0;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          listCalls += 1;
          if (listCalls > 1)
            throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
          return [
            section('section-text', 'rich-text', 0),
            section('section-tasks', 'task-list', 1),
          ];
        }),
      },
    });
    await store.load(PROJECT, PAGE);

    // The receipt is captured before the failed re-read, so a committed removal never
    // looks like a failed write and can still be undone.
    expect(await store.removeSection('section-text' as SectionId)).toBe(true);
    expect(store.sectionError()).toBeNull();
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks']);
    expect(store.undoNotice()).toMatchObject({ kind: 'available', refreshFailed: true });
  });

  it('surfaces an unreadable canvas as a visible error rather than a silently empty one', async () => {
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          throw new GatewayError('not_found', 404, 'no such page "page-project-a"');
        }),
      },
    });

    await store.load(PROJECT, PAGE);

    // An empty canvas is a legitimate state, so "nothing to draw" and "could not read it"
    // must not look the same. The project itself is the shell's error to report.
    expect(store.sections()).toEqual([]);
    expect(store.error()).toContain('no such page');
  });

  it('adds a section with the registry definition’s default config', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.addSection(definition())).toEqual({ ok: true });

    // The registry's default is what has to reach persistence — otherwise a new type's
    // config would silently start life as `{}`.
    // The registry's default *and* the canvas's own page: §27 resolves an unnamed write onto
    // the project's canonical page, which is the wrong answer for any other page a root shows.
    expect(gateway.sections.create).toHaveBeenCalledWith(PROJECT, {
      type: 'rich-text',
      pageId: PAGE,
      config: { text: '' },
    });
    expect(store.sections()).toHaveLength(3);
  });

  it('refuses a definition whose default config is not an object', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);

    // §29 types `createDefaultConfig()` as `unknown`; this is where that stops being safe.
    // The popup owns the failure message; this write does not overwrite the canvas error line.
    expect(await store.addSection(definition({ createDefaultConfig: () => 'not an object' }))).toEqual({
      ok: false,
      message: expect.any(String),
    });
    expect(gateway.sections.create).not.toHaveBeenCalled();
    expect(store.sectionError()).toBeNull();
  });

  it('adds a section at its requested position before reconciling the canonical combined order', async () => {
    const reconcile = deferred<ProjectSection[]>();
    const existingSections = [
      section('section-text', 'rich-text', 0),
      section('section-tasks', 'task-list', 2),
    ];
    const inserted = section('section-new', 'rich-text', 1, {
      title: 'Research',
      columnSpan: 6,
      config: { text: '' },
    });
    const { store, gateway } = setup({
      sections: existingSections,
      shortcuts: [shortcut('shortcut-a', 1)],
      sectionOverrides: {
        list: vi.fn()
          .mockResolvedValueOnce(existingSections)
          .mockImplementationOnce(() => reconcile.promise),
        create: vi.fn(async () => inserted),
      },
      shortcutList: vi.fn()
        .mockResolvedValueOnce([shortcut('shortcut-a', 1)])
        .mockResolvedValue([shortcut('shortcut-a', 2)]),
    });
    await store.load(PROJECT, PAGE);

    const adding = store.addSection(definition(), { position: 1, columnSpan: 6, title: 'Research' });
    await settleLive();

    expect(gateway.sections.create).toHaveBeenCalledWith(PROJECT, {
      type: 'rich-text',
      pageId: PAGE,
      config: { text: '' },
      position: 1,
      columnSpan: 6,
      title: 'Research',
    });
    expect(store.placements().map((placement) =>
      placement.kind === 'section' ? placement.section.id : placement.shortcut.id,
    )).toEqual(['section-text', 'section-new', 'shortcut-a', 'section-tasks']);

    reconcile.resolve([existingSections[0]!, inserted, section('section-tasks', 'task-list', 3)]);
    expect(await adding).toEqual({ ok: true });
    expect(store.placements().map((placement) =>
      placement.kind === 'section' ? placement.section.id : placement.shortcut.id,
    )).toEqual(['section-text', 'section-new', 'shortcut-a', 'section-tasks']);
  });

  it('returns a create failure without changing the canvas or section error', async () => {
    const { store } = setup({
      sectionOverrides: {
        create: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'section create refused');
        }),
        update: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'section update refused');
        }),
      },
    });
    await store.load(PROJECT, PAGE);
    await store.setCollapsed('section-text' as SectionId, true);
    const sectionError = store.sectionError();
    const before = store.placements();

    expect(await store.addSection(definition())).toEqual({
      ok: false,
      message: 'section create refused',
    });

    expect(store.placements()).toEqual(before);
    expect(store.sectionError()).toBe(sectionError);
  });

  it('refuses positioned creates while a shortcut-allowed canvas order is incomplete', async () => {
    const { store, gateway } = setup({
      shortcutList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'shortcut read failed');
      }),
    });
    await store.load(PROJECT, PAGE);
    const sectionError = store.sectionError();

    expect(store.orderComplete()).toBe(false);
    expect(await store.addSection(definition(), { position: 1 })).toEqual({
      ok: false,
      message: sectionError,
    });
    expect(await store.addShortcut({
      pageId: PAGE,
      sourceSectionId: 'section-source' as SectionId,
      position: 1,
      columnSpan: 6,
    })).toEqual({
      ok: false,
      message: sectionError,
    });

    expect(gateway.sections.create).not.toHaveBeenCalled();
    expect(gateway.shortcuts.create).not.toHaveBeenCalled();
    expect(store.sectionError()).toBe(sectionError);
  });

  it('returns a loading result before the first canvas read and treats a stale create as complete', async () => {
    const { store } = setup();
    expect(await store.addSection(definition())).toEqual({
      ok: false,
      message: 'The canvas has not finished loading',
    });

    TestBed.resetTestingModule();
    const gate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const stale = setup({
      projectGet: vi.fn(async (id: ProjectId) => project({ id })),
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other, pageId: OTHER_PAGE })],
        ),
        create: vi.fn(() => gate.promise),
      },
    });
    await stale.store.load(PROJECT, PAGE);
    const adding = stale.store.addSection(definition(), { position: 1, columnSpan: 6 });
    await stale.store.load(other, OTHER_PAGE);
    gate.resolve(section('section-created', 'rich-text', 1));

    expect(await adding).toEqual({ ok: true });
    expect(stale.store.sections().map(({ id }) => id)).toEqual(['section-b']);
  });

  it('adds a shortcut at its requested position before reconciling, and reports a refusal as a result', async () => {
    const reconcile = deferred<ResolvedSectionShortcut[]>();
    const initialSections = [
      section('section-text', 'rich-text', 0),
      section('section-tasks', 'task-list', 2),
    ];
    const inserted = shortcut('shortcut-new', 1, {
      sourceSectionId: 'section-source',
      columnSpan: 6,
    });
    const { store, gateway } = setup({
      sections: initialSections,
      shortcuts: [shortcut('shortcut-a', 1)],
      sectionOverrides: {
        list: vi.fn()
          .mockResolvedValueOnce(initialSections)
          .mockResolvedValue([initialSections[0]!, section('section-tasks', 'task-list', 3)]),
      },
      shortcutList: vi.fn()
        .mockResolvedValueOnce([shortcut('shortcut-a', 1)])
        .mockImplementationOnce(() => reconcile.promise)
        .mockResolvedValue([shortcut('shortcut-a', 2)]),
      shortcutOverrides: {
        create: vi.fn()
          .mockResolvedValueOnce(inserted)
          .mockRejectedValueOnce(new GatewayError('rule_violation', 409, 'shortcut refused')),
      },
    });
    await store.load(PROJECT, PAGE);

    const adding = store.addShortcut({
      pageId: PAGE,
      sourceSectionId: 'section-source' as SectionId,
      position: 1,
      columnSpan: 6,
    });
    await settleLive();

    expect(gateway.shortcuts.create).toHaveBeenCalledWith(PROJECT, {
      pageId: PAGE,
      sourceSectionId: 'section-source',
      position: 1,
      columnSpan: 6,
    });
    expect(store.placements().map((placement) =>
      placement.kind === 'section' ? placement.section.id : placement.shortcut.id,
    )).toEqual(['section-text', 'shortcut-new', 'shortcut-a', 'section-tasks']);

    reconcile.resolve([inserted, shortcut('shortcut-a', 2)]);
    expect(await adding).toEqual({ ok: true });
    expect(await store.addShortcut({
      pageId: PAGE,
      sourceSectionId: 'section-source' as SectionId,
      position: 0,
      columnSpan: 8,
    })).toEqual({ ok: false, message: 'shortcut refused' });
    expect(store.sectionError()).toBeNull();
  });

  it('collapses, resizes and re-configures a section through the gateway', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.setCollapsed('section-text' as SectionId, true)).toBe(true);
    expect(await store.setColumnSpan('section-text' as SectionId, 6)).toBe(true);
    expect(await store.updateConfig('section-text' as SectionId, { text: 'edited' })).toBe(true);

    expect(gateway.sections.update).toHaveBeenNthCalledWith(1, 'section-text', { collapsed: true });
    expect(gateway.sections.update).toHaveBeenNthCalledWith(2, 'section-text', { columnSpan: 6 });
    expect(gateway.sections.update).toHaveBeenNthCalledWith(3, 'section-text', {
      config: { text: 'edited' },
    });
    expect(store.sections()[0]).toMatchObject({
      collapsed: true,
      columnSpan: 6,
      config: { text: 'edited' },
    });
  });

  it('paints a section resize immediately and defers a live canvas refresh until it settles', async () => {
    const resize = deferred<ProjectSection>();
    const { store, gateway, live } = setup({
      sectionOverrides: { update: vi.fn(() => resize.promise) },
    });
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    const saving = store.setColumnSpan('section-text' as SectionId, 8);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(8);

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();
    expect(calls(gateway.sections.list)).toBe(sectionReads);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(8);

    resize.resolve(section('section-text', 'rich-text', 0, { columnSpan: 8 }));
    expect(await saving).toBe(true);
    expect(gateway.sections.update).toHaveBeenCalledWith('section-text', { columnSpan: 8 });
  });

  it('rolls back only the section width after a failure, preserving a concurrent collapse and rename', async () => {
    const resize = deferred<ProjectSection>();
    let persisted = section('section-text', 'rich-text', 0);
    const update = vi.fn(async (
      _id: SectionId,
      input: Parameters<WorkManagerGateway['sections']['update']>[1],
    ) => {
      if ('columnSpan' in input) return resize.promise;
      persisted = { ...persisted, ...input } as ProjectSection;
      return persisted;
    });
    const { store } = setup({ sectionOverrides: { update } });
    await store.load(PROJECT, PAGE);

    const saving = store.setColumnSpan('section-text' as SectionId, 8);
    expect(await store.setCollapsed('section-text' as SectionId, true)).toBe(true);
    expect(await store.renameSection('section-text' as SectionId, 'Backlog')).toBe(true);
    resize.reject(new GatewayError('unreachable', 0, 'resize refused'));

    expect(await saving).toBe(false);
    expect(store.sections().find(({ id }) => id === 'section-text')).toMatchObject({
      columnSpan: 12,
      collapsed: true,
      title: 'Backlog',
    });
    expect(store.sectionError()).toContain('resize refused');
  });

  it('does not let an older failed section resize roll back a newer width', async () => {
    const older = deferred<ProjectSection>();
    const newer = deferred<ProjectSection>();
    const { store } = setup({
      sectionOverrides: {
        update: vi.fn()
          .mockImplementationOnce(() => older.promise)
          .mockImplementationOnce(() => newer.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const first = store.setColumnSpan('section-text' as SectionId, 8);
    const second = store.setColumnSpan('section-text' as SectionId, 4);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(4);

    older.reject(new GatewayError('unreachable', 0, 'older resize failed'));
    expect(await first).toBe(false);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(4);

    newer.resolve(section('section-text', 'rich-text', 0, { columnSpan: 4 }));
    expect(await second).toBe(true);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(4);
  });

  it('restores the last confirmed width when every overlapping section resize fails', async () => {
    const older = deferred<ProjectSection>();
    const newer = deferred<ProjectSection>();
    const { store } = setup({
      sectionOverrides: {
        update: vi.fn()
          .mockImplementationOnce(() => older.promise)
          .mockImplementationOnce(() => newer.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const first = store.setColumnSpan('section-text' as SectionId, 8);
    const second = store.setColumnSpan('section-text' as SectionId, 4);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(4);

    older.reject(new GatewayError('unreachable', 0, 'older resize failed'));
    expect(await first).toBe(false);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(4);

    newer.reject(new GatewayError('unreachable', 0, 'newer resize failed'));
    expect(await second).toBe(false);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(12);
    expect(store.sectionError()).toContain('newer resize failed');
  });

  it('keeps the earlier preview until its request also fails when the newer resize fails first', async () => {
    const older = deferred<ProjectSection>();
    const newer = deferred<ProjectSection>();
    const { store } = setup({
      sectionOverrides: {
        update: vi.fn()
          .mockImplementationOnce(() => older.promise)
          .mockImplementationOnce(() => newer.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const first = store.setColumnSpan('section-text' as SectionId, 8);
    const second = store.setColumnSpan('section-text' as SectionId, 4);
    newer.reject(new GatewayError('unreachable', 0, 'newer resize failed'));

    expect(await second).toBe(false);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(8);

    older.reject(new GatewayError('unreachable', 0, 'older resize failed'));
    expect(await first).toBe(false);
    expect(store.sections().find(({ id }) => id === 'section-text')?.columnSpan).toBe(12);
    expect(store.sectionError()).toContain('newer resize failed');
  });

  it('paints a shortcut resize immediately and restores only its width on failure', async () => {
    const { store, gateway } = setup({
      shortcuts: [shortcut('shortcut-a', 1, { collapsed: true })],
      shortcutOverrides: {
        update: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'shortcut resize failed');
        }),
      },
    });
    await store.load(PROJECT, PAGE);

    const saving = store.setColumnSpanShortcut('shortcut-a' as never, 6);
    expect(store.shortcuts()[0]).toMatchObject({ columnSpan: 6, collapsed: true });
    expect(await saving).toBe(false);
    expect(gateway.shortcuts.update).toHaveBeenCalledWith('shortcut-a', { columnSpan: 6 });
    expect(store.shortcuts()[0]).toMatchObject({ columnSpan: 12, collapsed: true });
    expect(store.sectionError()).toContain('shortcut resize failed');
  });

  it('removes a section and closes the position gap', async () => {
    const { store } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 0],
    ]);
    expect(store.undoNotice()).toMatchObject({ kind: 'available', receipt: { actionId: 'undo-section-text' } });
  });

  it('recovers the same actor’s receipt from a repeated-removal refusal', async () => {
    const undo = receipt('undo-lost-response');
    const list = vi.fn()
      .mockResolvedValueOnce([section('section-text', 'rich-text', 0)])
      .mockResolvedValue([]);
    const remove = vi.fn(async () => {
      throw new GatewayError('rule_violation', 409, 'section_already_removed: retry with undo', {
        reason: 'section_already_removed',
        sectionId: 'section-text',
        operation: undo,
      });
    });
    const { store } = setup({ sectionOverrides: { list, remove } });
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection('section-text' as SectionId)).toBe(true);

    expect(store.undoNotice()).toEqual({
      kind: 'already-removed',
      receipt: undo,
      message: 'Already removed. Undo is available.',
    });
    expect(store.sections()).toEqual([]);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('recovers and executes its receipt after a committed remove response is lost', async () => {
    const first = section('section-text', 'rich-text', 0);
    const undo = receipt('undo-lost-response');
    let removalCommitted = false;
    let undoCommitted = false;
    const list = vi.fn(async () => (!removalCommitted || undoCommitted ? [first] : []));
    const remove = vi.fn<WorkManagerGateway['sections']['remove']>()
      .mockImplementationOnce(async () => {
        removalCommitted = true;
        throw new GatewayError('unreachable', 0, 'remove response was lost');
      })
      .mockRejectedValueOnce(new GatewayError('rule_violation', 409, 'section_already_removed: retry with undo', {
        reason: 'section_already_removed',
        sectionId: first.id,
        operation: undo,
      }));
    const undoExecute = vi.fn<UndoExecute>(async () => {
      undoCommitted = true;
      return {
        operation: 'section.remove',
        outcome: 'restored',
        section: first,
        placement: { pageId: PAGE, index: 0, strategy: 'index', pageEnabled: true },
        restoredRowCount: 0,
      };
    });
    const { store } = setup({ sectionOverrides: { list, remove }, undoExecute });
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection(first.id)).toBe(false);
    expect(store.failedRemoval()?.sectionId).toBe(first.id);
    expect(await store.retryFailedRemoval()).toBe(true);
    expect(store.undoNotice()).toMatchObject({ kind: 'already-removed', receipt: undo });
    expect(store.failedRemoval()).toBeNull();

    await expect(store.undoOperation()).resolves.toMatchObject({ operation: 'section.remove', outcome: 'restored' });

    expect(undoExecute).toHaveBeenCalledWith(undo.actionId);
    expect(store.sections().map(({ id }) => id)).toContain(first.id);
  });

  it('does not replace an unresolved removal retry with another request', async () => {
    const first = section('section-text', 'rich-text', 0);
    const next = section('section-tasks', 'task-list', 1);
    const remove = vi.fn<WorkManagerGateway['sections']['remove']>()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'remove response was lost'))
      .mockResolvedValueOnce({ section: { ...next, archivedAt: AT }, operation: receipt('undo-next'), archiveListed: true });
    const { store } = setup({ sectionOverrides: { remove } });
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection(first.id)).toBe(false);
    const unresolved = store.failedRemoval();
    expect(unresolved?.sectionId).toBe(first.id);

    expect(await store.removeSection(next.id)).toBe(false);

    expect(remove).toHaveBeenCalledOnce();
    expect(store.failedRemoval()).toEqual(unresolved);
    expect(store.sectionError()).toContain('Retry or dismiss');

    store.dismissFailedRemoval();
    expect(store.sectionError()).toBeNull();
    expect(await store.removeSection(next.id)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('keeps the prior receipt after a failed remove and retries the exact policy explicitly', async () => {
    const first = section('section-text', 'rich-text', 0);
    const next = section('section-tasks', 'task-list', 1);
    const remove = vi.fn<WorkManagerGateway['sections']['remove']>()
      .mockResolvedValueOnce({ section: { ...first, archivedAt: AT }, operation: receipt('undo-first'), archiveListed: true })
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'remove response was lost'))
      .mockResolvedValueOnce({ section: { ...next, archivedAt: AT }, operation: receipt('undo-second'), archiveListed: true });
    const { store } = setup({ sectionOverrides: { remove } });
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection(first.id)).toBe(true);
    const previous = store.undoNotice()?.receipt;
    const input = { policy: 'reassign' as const, reassignToSectionId: 'section-destination' as SectionId };
    expect(await store.removeSection(next.id, input)).toBe(false);

    expect(store.undoNotice()?.receipt).toEqual(previous);
    expect(store.failedRemoval()).toEqual({ sectionId: next.id, input, message: 'remove response was lost' });
    expect(await store.retryFailedRemoval()).toBe(true);
    expect(remove).toHaveBeenLastCalledWith(next.id, input);
    expect(store.undoNotice()?.receipt?.actionId).toBe('undo-second');
    expect(store.failedRemoval()).toBeNull();
  });

  it('keeps a failed later remove retryable when Undo succeeds for the prior receipt', async () => {
    const first = section('section-text', 'rich-text', 0);
    const next = section('section-tasks', 'task-list', 1);
    const remove = vi.fn<WorkManagerGateway['sections']['remove']>()
      .mockResolvedValueOnce({ section: { ...first, archivedAt: AT }, operation: receipt('undo-first'), archiveListed: true })
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'remove response was lost'));
    const undoExecute = vi.fn<UndoExecute>().mockResolvedValue({
      operation: 'section.remove',
      outcome: 'restored',
      section: first,
      placement: { pageId: PAGE, index: 0, strategy: 'index', pageEnabled: true },
      restoredRowCount: 0,
    });
    const { store } = setup({ sectionOverrides: { remove }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.removeSection(first.id);
    await store.removeSection(next.id, { policy: 'cascade' });
    const failed = store.failedRemoval();

    await expect(store.undoOperation()).resolves.toMatchObject({ operation: 'section.remove' });

    expect(store.undoNotice()).toMatchObject({ kind: 'result', receipt: null });
    expect(store.failedRemoval()).toEqual(failed);
    expect(undoExecute).toHaveBeenCalledWith('undo-first');

    store.dismissUndoNotice();

    expect(store.undoNotice()).toBeNull();
    expect(store.failedRemoval()).toEqual(failed);
  });

  it('keeps an earlier Undo receipt when the failed removal error is dismissed', async () => {
    const first = section('section-text', 'rich-text', 0);
    const next = section('section-tasks', 'task-list', 1);
    const remove = vi.fn<WorkManagerGateway['sections']['remove']>()
      .mockResolvedValueOnce({ section: { ...first, archivedAt: AT }, operation: receipt('undo-first'), archiveListed: true })
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'remove response was lost'));
    const { store } = setup({ sectionOverrides: { remove } });
    await store.load(PROJECT, PAGE);
    await store.removeSection(first.id);
    await store.removeSection(next.id);
    const priorNotice = store.undoNotice();

    store.dismissFailedRemoval();

    expect(store.failedRemoval()).toBeNull();
    expect(store.undoNotice()).toEqual(priorNotice);
  });

  it('reconciles an Undo whose successful response was lost: the stale refusal shows it landed', async () => {
    const first = section('section-text', 'rich-text', 0);
    const next = section('section-tasks', 'task-list', 1);
    let removalCommitted = false;
    let undoCommitted = false;
    const list = vi.fn(async () => {
      if (!removalCommitted || undoCommitted) return [first, next];
      return [next];
    });
    const remove = vi.fn<WorkManagerGateway['sections']['remove']>(async () => {
      removalCommitted = true;
      return { section: { ...first, archivedAt: AT }, operation: receipt('undo-committed'), archiveListed: true };
    });
    const undoExecute = vi.fn<UndoExecute>()
      .mockImplementationOnce(async () => {
        undoCommitted = true;
        throw new GatewayError('unreachable', 0, 'Undo response was lost');
      })
      // The replay refuses as stale, and the summary it carries names this action as the next Redo.
      .mockRejectedValueOnce(new GatewayError('rule_violation', 409, 'history_revision_stale: moved on', historyDetails('undo-committed', {
        reason: 'history_revision_stale',
      }, { revision: 99, redo: { actionId: 'undo-committed', operation: 'section.remove', label: 'Removed', expiresAt: AT } })));
    const { store } = setup({ sectionOverrides: { list, remove }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.removeSection(first.id);

    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'error', receipt: { actionId: 'undo-committed' } });
    expect(store.sections().map(({ id }) => id)).toEqual([next.id]);

    expect(await store.undoOperation()).toBeNull();

    expect(undoExecute).toHaveBeenCalledTimes(2);
    expect(undoExecute).toHaveBeenLastCalledWith('undo-committed');
    expect(store.undoNotice()).toMatchObject({ kind: 'terminal', receipt: null, refusal: { reason: 'history_revision_stale' }, message: 'Undo was already completed. The canvas has been refreshed.' });
    expect(store.undoNotice()).not.toHaveProperty('landed');
    expect(store.sections().map(({ id }) => id)).toEqual([first.id, next.id]);
  });

  it('names a disabled destination when a partial Undo falls back there', async () => {
    const first = section('section-text', 'rich-text', 0);
    const partial = vi.fn<UndoExecute>().mockResolvedValue({
      operation: 'section.remove',
      outcome: 'partial',
      section: first,
      placement: { pageId: OTHER_PAGE, index: 0, strategy: 'fallback-page', pageEnabled: false },
      restoredRowCount: 0,
    });
    const { store } = setup({ undoExecute: partial });
    await store.load(PROJECT, PAGE);
    await store.removeSection(first.id);

    await store.undoOperation();

    expect(store.undoNotice()?.message).toContain('disabled page');
    expect(store.undoNotice()?.message).toContain('Enable that page to see it.');
    expect(store.undoNotice()?.message).not.toContain('available page');
  });

  it('captures an Undo receipt before refresh failure and retries only the read', async () => {
    let listCallCount = 0;
    const list = vi.fn(async () => {
      listCallCount += 1;
      if (listCallCount === 2) throw new GatewayError('unreachable', 0, 'read after remove failed');
      return [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];
    });
    const { store, gateway } = setup({ sectionOverrides: { list } });
    await store.load(PROJECT, PAGE);
    expect(await store.removeSection('section-text' as SectionId)).toBe(true);
    const removeCalls = calls(gateway.sections.remove);
    expect(store.undoNotice()).toMatchObject({ kind: 'available', refreshFailed: true });

    expect(await store.retryUndoRefresh()).toBe(true);

    expect(calls(gateway.sections.remove)).toBe(removeCalls);
    expect(store.undoNotice()?.refreshFailed).toBe(false);
  });

  it('executes a history transition for the held receipt, refreshes the canvas and invalidates project data after Undo', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);
    await store.removeSection('section-text' as SectionId);
    const revision = store.projectDataRevision();
    const held = store.undoNotice()!.receipt!;

    const result = await store.undoOperation();

    expect(gateway.history.transition).toHaveBeenCalledWith(held.historyId, { actionId: held.actionId, direction: 'undo', expectedRevision: held.revision });
    expect(result).toMatchObject({ outcome: 'restored', restoredRowCount: 0 });
    expect(store.sections().map(({ id }) => id)).toContain('section-text');
    expect(store.projectDataRevision()).toBe(revision + 1);
    expect(store.undoNotice()).toMatchObject({ kind: 'result', receipt: null });
  });

  it('keeps a typed conflict receipt retryable, and clears it when the receipt is terminal', async () => {
    const conflict = new GatewayError('rule_violation', 409, 'history_conflict: restore the section first', historyDetails('undo-section-text', {
      reason: 'history_conflict',
      conflicts: [{ entityType: 'task', id: 'task-a', problem: 'archive-state-changed', nextStep: 'restore-state-and-retry' }],
    }));
    const execute = vi.fn<UndoExecute>().mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(new GatewayError('not_found', 404, 'no such undo'));
    const { store } = setup({ undoExecute: execute });
    await store.load(PROJECT, PAGE);
    await store.removeSection('section-text' as SectionId);

    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'refusal', receipt: { actionId: 'undo-section-text' }, refusal: { reason: 'history_conflict' } });
    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'terminal', receipt: null });
  });

  it('does not let a pending removal or a late response replace the next page’s receipt state', async () => {
    const pending = deferred<Awaited<ReturnType<WorkManagerGateway['sections']['remove']>>>();
    const remove = vi.fn(() => pending.promise);
    const { store } = setup({ sectionOverrides: { remove } });
    await store.load(PROJECT, PAGE);
    const first = store.removeSection('section-text' as SectionId);

    expect(await store.removeSection('section-tasks' as SectionId)).toBe(false);
    await store.load('project-b' as ProjectId, OTHER_PAGE);
    pending.resolve({ section: { ...section('section-text', 'rich-text', 0), archivedAt: AT }, operation: receipt('undo-stale'), archiveListed: true });
    await first;

    expect(store.undoNotice()).toBeNull();
    expect(store.sections().map(({ id }) => id)).toEqual(['section-text', 'section-tasks']);
  });

  it('ignores a removal response after the canvas store is destroyed', async () => {
    const pending = deferred<Awaited<ReturnType<WorkManagerGateway['sections']['remove']>>>();
    const { store } = setup({ sectionOverrides: { remove: vi.fn(() => pending.promise) } });
    await store.load(PROJECT, PAGE);
    const before = store.sections();
    const removal = store.removeSection('section-text' as SectionId);

    TestBed.resetTestingModule();
    pending.resolve({ section: { ...section('section-text', 'rich-text', 0), archivedAt: AT }, operation: receipt('undo-destroyed'), archiveListed: true });
    await removal;

    expect(store.sections()).toEqual(before);
    expect(store.undoNotice()).toBeNull();
  });

  it('does not fabricate sibling positions when a successful remove cannot be re-read', async () => {
    let listCalls = 0;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          if (listCalls++ === 0)
            return [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];
          throw new GatewayError('unreachable', 0, 're-read failed');
        }),
      },
    });
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 1],
    ]);
  });

  it('leaves the canvas exactly as it was and shows why when a section write fails', async () => {
    const { store } = setup({
      sectionOverrides: {
        remove: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
        }),
      },
    });
    await store.load(PROJECT, PAGE);
    const before = store.sections();

    expect(await store.removeSection('section-text' as SectionId)).toBe(false);

    // A silently dropped remove or config save is the failure that costs the user work.
    expect(store.sections()).toEqual(before);
    expect(store.failedRemoval()).toMatchObject({
      sectionId: 'section-text',
      input: {},
      message: 'could not reach the prototype host',
    });
    expect(store.sectionError()).toBeNull();
  });

  it('renames a section after the gateway answers, and leaves it alone when it refuses', async () => {
    // Rename joins `setCollapsed`/`setColumnSpan`/`updateConfig` on the store's awaited path
    // rather than forking a fourth idiom. **Not** an optimism test: the plan deliberately
    // does not make one pass — `updateSection` has nothing to revert.
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.renameSection('section-tasks' as SectionId, 'Backlog')).toBe(true);
    expect(gateway.sections.update).toHaveBeenCalledWith('section-tasks', { title: 'Backlog' });
    expect(store.sections().find(({ id }) => id === 'section-tasks')?.title).toBe('Backlog');
    // `null` clears the override, so the name falls back to the derived default.
    await store.renameSection('section-tasks' as SectionId, null);
    expect(gateway.sections.update).toHaveBeenLastCalledWith('section-tasks', { title: null });
  });

  it('leaves the section unchanged and says why when a rename is refused', async () => {
    const { store } = setup({
      sectionOverrides: {
        update: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'nope');
        }),
      },
    });
    await store.load(PROJECT, PAGE);
    const before = store.sections();

    expect(await store.renameSection('section-tasks' as SectionId, 'Backlog')).toBe(false);
    expect(store.sections()).toEqual(before);
    expect(store.sectionError()).toContain('nope');
  });

  it('opens the removal dialog with the parts the UI writes its question from', async () => {
    const { store } = setup({
      sections: [section('section-tasks', 'task-list', 0), section('section-shipped', 'task-list', 1)],
      sectionOverrides: {
        remove: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'still holds 3 tasks', {
            reason: 'section_not_empty',
            liveRowCount: 3,
          });
        }),
      },
    });
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection('section-tasks' as SectionId)).toBe(true);
    expect(store.removalPrompt()).toEqual({
      sectionId: 'section-tasks',
      sectionName: 'Task List',
      rowCount: 3,
      ownedKind: 'tasks',
      targets: [expect.objectContaining({ id: 'section-shipped' })],
    });
    // A question, not an error: the dialog is already saying it.
    expect(store.sectionError()).toBeNull();
  });

  it('surfaces every other 409 as an error rather than as a removal-policy question', async () => {
    // The archive phase's coming refusals — an already-archived section, an archived
    // reassign target — must never masquerade as this dialog's question.
    let details: unknown;
    const { store } = setup({
      sectionOverrides: {
        remove: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'still holds 3 tasks', details);
        }),
      },
    });
    await store.load(PROJECT, PAGE);

    for (const candidate of [
      undefined,
      null,
      'section_not_empty',
      { reason: 'section_not_empty' },
      { reason: 'section_not_empty', liveRowCount: 0 },
      { reason: 'section_not_empty', liveRowCount: 1.5 },
      { reason: 'section_not_empty', liveRowCount: '3' },
      { reason: 'section_archived', liveRowCount: 3 },
      { reason: 'section_already_removed', sectionId: 'section-other', operation: receipt('undo-other') },
    ]) {
      details = candidate;

      expect(await store.removeSection('section-tasks' as SectionId)).toBe(false);
      expect(store.removalPrompt()).toBeNull();
      expect(store.failedRemoval()?.message).toContain('still holds 3 tasks');
      expect(store.sectionError()).toBeNull();
    }
  });

  it('moves through the gateway and reconciles every authoritative sibling position (§32)', async () => {
    const movedSections = [
      section('section-tasks', 'task-list', 0),
      section('section-text', 'rich-text', 1),
    ];
    let listCalls = 0;
    const { store, gateway } = setup({
      sectionOverrides: {
        list: vi.fn(async () =>
          listCalls++ === 0
            ? [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)]
            : movedSections,
        ),
        move: vi.fn(async () => movedSections[1]!),
      },
    });
    await store.load(PROJECT, PAGE);

    expect(await store.moveSection('section-text' as SectionId, 1)).toBe(true);

    expect(gateway.sections.move).toHaveBeenCalledWith('section-text', { position: 1 });
    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 0],
      ['section-text', 1],
    ]);
  });

  it('skips a same-index drop without writing or recording activity', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.moveSection('section-text' as SectionId, 0)).toBe(true);

    expect(gateway.sections.move).not.toHaveBeenCalled();
  });

  it('restores a fresh canonical list and exposes the reason when a move fails', async () => {
    const { store } = setup({
      sectionOverrides: {
        move: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'move did not persist');
        }),
      },
    });
    await store.load(PROJECT, PAGE);
    const before = store.sections();
    const revision = store.canvasRevision();

    expect(await store.moveSection('section-text' as SectionId, 1)).toBe(false);

    expect(store.sections()).toEqual(before);
    expect(store.sections()).not.toBe(before);
    expect(store.canvasRevision()).toBe(revision + 1);
    expect(store.sectionError()).toContain('move did not persist');
  });

  it('ignores a move answer for the project left during the write', async () => {
    const gate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)]
            : [section('section-b', 'rich-text', 0, { projectId: other, pageId: OTHER_PAGE })],
        ),
        move: vi.fn(() => gate.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const move = store.moveSection('section-text' as SectionId, 1);
    await store.load(other, OTHER_PAGE);
    gate.resolve(section('section-text', 'rich-text', 1));
    await move;

    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
    expect(store.sectionError()).toBeNull();
  });

  it('does not append a created section after navigation leaves its project', async () => {
    const gate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      projectGet: vi.fn(async (id: ProjectId) => project({ id })),
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other })],
        ),
        create: vi.fn(() => gate.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const add = store.addSection(definition());
    await store.load(other, OTHER_PAGE);
    gate.resolve(section('section-created', 'rich-text', 1));
    expect(await add).toEqual({ ok: true });

    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
  });

  it('does not leak a rejected update after navigation', async () => {
    const updateGate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      projectGet: vi.fn(async (id: ProjectId) => project({ id })),
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other })],
        ),
        update: vi.fn(() => updateGate.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const update = store.setCollapsed('section-text' as SectionId, true);
    await store.load(other, OTHER_PAGE);
    updateGate.reject(new GatewayError('unreachable', 0, 'old project write failed'));
    await update;

    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
    expect(store.sectionError()).toBeNull();
  });

  it('previews order without fabricating persisted sibling positions', async () => {
    const gate = deferred<ProjectSection>();
    const { store } = setup({ sectionOverrides: { move: vi.fn(() => gate.promise) } });
    await store.load(PROJECT, PAGE);

    const move = store.moveSection('section-text' as SectionId, 1);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 1],
      ['section-text', 0],
    ]);
    gate.resolve(section('section-text', 'rich-text', 1));
    await move;
  });
});

/** How many times a spy has been called, so a spec can assert a *further* call. */
const calls = (spy: unknown): number => (spy as ReturnType<typeof vi.fn>).mock.calls.length;
const settleLive = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

describe('ProjectPageStore and live updates (§62)', () => {
  it('bumps the data revision on a task event for this project, without re-listing the canvas', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-1', projectId: PROJECT });
    await settleLive();

    // The rows themselves are re-read by whichever container owns them, off this revision —
    // this store no longer knows which task lists are on the canvas, and does not need to. A
    // task cannot change which *sections* exist, so it earns no `sections.list`.
    expect(store.projectDataRevision()).toBe(1);
    expect(store.projectHierarchyRevision()).toBe(0);
    expect(calls(gateway.sections.list)).toBe(sectionReads);
    // Quiet: the canvas never blinks back to its loading state for someone else's write.
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('bumps the data revision for a descendant frame only while the page holds a shortcut', async () => {
    const withoutShortcut = setup();
    await withoutShortcut.store.load(PROJECT, PAGE);
    withoutShortcut.live.emit({
      type: 'task.updated',
      entityType: 'task',
      entityId: 'task-source',
      projectId: 'project-source' as ProjectId,
      rootProjectId: PROJECT,
    });
    await settleLive();
    expect(withoutShortcut.store.projectDataRevision()).toBe(0);

    TestBed.resetTestingModule();
    const withShortcut = setup({ shortcuts: [shortcut('shortcut-a', 0)] });
    await withShortcut.store.load(PROJECT, PAGE);
    withShortcut.live.emit({
      type: 'task.updated',
      entityType: 'task',
      entityId: 'task-source',
      projectId: 'project-source' as ProjectId,
      rootProjectId: PROJECT,
    });
    await settleLive();
    expect(withShortcut.store.projectDataRevision()).toBe(1);
  });

  it('re-reads placements, not the section list, for a project frame elsewhere in the root tree', async () => {
    const { store, gateway, live } = setup({ shortcuts: [shortcut('shortcut-a', 0)] });
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);
    const shortcutReads = calls(gateway.shortcuts.list);

    live.emit({
      type: 'project.updated',
      entityType: 'project',
      entityId: 'project-source',
      projectId: 'project-source' as ProjectId,
      rootProjectId: PROJECT,
    });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads);
    expect(calls(gateway.shortcuts.list)).toBe(shortcutReads + 1);
    expect(store.projectDataRevision()).toBe(1);
  });

  it('paints a shortcut added by another tab after the destination frame arrives', async () => {
    const added = shortcut('shortcut-added', 2);
    const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([added]);
    const { store, live } = setup({ shortcutList: list });
    await store.load(PROJECT, PAGE);

    live.emit({
      type: 'project.shortcut_added',
      entityType: 'project',
      entityId: PROJECT,
      projectId: PROJECT,
      rootProjectId: PROJECT,
    });
    await settleLive();

    expect(store.shortcuts().map(({ id }) => id)).toEqual(['shortcut-added']);
  });

  it('defers a placement refresh that arrives while a shortcut write is in flight', async () => {
    const create = deferred<ResolvedSectionShortcut>();
    const { store, gateway, live } = setup({
      shortcutOverrides: { create: vi.fn(() => create.promise) },
    });
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    const add = store.addShortcut({ pageId: PAGE, sourceSectionId: 'section-source' as SectionId });
    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();
    expect(calls(gateway.sections.list)).toBe(sectionReads);

    create.resolve(shortcut('shortcut-created', 2));
    await add;
    await settleLive();
    expect(calls(gateway.sections.list)).toBeGreaterThan(sectionReads);
  });

  it('rolls back a failed placement save and reports the reason', async () => {
    const { store } = setup({
      shortcuts: [shortcut('shortcut-a', 1)],
      shortcutOverrides: {
        update: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'shortcut update failed');
        }),
      },
    });
    await store.load(PROJECT, PAGE);
    const before = store.placements();

    expect(await store.setCollapsedShortcut('shortcut-a' as never, true)).toBe(false);

    expect(store.placements()).toEqual(before);
    expect(store.sectionError()).toContain('shortcut update failed');
  });

  it('removes only the placement and leaves the source section collection visible', async () => {
    const { store } = setup({
      sections: [section('section-text', 'rich-text', 0)],
      shortcuts: [shortcut('shortcut-a', 1)],
    });
    await store.load(PROJECT, PAGE);

    expect(await store.removeShortcut('shortcut-a' as never)).toBe(true);

    expect(store.sections().map(({ id }) => id)).toEqual(['section-text']);
    expect(store.shortcuts()).toEqual([]);
  });

  it('restores the combined order after a rejected section move past a shortcut', async () => {
    const { store } = setup({
      sections: [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 2)],
      shortcuts: [shortcut('shortcut-a', 1)],
      sectionOverrides: {
        move: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'section move failed');
        }),
      },
    });
    await store.load(PROJECT, PAGE);
    const before = store.placements().map((placement) => placement.kind === 'section' ? placement.section.id : placement.shortcut.id);

    expect(await store.moveSection('section-text' as SectionId, 2)).toBe(false);

    expect(store.placements().map((placement) => placement.kind === 'section' ? placement.section.id : placement.shortcut.id)).toEqual(before);
    expect(store.sectionError()).toContain('section move failed');
  });

  it('routes a minimal current-project event by type and entityId and bumps both revisions', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type: 'project.updated', entityId: PROJECT });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
    expect(store.projectDataRevision()).toBe(1);
    expect(store.projectHierarchyRevision()).toBe(1);
  });

  // The hierarchy revision is the one signal that ignores `projectId`: a Sub-Projects section
  // is a *view* of the work tree, so a sibling's creation has to move it.
  it('invalidates hierarchy only for a project event naming another workspace project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type: 'project.created', entityType: 'project', entityId: 'project-child', projectId: 'project-child' as ProjectId });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads);
    expect(store.projectDataRevision()).toBe(0);
    expect(store.projectHierarchyRevision()).toBe(1);
  });

  it('quietly recovers the open canvas when the live connection opens', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emitConnected();
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
    // The containers recover on the revision the reconnect bumps.
    expect(store.projectDataRevision()).toBeGreaterThan(0);
    expect(store.loading()).toBe(false);
  });

  it('recovers a failed first canvas load when the live connection opens', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'host starting'))
      .mockResolvedValue([section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)]);
    const listTasks = vi.fn()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'host starting'))
      .mockResolvedValue([task('task-recovered')]);
    const { store, tasks, live } = setup({ sectionOverrides: { list }, taskList: listTasks });
    const container = section('section-tasks', 'task-list', 1);

    await store.load(PROJECT, PAGE);
    await tasks.load(container);
    expect(store.sections()).toEqual([]);
    expect(store.error()).toContain('host starting');
    expect(tasks.loadFailed()).toBe(true);

    live.emitConnected();
    await settleLive();

    expect(store.sections()).toHaveLength(2);
    expect(store.error()).toBeNull();
    expect(store.sectionError()).toBeNull();

    // The container recovers itself off the revision, the way the section component does.
    await tasks.sync(container);
    expect(tasks.tasks().map(({ id }) => id)).toEqual(['task-recovered']);
    expect(tasks.error()).toBeNull();
    expect(tasks.loadFailed()).toBe(false);
  });

  // The recovery above repaints the canvas and clears the error, which is the whole point of
  // it — so the canvas must be *writable* afterwards. `loaded` was set only by `load()`, and
  // every write guard reads it, so a recovered canvas rendered a full set of controls that
  // silently did nothing: no write, no error, and a dragged section snapping back.
  it('is writable again after a quiet recovery, not merely readable', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'host starting'))
      .mockResolvedValue([section('section-text', 'rich-text', 0)]);
    const { store, gateway, live } = setup({ sectionOverrides: { list } });

    await store.load(PROJECT, PAGE);
    expect(store.error()).toContain('host starting');

    live.emitConnected();
    await settleLive();
    expect(store.sections()).toHaveLength(1);

    expect(await store.setCollapsed('section-text' as SectionId, true)).toBe(true);
    expect(gateway.sections.update).toHaveBeenCalled();
  });

  it('queues an event that arrives before the first canvas response', async () => {
    const first = deferred<ProjectSection[]>();
    const list = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue([section('section-recovered', 'rich-text', 0)]);
    const { store, gateway, live } = setup({ sectionOverrides: { list } });

    const loading = store.load(PROJECT, PAGE);
    live.emit({ type: 'project.updated', entityId: PROJECT, projectId: PROJECT });
    first.resolve([section('section-text', 'rich-text', 0)]);
    await loading;
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(2);
    expect(store.projectDataRevision()).toBe(1);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-recovered']);
  });

  it('coalesces a second full recovery behind one already in flight', async () => {
    const firstRecovery = deferred<ProjectSection[]>();
    const list = vi.fn()
      .mockResolvedValueOnce([section('section-text', 'rich-text', 0)])
      .mockImplementationOnce(() => firstRecovery.promise)
      .mockResolvedValue([section('section-trailing', 'rich-text', 0)]);
    const { store, gateway, live } = setup({ sectionOverrides: { list } });
    await store.load(PROJECT, PAGE);

    live.emitConnected();
    await settleLive();
    live.emitConnected();
    await settleLive();
    expect(calls(gateway.sections.list)).toBe(2);

    firstRecovery.resolve([section('section-first', 'rich-text', 0)]);
    await settleLive();
    expect(calls(gateway.sections.list)).toBe(3);
    await settleLive();
    expect(store.sections().map(({ id }) => id)).toEqual(['section-trailing']);
  });

  it('ignores an event for another project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-9', projectId: 'project-z' as ProjectId });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads);
    expect(store.projectDataRevision()).toBe(0);
  });

  it('re-reads its canvas on a project event naming this project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    // §57 records a section change against the *project*, which is why routing is on
    // `type` and `projectId` rather than on `entityType`.
    live.emit({ type: 'project.section_added', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
    expect(store.sections()).toHaveLength(2);
  });

  it('reads the canvas of the page it is showing, never the whole project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);

    live.emit({ type: 'project.section_added', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    for (const call of (gateway.sections.list as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toEqual({ pageId: PAGE });
    }
  });

  it.each([
    'task.created',
    'reflection.added',
    'task.task_addition_undone',
    'task.task_addition_redone',
    'reflection.reflection_addition_undone',
    'reflection.reflection_addition_redone',
  ])('re-resolves implicit container existence after %s', async (type) => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type, entityType: type.startsWith('task.') ? 'task' : 'reflection', entityId: 'row-1', projectId: PROJECT });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
  });

  it('does not clobber an optimistic section reorder that is still in flight', async () => {
    const move = deferred<ProjectSection>();
    const { store, gateway, live } = setup({
      sectionOverrides: { move: vi.fn(async () => move.promise) },
    });
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    const moving = store.moveSection('section-tasks' as SectionId, 0);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks', 'section-text']);

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    // The preview survives, and the write's own reconcile is still the thing that lands it.
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks', 'section-text']);
    expect(calls(gateway.sections.list)).toBe(sectionReads);

    move.resolve(section('section-tasks', 'task-list', 0));
    await moving;
  });

  it('discards a live re-read that was already in flight when a write began, and reads again', async () => {
    const text = section('section-text', 'rich-text', 0);
    const tasks = section('section-tasks', 'task-list', 1);
    let hostOrder = [text, tasks];
    let heldRead: ReturnType<typeof deferred<ProjectSection[]>> | null = null;
    const { store, gateway, live } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          if (heldRead !== null) {
            const held = heldRead;
            heldRead = null;
            return held.promise;
          }
          return [...hostOrder];
        }),
        move: vi.fn(async (id, input) => {
          hostOrder = [
            { ...tasks, position: 0 },
            { ...text, position: 1 },
          ];
          return { ...(id === tasks.id ? tasks : text), position: input.position };
        }),
      },
    });
    await store.load(PROJECT, PAGE);

    // Someone else's change starts a re-read, which answers with the order before the move.
    const staleRead = deferred<ProjectSection[]>();
    heldRead = staleRead;
    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    await store.moveSection('section-tasks' as SectionId, 0);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks', 'section-text']);
    const readsBeforeStaleAnswer = calls(gateway.sections.list);

    staleRead.resolve([text, tasks]);
    await settleLive();

    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks', 'section-text']);
    // The discarded answer is replaced by a read that started after the write.
    expect(calls(gateway.sections.list)).toBe(readsBeforeStaleAnswer + 1);
  });

  it('reloads the canvas when the host state is replaced', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    await settleLive();

    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
  });

  it('stops listening once the store is destroyed', async () => {
    const { store, live } = setup();
    await store.load(PROJECT, PAGE);
    expect(live.listenerCount).toBeGreaterThan(0);

    TestBed.resetTestingModule();

    expect(live.listenerCount).toBe(0);
  });
});

describe('ProjectPageStore — section edit Undo receipts (Slice 32)', () => {
  const editReceipt = (id: string, operation: OperationReceipt['operation'], revision: number): OperationReceipt => ({
    historyId: HISTORY,
    actionId: id as OperationActionId,
    operation,
    revision,
    label: `${operation} ${id}`,
    createdAt: AT,
    expiresAt: '2026-08-28T16:00:00.000Z',
  });

  it('holds a changed update receipt through a later no-op and a failed write', async () => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Renamed' }, operation: editReceipt('undo-rename', 'section.update', 900) })
      .mockResolvedValueOnce({ section: { ...text, title: 'Renamed' }, operation: null })
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'offline'));
    const { store } = setup({ sections: [text], sectionOverrides: { update } });
    await store.load(PROJECT, PAGE);

    await store.renameSection(text.id, 'Renamed');
    expect(store.undoNotice()).toMatchObject({ kind: 'available', receipt: { actionId: 'undo-rename' } });

    await store.renameSection(text.id, 'Renamed');
    await store.setCollapsed(text.id, true);

    expect(store.undoNotice()).toMatchObject({ kind: 'available', receipt: { actionId: 'undo-rename' } });
  });

  it('selects receipts by server sequence when write responses arrive out of order', async () => {
    const text = section('section-text', 'rich-text', 0);
    const tasks = section('section-tasks', 'task-list', 1);
    let resolveEarlier!: (result: SectionWriteResult) => void;
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveEarlier = resolve; }))
      .mockResolvedValueOnce({ section: { ...tasks, collapsed: true }, operation: editReceipt('undo-later', 'section.update', 1001) });
    const { store } = setup({ sections: [text, tasks], sectionOverrides: { update } });
    await store.load(PROJECT, PAGE);

    const earlier = store.renameSection(text.id, 'Earlier');
    await Promise.resolve();
    await store.setCollapsed(tasks.id, true);
    resolveEarlier({ section: { ...text, title: 'Earlier' }, operation: editReceipt('undo-earlier', 'section.update', 1000) });
    await earlier;

    expect(store.undoNotice()?.receipt?.actionId).toBe('undo-later');
  });

  it('does not resurrect an older receipt after the newer notice is dismissed', async () => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Newer' }, operation: editReceipt('undo-newer', 'section.update', 2001) })
      .mockResolvedValueOnce({ section: { ...text, collapsed: true }, operation: editReceipt('undo-stale', 'section.update', 2000) });
    const { store } = setup({ sections: [text], sectionOverrides: { update } });
    await store.load(PROJECT, PAGE);

    await store.renameSection(text.id, 'Newer');
    store.dismissUndoNotice();
    await store.setCollapsed(text.id, true);

    expect(store.undoNotice()).toBeNull();
  });

  it('refuses to execute a held receipt while a section write is pending', async () => {
    const text = section('section-text', 'rich-text', 0);
    let resolvePending!: (result: SectionWriteResult) => void;
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Held' }, operation: editReceipt('undo-held', 'section.update', 3000) })
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
    const undoExecute = vi.fn<UndoExecute>();
    const { store } = setup({ sections: [text], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Held');

    const blurSave = store.updateConfig(text.id, { text: 'Saved on blur' });
    await Promise.resolve();
    expect(store.undoBusy()).toBe(true);
    expect(await store.undoOperation()).toBeNull();
    expect(undoExecute).not.toHaveBeenCalled();

    resolvePending({ section: { ...text, config: { text: 'Saved on blur' } }, operation: editReceipt('undo-blur', 'section.update', 3001) });
    await blurSave;
    expect(store.undoBusy()).toBe(false);
    expect(store.undoNotice()?.receipt?.actionId).toBe('undo-blur');
  });

  it('executes an add receipt and removes the created frame without restoring focus data', async () => {
    const text = section('section-text', 'rich-text', 0);
    let listed = [text];
    const added = section('section-added', 'progress', 1);
    const create = vi.fn<WorkManagerGateway['sections']['create']>(async () => {
      listed = [text, added];
      return { section: added, operation: editReceipt('undo-add', 'section.add', 4000) };
    });
    const list = vi.fn(async () => [...listed]);
    const undoExecute = vi.fn<UndoExecute>(async () => {
      listed = [text];
      return { operation: 'section.add', outcome: 'removed', sectionId: added.id, projectId: PROJECT, pageId: PAGE };
    });
    const { store } = setup({ sections: [text], sectionOverrides: { create, list }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.addSection({ type: 'progress', label: 'Progress', createDefaultConfig: () => ({}) } as unknown as SectionDefinition);
    expect(store.sections().map(({ id }) => id)).toEqual([text.id, added.id]);

    await expect(store.undoOperation()).resolves.toMatchObject({ operation: 'section.add', outcome: 'removed' });

    expect(store.undoNotice()).toMatchObject({ kind: 'result', receipt: null, message: 'Undo removed the added section.' });
    expect(store.sections().map(({ id }) => id)).toEqual([text.id]);
  });

  it('keeps a newer receipt when a slow Undo response lands after it', async () => {
    const text = section('section-text', 'rich-text', 0);
    const tasks = section('section-tasks', 'task-list', 1);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Held' }, operation: editReceipt('undo-held', 'section.update', 5000) })
      .mockResolvedValueOnce({ section: { ...tasks, collapsed: true }, operation: editReceipt('undo-newer', 'section.update', 5001) });
    let resolveUndo!: (result: UndoResult) => void;
    const undoExecute = vi.fn<UndoExecute>(() => new Promise((resolve) => { resolveUndo = resolve; }));
    const { store } = setup({ sections: [text, tasks], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Held');

    const undoing = store.undoOperation();
    await Promise.resolve();
    // The Undo counts as a pending write, so capture the newer receipt directly as a concurrent commit would.
    (store as unknown as { captureUndoReceipt: (receipt: OperationReceipt, message: string) => void })
      .captureUndoReceipt(editReceipt('undo-newer', 'section.update', 5001), 'Section updated. Undo is available on this page.');
    resolveUndo({ operation: 'section.update', outcome: 'restored', section: text });
    await undoing;

    expect(store.undoNotice()).toMatchObject({ kind: 'available', receipt: { actionId: 'undo-newer' } });
  });

  it('offers read-only Retry refresh when the read after a committed move fails', async () => {
    const text = section('section-text', 'rich-text', 0);
    const tasks = section('section-tasks', 'task-list', 1);
    const list = vi.fn<WorkManagerGateway['sections']['list']>()
      .mockResolvedValueOnce([text, tasks])
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'read offline'))
      .mockResolvedValue([{ ...tasks, position: 0 }, { ...text, position: 1 }]);
    const move = vi.fn<WorkManagerGateway['sections']['move']>(async () => ({
      section: { ...tasks, position: 0 },
      operation: editReceipt('undo-move', 'section.move', 6000),
    }));
    const { store } = setup({ sections: [text, tasks], sectionOverrides: { list, move } });
    await store.load(PROJECT, PAGE);

    expect(await store.moveSection(tasks.id, 0)).toBe(true);
    expect(store.undoNotice()).toMatchObject({ receipt: { actionId: 'undo-move' }, refreshFailed: true });

    expect(await store.retryUndoRefresh()).toBe(true);
    expect(move).toHaveBeenCalledTimes(1);
    expect(store.undoNotice()).toMatchObject({ receipt: { actionId: 'undo-move' }, refreshFailed: false });
  });

  it('still sends a receipt again after a conflict over something missing, which another Undo can bring back', async () => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Mine' }, operation: editReceipt('undo-mine', 'section.update', 7000) });
    const undoExecute = vi.fn<UndoExecute>(async () => {
      throw new GatewayError('rule_violation', 409, 'history_conflict: refused', historyDetails('undo-mine', {
        reason: 'history_conflict',
        conflicts: [{ entityType: 'section', id: text.id, problem: 'missing', nextStep: 'nothing-to-undo' }],
      }));
    });
    const { store } = setup({ sections: [text], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Mine');

    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'refusal', receipt: { actionId: 'undo-mine' } });
    expect(await store.undoOperation()).toBeNull();

    // Permanence is the server's call: it retires an action no repair can satisfy.
    expect(undoExecute).toHaveBeenCalledTimes(2);
  });

  it('still sends a receipt again after a refusal that can be repaired', async () => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Mine' }, operation: editReceipt('undo-fixable', 'section.update', 7100) });
    const undoExecute = vi.fn<UndoExecute>(async () => {
      throw new GatewayError('rule_violation', 409, 'history_conflict: refused', historyDetails('undo-fixable', {
        reason: 'history_conflict',
        conflicts: [{ entityType: 'section', id: text.id, title: 'Mine', problem: 'field-changed', nextStep: 'change-by-hand' }],
      }));
    });
    const { store } = setup({ sections: [text], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Mine');

    await store.undoOperation();
    await store.undoOperation();

    expect(undoExecute).toHaveBeenCalledTimes(2);
  });

  it('history_not_next leaves the recovery offer standing, because undoing the newer change repairs it', async () => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Mine' }, operation: editReceipt('undo-behind', 'section.update', 7200) });
    const undoExecute = vi.fn<UndoExecute>().mockRejectedValueOnce(
      new GatewayError('rule_violation', 409, 'history_not_next: a newer change is first', historyDetails('undo-behind', { reason: 'history_not_next' })),
    ).mockResolvedValueOnce({ operation: 'section.update', outcome: 'restored', section: text });
    const { store } = setup({ sections: [text], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Mine');

    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'refusal', receipt: { actionId: 'undo-behind' }, refusal: { reason: 'history_not_next' } });

    await expect(store.undoOperation()).resolves.toMatchObject({ operation: 'section.update' });
    expect(undoExecute).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['history_expired', { reason: 'history_expired', expiresAt: AT }],
    ['history_retired', { reason: 'history_retired', conflicts: [{ entityType: 'section', id: 'section-text', problem: 'not-archived', nextStep: 'nothing-to-undo' }] }],
  ] as const)('%s is terminal: the receipt goes and is never sent again', async (_, details) => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Mine' }, operation: editReceipt('undo-done', 'section.update', 7300) });
    const undoExecute = vi.fn<UndoExecute>(async () => {
      throw new GatewayError('rule_violation', 409, `${details.reason}: refused`, historyDetails('undo-done', details));
    });
    const { store } = setup({ sections: [text], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Mine');

    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'terminal', receipt: null, refusal: { reason: details.reason } });
    expect(await store.undoOperation()).toBeNull();
    expect(undoExecute).toHaveBeenCalledOnce();
  });

  it('a stale revision whose action is still next keeps the receipt at the current revision', async () => {
    const text = section('section-text', 'rich-text', 0);
    const update = vi.fn<WorkManagerGateway['sections']['update']>()
      .mockResolvedValueOnce({ section: { ...text, title: 'Mine' }, operation: editReceipt('undo-still-next', 'section.update', 7400) });
    const undoExecute = vi.fn<UndoExecute>().mockRejectedValueOnce(
      new GatewayError('rule_violation', 409, 'history_revision_stale: moved on', historyDetails('undo-still-next', { reason: 'history_revision_stale' }, {
        revision: 7402,
        undo: { actionId: 'undo-still-next', operation: 'section.update', label: 'Mine', expiresAt: AT },
      })),
    ).mockResolvedValueOnce({ operation: 'section.update', outcome: 'restored', section: text });
    const { store, gateway } = setup({ sections: [text], sectionOverrides: { update }, undoExecute });
    await store.load(PROJECT, PAGE);
    await store.renameSection(text.id, 'Mine');

    expect(await store.undoOperation()).toBeNull();
    expect(store.undoNotice()).toMatchObject({ kind: 'available', receipt: { actionId: 'undo-still-next', revision: 7402 } });

    await expect(store.undoOperation()).resolves.toMatchObject({ operation: 'section.update' });
    expect(gateway.history.transition).toHaveBeenLastCalledWith(HISTORY, { actionId: 'undo-still-next', direction: 'undo', expectedRevision: 7402 });
  });
});
