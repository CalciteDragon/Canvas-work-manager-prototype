import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Project, ProjectId, ProjectPage, ProjectPageKind } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { ShellStore, type ProjectTreeNode } from '../../core/shell/shell-store';
import { navigablePages } from '../../features/projects/project-page-registry';

/**
 * Slice 81's alternatives specimens (R1): the data every option draws from. **Disposable
 * prototype tooling, deleted at step 3.** It reads `ShellStore` and the gateway interface
 * directly, a shortcut product code may not take (`shell-commands.ts`); the tree's real data
 * path is R2's navigation context.
 */

/** A place in the app, parsed from the specimen's `at` query. */
export type SpecimenPlace =
  | { kind: 'destination'; id: 'app' | 'calendar' | 'search' | 'settings' | 'settings/agents' | 'settings/archived-projects' }
  | { kind: 'project'; projectId: ProjectId; pageKind: ProjectPageKind | null }
  | { kind: 'unknown'; url: string };

/** Q5's options for the word "Home". */
export type HomeNaming = 'a' | 'b' | 'c' | 'd';
/** Q16's options for a root that is opened but not current. */
export type RootPagesMode = 'a' | 'b' | 'c';

export interface SpecimenNode {
  id: string;
  label: string;
  /**
   * `link` navigates; `action` opens a lift or changes the specimen; `note` is a plain row;
   * `group` is a label over its children, not a heading, so nothing in the tree precedes the
   * page's `h1` (L5-015).
   */
  kind: 'link' | 'action' | 'note' | 'group';
  /** A link's app URL, rewritten into the specimen's `at`. */
  at?: string;
  current?: 'page' | 'location';
  muted?: boolean;
  /** A visible status word after the label ("Archived"). */
  mark?: string;
  /** `aria-describedby` text (Add workstream's "in Home renovation"). */
  description?: string;
  action?: SpecimenAction;
  /** Present: the row has a disclosure. Absent: a leaf. */
  children?: SpecimenNode[];
  /** Whether a disclosure is open; ignored for leaves. */
  expanded?: boolean;
}

export type SpecimenAction =
  | { type: 'page-settings'; rootId: ProjectId; rootName: string }
  | { type: 'add-workstream'; rootName: string; parentName: string }
  | { type: 'new-project' }
  | { type: 'all-projects' }
  | { type: 'retry-pages'; rootId: ProjectId }
  | { type: 'retry-projects' };

export interface ProjectContext {
  project: Project;
  /** Root first, parent last. */
  ancestors: Project[];
  root: Project;
  rootPages: ProjectPage[];
}

type ContextState = { state: 'none' } | { state: 'loading'; projectId: ProjectId } | { state: 'ready'; context: ProjectContext } | { state: 'failed'; projectId: ProjectId };
type RootPagesState = 'loading' | 'failed' | ProjectPage[];

const DESTINATIONS = ['app', 'calendar', 'search', 'settings', 'settings/agents', 'settings/archived-projects'] as const;

