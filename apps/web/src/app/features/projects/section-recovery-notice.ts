import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, output } from '@angular/core';
import type { FailedSectionRemoval, SectionRecoveryNoticeState } from './project-page-store';

/**
 * The canvas-local recovery the header cannot offer (Slice 41): Open Archive after a removal that
 * Archive will list, a read-only Retry refresh after a committed write whose follow-up read failed,
 * and Retry remove after an uncertain removal. **No Undo**: the project header's Undo/Redo controls
 * are the one action surface for history, and a second button for the same step would compete with
 * them.
 */
@Component({
  selector: 'app-section-recovery-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './section-recovery-notice.html',
  styleUrl: './section-recovery-notice.scss',
})
export class SectionRecoveryNotice {
  readonly state = input<SectionRecoveryNoticeState | null>(null);
  readonly failedRemoval = input<FailedSectionRemoval | null>(null);
  readonly busy = input(false);

  readonly retryRemove = output<void>();
  readonly retryRefresh = output<void>();
  readonly openArchive = output<void>();
  readonly dismissNotice = output<void>();
  readonly dismissFailure = output<void>();
  readonly ready = output<void>();

  constructor() {
    afterNextRender(() => this.ready.emit());
  }

  /**
   * Archive is offered for a removal unless the removal said it left nothing there. A section
   * kept only because a shortcut or an archived row still names it is stored but not listed, and
   * offering the route then lands the person on a page with no entry for their section
   * (`note-2026-09-15-006`). An absent `archiveListed` is unknown, not false: a receipt recovered
   * from a repeat removal carries no verdict, so the offer stands.
   */
  readonly showArchive = computed(() => {
    const removal = this.state()?.removal;
    return removal !== undefined && removal.archiveListed !== false;
  });

  activate(action: () => void): void {
    if (!this.busy()) action();
  }

  requestRetryRemove(): void {
    this.activate(() => this.retryRemove.emit());
  }

  requestRetryRefresh(): void {
    this.activate(() => this.retryRefresh.emit());
  }

  requestOpenArchive(): void {
    this.activate(() => this.openArchive.emit());
  }

  requestDismissNotice(): void {
    this.activate(() => this.dismissNotice.emit());
  }

  requestDismissFailure(): void {
    this.activate(() => this.dismissFailure.emit());
  }
}
