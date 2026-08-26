import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, SectionIdSchema } from './ids';

/**
 * §27's grid presets against a 12-column grid. No absolute X/Y, and no arbitrary span —
 * whether resizing is useful at all is a §83 question.
 */
export const SectionColumnSpanSchema = z.literal([12, 8, 6, 4]);
export type SectionColumnSpan = z.infer<typeof SectionColumnSpanSchema>;

export const ProjectSectionSchema = z.object({
  id: SectionIdSchema,
  projectId: ProjectIdSchema,

  /**
   * Open string, not an enum: §29 makes section types a registry, and adding one should
   * touch its own folder plus one registry line — not this file.
   */
  type: z.string().min(1),
  /** Optional override for the §31 frame title; the registry supplies the default. */
  title: z.string().optional(),

  position: PositionSchema,
  columnSpan: SectionColumnSpanSchema,
  collapsed: z.boolean(),
  /** Shape belongs to the section definition (§29's `createDefaultConfig`). */
  config: z.unknown(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProjectSection = z.infer<typeof ProjectSectionSchema>;
