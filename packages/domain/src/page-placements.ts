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

/** The one placement a write is about, as opposed to the siblings it shifts. */
export interface PlacementSubject {
  kind: PagePlacement['kind'];
  id: string;
}

/**
 * Persist a dense combined order, touching only records whose position changed.
 *
 * Only the `subject` — the placement a move was asked to move — gets a new `updatedAt`.
 * Siblings shifted by an insert, a move or a removal keep theirs: nobody edited them, and
 * an `updatedAt` that changes whenever a neighbour arrives would stop meaning "last edited".
 */
export const renumberPlacements = async (
  repositories: PagePlacementRepositories,
  clock: Clock,
  ordered: readonly PagePlacement[],
  subject?: PlacementSubject,
): Promise<void> => {
  const now = clock.now().toISOString();
  for (const [position, placement] of ordered.entries()) {
    if (placement.value.position === position) continue;
    const isSubject = subject !== undefined && subject.kind === placement.kind && subject.id === placement.value.id;
    const updatedAt = isSubject ? now : placement.value.updatedAt;
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
