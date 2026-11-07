import type { ProjectId } from '@cwm/contracts';
import type { ProjectWorkspaceStore, WorkTreeNode } from './project-workspace-store';

/** One live workstream under the routed project, with its own, so depth can reach the list's markup. */
export type LiveDescendant = WorkTreeNode;

const live = (nodes: readonly WorkTreeNode[]): LiveDescendant[] =>
  nodes.filter(({ project }) => project.status !== 'archived').map(({ project, children }) => ({ project, children: live(children) }));

/**
 * The routed project's live subtree (Slice 80, R10), which is what the domain's archive rule
 * requires the caller to name. A root's is all of `subprojectTree()`; a workstream's is what is
 * under its node (the tree never holds the root). The walk stops where the domain's does, at
 * anything archived. Empty when the tree cannot say (unread, stale, or hidden under an archived
 * ancestor), and the domain then decides. A function over the store, not a store signal, so it ships
 * in the deferred confirmation's chunk rather than the initial bundle.
 */
export const liveDescendantsOf = (store: Pick<ProjectWorkspaceStore, 'project' | 'root' | 'subprojectTree'>): LiveDescendant[] => {
  const projectId = store.project()?.id;
  const find = (nodes: readonly WorkTreeNode[]): readonly WorkTreeNode[] | undefined => {
    for (const node of nodes) {
      const found = node.project.id === projectId ? node.children : find(node.children);
      if (found) return found;
    }
    return undefined;
  };
  const tree = store.subprojectTree();
  return live(projectId !== undefined && projectId === store.root()?.id ? tree : (find(tree) ?? []));
};

/** The ids a press names, depth first, in the order the list shows them. */
export const liveDescendantIds = (nodes: readonly LiveDescendant[]): ProjectId[] =>
  nodes.flatMap(({ project, children }) => [project.id, ...liveDescendantIds(children)]);
