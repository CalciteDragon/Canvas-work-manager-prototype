import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema, SectionShortcutIdSchema } from './ids';
import { ProjectPageKindSchema } from './project-page';
import { ProjectSectionSchema, SectionColumnSpanSchema } from './section';

/**
 * §27's shortcut placement: a **reference**, not a copy.
 *
 * A root's Home may show a section that canonically lives elsewhere in the same root tree —
 * another of its pages, or any sub-project at any depth. The placement stores where it sits
 * and how it looks; the source stores everything else. No rows are copied and the source's
 * `config` is not duplicated, so there is still exactly one owner of the data.
 *
 * The collection is a placement collection: the source section remains the only owner of
 * content, rows, configuration, and activity. The resolved/read shapes below are deliberately
 * separate so an API or MCP read can expose source identity without putting source rows into
 * the placement record.
 */
export const SectionShortcutSchema = z.object({
  id: SectionShortcutIdSchema,

  /** The page the placement sits on. Home, in every case 25.4 will allow. */
  pageId: ProjectPageIdSchema,

  /** The canonical section whose content is rendered. Never another shortcut (§27). */
  sourceSectionId: SectionIdSchema,

  /**
   * Layout is the placement's own, which is the point: Home orders its sections and its
   * shortcuts together, and collapsing a placement does not collapse the source.
   */
  position: PositionSchema,
  columnSpan: SectionColumnSpanSchema,
  collapsed: z.boolean(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SectionShortcut = z.infer<typeof SectionShortcutSchema>;

/** Why a stored reference can or cannot currently render its source (§27, §31). */
export const ShortcutAvailabilitySchema = z.enum(['available', 'source_archived', 'source_hidden']);
export type ShortcutAvailability = z.infer<typeof ShortcutAvailabilitySchema>;

/** A placement resolved to its canonical source identity, never to copied source rows. */
export const ResolvedSectionShortcutSchema = SectionShortcutSchema.extend({
  source: ProjectSectionSchema,
  sourceProjectId: ProjectIdSchema,
  sourceProjectName: z.string().min(1),
  sourcePageKind: ProjectPageKindSchema,
  breadcrumb: z.array(z.string().min(1)),
  availability: ShortcutAvailabilitySchema,
});
export type ResolvedSectionShortcut = z.infer<typeof ResolvedSectionShortcutSchema>;

/** One selectable source in the Add shortcut picker; row collections never cross this seam. */
export const ShortcutSourceSchema = z.object({
  sourceSectionId: SectionIdSchema,
  type: z.string().min(1),
  name: z.string().min(1),
  projectId: ProjectIdSchema,
  projectName: z.string().min(1),
  pageId: ProjectPageIdSchema,
  pageKind: ProjectPageKindSchema,
  breadcrumb: z.array(z.string().min(1)),
  alreadyPlaced: z.boolean(),
});
export type ShortcutSource = z.infer<typeof ShortcutSourceSchema>;
