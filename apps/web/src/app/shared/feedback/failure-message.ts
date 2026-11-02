import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, output } from '@angular/core';
import type { Failure } from './failure';

/** The recoveries a failure can offer by itself; Go to Home and Reload page are links and pages of their own. */
export type FailureRecovery = 'try-again' | 'retry-refresh';

const RECOVERY_LABELS: Record<FailureRecovery, string> = { 'try-again': 'Try again', 'retry-refresh': 'Retry refresh' };

/** Marks a region's heading (or, in the sidebar, its group button) as where focus lands when its failure recovers. */
const RECOVERY_FOCUS = '[data-recovery-focus]';

/**
 * One failure form, two weights (Slice 78, §21, §24). The *region* weight replaces a section
 * body, page or widget; the *inline* weight keeps slice 75's row, field and card placement.
 *
 * The host is the wrapper, so a caller's `data-*-error` hook goes on `<app-failure-message>` and
 * its text holds the reason. The sentence is the only element a control's `aria-describedby`
 * should name (`sentenceId`); the reason sits in a collapsed native Details beside it, so a
 * screen reader never reads it as a description.
 *
 * A successful retry removes the message with its button (Open question 11, user decision
 * 2026-11-01). If that button held focus, focus moves to the nearest `data-recovery-focus` before
 * the message in its landmark, else to the first one the landmark shows after recovery, so it
 * never falls to the top of the page. A person who moved focus elsewhere keeps it there.
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
    '(focusout)': 'keepRecoveryFocus($event)',
  },
})
export class FailureMessage {
  readonly failure = input.required<Failure>();
  readonly weight = input<'region' | 'inline'>('region');
  /**
   * `alert` interrupts; `status` is polite (stale content, the sidebar); `null` is not announced.
   * A polite region inserted already holding its text is often not read: a caller that needs
   * `status` announced keeps this component mounted and changes `failure`.
   */
  readonly live = input<'alert' | 'status' | null>(null);
  readonly recovery = input<FailureRecovery | null>(null);
  /** While the caller's retry runs: the region is busy and its button `aria-disabled`, keeping focus. */
  readonly pending = input(false);
  readonly sentenceId = input<string | null>(null);
  readonly retry = output<void>();
  protected readonly labels = RECOVERY_LABELS;

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  /** Set while the recovery button holds focus after a press: the landmark and its headings before the message. */
  private recoveryFocus: { scope: Element | null; before: HTMLElement[] } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      const recoveryFocus = this.recoveryFocus;
      if (recoveryFocus !== null) queueMicrotask(() => landRecoveryFocus(recoveryFocus));
    });
  }

  protected press(button: HTMLElement): void {
    if (this.pending()) return;
    if (document.activeElement === button) {
      const scope = this.host.closest('main, nav, dialog, [role="dialog"]');
      const marked = [...(scope ?? document).querySelectorAll<HTMLElement>(RECOVERY_FOCUS)];
      const before = marked.filter((heading) => heading.compareDocumentPosition(this.host) & Node.DOCUMENT_POSITION_FOLLOWING).reverse();
      this.recoveryFocus = { scope, before };
    }
    this.retry.emit();
  }

  protected keepRecoveryFocus(event: FocusEvent): void {
    if (event.relatedTarget instanceof Node && !this.host.contains(event.relatedTarget)) this.recoveryFocus = null;
  }
}

function landRecoveryFocus({ scope, before }: { scope: Element | null; before: HTMLElement[] }): void {
  const active = document.activeElement;
  if (active !== null && active !== document.body && active.isConnected) return;
  const target = before.find((heading) => heading.isConnected) ?? (scope?.isConnected ? scope.querySelector<HTMLElement>(RECOVERY_FOCUS) : null);
  target?.focus();
}
