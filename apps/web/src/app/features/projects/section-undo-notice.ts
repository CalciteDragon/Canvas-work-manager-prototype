import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, output } from '@angular/core';
import type { UndoConflictNextStep, UndoRefusalDetails } from '@cwm/contracts';
import { isUndoRefusedForGood, type FailedSectionRemoval, type SectionUndoNoticeState } from './project-page-store';

const NEXT_STEP_COPY: Record<UndoConflictNextStep, string> = {
  'move-back-and-retry': 'Move it back to its previous section, then try Undo again.',
  'restore-state-and-retry': 'Restore its previous state, then try Undo again.',
  'restore-or-move-dependent-and-retry': 'Restore or move the new dependent, then try Undo again.',
  'remove-reference-and-retry': 'Remove the reference, then try Undo again.',
  'use-later-receipt-or-archive': 'Use the later Undo receipt, or check Archive for retained content.',
  'use-later-receipt': 'Use the later Undo receipt, or make the change again by hand.',
  'redo-by-hand': 'Make the change again by hand.',
  'redo-by-hand-or-archive': 'Make the change again by hand, or check Archive for retained content.',
  'nothing-to-undo': 'It is already live, so there is nothing to undo for this item.',
  'nothing-to-restore': 'It no longer exists. Use Archive if it still has a saved copy.',
};

/**
 * Who made the later change, when it was not this person. The server already chose the repair;
 * this only names the other party, so the sentence explains why the receipt for that change is
 * out of reach rather than leaving the person hunting for it (`note-2026-09-15-005`).
 */
const SUPERSEDED_BY_COPY: Record<'user' | 'agent' | 'system', string> = {
  user: 'Someone else changed it after you.',
  agent: 'An agent changed it after you.',
  system: 'The system changed it after you.',
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
  /**
   * Archive is offered for a removal unless the removal said it left nothing there. A section
   * kept only because a shortcut or an archived row still names it is stored but not listed, and
   * offering the route then lands the person on a page with no entry for their section
   * (`note-2026-09-15-006`). An absent `archiveListed` is unknown, not false: a receipt recovered
   * from a repeat removal carries no verdict, so the offer stands.
   */
  readonly showArchive = computed(() => {
    const state = this.state();
    if (state?.archiveListed === false) return false;
    return state?.receipt?.operation === 'section.remove' || state?.result?.operation === 'section.remove';
  });
  readonly canUndo = computed(() =>
    this.hasReceipt() && ['available', 'already-removed', 'refusal', 'error'].includes(this.state()?.kind ?? ''),
  );
  /** The server already refused this receipt for good; the button stays visible but cannot send it. */
  readonly undoRefusedForGood = computed(() => isUndoRefusedForGood(this.state()));
  readonly isAlert = computed(() => ['refusal', 'terminal', 'error'].includes(this.state()?.kind ?? ''));
  readonly conflicts = computed(() => {
    const refusal = this.state()?.refusal;
    if (refusal?.reason !== 'undo_conflict') return [];
    // One line per entity and rendered repair: a section that both changed and was superseded
    // needs one step. The key is what the line *says*, so a `self` supersession and a plain
    // change still collapse while a foreign actor's line — which names them — stands on its own.
    //
    // A foreign supersession also *replaces* the receipt advice for its own entity rather than
    // sitting beside it: one agent edit produces both `field-changed` and `superseded`, and
    // telling the person to use a receipt they cannot reach contradicts the line below it
    // (`note-2026-09-15-005`).
    const redone = new Set(
      refusal.conflicts
        .filter(({ nextStep }) => nextStep === 'redo-by-hand' || nextStep === 'redo-by-hand-or-archive')
        .map(({ entityType, id }) => `${entityType}:${id}`),
    );
    const seen = new Set<string>();
    return refusal.conflicts.filter((conflict) => {
      const { entityType, id, nextStep } = conflict;
      const subject = `${entityType}:${id}`;
      const offersReceipt = nextStep === 'use-later-receipt' || nextStep === 'use-later-receipt-or-archive';
      if (offersReceipt && redone.has(subject)) return false;
      const key = `${subject}:${nextStep}:${this.supersededByCopy(conflict) ?? ''}`;
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
    if (this.undoRefusedForGood()) return;
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

  /** The prefix that names the other party, or `null` when the later change was this person's. */
  supersededByCopy(conflict: { supersededBy?: 'self' | 'user' | 'agent' | 'system' }): string | null {
    const by = conflict.supersededBy;
    return by === undefined || by === 'self' ? null : SUPERSEDED_BY_COPY[by];
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
