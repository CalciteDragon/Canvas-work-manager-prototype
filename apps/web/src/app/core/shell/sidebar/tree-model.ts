import type { ProjectId, ProjectPageKind } from '@cwm/contracts';
import type { PlaceProject, ProjectPlace } from '../navigation-context';
import type { ProjectTreeNode } from '../shell-store';

/**
 * One workstream row in the navigation tree (Slice 81). **Derived view state**, like
 * `ProjectTreeNode`: a row may come from the projects read or, while current, from the project
 * place's path (Q11 (a)), which is how archived work and work under an archived parent appear.
 */
export interface WorkRow {
  readonly id: ProjectId;
  readonly name: string;
  readonly icon: string | null;
  readonly archived: boolean;
  readonly completed: boolean;
  readonly children: readonly WorkRow[];
}

/** One of the root's pages, with whether it is the current item. */
export interface PageRow {
  readonly kind: ProjectPageKind;
  readonly label: string;
  readonly current: boolean;
}

/** B's root level: the root's row, its enabled pages and its workstream hierarchy. */
export interface RootLevel {
  readonly root: PlaceProject & { readonly icon: string | null };
  /** The root's row stands for its first page (Q5 (d)), so it is current there. */
  readonly rootCurrent: boolean;
  readonly pages: readonly PageRow[];
  readonly work: readonly WorkRow[];
  /** The workstream that is the current item, or `null` on a root page. */
  readonly currentWorkId: ProjectId | null;
}

/**
 * The root level for a project place over the shell's projects read, or `null` where there is
 * none: outside a project, after a failed or not-found load, or while an unlisted project loads.
 *
 * While a project loads, the previous root's rows stay if the loading project is in that root (or
 * cannot be placed), and otherwise the new root's row shows alone until its pages arrive (R2).
 */
export const rootLevelOf = (place: ProjectPlace | null, tree: readonly ProjectTreeNode[]): RootLevel | null => {
  if (place === null || place.status === 'missing') return null;
  const loadingRootId = place.status === 'loading' ? rootIdOf(place.projectId, tree) : undefined;
  if (place.root === null || (loadingRootId !== undefined && loadingRootId !== place.root.id)) {
    const node = tree.find(({ project }) => project.id === loadingRootId);
    if (node === undefined) return null;
    const { project } = node;
    return {
      root: { id: project.id, name: project.name, status: project.status, icon: project.icon ?? null },
      rootCurrent: place.projectId === project.id && (place.currentKind ?? 'home') === 'home',
      pages: [],
      work: [],
      currentWorkId: null,
    };
  }

  const root = place.root;
  const node = tree.find(({ project }) => project.id === root.id);
  const onRoot = place.projectId === root.id;
  // While loading, a bare `/projects/:id` is the root's first page.
  const kind = place.currentKind ?? (place.status === 'loading' ? 'home' : null);
  const chain = place.status === 'ready' && !onRoot && place.current !== null ? [...place.ancestors.slice(1), place.current] : [];
  return {
    root: { ...root, icon: node?.project.icon ?? null },
    rootCurrent: onRoot && kind === 'home',
    pages: place.pages.map(({ kind: pageKind, label }) => ({ kind: pageKind, label, current: onRoot && kind === pageKind })),
    work: workRows(node?.children ?? [], chain),
    currentWorkId: onRoot ? null : place.projectId,
  };
};

/** The live rows, with the current item's path drawn in where the read does not list it (Q11 (a)). */
const workRows = (nodes: readonly ProjectTreeNode[], chain: readonly PlaceProject[]): WorkRow[] => {
  const [next, ...rest] = chain;
  const rows = nodes.map(({ project, children }): WorkRow => ({
    id: project.id,
    name: project.name,
    icon: project.icon ?? null,
    archived: project.status === 'archived',
    completed: project.completedAt !== undefined && project.completedAt !== null,
    children: workRows(children, next !== undefined && project.id === next.id ? rest : []),
  }));
  if (next !== undefined && !nodes.some(({ project }) => project.id === next.id)) {
    rows.push({ id: next.id, name: next.name, icon: null, archived: next.status === 'archived', completed: next.status === 'completed', children: workRows([], rest) });
  }
  return rows;
};

/** The id of the listed root that holds `projectId`, or `undefined` when the read does not list it. */
const rootIdOf = (projectId: ProjectId, tree: readonly ProjectTreeNode[]): ProjectId | undefined => {
  const holds = (node: ProjectTreeNode): boolean => node.project.id === projectId || node.children.some(holds);
  return tree.find(holds)?.project.id;
};
