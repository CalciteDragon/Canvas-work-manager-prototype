import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { isSubproject, type Project, type UpdateProjectInput } from '@cwm/contracts';
import { Icon } from '../../shared/components/icon/icon';
import { FailureMessage } from '../../shared/feedback/failure-message';
import type { Failure } from '../../shared/feedback/failure';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { ProjectMoreMenu, type SettableProjectStatus } from './project-more-menu';
import { ProjectDetailsDialog } from './project-details-dialog';
import { ProjectArchiveConfirm } from './project-archive-confirm';

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
  imports: [ProjectMoreMenu, ProjectDetailsDialog, ProjectArchiveConfirm, Icon, FailureMessage],
  templateUrl: './project-header.html',
  styleUrl: './project-header.scss',
})
export class ProjectHeader {
  readonly project = input.required<Project>();
  /** §39's percentage, or `null` for "not available" — which is not the same as 0%. */
  readonly progress = input<number | null>(null);
  readonly writeError = input<Failure | null>(null);
  readonly routeLanding = input(true);
  readonly saveDetails = input<(patch: Pick<UpdateProjectInput, 'name' | 'description' | 'targetDate'>) => Promise<boolean>>(async () => false);
  readonly confirmArchive = input<() => Promise<boolean>>(async () => false);
  readonly clearWriteError = input<() => void>(() => {});

  readonly statusRequested = output<SettableProjectStatus>();
  readonly openArchiveRequested = output<HTMLElement>();

  readonly moreOpen = signal(false);
  readonly detailsOpen = signal(false);
  readonly archiveOpen = signal(false);
  readonly moreButton = viewChild.required<ElementRef<HTMLButtonElement>>('moreButton');
  private readonly menuElement = viewChild.required<ProjectMoreMenu>(ProjectMoreMenu);
  private readonly menuHost = viewChild.required('menuHost', { read: ElementRef<HTMLElement> });
  private readonly injector = inject(Injector);
  private readonly stack = inject(LiftStack);
  private release: (() => void) | null = null;
  private focus: LiftFocus | null = null;
  private restoreOnMenuClose = true;

  /** §26's unit of work. The three labels below are the whole difference. */
  readonly isWorkUnit = computed(() => isSubproject(this.project()));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release?.());
  }

  moreToggled(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open';
    this.moreOpen.set(open);
    if (open) {
      this.restoreOnMenuClose = true;
      this.focus = new LiftFocus(this.moreButton().nativeElement, () => document.querySelector<HTMLElement>('main'));
      this.release = this.stack.open(() => this.closeMore());
      afterNextRender(() => {
        if (this.moreOpen()) this.menuElement().focusFirst();
      }, { injector: this.injector });
    } else {
      this.release?.();
      this.release = null;
      if (this.restoreOnMenuClose) this.focus?.restore(this.menuHost().nativeElement);
    }
  }

  closeMore(restore = true): void {
    this.restoreOnMenuClose = restore;
    this.moreOpen.set(false);
    this.release?.();
    this.release = null;
    const menu = this.menuHost().nativeElement;
    menu.hidePopover();
    if (restore) this.focus?.restore(menu);
  }

  setStatus(status: SettableProjectStatus): void {
    this.closeMore();
    if (status !== this.project().status) this.statusRequested.emit(status);
  }

  editDetails(): void {
    this.closeMore(false);
    this.clearWriteError()();
    this.detailsOpen.set(true);
  }

  closeDetails(): void {
    this.clearWriteError()();
    this.detailsOpen.set(false);
  }

  requestArchive(): void {
    this.closeMore(false);
    this.archiveOpen.set(true);
  }

  openArchive(): void {
    this.closeMore(false);
    this.openArchiveRequested.emit(this.moreButton().nativeElement);
  }
}
