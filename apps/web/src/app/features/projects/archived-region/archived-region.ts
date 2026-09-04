import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import type { OwnedDataKind, ProjectId, SectionId } from '@cwm/contracts';
import { ArchivedRegionStore, type ArchivedRowEntry, type ArchivedSectionEntry } from './archived-region-store';

/** `1 task`, never `1 tasks` — the same rule `SectionRemovalDialog` follows. */
const ROW_NOUN: Record<OwnedDataKind, { one: string; many: string }> = {
  tasks: { one: 'task', many: 'tasks' },
  reflections: { one: 'reflection', many: 'reflections' },
};

/**
 * **Archived**, at the foot of the project canvas: what removal took, and one click to get
 * it back. It is the undo §31 now promises, and the reason a view or an empty container can
 * archive silently — a silent *delete* would not have been safe.
 *
 * It is **content, not layout chrome**, so unlike §31's remove control it shows in View Mode
 * too (§32). Hiding the undo behind Edit Layout Mode would hide it exactly when someone
 * needs it: right after a removal they did not mean.
 *
 * Hidden entirely when there is nothing archived. Views appear here alongside containers —
 * removal archives every section — and simply show no row count, because a `progress`
 * section owning `0 tasks` would be a lie rather than a count.
 */
@Component({
  selector: 'app-archived-region',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ArchivedRegionStore],
  templateUrl: './archived-region.html',
  styleUrl: './archived-region.scss',
})
export class ArchivedRegion {
  readonly projectId = input.required<ProjectId>();
  /** The page's §62 invalidation signal — the same input every section frame takes. */
  readonly projectDataRevision = input.required<number>();
  /**
   * True while the project is archived, or while a write to the project record is in flight.
   * Restoring into an archived project is a domain refusal, so the control is disabled with
   * guidance rather than offered and refused — and the pending half is what stops an
   * optimistic `active` paint from enabling it before the reactivation has actually landed.
   */
  readonly restoreBlocked = input(false);

  readonly sectionRestored = output<SectionId>();
  readonly rowRestored = output<void>();

  readonly store = inject(ArchivedRegionStore);

  readonly sections = computed(() => this.store.sections());
  readonly rows = computed(() => this.store.rows());
  readonly hidden = computed(() => this.store.empty());

  constructor() {
    // The same rule every section follows: read on mount, and again whenever the page says
    // the project's data moved. A per-row archive publishes that revision, so a row archived
    // in a Task List appears here without a reload.
    effect(() => {
      this.projectDataRevision();
      void this.store.load(this.projectId());
    });
  }

  rowCountLabel(entry: ArchivedSectionEntry): string | null {
    if (entry.rowCount === undefined || entry.ownedKind === undefined) return null;
    const noun = ROW_NOUN[entry.ownedKind];
    return `${entry.rowCount} ${entry.rowCount === 1 ? noun.one : noun.many}`;
  }

  restoring(id: string): boolean {
    return this.store.restoring().has(id);
  }

  async restoreSection(entry: ArchivedSectionEntry): Promise<void> {
    if (this.restoreBlocked()) return;
    if (await this.store.restoreSection(entry.id)) this.sectionRestored.emit(entry.id);
  }

  async restoreRow(entry: ArchivedRowEntry): Promise<void> {
    if (this.restoreBlocked()) return;
    if (await this.store.restoreRow(entry)) this.rowRestored.emit();
  }
}
