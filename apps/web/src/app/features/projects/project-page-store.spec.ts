import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  TaskSchema,
  type Project,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type ResolvedSectionShortcut,
  type SectionId,
  type Task,
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
    sectionOverrides?: Partial<WorkManagerGateway['sections']>;
    shortcutList?: WorkManagerGateway['shortcuts']['list'];
    shortcutOverrides?: Partial<WorkManagerGateway['shortcuts']>;
    taskList?: WorkManagerGateway['tasks']['list'];
  } = {},
) => {
  // Mutated by the write fakes, so a spec sees what a re-listing host would answer.
  let sections = options.sections ?? [
    section('section-text', 'rich-text', 0),
    section('section-tasks', 'task-list', 1),
  ];
  let shortcuts = options.shortcuts ?? [];

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
      list: vi.fn(async () => [...sections]),
      create: vi.fn(async (_projectId, input) => {
        const created = section(`section-${sections.length}`, input.type, sections.length, {
          config: input.config,
        });
        sections = [...sections, created];
        return created;
      }),
      update: vi.fn(async (id, input) => {
        const updated = { ...sections.find((item) => item.id === id)!, ...input } as ProjectSection;
        sections = sections.map((item) => (item.id === id ? updated : item));
        return updated;
      }),
      move: vi.fn(async (id, input) => ({
        ...sections.find((item) => item.id === id)!,
        position: input.position,
      })),
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
        sections = sections
          .filter((item) => item.id !== id)
          .map((item, position) => ({ ...item, position }));
      }),
      restore: vi.fn(async (id) => sections.find((item) => item.id === id)!),
      ...options.sectionOverrides,
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
      complete: vi.fn(async (id: string) => task(id, 'done')),
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
    previous.resolve([]);
    await oldLoad;

    expect(store.shortcuts()).toEqual([]);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
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

    // Telling the user a completed remove failed invites them to click it again, which now
    // answers the already-archived 409 — the record is still there.
    expect(await store.removeSection('section-text' as SectionId)).toBe(true);
    expect(store.sectionError()).toBeNull();
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks']);
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

    expect(await store.addSection(definition())).toBe(true);

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
    // It surfaces as a visible section error, not a thrown page crash — a broken definition
    // is a bug to see, not a reason to lose the canvas.
    expect(await store.addSection(definition({ createDefaultConfig: () => 'not an object' }))).toBe(
      false,
    );
    expect(gateway.sections.create).not.toHaveBeenCalled();
    expect(store.sectionError()).not.toBeNull();
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

  it('duplicates a section and re-reads the positions the host renumbered', async () => {
    const { store } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.duplicateSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-text', 0],
      ['section-text-copy', 1],
      ['section-tasks', 2],
    ]);
  });

  it('removes a section and closes the position gap', async () => {
    const { store } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.removeSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 0],
    ]);
  });

  it('does not fabricate sibling positions when a successful duplicate cannot be re-read', async () => {
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

    expect(await store.duplicateSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-text', 0],
      ['section-text-copy', 1],
      ['section-tasks', 1],
    ]);
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
    expect(store.sectionError()).toContain('could not reach');
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
    ]) {
      details = candidate;

      expect(await store.removeSection('section-tasks' as SectionId)).toBe(false);
      expect(store.removalPrompt()).toBeNull();
      expect(store.sectionError()).toContain('still holds 3 tasks');
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

  it('resets Edit Layout Mode when page navigation starts', async () => {
    const { store } = setup();
    await store.load(PROJECT, PAGE);
    store.setEditMode(true);

    const next = store.load('project-b' as ProjectId, OTHER_PAGE);

    expect(store.editMode()).toBe(false);
    await next;
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
    await add;

    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
  });

  it('does not append a duplicate or leak a rejected update after navigation', async () => {
    const duplicateGate = deferred<ProjectSection>();
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
        duplicate: vi.fn(() => duplicateGate.promise),
        update: vi.fn(() => updateGate.promise),
      },
    });
    await store.load(PROJECT, PAGE);

    const duplicate = store.duplicateSection('section-text' as SectionId);
    const update = store.setCollapsed('section-text' as SectionId, true);
    await store.load(other, OTHER_PAGE);
    duplicateGate.resolve(section('section-copy', 'rich-text', 1));
    updateGate.reject(new GatewayError('unreachable', 0, 'old project write failed'));
    await Promise.all([duplicate, update]);

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
