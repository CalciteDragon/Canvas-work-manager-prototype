import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { isSubproject, type Project } from '@cwm/contracts';
import { ProjectMoreMenu, type SettableProjectStatus } from './project-more-menu';

/**
 * §26's Project Header, rendered once per project by `ProjectWorkspaceShell` — at the top of
 * the workspace track, beside the full-height navigation column and above whichever page is
 * showing. §23's diagram is the one describing the shell, so it wins over reading §26's
 * structure list as a strict vertical stack.
 *
 * It lives here rather than inside a page renderer because it belongs to the **project**: a
 * root has several canvases and one identity, and a header inside Home would disappear the
 * moment another page rendered.
 *
 * **Presentational**: it takes the project and emits what the user asked for; the shell owns
 * the store and the navigation (§19). One component varies on `kind` rather than two nearly
 * identical ones — §26's difference between a workspace and a unit of work is three labels
 * and a timestamp, not a different header.
 */
@Component({
  selector: 'app-project-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectMoreMenu],
  templateUrl: './project-header.html',
  styleUrl: './project-header.scss',
  // The More menu closes on Escape from anywhere on the page, which is what a menu opened
  // with the pointer needs. Quick Add declares its own, on the canvas that owns it.
  host: { '(document:keydown.escape)': 'closeMore()' },
})
export class ProjectHeader {
  readonly project = input.required<Project>();
  /** §39's percentage, or `null` for "not available" — which is not the same as 0%. */
  readonly progress = input<number | null>(null);
  readonly writeError = input<string | null>(null);

  readonly renameRequested = output<string>();
  /** §26's work-unit description. `null` clears it. */
  readonly descriptionRequested = output<string | null>();
  readonly statusRequested = output<SettableProjectStatus>();
  /** `null` clears it, which is what puts the "No due date" branch in reach. */
  readonly targetDateRequested = output<string | null>();
  readonly archiveRequested = output<void>();
  readonly openArchiveRequested = output<void>();

  readonly moreOpen = signal(false);

  /** §26's unit of work. The three labels below are the whole difference. */
  readonly isWorkUnit = computed(() => isSubproject(this.project()));

  toggleMore(): void {
    this.moreOpen.update((open) => !open);
  }

  closeMore(): void {
    this.moreOpen.set(false);
  }

  /** Every menu choice closes the menu and hands the intent up. */
  emit<T>(target: { emit: (value: T) => void }, value: T): void {
    this.closeMore();
    target.emit(value);
  }

  archive(): void {
    this.closeMore();
    this.archiveRequested.emit();
  }

  openArchive(): void {
    this.closeMore();
    this.openArchiveRequested.emit();
  }
}
