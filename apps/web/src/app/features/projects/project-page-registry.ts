import type { Type } from '@angular/core';
import {
  ProjectPageKindSchema,
  isNavigablePageKind,
  isRootProject,
  type Project,
  type ProjectPage,
  type ProjectPageId,
  type ProjectPageKind,
  isOptionalPageKind,
  type OptionalProjectPageKind as ContractOptionalProjectPageKind,
} from '@cwm/contracts';
import { ProjectCanvas } from './project-canvas';
import { ArchivePage } from './pages/archive-page';
import { TodosPage } from './pages/todos-page';
import { ReflectionsPage } from './pages/reflections-page';
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

/** Root page kinds the navigation manager may toggle. Canonical pages are intentionally absent. */
/**
 * Re-exported from contracts rather than redeclared: Slice 38 needed the same three kinds in
 * `page-history.ts`, and two structurally identical definitions of "an optional page" would be
 * two places to change when §26 gains a fourth.
 */
export type OptionalProjectPageKind = ContractOptionalProjectPageKind;
export type OptionalProjectPageDefinition = Omit<ProjectPageDefinition, 'kind'> & {
  kind: OptionalProjectPageKind;
};

/**
 * §26's four root pages, minus the ones nothing can draw yet.
 *
 * Adding a page kind is one entry here plus its renderer — the same claim §29's section
 * registry makes, at the level above it. **A kind with no entry is not advertised and cannot
 * be navigated to**, even when the root has enabled it: a tab leading to a blank screen is worse
 * than no tab. Archive and Reflections are both rendered here; future page kinds remain absent
 * until their own renderer exists.
 */
export const PROJECT_PAGE_REGISTRY: readonly ProjectPageDefinition[] = [
  { kind: 'home', label: 'Home', icon: '🏠', component: ProjectCanvas },
  { kind: 'todos', label: 'Todos', icon: '🗓️', component: TodosPage },
  { kind: 'archive', label: 'Archive', icon: '🗄️', component: ArchivePage },
  { kind: 'reflections', label: 'Reflections', icon: '📓', component: ReflectionsPage },
];

export const OPTIONAL_PROJECT_PAGE_DEFINITIONS: readonly OptionalProjectPageDefinition[] =
  PROJECT_PAGE_REGISTRY.filter(
    (definition): definition is OptionalProjectPageDefinition => definition.kind !== 'home' && definition.kind !== 'work',
  );

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
  | { outcome: 'redirect'; to: unknown[]; reason: string; enableKind?: OptionalProjectPageKind }
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
    const fallback = toHome(`The ${labelFor(kind)} page is switched off for this project. Showing Home instead.`);
    // Only a real, disabled optional record gets an enable affordance. A missing record is the
    // first-enable case, while Home/work and unknown kinds are different fallbacks entirely.
    return page !== undefined && !page.enabled && isOptionalProjectPageKind(kind) && fallback.outcome === 'redirect'
      ? { ...fallback, enableKind: kind }
      : fallback;
  }
  if (definition === undefined) {
    return toHome(`The ${labelFor(kind)} page is not built yet. Showing Home instead.`);
  }
  return { outcome: 'render', kind, pageId: page.id, component: definition.component };
};

/** Read from the contract rather than restated: §11 defines the kinds once. */
const isPageKind = (kind: string): kind is ProjectPageKind =>
  (ProjectPageKindSchema.options as readonly string[]).includes(kind);

/** The contract's predicate, under the name the shell already imports. */
export const isOptionalProjectPageKind: (kind: ProjectPageKind) => kind is OptionalProjectPageKind = isOptionalPageKind;

/** A kind's name in a sentence, whether or not this build can draw it. */
const labelFor = (kind: ProjectPageKind): string =>
  pageDefinitionFor(kind)?.label ?? kind.charAt(0).toUpperCase() + kind.slice(1);
