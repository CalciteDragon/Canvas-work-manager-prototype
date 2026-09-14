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
  tasks: readonly Pick<Task, 'sectionId'>[];
  reflections: readonly Pick<Reflection, 'sectionId'>[];
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
 * Uncertainty is kept, not dropped: an unregistered type, or rich-text config with a missing
 * or non-string `text` or any other key, is `unknown`. Nothing here decides deletion; it only
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
      const rows: readonly Pick<Task | Reflection, 'sectionId'>[] =
        ownedData === 'tasks' ? content.tasks : content.reflections;
      const contentCount = rows.filter(({ sectionId }) => sectionId === section.id).length;
      return contentCount === 0
        ? EXCLUDE
        : { include: true, recovery: { kind: 'owned-content', ownedData, contentCount } };
    }
  }
};

/**
 * Inspects only the recovery-relevant keys; the section folder keeps its editor schema
 * (`rich-text-config.ts`), whose fallback to empty text is a display choice, not evidence.
 * JavaScript `trim`, with no HTML parsing: the editor is a plain textarea.
 */
const richTextRecovery = (config: ProjectSection['config']): SectionRecoveryDecision => {
  const keys = Object.keys(config);
  if (keys.length !== 1 || keys[0] !== 'text') return UNKNOWN;
  const text: unknown = config['text'];
  if (typeof text !== 'string') return UNKNOWN;
  return text.trim().length > 0 ? { include: true, recovery: { kind: 'config' } } : EXCLUDE;
};
