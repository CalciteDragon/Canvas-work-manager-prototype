import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, ProjectPageIdSchema } from './ids';
import type { ProjectKind } from './project';

/**
 * §26's pages. Four of these are a **root's**, and one is a **sub-project's**.
 *
 * `work` is a page record rather than an exception because §27's ownership chain
 * (`project → page → section → row`) does not branch: every section names a page, with no
 * "unless its owner is a sub-project" clause in every reader. It is deliberately not a *tab* —
 * it cannot be added, disabled, chosen or navigated to, which is why `NAVIGABLE_PAGE_KINDS`
 * exists separately below.
 *
 * A new kind is an explicit entry here plus a renderer. There is no generic page builder
 * (§80).
 */
export const ProjectPageKindSchema = z.enum(['home', 'work', 'todos', 'archive', 'reflections']);
export type ProjectPageKind = z.infer<typeof ProjectPageKindSchema>;

/** The kinds that are navigation — a root's, and only a root's. In §23's column order. */
export const NAVIGABLE_PAGE_KINDS = ['home', 'todos', 'archive', 'reflections'] as const;

export const isNavigablePageKind = (kind: ProjectPageKind): boolean =>
  (NAVIGABLE_PAGE_KINDS as readonly string[]).includes(kind);

/**
 * §30's capability table, as the one answer three layers need.
 *
 * It lives in contracts rather than in the Angular `SECTION_REGISTRY` for the same reason
 * `SECTION_OWNERSHIP` does: `validateDocumentIntegrity` and `SectionService` both have to
 * enforce it, and neither can import from `apps/web`.
 *
 * **Todos and Archive own nothing.** They are derived projections of rows that live elsewhere
 * (§31, §34), so a section on one is a section nothing would render.
 */
const PAGES_HOLDING_SECTIONS: readonly ProjectPageKind[] = ['home', 'work', 'reflections'];

export const pageAcceptsSections = (kind: ProjectPageKind): boolean => PAGES_HOLDING_SECTIONS.includes(kind);

/**
 * The page a project's sections land on when nobody named one (§27). A root's Home, a
 * sub-project's sole canvas — one lookup, no branch at the call site.
 */
export const canonicalPageKindFor = (kind: ProjectKind): ProjectPageKind => (kind === 'root' ? 'home' : 'work');

/** The kind a project's canonical page may **not** be, stated once for the integrity rules. */
export const isCanonicalPageKind = (kind: ProjectPageKind): boolean => kind === 'home' || kind === 'work';

export const ProjectPageSchema = z.object({
  id: ProjectPageIdSchema,
  projectId: ProjectIdSchema,
  kind: ProjectPageKindSchema,

  /**
   * §26's optional tabs. A canonical page is always enabled — `validateDocumentIntegrity`
   * rejects a disabled `home` or `work`, because a project with nowhere to put a section is
   * not a state any operation should be able to reach.
   *
   * Disabling is nondestructive: the page keeps its sections, their layout and every
   * reference to it. Only navigation changes.
   */
  enabled: z.boolean(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProjectPage = z.infer<typeof ProjectPageSchema>;
