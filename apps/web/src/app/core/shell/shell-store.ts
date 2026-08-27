import { Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import { ProjectStatusSchema, type Identity, type Project } from '@cwm/contracts';
import { GatewayError } from '../gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../gateway/work-manager-gateway';
import { IDENTITY_PROVIDER } from '../identity/identity-provider';

/**
 * A project and the projects under it. **Derived view state, not an entity** — it has no
 * counterpart in `@cwm/contracts` and must never get one; §23's "expand inline" is a
 * rendering concern that the domain does not know about.
 */
export interface ProjectTreeNode {
  project: Project;
  children: ProjectTreeNode[];
}

/** The sidebar is navigation, so archived projects have no business in it. */
const SIDEBAR_STATUSES = ProjectStatusSchema.options.filter((status) => status !== 'archived');

/**
 * The shell's own store (§19, §20). It holds the shell's state and no one else's: the
 * dashboard, the project page and the rest bring their own, so any of them can be deleted
 * without unpicking a shared one.
 */
@Injectable()
export class ShellStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly identityProvider = inject(IDENTITY_PROVIDER);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly identityState = signal<Identity | null>(null);
  private readonly projectsState = signal<Project[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly identity = this.identityState.asReadonly();
  readonly projects = this.projectsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly projectTree = computed(() => toTree(this.projectsState()));

  /**
   * Registered with `PendingTasks` so `ApplicationRef.isStable` — and therefore
   * `fixture.whenStable()` — knows the app is mid-load. Without it a zoneless app
   * considers itself stable while this promise is still in flight, and every spec that
   * awaits `whenStable()` reads signals that have not been written yet.
   * (`PendingTasks.run` would do the same but returns void, and callers want the promise.)
   */
  load(): Promise<void> {
    const settled = this.pendingTasks.add();
    return this.loadInto().finally(settled);
  }

  private async loadInto(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const identity = await this.identityProvider.getCurrentIdentity();
      this.identityState.set(identity);
      this.projectsState.set(await this.gateway.projects.list({ status: SIDEBAR_STATUSES }));
    } catch (error) {
      this.projectsState.set([]);
      this.errorState.set(error instanceof GatewayError || error instanceof Error ? error.message : String(error));
    } finally {
      this.loadingState.set(false);
    }
  }
}

/**
 * A flat list becomes §23's inline hierarchy. Two rules earn their place:
 * a project whose parent is not in the list stays at the top level, so a filtered list
 * cannot make it invisible; and a visited set stops a parent cycle from recursing forever.
 * The prototype host rejects a cyclic document at load, but this walks a list it does not
 * own — a production API makes no such promise.
 */
const toTree = (projects: Project[]): ProjectTreeNode[] => {
  const nodes = new Map<string, ProjectTreeNode>(
    projects.map((project) => [project.id, { project, children: [] }]),
  );
  const inCycle = cycleMembers(nodes);

  const roots: ProjectTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.project.parentProjectId;
    // A node *inside* a cycle is cut loose; a node merely pointing at one keeps its edge.
    // The first version cut both, so a project whose parent happened to self-reference
    // was rendered as its own parent's sibling.
    const parent = parentId === undefined || inCycle.has(node.project.id) ? undefined : nodes.get(parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
};

/**
 * Every id that sits on a parent cycle. One pass with a shared `settled` set, so the whole
 * walk is O(n) rather than a fresh ancestor climb per node.
 */
const cycleMembers = (nodes: ReadonlyMap<string, ProjectTreeNode>): ReadonlySet<string> => {
  const cyclic = new Set<string>();
  const settled = new Set<string>();

  for (const start of nodes.keys()) {
    if (settled.has(start)) continue;

    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | undefined = start;

    while (current !== undefined && !settled.has(current) && !onPath.has(current)) {
      path.push(current);
      onPath.add(current);
      current = nodes.get(current)?.project.parentProjectId;
    }

    // Stopping on a node already on this path means everything from it onward is the loop.
    if (current !== undefined && onPath.has(current)) {
      for (const id of path.slice(path.indexOf(current))) cyclic.add(id);
    }
    for (const id of path) settled.add(id);
  }
  return cyclic;
};
