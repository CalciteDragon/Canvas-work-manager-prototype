import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { nameOf, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { readRichTextConfig } from './rich-text-config';

/**
 * §30's Rich Text section. Plain text in a textarea: a formatting toolbar is not a question
 * this prototype has to answer, and the §83 question the section exists to test is whether
 * free-form notes belong on a project canvas at all.
 */
@Component({
  selector: 'app-rich-text-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rich-text-section.html',
  styleUrl: './rich-text-section.scss',
})
export class RichTextSection {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);

  readonly text = computed(() => readRichTextConfig(this.section().config).text);

  /** A template can only call its component's members, and the label needs the shared name. */
  readonly name = computed(() => nameOf(this.section()));

  /**
   * Saved on blur, not per keystroke: the section has no other commit point, and a debounce
   * would still PATCH mid-sentence.
   */
  save(value: string): void {
    if (this.readOnly()) return;
    if (value === this.text()) return;
    this.onConfigChange()({ text: value });
  }
}
