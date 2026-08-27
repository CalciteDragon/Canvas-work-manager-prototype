import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, SectionIdSchema } from './ids';

/**
 * §27's grid presets against a 12-column grid. No absolute X/Y, and no arbitrary span —
 * whether resizing is useful at all is a §83 question.
 */
export const SectionColumnSpanSchema = z.literal([12, 8, 6, 4]);
export type SectionColumnSpan = z.infer<typeof SectionColumnSpanSchema>;

/**
 * Opaque to this package, but an **object**: §29 gives the shape to the section
 * definition's `createDefaultConfig`, while the write inputs replace a config whole. A
 * bare `z.unknown()` let storage hold `[]`, `"text"` or `null` — values no input schema
 * can produce or edit — and made "absent" and "explicitly undefined" the same thing.
 * See docs/decisions/2026-08-section-config-ownership.md.
 */
export const SectionConfigSchema = z.record(z.string(), z.unknown());
export type SectionConfig = z.infer<typeof SectionConfigSchema>;

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
  /** Keys belong to the section definition (§29's `createDefaultConfig`). */
  config: SectionConfigSchema,

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProjectSection = z.infer<typeof ProjectSectionSchema>;
