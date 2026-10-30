import type { SectionContentInputs } from '../section-contract';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ProjectSection } from '@cwm/contracts';
import { MarkdownSectionBody } from './markdown-section-body';
import { readMarkdownConfig } from './markdown-config';

/**
 * **The placeholder's text, simplified for converted prose** (Slice 63). Converted Rich Text is
 * escaped source (`Keep this light\.`), and the eager placeholder prints source as text, so it
 * would flash the escapes until the body renders. This drops a backslash before ASCII punctuation
 * or a line break, and the three references the conversion writes — `&#32;`, `&#9;`, `&#13;`.
 *
 * Display-only and deliberately narrow: not a Markdown-to-text converter and not the legacy
 * decoder. Any other entity or syntax stays visible for the brief placeholder moment.
 */
export const placeholderTextOf = (source: string): string =>
  // One pass, so an escaped `\&\#32\;` — a reference the person typed — stays literal text.
  source.replace(/\\([!-/:-@[-`{-~\n])|&#(32|9|13);/g, (_match, escaped: string | undefined, code: string | undefined) =>
    escaped ?? String.fromCharCode(Number(code)));

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
  readonly onConfigChange = input.required<SectionContentInputs['onConfigChange']>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly sourceLink = input<SectionContentInputs['sourceLink']>(null);
  readonly placeholderText = computed(() => {
    const content = readMarkdownConfig(this.section().config);
    return content.state === 'ok' ? placeholderTextOf(content.markdown) : '';
  });
}
