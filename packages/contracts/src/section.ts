import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema } from './ids';

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
 * It says nothing about *surviving* removal: whether a removed section is archived or deleted
 * outright is a `recovery` question, not a `kind` one — a container and a view are both archived
 * when something worth recovering remains, and both are deleted when nothing does
 * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md,
 * docs/decisions/2026-09-disposable-removal-and-immediate-undo.md).
 */
export const SectionKindSchema = z.enum(['container', 'view']);
export type SectionKind = z.infer<typeof SectionKindSchema>;

/** The row collections a container can own. Milestones have no container type (§35). */
export const OwnedDataKindSchema = z.enum(['tasks', 'reflections']);
export type OwnedDataKind = z.infer<typeof OwnedDataKindSchema>;

/**
 * What removing a section could leave worth recovering, declared per type. `owned-content`
 * is a container whose rows remain; `config` is prose kept in the section record; `none` is a
 * disposable view — it renders data owned elsewhere, whatever display settings it carries.
 *
 * A declaration, not a verdict: `section-recovery-policy.ts` in domain combines it with the
 * content that actually remains, so an emptied container still reads as empty. There is
 * deliberately no `unknown` member — an unregistered type has *no* capability, and callers
 * must treat that absence as uncertain rather than as `none`.
 * See docs/decisions/2026-09-content-oriented-archive-policy.md.
 */
export const SectionRecoveryCapabilitySchema = z.enum(['owned-content', 'config', 'none']);
export type SectionRecoveryCapability = z.infer<typeof SectionRecoveryCapabilitySchema>;

/** A type owns rows exactly when its recovery is `owned-content`; the refinement holds that. */
export const SectionCapabilitySchema = z
  .object({ ownedData: OwnedDataKindSchema.optional(), recovery: SectionRecoveryCapabilitySchema })
  .refine(({ ownedData, recovery }) => (ownedData !== undefined) === (recovery === 'owned-content'), {
    message: 'a section owns rows exactly when its recovery capability is owned-content',
  });
export type SectionCapability = z.infer<typeof SectionCapabilitySchema>;

/**
 * **The one capability source** for section types. It lives here rather than in the Angular
 * registry (§29) because `SectionService` and `ProjectArchiveService` need it and cannot
 * import from `apps/web`; the registry reads `kind` back out of it, and `registry.spec.ts`
 * fails when a registered type has no entry — so a new type has to declare its recovery.
 * Keyed by the same open `type` strings the registry uses.
 *
 * `rich-text` owns its data through `config.text` rather than through rows: it has nothing
 * to cascade, and archiving the section keeps its text — `config` rides along on the record,
 * so restoring returns the prose intact. That survival is why a view can be worth archiving
 * too, and why removal asks this table rather than `kind` before it decides.
 */
export const SECTION_CAPABILITIES: Readonly<Record<string, SectionCapability>> = {
  'task-list': { ownedData: 'tasks', recovery: 'owned-content' },
  reflections: { ownedData: 'reflections', recovery: 'owned-content' },
  'rich-text': { recovery: 'config' },
  'sub-projects': { recovery: 'none' },
  progress: { recovery: 'none' },
  timeline: { recovery: 'none' },
  'recent-activity': { recovery: 'none' },
};

// `Object.hasOwn`, not `in`: `'toString' in SECTION_CAPABILITIES` is true, and a section type
// that happens to name an `Object.prototype` member must not read as a registered type.
/** The declared capability, or `undefined` for a type nothing declares — unknown, not disposable. */
export const sectionCapabilityOf = (type: string): SectionCapability | undefined =>
  Object.hasOwn(SECTION_CAPABILITIES, type) ? SECTION_CAPABILITIES[type] : undefined;

/**
 * Which row collection each container owns, derived from `SECTION_CAPABILITIES`.
 *
 * **Types absent from this map are views**, so an unknown type can never cascade — the
 * failure mode for a stale or hand-edited `type` stays non-destructive. That is ownership only:
 * an undeclared type's *recovery* is unknown, not disposable (`sectionCapabilityOf`).
 */
export const SECTION_OWNERSHIP: Readonly<Record<string, OwnedDataKind>> = Object.fromEntries(
  Object.entries(SECTION_CAPABILITIES).flatMap(([type, { ownedData }]) =>
    ownedData === undefined ? [] : [[type, ownedData]],
  ),
);

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
 * `Object.hasOwn`, not `??` — for the reason stated above at `sectionCapabilityOf`:
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
   * The page this section sits on (§27). Required, not optional: every project has a
   * canonical page from the moment it is created, so there is no legitimate state in which a
   * section belongs to a project but to none of its pages.
   *
   * `projectId` stays alongside it for the same reason a row keeps both `projectId` and
   * `sectionId` — the readers that filter by project should not have to join through a page
   * to do it. `validateDocumentIntegrity` holds the two in agreement.
   */
  pageId: ProjectPageIdSchema,

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
   * Set when the section is removed from the canvas **and the removal kept it**. A removal
   * archives rather than deletes whenever something is left worth recovering or still
   * pointing at the section: `config` — a Notes section's prose, a Progress section's
   * milestone selection — rides along on the record, and the rows a container took down name
   * it through `archivedWithSectionId`. A safe disposable section — nothing recoverable, no
   * row and no shortcut naming it — is deleted outright instead, and the archived-shaped
   * section a removal returns is then a result snapshot rather than a stored record
   * (`SectionRemovalResultSchema`, docs/decisions/2026-09-disposable-removal-and-immediate-undo.md).
   * Either way the removal is undoable through its receipt. Optional, so a document written
   * before this field parses unchanged.
   */
  archivedAt: IsoDateTimeSchema.optional(),

  /**
   * How many times this section has been removed. Bumped by every removal and by nothing else —
   * Archive Restore and Undo leave it alone — so it never decreases. A removal action captures
   * the value it wrote, and Undo/Redo refuse when the section has since moved past it: the one
   * check that tells two removals in the same clock instant apart, across actors' histories
   * (docs/decisions/2026-09-operation-history-retired-actions.md). Defaulted to `0`, the honest
   * value for a section written before the field existed.
   */
  archiveGeneration: z.number().int().min(0).default(0),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProjectSection = z.infer<typeof ProjectSectionSchema>;
