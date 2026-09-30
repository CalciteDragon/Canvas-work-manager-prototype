import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { HistoryFeedback } from './history-feedback';

/**
 * The header's one polite feedback line for Undo/Redo (Slice 41): what a transition did or why it
 * was refused, and — for a write recorded in another project's history — where to find it, with an
 * Open link. **Presentational**, projected by the shell into the header's full-width row.
 *
 * The live region is always rendered, empty when there is nothing to say, so a screen reader is
 * already listening when a sentence arrives.
 */
@Component({
  selector: 'app-project-history-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div data-history-feedback role="status" aria-live="polite" class="history-feedback"
      [class.history-feedback--alert]="feedback()?.tone === 'alert'">
      @if (feedback(); as feedback) {
        <p data-history-message class="history-feedback__message">{{ feedback.message }}</p>
        @if (feedback.lines?.length) {
          <ul class="history-feedback__lines">
            @for (line of feedback.lines; track $index) {
              <li data-history-conflict>{{ line }}</li>
            }
          </ul>
        }
        <span class="history-feedback__actions">
          @if (feedback.link; as link) {
            <a data-history-open [routerLink]="['/projects', link.projectId]">{{ link.label }}</a>
          }
          <button data-history-dismiss type="button" (click)="dismissed.emit()">Dismiss</button>
        </span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .history-feedback {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1) var(--space-3);
        align-items: baseline;
        color: var(--color-text-muted);
      }

      .history-feedback--alert {
        color: var(--color-danger);
      }

      .history-feedback__message,
      .history-feedback__lines {
        margin: 0;
      }

      .history-feedback__lines {
        flex-basis: 100%;
        padding-inline-start: var(--space-5);
      }

      .history-feedback__actions {
        display: inline-flex;
        gap: var(--space-2);
      }

      button {
        padding: 0;
        border: 0;
        background: none;
        color: var(--color-accent);
        font: inherit;
        text-decoration: underline;
        cursor: pointer;
      }

      a {
        color: var(--color-accent);
      }
    `,
  ],
})
export class ProjectHistoryFeedback {
  readonly feedback = input<HistoryFeedback | null>(null);
  readonly dismissed = output<void>();
}
