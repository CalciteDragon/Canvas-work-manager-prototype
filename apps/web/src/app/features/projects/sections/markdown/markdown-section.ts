import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ProjectSection, SectionConfig } from '@cwm/contracts';
import { MarkdownSectionBody } from './markdown-section-body';
import { readMarkdownConfig } from './markdown-config';

/** Eager section shell; source rendering and editing are deferred into one lazy body. */
@Component({
  selector: 'app-markdown-section',
  imports: [MarkdownSectionBody],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@defer (on immediate) {
    <app-markdown-section-body [section]="section()" [save]="onConfigChange()" [readOnly]="readOnly()" />
  } @placeholder {
    <p class="markdown-placeholder" style="white-space: pre-wrap">{{ placeholderText() }}</p>
  }`,
})
export class MarkdownSection {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => Promise<boolean>>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly placeholderText = computed(() => {
    const content = readMarkdownConfig(this.section().config);
    return content.state === 'ok' ? content.markdown : '';
  });
}
