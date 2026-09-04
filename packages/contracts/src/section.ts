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
 * removing it archives them with it; a view renders data it does not own, so removing it
 * touches no rows.
 *
 * It says nothing about *surviving* removal: every section archives, container or view
 * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md).
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
 * rather than through rows: it has nothing to cascade, and archiving the section keeps its
 * text — `config` rides along on the record, so restoring returns the prose intact. That
 * survival is why removal archives *every* section rather than only containers.
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

/**
 * Display names that the derivation below cannot produce. One entry today: the spec spells
 * sub-projects with a hyphen (line 1109), and nothing distinguishes that hyphen from
 * `task-list`'s. `registry.spec.ts` fails when a registered name and this pair disagree, so
 * the table grows exactly when a new type earns an entry and never silently.
 */
export const SECTION_DISPLAY_NAMES: Record<string, string> = { 'sub-projects': 'Sub-Projects' };

/**
 * The name a section carries when it has no `title` override.
 *
 * `Object.hasOwn`, not `??` — for the reason stated above at `sectionKindOf`:
 * `SECTION_DISPLAY_NAMES['constructor']` is `Object`, not `undefined`, so `??` would never
 * fire and this would return a *function* from a signature declaring `: string`, with the
 * `Record<string, string>` index signature hiding it from the compiler. `type` is an open
 * `z.string().min(1)` that `create_section` exposes to agents and that a hand-edited
 * `data.json` (§14) can hold, so this is reachable rather than theoretical.
 */
export const displayNameOf = (type: string): string =>
  Object.hasOwn(SECTION_DISPLAY_NAMES, type)
    ? SECTION_DISPLAY_NAMES[type]
    : type.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** A stored or incoming override, normalised without making legacy blank data fatal. */
export const normaliseSectionTitle = (title: string | null | undefined): string | undefined => {
  const normalised = title?.trim();
  return normalised === undefined || normalised === '' ? undefined : normalised;
};

/**
 * **A section's name, for every surface that has to say one.** Its normalised override, else
 * the derived default. The frame, the removal dialog, the domain's activity summary and the
 * Notes aria-label each had their own answer and the four disagreed; this is the one.
 */
export const nameOf = (section: Pick<ProjectSection, 'type' | 'title'>): string =>
  normaliseSectionTitle(section.title) ?? displayNameOf(section.type);

/**
 * The only 409 the canvas may turn into a removal-policy question. Positive and
 * discriminated on purpose: a refusal that carries no count, or a different reason, is not
 * safely identifiable as the question the dialog can answer, so it stays an ordinary error.
 */
export const SectionRemovalRefusalDetailsSchema = z.object({
  reason: z.literal('section_not_empty'),
  liveRowCount: z.number().int().positive(),
});
export type SectionRemovalRefusalDetails = z.infer<typeof SectionRemovalRefusalDetailsSchema>;

export const ProjectSectionSchema = z.object({
  id: SectionIdSchema,
  projectId: ProjectIdSchema,

  /**
   * Open string, not an enum: §29 makes section types a registry, and adding one should
   * touch its own folder plus one registry line — not this file.
   */
  type: z.string().min(1),
  /**
   * Optional override for the §31 frame title; `displayNameOf` supplies the default. Left a
   * plain optional string rather than the trimmed `SectionTitleSchema` the write inputs use:
   * tightening it here would reject a document that parsed before this phase, which is a
   * `SCHEMA_VERSION` change this phase does not make. `nameOf` is the compatibility
   * boundary — every new write is strict.
   */
  title: z.string().optional(),

  position: PositionSchema,
  columnSpan: SectionColumnSpanSchema,
  collapsed: z.boolean(),
  /** Keys belong to the section definition (§29's `createDefaultConfig`). */
  config: SectionConfigSchema,

  /**
   * Set when the section is removed from the canvas. Removing a section archives it rather
   * than deleting it, so removal is undoable: `config` — a Notes section's prose, a
   * Progress section's milestone selection — rides along on the record, and the rows a
   * container took down name it through `archivedWithSectionId`. Optional, so a document
   * written before this field parses unchanged.
   */
  archivedAt: IsoDateTimeSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProjectSection = z.infer<typeof ProjectSectionSchema>;
