import { InjectionToken } from '@angular/core';
import type { ProjectWorkspaceStore } from './project-workspace-store';

/**
 * The workspace store's project and tree, as the deferred archive confirmation reads them
 * (Slices 79, 80). A token with no runtime dependency, provided by the shell with
 * `useExisting`, so the confirmation's chunk never imports the store module (which would split
 * the store's own dependencies into extra initial chunks).
 */
export const WORKSPACE_TREE = new InjectionToken<Pick<ProjectWorkspaceStore, 'project' | 'root' | 'subprojectTree'>>('WORKSPACE_TREE');
