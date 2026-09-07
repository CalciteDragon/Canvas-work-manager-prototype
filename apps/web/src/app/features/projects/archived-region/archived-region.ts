import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { nameOf, type ProjectArchiveItem, type ProjectRestoreStatus } from '@cwm/contracts';

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
