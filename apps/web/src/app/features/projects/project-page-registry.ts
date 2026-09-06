import type { Type } from '@angular/core';
import {
  ProjectPageKindSchema,
  isNavigablePageKind,
  isRootProject,
  type Project,
  type ProjectPage,
  type ProjectPageId,
  type ProjectPageKind,
} from '@cwm/contracts';
import { ProjectCanvas } from './project-canvas';
import type { ProjectPageRenderer } from './project-page-contract';

/**
 * A page kind this build can draw, and what the column calls it.
 *
 * **Navigable kinds only.** `work` is a page record but not a tab (§26) — it cannot be added,
 * disabled, chosen or navigated to — so putting it here would make `/projects/:rootId/pages/work`
 * a resolvable URL on a project that has no such page. A sub-project's canvas is chosen from
 * `project.kind` instead, which is the only thing that can decide it.
 */
export interface ProjectPageDefinition {
  kind: ProjectPageKind;
  label: string;
  icon: string;
  component: Type<ProjectPageRenderer>;
}

/**
 * §26's four root pages, minus the ones nothing can draw yet.
 *
 * Adding a page kind is one entry here plus its renderer — the same claim §29's section
 * registry makes, at the level above it. **A kind with no entry is not advertised and cannot
 * be navigated to**, even when the root has enabled it: enabling Todos over MCP today creates
 * a page that owns data and has nothing to render it, and a tab leading to a blank screen is
 * worse than no tab. Slices 25.5–25.7 add one line each.
 */
export const PROJECT_PAGE_REGISTRY: readonly ProjectPageDefinition[] = [
  { kind: 'home', label: 'Home', icon: '🏠', component: ProjectCanvas },
];

export const pageDefinitionFor = (kind: ProjectPageKind): ProjectPageDefinition | undefined =>
  PROJECT_PAGE_REGISTRY.find((definition) => definition.kind === kind);

/** The tabs the column shows: navigable, enabled by this root, and renderable by this build. */
export const navigablePages = (pages: readonly ProjectPage[]): ProjectPageDefinition[] =>
  PROJECT_PAGE_REGISTRY.filter((definition) =>
    pages.some((page) => page.kind === definition.kind && page.enabled),
  );

/**
 * §68's resolution, as one **positive** rule: a `/pages/:kind` URL renders that page only when
 * the project is a root, the kind is navigable, the root has that page enabled, and this build
 * can draw it. Everything else redirects, because §68 asks for a fallback to Home "with an
 * explanation" rather than a blank screen or a 404.
 *
 * Pure, and separate from the shell, so every branch is testable without a router.
 */
export type ProjectPageResolution =
  | { outcome: 'render'; kind: ProjectPageKind; pageId: ProjectPageId; component: Type<ProjectPageRenderer> }
  | { outcome: 'redirect'; to: unknown[]; reason: string }
  | { outcome: 'unavailable'; reason: string };

export const resolveProjectPage = (input: {
  project: Project;
  /** The routed project's **own** pages — a sub-project's `work` record lives only here. */
  ownPages: readonly ProjectPage[];
  requestedKind: string | null;
}): ProjectPageResolution => {
  const { project, ownPages, requestedKind } = input;

  if (!isRootProject(project)) {
    // §68: "rejected on a subproject, which has no pages."
    if (requestedKind !== null) {
      return {
        outcome: 'redirect',
        to: ['/projects', project.id],
        reason: `“${project.name}” is a unit of work with a single canvas, so it has no pages.`,
      };
    }
    const work = ownPages.find((page) => page.kind === 'work');
    return work === undefined
      ? { outcome: 'unavailable', reason: 'This unit of work has no canvas to show.' }
      : { outcome: 'render', kind: 'work', pageId: work.id, component: ProjectCanvas };
  }

  const kind = requestedKind ?? 'home';
  const home = ownPages.find((page) => page.kind === 'home' && page.enabled);

  /**
   * Falling back *to* Home when Home is the thing that failed would loop, so that case answers
   * `unavailable` — with its own sentence, because "Showing Home instead" is exactly what is
   * not happening. §26 makes Home required and undisablable, so reaching this is a broken
   * document rather than an ordinary state, and it should read like one.
   */
  const toHome = (reason: string): ProjectPageResolution =>
    kind === 'home' || home === undefined
      ? { outcome: 'unavailable', reason: 'This project has no Home page to show.' }
      : { outcome: 'redirect', to: ['/projects', project.id, 'pages', 'home'], reason };

  const definition = PROJECT_PAGE_REGISTRY.find(({ kind: candidate }) => candidate === kind);
  if (!isPageKind(kind) || !isNavigablePageKind(kind)) {
    return toHome(`There is no “${kind}” page. Showing Home instead.`);
  }
  const page = ownPages.find((candidate) => candidate.kind === kind);
  if (page === undefined || !page.enabled) {
    return toHome(`The ${labelFor(kind)} page is switched off for this project. Showing Home instead.`);
  }
  if (definition === undefined) {
    return toHome(`The ${labelFor(kind)} page is not built yet. Showing Home instead.`);
  }
  return { outcome: 'render', kind, pageId: page.id, component: definition.component };
};

/** Read from the contract rather than restated: §11 defines the kinds once. */
const isPageKind = (kind: string): kind is ProjectPageKind =>
  (ProjectPageKindSchema.options as readonly string[]).includes(kind);

/** A kind's name in a sentence, whether or not this build can draw it. */
const labelFor = (kind: ProjectPageKind): string =>
  pageDefinitionFor(kind)?.label ?? kind.charAt(0).toUpperCase() + kind.slice(1);
