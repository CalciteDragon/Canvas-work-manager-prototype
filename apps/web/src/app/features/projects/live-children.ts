import type { Project } from '@cwm/contracts';
import type { ProjectWorkspaceStore, WorkTreeNode } from './project-workspace-store';

/**
 * The routed project's direct children that are not archived (Slice 79, L4-008): exactly what
 * the domain's archive rule checks, so the archive confirmation can refuse first. A root's are
 * the top level of `subprojectTree()`; a workstream's are its node's children (the tree never
 * holds the root). Empty when the tree cannot say (unread, stale, or hidden under an archived
 * ancestor), and the domain then decides. A function over the store, not a store signal, so it
 * ships in the deferred confirmation's chunk rather than the initial bundle.
 */
export const liveChildrenOf = (store: Pick<ProjectWorkspaceStore, 'project' | 'root' | 'subprojectTree'>): Project[] => {
  const projectId = store.project()?.id;
  const find = (nodes: WorkTreeNode[]): WorkTreeNode[] | undefined => {
    for (const node of nodes) {
      const found = node.project.id === projectId ? node.children : find(node.children);
      if (found) return found;
    }
    return undefined;
  };
  const tree = store.subprojectTree();
  const children = projectId !== undefined && projectId === store.root()?.id ? tree : (find(tree) ?? []);
  return children.map(({ project }) => project).filter(({ status }) => status !== 'archived');
};
