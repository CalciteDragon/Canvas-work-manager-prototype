import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, output } from '@angular/core';
import type { UndoConflictNextStep, UndoRefusalDetails } from '@cwm/contracts';
import type { FailedSectionRemoval, SectionUndoNoticeState } from './project-page-store';

const NEXT_STEP_COPY: Record<UndoConflictNextStep, string> = {
  'move-back-and-retry': 'Move it back to its previous section, then try Undo again.',
  'restore-state-and-retry': 'Restore its previous state, then try Undo again.',
  'restore-or-move-dependent-and-retry': 'Restore or move the new dependent, then try Undo again.',
  'remove-reference-and-retry': 'Remove the reference, then try Undo again.',
  'use-later-receipt-or-archive': 'Use the later Undo receipt, or check Archive for retained content.',
  'use-later-receipt': 'Use the later Undo receipt, or make the change again by hand.',
  'nothing-to-undo': 'It is already live, so there is nothing to undo for this item.',
  'nothing-to-restore': 'It no longer exists. Use Archive if it still has a saved copy.',
};

/** The canvas-local, accessible status and action for one section-operation receipt. */
@Component({
  selector: 'app-section-undo-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './section-undo-notice.html',
  styleUrl: './section-undo-notice.scss',
})
export class SectionUndoNotice {
  readonly state = input<SectionUndoNoticeState | null>(null);
  readonly failedRemoval = input<FailedSectionRemoval | null>(null);
  readonly busy = input(false);

  readonly undo = output<void>();
  readonly retryRemove = output<void>();
  readonly retryRefresh = output<void>();
  readonly openArchive = output<void>();
  readonly dismissUndo = output<void>();
  readonly dismissFailure = output<void>();
  readonly ready = output<void>();

  constructor() {
    afterNextRender(() => this.ready.emit());
  }

  readonly hasReceipt = computed(() => this.state()?.receipt != null);
  readonly showArchive = computed(() => {
    const state = this.state();
    return state?.receipt?.operation === 'section.remove' || state?.result?.operation === 'section.remove';
  });
  readonly canUndo = computed(() =>
    this.hasReceipt() && ['available', 'already-removed', 'refusal', 'error'].includes(this.state()?.kind ?? ''),
  );
  readonly isAlert = computed(() => ['refusal', 'terminal', 'error'].includes(this.state()?.kind ?? ''));
  readonly conflicts = computed(() => {
    const refusal = this.state()?.refusal;
    if (refusal?.reason !== 'undo_conflict') return [];
    // One line per entity and repair: a section that both changed and was superseded needs one step.
    const seen = new Set<string>();
    return refusal.conflicts.filter(({ entityType, id, nextStep }) => {
      const key = `${entityType}:${id}:${nextStep}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  readonly typedGuidance = computed(() => this.guidanceFor(this.state()?.refusal));

  activate(action: () => void): void {
    if (!this.busy()) action();
  }

  requestUndo(): void {
    this.activate(() => this.undo.emit());
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

  requestDismissUndo(): void {
    this.activate(() => this.dismissUndo.emit());
  }

  requestDismissFailure(): void {
    this.activate(() => this.dismissFailure.emit());
  }

  nextStepCopy(step: UndoConflictNextStep): string {
    return NEXT_STEP_COPY[step];
  }

  conflictSubject(conflict: { entityType: string; id: string; title?: string }): string {
    const name = conflict.title ?? (conflict.entityType === 'reflection' ? 'Untitled reflection' : conflict.entityType);
    return `${name} [${conflict.id}]`;
  }

  private guidanceFor(refusal: UndoRefusalDetails | undefined): string | null {
    if (refusal === undefined) return null;
    switch (refusal.reason) {
      case 'undo_blocked':
        return `Restore is blocked by ${refusal.blockingProjectTitle}.`;
      case 'undo_unavailable':
        return refusal.problem === 'no-compatible-page'
          ? 'No page can currently receive this section. Make a compatible page available and try Undo again; check Archive for retained content.'
          : 'A shortcut on the fallback page prevents restoration there. Remove the shortcut and try Undo again; check Archive for retained content.';
      case 'undo_conflict':
      case 'undo_consumed':
      case 'undo_expired':
        return null;
    }
  }
}
