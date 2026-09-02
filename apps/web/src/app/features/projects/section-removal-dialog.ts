import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { SectionId } from '@cwm/contracts';
import type { SectionRemovalPrompt } from './project-page-store';

/**
 * §31's remove, once ownership has made it a question rather than a confirmation. A view
 * and an empty container never reach this — they are already gone; a container still
 * holding rows has to say what becomes of them
 * (docs/decisions/2026-09-sections-own-their-data.md).
 *
 * Its own component rather than more of `ProjectPage`: the page's stylesheet is already at
 * its budget, and a dialog with two answers and a target picker is a self-contained thing.
 */
@Component({
  selector: 'app-section-removal-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-section-removal-dialog]': '""' },
  templateUrl: './section-removal-dialog.html',
  styleUrl: './section-removal-dialog.scss',
})
export class SectionRemovalDialog {
  readonly prompt = input.required<SectionRemovalPrompt>();

  readonly cancelled = output<void>();
  readonly cascadeChosen = output<void>();
  readonly reassignChosen = output<SectionId>();

  /** Unset until the user picks: the first offered container is the default answer. */
  readonly targetId = signal<SectionId | null>(null);
  readonly chosenTarget = computed(() => this.targetId() ?? (this.prompt().targets[0]?.id as SectionId));
}
