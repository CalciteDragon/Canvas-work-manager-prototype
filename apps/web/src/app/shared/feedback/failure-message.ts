import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Failure } from './failure';

/** The recoveries a failure can offer by itself; Go to Home and Reload page are links and pages of their own. */
export type FailureRecovery = 'try-again' | 'retry-refresh';

const RECOVERY_LABELS: Record<FailureRecovery, string> = { 'try-again': 'Try again', 'retry-refresh': 'Retry refresh' };

/**
 * One failure form, two weights (Slice 78, §21, §24). The *region* weight replaces a section
 * body, page or widget; the *inline* weight keeps slice 75's row, field and card placement.
 *
 * The host is the wrapper, so a caller's `data-*-error` hook goes on `<app-failure-message>` and
 * its text holds the reason. The sentence is the only element a control's `aria-describedby`
 * should name (`sentenceId`); the reason sits in a collapsed native Details beside it, so a
 * screen reader never reads it as a description.
 */
@Component({
  selector: 'app-failure-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './failure-message.html',
  host: {
    class: 'state-message state-message--failed',
    '[class.state-message--region]': "weight() === 'region'",
    '[class.state-message--inline]': "weight() === 'inline'",
    '[attr.aria-busy]': "pending() ? 'true' : null",
  },
})
export class FailureMessage {
  readonly failure = input.required<Failure>();
  readonly weight = input<'region' | 'inline'>('region');
  /** `alert` interrupts; `status` is polite (stale content, the sidebar); `null` is not announced. */
  readonly live = input<'alert' | 'status' | null>(null);
  readonly recovery = input<FailureRecovery | null>(null);
  /** While the caller's retry runs: the region is busy and its button disabled. */
  readonly pending = input(false);
  readonly sentenceId = input<string | null>(null);
  readonly retry = output<void>();
  protected readonly labels = RECOVERY_LABELS;
}
