import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownRenderer, renderMarkdown } from './markdown-renderer';

describe('renderMarkdown', () => {
  it('shifts headings and closes them at the same level', () => {
    const html = renderMarkdown('# One\n\n## Two\n\n###### Six');
    expect(html).toContain('<h3>One</h3>');
    expect(html).toContain('<h4>Two</h4>');
    expect(html).toContain('<h6>Six</h6>');
    expect(html).not.toContain('<h1');
  });
  /**
   * Frozen outputs of `encodeLegacyProse` (packages/prototype-data, Slice 63), rendered through
   * the real renderer: converted Rich Text reads as its prose, never as structure.
   */
  it.each([
    [
      '\\# Whole\\-house plan\\\n1\\. Kitchen first\\\n\\- garden in the spring\n\n\\| a \\| b \\|\\\n\\<b\\>bold\\<\\/b\\> \\&amp\\; \\[x\\]\\(https\\:\\/\\/e\\.com\\) 50\\% \\*done\\*\\\\',
      ['# Whole-house plan', '1. Kitchen first', '- garden in the spring', '| a | b |', '<b>bold</b> &amp; [x](https://e.com) 50% *done*\\'],
      3,
    ],
    ['&#32;&#32;&#32;&#32;indented\\\n\\`\\`\\`js\\\n\\> quote\\\n\\=\\=\\=', ['indented', '```js', '> quote', '==='], 3],
    ['test\\\naaa', ['test', 'aaa'], 1],
  ])('renders converted legacy prose %# as prose with hard breaks', (source, lines, breaks) => {
    const host = document.createElement('div');
    host.innerHTML = renderMarkdown(source);
    expect(host.querySelectorAll('h1, h2, h3, h4, h5, h6, ul, ol, li, table, blockquote, pre, code, a, b, hr').length).toBe(0);
    expect(host.querySelectorAll('br').length).toBe(breaks);
    expect([...host.querySelectorAll('p')].map((paragraph) => paragraph.textContent!.replace(/\s+/g, ' ').trim()).join(' '))
      .toBe(lines.join(' ').replace(/\s+/g, ' ').trim());
  });
  it('escapes raw HTML', () => {
    const html = renderMarkdown('<script>x</script>\n\n<img src=x onerror=y>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/<(script|img)/);
  });
  it('unsafe schemes are not links', () => {
    for (const url of ['javascript:alert(1)', 'vbscript:x', 'file:///notes', 'data:text/html,x']) {
      expect(renderMarkdown(`[unsafe](${url})`)).not.toContain('<a');
    }
  });
  it('images never load', () => {
    expect(renderMarkdown('![a](https://x/y.png)')).not.toContain('<img');
  });
  it('links open safely', () => {
    for (const source of ['[docs](https://example.com)', '<https://example.com>']) {
      expect(renderMarkdown(source)).toContain('target="_blank" rel="noopener noreferrer"');
    }
  });
  it('table alignment becomes a class', () => {
    const html = renderMarkdown('| a |\n| :-: |\n| b |');
    expect(html).toContain('class="markdown-align-center"');
    expect(html).not.toContain('style=');
  });
  it('renders lists, quotes, emphasis, code, rules, tables', () => {
    const html = renderMarkdown('- a\n- b\n\n1. first\n\n> Quote\n\n*em* **strong** ~~old~~ `inline`\n\n```ts\nconst x = 1;\n```\n\n---\n\n| a |\n| --- |\n| b |');
    for (const tag of ['ul', 'ol', 'li', 'blockquote', 'em', 'strong', 's', 'code', 'pre', 'hr', 'table']) {
      expect(html).toContain(`<${tag}`);
    }
  });
});

describe('MarkdownRenderer', () => {
  it('sanitized output keeps link attributes and styles apply', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fixture = TestBed.createComponent(MarkdownRenderer);
      fixture.componentRef.setInput('source', '[docs](https://example.com)\n\n> Quote\n\n| a |\n| :-: |\n| b |');
      fixture.detectChanges();
      const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
      expect(anchor?.target).toBe('_blank');
      expect(anchor?.rel).toBe('noopener noreferrer');
      const quote = fixture.nativeElement.querySelector('blockquote') as HTMLElement;
      expect(quote && getComputedStyle(quote).borderLeftStyle).toBe('solid');
      expect(warning).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
  });
  it('empty source shows the empty text', () => {
    const fixture = TestBed.createComponent(MarkdownRenderer);
    fixture.componentRef.setInput('source', ' \n');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No notes yet.');
    fixture.componentRef.setInput('emptyText', 'Nothing written.');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nothing written.');
  });
});
