import {
  ProjectSectionSchema,
  SectionShortcutSchema,
  type ProjectPageId,
  type ProjectSection,
  type SectionShortcut,
} from '@cwm/contracts';
import type { SectionRepository, SectionShortcutRepository } from '@cwm/repositories';
import type { Clock } from './clock';

/** The two records that occupy one page's combined canvas order (§27). */
export type PagePlacement =
  | { kind: 'section'; value: ProjectSection }
  | { kind: 'shortcut'; value: SectionShortcut };

export interface PagePlacementRepositories {
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
}

const byPositionThenId = (a: PagePlacement, b: PagePlacement): number =>
  a.value.position === b.value.position
    ? a.value.id.localeCompare(b.value.id)
    : a.value.position - b.value.position;

/** Read a page's live sections and placements into the one order every write must preserve. */
export const listPlacements = async (
  repositories: PagePlacementRepositories,
  pageId: ProjectPageId,
): Promise<PagePlacement[]> => {
  const [sections, shortcuts] = await Promise.all([
    repositories.sections.list({ pageId }),
    repositories.shortcuts.list({ pageId }),
  ]);
  return [
    ...sections.map((value) => ({ kind: 'section' as const, value })),
    ...shortcuts.map((value) => ({ kind: 'shortcut' as const, value })),
  ].sort(byPositionThenId);
};

/** Persist a dense combined order, touching only records whose position changed. */
export const renumberPlacements = async (
  repositories: PagePlacementRepositories,
  clock: Clock,
  ordered: readonly PagePlacement[],
): Promise<void> => {
  const updatedAt = clock.now().toISOString();
  for (const [position, placement] of ordered.entries()) {
    if (placement.value.position === position) continue;
    if (placement.kind === 'section') {
      await repositories.sections.update(
        ProjectSectionSchema.parse({ ...placement.value, position, updatedAt }),
      );
    } else {
      await repositories.shortcuts.update(
        SectionShortcutSchema.parse({ ...placement.value, position, updatedAt }),
      );
    }
  }
};
