import {
  sectionCapabilityOf,
  type ProjectArchiveSectionRecovery,
  type ProjectSection,
  type Reflection,
  type Task,
} from '@cwm/contracts';

/** Whether Archive should list a section entry, and what that entry is for. */
export type SectionRecoveryDecision =
  | { include: false }
  | { include: true; recovery: ProjectArchiveSectionRecovery };

/** The canonical rows in scope, archived included; the policy picks the ones assigned to the section. */
export interface SectionRecoveryContent {
  tasks: readonly Pick<Task, 'id' | 'sectionId' | 'archivedAt' | 'archivedWithSectionId' | 'archivedWithTaskId'>[];
  reflections: readonly Pick<Reflection, 'sectionId' | 'archivedAt' | 'archivedWithSectionId'>[];
}

const EXCLUDE: SectionRecoveryDecision = { include: false };
const UNKNOWN: SectionRecoveryDecision = { include: true, recovery: { kind: 'unknown' } };

/**
 * **What a section leaves worth recovering, judged on what actually remains** — the pure half
 * of the content-oriented Archive (docs/decisions/2026-09-content-oriented-archive-policy.md).
 *
 * The contracts capability says what a type *could* hold; this reads the current state: a
 * container is content while any row is still assigned to it (archived rows included, since
 * the section is the dependency their own Restore needs), and rich text is content while its
 * prose trims to something. It evaluates state after removal or reassignment, never intent.
 *
 * Uncertainty is kept, not dropped: an unregistered type, or rich-text config with a non-string
 * `text` or any other key, is `unknown`. An empty rich-text config (`{}`) holds nothing and is
 * excluded like blank prose. Nothing here decides deletion; it only
 * decides a projection. No repositories, clock or mutation.
 */
export const sectionRecoveryOf = (
  section: Pick<ProjectSection, 'id' | 'type' | 'config'>,
  content: SectionRecoveryContent,
): SectionRecoveryDecision => {
  const capability = sectionCapabilityOf(section.type);
  if (capability === undefined) return UNKNOWN;

  switch (capability.recovery) {
    case 'none':
      return EXCLUDE;
    case 'config':
      return richTextRecovery(section.config);
    case 'owned-content': {
      const ownedData = capability.ownedData!;
      const rows =
        ownedData === 'tasks'
          ? content.tasks.filter(({ sectionId }) => sectionId === section.id)
          : content.reflections.filter(({ sectionId }) => sectionId === section.id);
      if (rows.length === 0) return EXCLUDE;
      return {
        include: true,
        recovery: {
          kind: 'owned-content',
          ownedData,
          contentCount: rows.length,
          separateRestoreCount: separateRestores(section.id, rows),
        },
      };
    }
  }
};

/**
 * The Restore calls an archived container's rows need after the section's own: an archived row
 * returns with the section when its marker names it, and with its parent task when that parent
 * is archived in the same container (task Restore brings its `archivedWithTaskId` group back).
 * Everything else archived needs its own.
 */
interface ArchivableRow {
  id?: string;
  archivedAt?: string;
  archivedWithSectionId?: string;
  archivedWithTaskId?: string;
}

const separateRestores = (sectionId: ProjectSection['id'], rows: readonly ArchivableRow[]): number => {
  const archivedIds = new Set(rows.flatMap((row) => (row.archivedAt !== undefined && row.id !== undefined ? [row.id] : [])));
  return rows.filter(
    (row) =>
      row.archivedAt !== undefined &&
      row.archivedWithSectionId !== sectionId &&
      (row.archivedWithTaskId === undefined || !archivedIds.has(row.archivedWithTaskId)),
  ).length;
};

/**
 * Inspects only the recovery-relevant keys; the section folder keeps its editor schema
 * (`rich-text-config.ts`), whose fallback to empty text is a display choice, not evidence.
 * JavaScript `trim`, with no HTML parsing: the editor is a plain textarea.
 */
const richTextRecovery = (config: ProjectSection['config']): SectionRecoveryDecision => {
  const keys = Object.keys(config);
  // `create_section` without a config stores `{}`: no keys, so nothing to lose.
  if (keys.length === 0) return EXCLUDE;
  if (keys.length !== 1 || keys[0] !== 'text') return UNKNOWN;
  const text: unknown = config['text'];
  if (typeof text !== 'string') return UNKNOWN;
  return text.trim().length > 0 ? { include: true, recovery: { kind: 'config' } } : EXCLUDE;
};
