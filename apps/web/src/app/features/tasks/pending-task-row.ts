import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A quick-added task before the server has answered (Slice 75, §63). It is not a `Task`: it has
 * only the title the person typed, so it offers nothing to act on until the real row replaces it.
 */
@Component({
  selector: 'app-pending-task-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article data-task-pending class="task-row task-row--adding" aria-busy="true">
      <span class="task-row__title">{{ title() }}</span>
      <span class="task-row__adding-label">Adding…</span>
    </article>
  `,
  styleUrl: './task-row.scss',
  host: { '[class]': '"task-row-host"' },
})
export class PendingTaskRow {
  readonly title = input.required<string>();
}
