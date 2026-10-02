import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: false, typographer: false }).disable('image');
md.core.ruler.push('cwm_presentation', (state) => {
  for (const token of state.tokens) {
    if (token.type === 'heading_open' || token.type === 'heading_close') {
      token.tag = `h${Math.min(Number(token.tag.slice(1)) + 2, 6)}`;
    }
    if (token.type === 'th_open' || token.type === 'td_open') {
      const alignment = token.attrGet('style');
      if (typeof alignment === 'string') {
        token.attrs = token.attrs?.filter(([name]) => name !== 'style') ?? null;
        token.attrSet('class', `markdown-align-${alignment.slice('text-align:'.length)}`);
      }
    }
    for (const child of token.children ?? []) {
      if (child.type !== 'link_open') continue;
      child.attrSet('target', '_blank');
      child.attrSet('rel', 'noopener noreferrer');
    }
  }
});

/** Render stored Markdown source for display. */
export const renderMarkdown = (source: string): string => md.render(source);

/** Presentational Markdown output; persistence always keeps the source. */
@Component({
  selector: 'app-markdown-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'markdown-renderer' },
  template: `@if (source().trim()) {
    <div [innerHTML]="html()"></div>
  } @else {
    <p class="markdown-renderer__empty">{{ emptyText() }}</p>
  }`,
  styleUrl: './markdown-renderer.scss',
})
export class MarkdownRenderer {
  readonly source = input.required<string>();
  readonly emptyText = input('No notes yet.');
  readonly html = computed(() => renderMarkdown(this.source()));
}
