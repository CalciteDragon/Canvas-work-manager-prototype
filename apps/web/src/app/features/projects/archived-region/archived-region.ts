import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { nameOf, ownedKindOf, type ProjectArchiveItem, type ProjectRestoreStatus } from '@cwm/contracts';

export interface ArchiveRestoreRequest {
  item: ProjectArchiveItem;
  status: ProjectRestoreStatus;
}

/**
 * The shared Archive list. It is deliberately presentational: the root Archive page owns the
 * whole-tree query and the canonical restore writes, while this component is also useful to
 * story the list in isolation. The old page-local Archived store was a second archive model;
 * §31 now has one projection and one set of restore affordances.
 */
@Component({
  selector: 'app-archived-region',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './archived-region.html',
  styleUrl: './archived-region.scss',
})
export class ArchivedRegion {
  readonly items = input.required<readonly ProjectArchiveItem[]>();
  readonly restoreBlocked = input(false);
  readonly restoring = input<ReadonlySet<string>>(new Set());

  readonly restoreRequested = output<ArchiveRestoreRequest>();
  private readonly selectedProjectStatuses = signal<Record<string, ProjectRestoreStatus>>({});

  protected readonly projectStatuses: ProjectRestoreStatus[] = ['planning', 'active', 'on_hold', 'completed'];

  readonly hidden = computed(() => this.items().length === 0);

  private readonly pageLabels: Record<string, string> = {
    home: 'Home',
    work: 'Work canvas',
    todos: 'Todos',
    archive: 'Archive',
    reflections: 'Reflections',
  };

  label(item: ProjectArchiveItem): string {
    switch (item.kind) {
      case 'subproject':
        return item.project.name;
      case 'section':
        return nameOf(item.section);
      case 'task':
        return item.task.title;
      case 'reflection':
        return item.reflection.title?.trim() || 'Reflection';
    }
  }

  typeLabel(item: ProjectArchiveItem): string {
    switch (item.kind) {
      case 'subproject':
        return 'Sub-project';
      case 'section':
        return 'Section';
      case 'task':
        return 'Task';
      case 'reflection':
        return 'Reflection';
    }
  }

  originPageLabel(item: ProjectArchiveItem): string {
    const label = this.pageLabels[item.origin.pageKind] ?? item.origin.pageKind;
    if (!item.origin.pageEnabled) return `${label} (disabled)`;
    return item.origin.pageKind === 'reflections' ? `${label} (not rendered yet)` : label;
  }

  originRoute(item: ProjectArchiveItem): readonly unknown[] | null {
    if (!item.origin.pageEnabled) return null;
    if (item.origin.pageKind === 'home') {
      return ['/projects', item.origin.projectId, 'pages', 'home'];
    }
    if (item.origin.pageKind === 'work') return ['/projects', item.origin.projectId];
    return null;
  }

  originFragment(item: ProjectArchiveItem): string | undefined {
    return item.origin.sectionId === undefined ? undefined : `section-${item.origin.sectionId}`;
  }

  causeLabel(item: ProjectArchiveItem): string {
    switch (item.cause.kind) {
      case 'own':
        return 'Archived directly';
      case 'section-cascade':
        return 'Archived with its section';
      case 'task-cascade':
        return 'Archived with its task';
      case 'hidden-by-project':
        return 'Hidden by an archived project';
    }
  }

  blockerLabel(item: ProjectArchiveItem): string | null {
    if (item.restoration.kind === 'ready') return null;
    return `Restore “${item.restoration.blocker.name}” first`;
  }

  /**
   * Copy for the domain's `recovery` verdict. Presentational only: whether a section is listed,
   * and what it holds, was decided by `sectionRecoveryOf` — nothing here re-derives it.
   */
  contentLabel(item: ProjectArchiveItem): string | null {
    if (item.kind !== 'section' || item.recovery === undefined) return null;
    switch (item.recovery.kind) {
      case 'owned-content':
        return `${this.rows(item.recovery.ownedData, item.recovery.contentCount)} in this section`;
      case 'config':
        return 'Keeps its text';
      case 'unknown':
        return 'Content this version cannot read — kept to be safe';
    }
  }

  /** The exact `archivedWithSectionId` count, only for an archived container (never a live hidden one). */
  cascadeLabel(item: ProjectArchiveItem): string | null {
    if (item.kind !== 'section' || item.cascadeCount === undefined || item.restoration.kind === 'not-archived') return null;
    const ownedData = item.recovery?.kind === 'owned-content' ? item.recovery.ownedData : ownedKindOf(item.section.type);
    if (ownedData === undefined) return null;
    const verb = item.cascadeCount === 1 ? 'restores' : 'restore';
    return `${this.rows(ownedData, item.cascadeCount)} ${verb} with this section`;
  }

  /**
   * What recovering the rows a section Restore will *not* bring back takes. An archived
   * container's other rows were archived on their own, so they need their own Restore after
   * it. A live container hidden beneath an archived project needs no restore at all — only the
   * project's reactivation, which the blocker names — so it never gets row instructions.
   */
  recoveryGuidance(item: ProjectArchiveItem): string | null {
    if (item.kind !== 'section' || item.recovery?.kind !== 'owned-content') return null;
    if (item.restoration.kind === 'not-archived') {
      return `Still on its canvas: reactivate “${item.restoration.blocker.name}” to see it again.`;
    }
    const cascade = item.cascadeCount ?? 0;
    const remaining = item.recovery.contentCount - cascade;
    if (remaining <= 0) return null;
    const rows = this.noun(item.recovery.ownedData, remaining);
    if (cascade > 0) {
      return remaining === 1
        ? `1 other ${rows} stays archived; restore it separately afterwards.`
        : `${remaining} other ${rows} stay archived; restore them separately afterwards.`;
    }
    return item.restoration.kind === 'blocked'
      ? `Then restore this section, then restore its archived ${rows} separately.`
      : `Restore this section first, then restore its archived ${rows} separately.`;
  }

  canRestore(item: ProjectArchiveItem): boolean {
    return !this.restoreBlocked() && this.restoring().size === 0 && item.restoration.kind === 'ready';
  }

  isRestoring(item: ProjectArchiveItem): boolean {
    return this.restoring().has(this.idOf(item));
  }

  projectStatus(item: ProjectArchiveItem): ProjectRestoreStatus {
    return this.selectedProjectStatuses()[this.idOf(item)] ?? 'active';
  }

  selectProjectStatus(item: ProjectArchiveItem, event: Event): void {
    if (item.kind !== 'subproject') return;
    const status = (event.target as HTMLSelectElement).value as ProjectRestoreStatus;
    if (!this.projectStatuses.includes(status)) return;
    this.selectedProjectStatuses.update((statuses) => ({ ...statuses, [item.project.id]: status }));
  }

  restore(item: ProjectArchiveItem): void {
    if (!this.canRestore(item)) return;
    this.restoreRequested.emit({ item, status: this.projectStatus(item) });
  }

  private rows(ownedData: 'tasks' | 'reflections', count: number): string {
    return `${count} ${this.noun(ownedData, count)}`;
  }

  private noun(ownedData: 'tasks' | 'reflections', count: number): string {
    const singular = ownedData === 'tasks' ? 'task' : 'reflection';
    return count === 1 ? singular : `${singular}s`;
  }

  idOf(item: ProjectArchiveItem): string {
    switch (item.kind) {
      case 'subproject':
        return item.project.id;
      case 'section':
        return item.section.id;
      case 'task':
        return item.task.id;
      case 'reflection':
        return item.reflection.id;
    }
  }
}
