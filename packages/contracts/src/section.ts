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

/**
 * What a section *does* with data, not what it renders. See
 * docs/decisions/2026-09-sections-own-their-data.md: a container owns rows of one kind and
 * removing it takes them with it; a view renders data it does not own and removing it
 * touches nothing.
 */
export const SectionKindSchema = z.enum(['container', 'view']);
export type SectionKind = z.infer<typeof SectionKindSchema>;

/** The row collections a container can own. Milestones have no container type (§35). */
export const OwnedDataKindSchema = z.enum(['tasks', 'reflections']);
export type OwnedDataKind = z.infer<typeof OwnedDataKindSchema>;

/**
 * Ownership lives here rather than in the Angular registry (§29) because `SectionService`
 * needs it and cannot import from `apps/web`; the registry reads `kind` back out of it, so
 * there is still one source. Keyed by the same open `type` strings the registry uses.
 *
 * **Types absent from this map are views**, so an unknown type can never cascade — the
 * failure mode for a stale or hand-edited `type` stays non-destructive.
 *
 * `rich-text` is a container conceptually, but it owns its data through `config.text`
 * rather than through rows: it has nothing to cascade, and removing the section already
 * removes its text.
 */
export const SECTION_OWNERSHIP: Record<string, OwnedDataKind> = {
  'task-list': 'tasks',
  reflections: 'reflections',
};

// `Object.hasOwn`, not `in`: `'toString' in SECTION_OWNERSHIP` is true, and a section type
// that happens to name an `Object.prototype` member must not read as a container.
export const sectionKindOf = (type: string): SectionKind =>
  Object.hasOwn(SECTION_OWNERSHIP, type) ? 'container' : 'view';

export const ownedKindOf = (type: string): OwnedDataKind | undefined =>
  Object.hasOwn(SECTION_OWNERSHIP, type) ? SECTION_OWNERSHIP[type] : undefined;

/**
 * The container type to create for rows of `owned` when a project has none. Derived from
 * the same map rather than written out a second time, so the two cannot drift.
 */
export const containerTypeFor = (owned: OwnedDataKind): string => {
  const type = Object.entries(SECTION_OWNERSHIP).find(([, kind]) => kind === owned)?.[0];
  // Unreachable while `OwnedDataKind` is derived from the map's values, and cheaper to
  // assert than to make every caller handle an impossible undefined.
  if (type === undefined) throw new TypeError(`no section type owns "${owned}"`);
  return type;
};

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
