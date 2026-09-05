import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectPageIdSchema, SectionIdSchema, SectionShortcutIdSchema } from './ids';
import { SectionColumnSpanSchema } from './section';

/**
 * §27's shortcut placement: a **reference**, not a copy.
 *
 * A root's Home may show a section that canonically lives elsewhere in the same root tree —
 * another of its pages, or any sub-project at any depth. The placement stores where it sits
 * and how it looks; the source stores everything else. No rows are copied and the source's
 * `config` is not duplicated, so there is still exactly one owner of the data.
 *
 * **Schema only, in this slice.** The collection this shape describes ships empty in Slice
 * 25.1 so that the operations arriving in 25.4 do not need a second destructive load break;
 * there are no shortcut services, repositories or integrity rules yet. A document written
 * today has `sectionShortcuts: []` and nothing that can add to it.
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
