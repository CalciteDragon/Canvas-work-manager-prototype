import type { ProjectId, ProjectLayoutMode, ProjectPageId } from '@cwm/contracts';

/**
 * What every page renderer receives from `ProjectWorkspaceShell`.
 *
 * The two `on…` members are **callbacks, not outputs**, and that is forced rather than
 * preferred: the shell mounts a renderer through `NgComponentOutlet`, which has an inputs
 * record and no output API at all. `SectionContentInputs` solved the same problem the same
 * way one level down, and its rule applies here too — the callback's identity must be
 * **stable**, because `NgComponentOutlet` calls `setInput` for every key on every
 * change-detection pass and only `Object.is` stops that from re-rendering the page each
 * cycle. So the shell passes class-property arrows and builds this record in a `computed()`.
 */
export interface ProjectPageRendererInputs extends Record<string, unknown> {
  projectId: ProjectId;
  pageId: ProjectPageId;
  projectLayoutMode: ProjectLayoutMode;
  restoreBlocked: boolean;
  /** Shortcut placement is a Home-only root capability (§27). */
  shortcutsAllowed: boolean;
  /** Something on this page may have moved §39's progress — the header re-reads it. */
  onProjectDataChange: () => void;
  /** Something on this page may have moved the work hierarchy — the column re-reads it. */
  onProjectHierarchyChange: () => void;
}

/**
 * The members a page renderer must declare. `ProjectPageDefinition.component` is typed
 * against this, so a page registered without one of the shell's inputs fails to compile
 * rather than failing at `setInput` in the browser.
 */
export interface ProjectPageRenderer {
  readonly projectId: unknown;
  readonly pageId: unknown;
  readonly projectLayoutMode: unknown;
  readonly restoreBlocked: unknown;
  readonly shortcutsAllowed: unknown;
  readonly onProjectDataChange: unknown;
  readonly onProjectHierarchyChange: unknown;
}
