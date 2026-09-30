import {
  ProjectSectionSchema,
  SectionShortcutSchema,
  type PlacementRef,
  type PlacementSnapshot,
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

const isRef = (placement: PagePlacement, ref: PlacementRef): boolean =>
  placement.kind === ref.kind && placement.value.id === ref.id;

const refOf = (placement: PagePlacement | undefined): PlacementRef | undefined =>
  placement === undefined ? undefined : { kind: placement.kind, id: placement.value.id };

/**
 * Where `subject` sits in a page's combined live order: its neighbours of either kind and its
 * index. Captured **before** a removal writes anything, so Undo can put the placement back
 * between the same neighbours rather than at an index the page has since reused.
 */
export const snapshotPlacement = (ordered: readonly PagePlacement[], subject: PlacementSubject): PlacementSnapshot => {
  const index = ordered.findIndex((placement) => isRef(placement, subject));
  const placement = ordered[index];
  if (placement === undefined) throw new TypeError(`${subject.kind} "${subject.id}" is not in this page's order`);
  const previous = refOf(ordered[index - 1]);
  const next = refOf(ordered[index + 1]);
  return {
    pageId: placement.value.pageId,
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
    index,
  };
};

/** How a restore index was chosen. */
export type RestoreStrategy = 'previous' | 'next' | 'index';

/**
 * Refactor §13's algorithm, over `current` — the page's live order **without** the subject:
 * directly after the previous neighbour when it survives, otherwise directly before the next,
 * otherwise the original index clamped to the page. A neighbour that was archived, removed or
 * moved to another page is simply absent from `current`, so it has not survived.
 */
export const resolveRestoreIndex = (
  snapshot: PlacementSnapshot,
  current: readonly PagePlacement[],
): { index: number; strategy: RestoreStrategy } => {
  const { previous, next } = snapshot;
  const previousIndex = previous === undefined ? -1 : current.findIndex((placement) => isRef(placement, previous));
  if (previousIndex !== -1) return { index: previousIndex + 1, strategy: 'previous' };
  const nextIndex = next === undefined ? -1 : current.findIndex((placement) => isRef(placement, next));
  if (nextIndex !== -1) return { index: nextIndex, strategy: 'next' };
  return { index: Math.min(snapshot.index, current.length), strategy: 'index' };
};
