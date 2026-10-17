import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { isSubproject, type Project, type ProjectStatus } from '@cwm/contracts';
import { menuKeys } from '../../shared/lifts/menu-keys';

/** The four §26 statuses offered independently of the archive confirmation. */
export type SettableProjectStatus = Exclude<ProjectStatus, 'archived'>;

/** Presentational APG menu; the header owns its native popover and intent handoffs. */
@Component({
  selector: 'app-project-more-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './project-more-menu.scss',
  templateUrl: './project-more-menu.html',
  host: { '(keydown)': 'keydown($event)' },
})
export class ProjectMoreMenu {
  readonly project = input.required<Project>();
  readonly editDetailsRequested = output<void>();
  readonly statusRequested = output<SettableProjectStatus>();
  readonly archiveRequested = output<void>();
  readonly openArchiveRequested = output<void>();
  readonly dismissed = output<void>();
  protected readonly statuses: SettableProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
  protected readonly isWorkUnit = computed(() => isSubproject(this.project()));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Opening a menu always starts at its first action. */
  focusFirst(): void {
    this.items()[0]?.focus();
  }

  protected keydown(event: KeyboardEvent): void {
    menuKeys(event, this.items(), () => this.dismissed.emit());
  }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')];
  }
}
