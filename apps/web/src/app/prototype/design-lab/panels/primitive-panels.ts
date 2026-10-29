import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Failure } from '../../../shared/feedback/failure';
import { FailureMessage } from '../../../shared/feedback/failure-message';

/**
 * §67's catalogue, primitive half.
 *
 * §67 lists buttons, inputs, cards, project cards and menus. Since slice 72, buttons and inputs
 * are **shared**: the global primitive classes in `styles/_controls.scss`, rendered here as they
 * are, and the Controls panel shows every variant and state. Since slice 78 the loading and
 * failed states are shared too: `.state-message` and `FailureMessage`. Cards, project cards and
 * menus are still token-styled markup inside features, so their panels are *representative
 * markup* labelled **not yet a shared component**. That label is the useful output: a primitive
 * everybody keeps re-styling is evidence for extracting it, and §78 is where that evidence goes.
 *
 * The project-card shapes are copied from the `active-projects` widget rows and the
 * historical hierarchy-view rows, which is why they get a panel of their own rather than folding
 * into "cards" — §67 names them separately and the markup genuinely differs.
 */
@Component({
  selector: 'app-design-lab-primitive-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FailureMessage],
  templateUrl: './primitive-panels.html',
  styleUrls: ['./panels.scss', './primitive-panels.scss'],
})
export class PrimitivePanels {
  /** Slice 78's failure forms: a read in place of a body, stale content said politely, a write on its row. */
  readonly readFailure: Failure = { sentence: 'Couldn’t load this task list.', reason: 'the prototype host is not running' };
  readonly staleFailure: Failure = { sentence: 'This list may be out of date.', reason: 'the prototype host is not running' };
  readonly writeFailure: Failure = { sentence: 'Couldn’t complete “Order tiles”. Try again.', reason: 'Task “Order tiles” changed since it was read.' };
  /** §21's single row shape, including rows that have no interactive owner. */
  readonly rows = [
    { title: 'Draft the launch announcement', meta: 'In progress · Due 2026-10-24', variant: 'link' },
    { title: 'Project target', meta: '2026-10-30', variant: 'static' },
    { title: 'Fix the sign-up form', meta: 'High priority · Due 2026-10-24', variant: 'high-priority' },
    { title: 'Send the pre-launch email', meta: 'Due 2026-10-20 · Overdue', variant: 'overdue' },
    { title: 'Book the venue', meta: 'Done · Completed 2026-10-21', variant: 'finished' },
    { title: 'Read-only source task', meta: 'Blocked · Due 2026-10-24', variant: 'read-only' },
  ];
}