export const parsePlace = (url: string): SpecimenPlace => {
  const path = url.split(/[?#]/)[0]!.replace(/^\/+|\/+$/g, '');
  if ((DESTINATIONS as readonly string[]).includes(path)) return { kind: 'destination', id: path as (typeof DESTINATIONS)[number] };
  const match = /^projects\/([^/]+)(?:\/pages\/([^/]+))?$/.exec(path);
  if (match) return { kind: 'project', projectId: match[1] as ProjectId, pageKind: (match[2] as ProjectPageKind | undefined) ?? null };
  return { kind: 'unknown', url };
};

export const DESTINATION_LABELS: Record<(typeof DESTINATIONS)[number], string> = {
  app: 'Home',
  calendar: 'Calendar',
  search: 'Search',
  settings: 'Settings',
  'settings/agents': 'AI & Agents',
  'settings/archived-projects': 'Archived projects',
};

@Injectable()
export class SpecimenModel {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  /** Optional so the route map's spec, which renders the page without `AppShell`, still resolves it. */
  readonly shell = inject(ShellStore, { optional: true });

  readonly at = signal('/app');
  readonly home = signal<HomeNaming>('d');
  readonly rootPagesMode = signal<RootPagesMode>('b');
  readonly place = computed(() => parsePlace(this.at()));

  private readonly contextState = signal<ContextState>({ state: 'none' });
  private readonly rootPagesState = signal<ReadonlyMap<ProjectId, RootPagesState>>(new Map());
  /** Disclosures the person opened or closed by hand; they outlive navigation (L7-022). */
  private readonly expandedState = signal<ReadonlyMap<string, boolean>>(new Map());
  private loadToken = 0;

  readonly context = computed(() => {
    const state = this.contextState();
    return state.state === 'ready' ? state.context : null;
  });
  readonly contextFailed = computed(() => this.contextState().state === 'failed');
  readonly contextLoading = computed(() => this.contextState().state === 'loading');

  /** Live roots and their live work, from the shell's one read. */
  readonly roots = computed<ProjectTreeNode[]>(() => this.shell?.projectTree() ?? []);

  /** The page kind being shown on a root, `home` for the bare project URL. */
  readonly currentPageKind = computed<ProjectPageKind | null>(() => {
    const place = this.place();
    const context = this.context();
    if (place.kind !== 'project' || context === null || context.project.id !== context.root.id) return null;
    return place.pageKind ?? 'home';
  });

  constructor() {
    effect(() => {
      const place = this.place();
      untracked(() => {
        if (place.kind === 'project') void this.loadContext(place.projectId);
        else this.contextState.set({ state: 'none' });
      });
    });
    // Q16 (b): an opened root that is not current reads its pages once, on first expand.
    effect(() => {
      if (this.rootPagesMode() !== 'b') return;
      const expanded = this.expandedState();
      const current = this.context()?.root.id;
      const roots = this.roots();
      untracked(() => {
        for (const [id, open] of expanded) {
          const projectId = id.slice('project:'.length) as ProjectId;
          if (open && id.startsWith('project:') && projectId !== current && roots.some((root) => root.project.id === projectId)) this.ensureRootPages(projectId);
        }
      });
    });
    // Ancestors of the current item are always expanded on arrival (R3, deep trees).
    effect(() => {
      const context = this.context();
      if (context === null) return;
      untracked(() =>
        this.expandedState.update((map) => {
          const next = new Map(map);
          for (const ancestor of [...context.ancestors, context.root]) next.set(`project:${ancestor.id}`, true);
          return next;
        }),
      );
    });
  }

  isExpanded(id: string, fallback: boolean): boolean {
    return this.expandedState().get(id) ?? fallback;
  }

  setExpanded(id: string, open: boolean): void {
    this.expandedState.update((map) => new Map(map).set(id, open));
  }

  /** The label of the workspace dashboard under Q5. */
  dashboardLabel(): string {
    return this.home() === 'b' ? 'Dashboard' : 'Home';
  }

  /**
   * A root's page rows. For the current root they come from the context; for another root they
   * follow Q16: (a) none, (b) its records read on first expand, (c) every kind this build
   * renders, without records. The first page follows Q5: (d) has no row of its own.
   */
  pageRows(root: Project, opts: { includeFirst?: boolean } = {}): SpecimenNode[] {
    const context = this.context();
    const isCurrentRoot = context !== null && context.root.id === root.id;
    let pages: ProjectPage[] | 'loading' | 'failed';
    if (isCurrentRoot) pages = context.rootPages;
    else if (this.rootPagesMode() === 'a') return [];
    else if (this.rootPagesMode() === 'c') pages = (['home', 'todos', 'archive', 'reflections'] as const).map((kind) => fakePage(root.id, kind));
    else pages = this.rootPagesState().get(root.id) ?? 'loading';

    if (pages === 'loading') return [{ id: `pages-loading:${root.id}`, kind: 'note', label: 'Loading pages…', muted: true }];
    if (pages === 'failed') {
      return [
        { id: `pages-failed:${root.id}`, kind: 'note', label: 'Couldn’t load pages.', muted: true },
        { id: `pages-retry:${root.id}`, kind: 'action', label: 'Try again', action: { type: 'retry-pages', rootId: root.id } },
      ];
    }
    const activeKind = isCurrentRoot ? this.currentPageKind() : null;
    const includeFirst = opts.includeFirst ?? this.home() !== 'd';
    return navigablePages(pages, activeKind)
      .filter((definition) => includeFirst || definition.kind !== 'home')
      .map((definition) => ({
        id: `page:${root.id}:${definition.kind}`,
        kind: 'link' as const,
        label: definition.kind === 'home' ? this.firstPageLabel() : definition.label,
        at: definition.kind === 'home' ? `/projects/${root.id}` : `/projects/${root.id}/pages/${definition.kind}`,
        current: activeKind === definition.kind ? ('page' as const) : undefined,
      }));
  }

  /** Whether the root's own row is the current item (Q5 (d): it stands for the first page). */
  rootRowIsCurrent(root: Project, firstPageHasRow: boolean): boolean {
    return !firstPageHasRow && this.currentPageKind() === 'home' && this.context()?.root.id === root.id;
  }

  firstPageLabel(): string {
    return this.home() === 'a' ? 'Overview' : 'Home';
  }

  /**
   * A root's workstreams as rows, to full depth. Archived items reach the tree only while current
   * (Q11 (a)): the current item's real path is grafted in from the context, an archived ancestor
   * muted and marked, the item marked if it is archived.
   */
  workRows(root: ProjectTreeNode | Project): SpecimenNode[] {
    const rootProject = 'project' in root ? root.project : root;
    const live = 'project' in root ? root.children : (this.roots().find((node) => node.project.id === rootProject.id)?.children ?? []);
    const context = this.context();
    const chain = context !== null && context.root.id === rootProject.id ? [...context.ancestors.slice(1), context.project].filter((p) => p.id !== rootProject.id) : [];
    const currentId = context !== null && context.project.id !== context.root.id ? context.project.id : null;
    return this.toRows(live, chain, currentId);
  }

  private toRows(nodes: ProjectTreeNode[], chain: Project[], currentId: ProjectId | null): SpecimenNode[] {
    const [next, ...rest] = chain;
    const all = [...nodes];
    if (next !== undefined && !all.some((node) => node.project.id === next.id)) all.push({ project: next, children: [] });
    return all.map(({ project, children }) => {
      const onChain = next !== undefined && project.id === next.id;
      const rows = this.toRows(children, onChain ? rest : [], currentId);
      const id = `project:${project.id}`;
      return {
        id,
        kind: 'link' as const,
        label: project.name,
        at: `/projects/${project.id}`,
        current: project.id === currentId ? ('page' as const) : undefined,
        muted: project.status === 'archived',
        mark: project.status === 'archived' ? 'Archived' : undefined,
        ...(rows.length > 0 ? { children: rows, expanded: this.isExpanded(id, true) } : {}),
      };
    });
  }

  /** Page settings and Add workstream, labelled with the root (R3). */
  rootControls(root: Project): SpecimenNode[] {
    const context = this.context();
    const parentName = context !== null && context.root.id === root.id ? nearestEligible(context).name : root.name;
    return [
      { id: `page-settings:${root.id}`, kind: 'action', label: `Pages of ${root.name}…`, action: { type: 'page-settings', rootId: root.id, rootName: root.name } },
      { id: `add-workstream:${root.id}`, kind: 'action', label: 'Add workstream', description: `in ${root.name}`, action: { type: 'add-workstream', rootName: root.name, parentName } },
    ];
  }

  /** The destinations, in today's order; Settings holds its two children (L7-010). */
  destinationRows(): { before: SpecimenNode[]; settings: SpecimenNode } {
    const place = this.place();
    const currentId = place.kind === 'destination' ? place.id : null;
    const link = (id: keyof typeof DESTINATION_LABELS, label = DESTINATION_LABELS[id]): SpecimenNode => ({
      id: `destination:${id}`,
      kind: 'link',
      label,
      at: `/${id}`,
      current: currentId === id ? 'page' : undefined,
    });
    const inSettings = currentId?.startsWith('settings') ?? false;
    return {
      before: [link('app', this.dashboardLabel()), link('calendar'), link('search')],
      settings: { ...link('settings'), children: [link('settings/agents'), link('settings/archived-projects')], expanded: this.isExpanded('destination:settings', inSettings) },
    };
  }

  /**
   * The Projects group's own rows when there are no roots to list: the empty-workspace decision's
   * words, kept (R3). `null` when roots are listed.
   */
  projectsStateRows(): SpecimenNode[] | null {
    const shell = this.shell;
    if (shell === null) return [{ id: 'projects-no-shell', kind: 'note', label: 'Open this specimen inside the app shell.' }];
    if (shell.error() !== null) {
      return [
        { id: 'projects-failed', kind: 'note', label: 'Couldn’t load your projects.' },
        { id: 'projects-retry', kind: 'action', label: 'Try again', action: { type: 'retry-projects' } },
      ];
    }
    if (this.rootList().length > 0) return null;
    if (shell.loading() || !shell.answered()) return [{ id: 'projects-loading', kind: 'note', label: 'Loading projects…' }];
    if (shell.hasArchived()) {
      return [
        { id: 'projects-empty', kind: 'note', label: 'No active projects.' },
        { id: 'projects-archives', kind: 'link', label: 'View archives', at: '/settings/archived-projects' },
      ];
    }
    return [{ id: 'projects-empty', kind: 'note', label: 'No projects yet' }];
  }

  readonly newProjectRow: SpecimenNode = { id: 'new-project', kind: 'action', label: 'New project', action: { type: 'new-project' } };

  /** The current root, drawn from the context even when archived (Q11 (a)), or `null`. */
  readonly currentRoot = computed<Project | null>(() => this.context()?.root ?? null);

  /** The live roots plus an archived current root, in the shell's order. */
  readonly rootList = computed<ProjectTreeNode[]>(() => {
    const roots = this.roots();
    const current = this.currentRoot();
    if (current === null || roots.some((node) => node.project.id === current.id)) return roots;
    return [...roots, { project: current, children: [] }];
  });

  ensureRootPages(rootId: ProjectId): void {
    if (this.rootPagesMode() !== 'b' || this.context()?.root.id === rootId) return;
    const state = this.rootPagesState().get(rootId);
    if (state !== undefined && state !== 'failed') return;
    this.setRootPages(rootId, 'loading');
    this.gateway.pages.list(rootId).then(
      (pages) => this.setRootPages(rootId, pages),
      () => this.setRootPages(rootId, 'failed'),
    );
  }

  private setRootPages(rootId: ProjectId, state: RootPagesState): void {
    this.rootPagesState.update((map) => new Map(map).set(rootId, state));
  }

  private async loadContext(projectId: ProjectId): Promise<void> {
    const token = ++this.loadToken;
    const previous = this.context();
    // A move inside the same root keeps the old context until the new one answers: no empty frame.
    if (previous === null) this.contextState.set({ state: 'loading', projectId });
    try {
      const project = await this.gateway.projects.get(projectId);
      const ancestors: Project[] = [];
      for (let parentId = project.parentProjectId; parentId !== undefined; ) {
        const parent = await this.gateway.projects.get(parentId);
        ancestors.unshift(parent);
        parentId = parent.parentProjectId;
      }
      const root = ancestors[0] ?? project;
      const rootPages = await this.gateway.pages.list(root.id);
      if (token === this.loadToken) this.contextState.set({ state: 'ready', context: { project, ancestors, root, rootPages } });
    } catch {
      if (token === this.loadToken) this.contextState.set({ state: 'failed', projectId });
    }
  }
}

/** Q15 (a): the open workstream, else its nearest eligible ancestor (live, under no archived one). */
const nearestEligible = (context: ProjectContext): Project => {
  const chain = [...context.ancestors, context.project];
  const firstArchived = chain.findIndex((project) => project.status === 'archived');
  const eligible = firstArchived === -1 ? chain : chain.slice(0, firstArchived);
  return eligible[eligible.length - 1] ?? context.root;
};

const fakePage = (projectId: ProjectId, kind: ProjectPageKind): ProjectPage =>
  ({ id: `fake-${projectId}-${kind}`, projectId, kind, enabled: true }) as unknown as ProjectPage;
