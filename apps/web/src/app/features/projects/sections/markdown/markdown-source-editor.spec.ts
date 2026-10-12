import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownSourceEditor } from './markdown-source-editor';

const render = () => {
  const fixture = TestBed.createComponent(MarkdownSourceEditor);
  fixture.componentRef.setInput('initialSource', '# Original');
  fixture.componentRef.setInput('name', 'Kickoff');
  fixture.detectChanges();
  const query = <T extends HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);
  return { fixture, query };
};

describe('MarkdownSourceEditor', () => {
  it('Preview renders the draft', async () => {
    const { fixture, query } = render();
    const textarea = query<HTMLTextAreaElement>('[data-markdown-source]');
    expect(textarea.getAttribute('aria-label')).toBe('Markdown source for Kickoff');
    expect(textarea.rows).toBe(10);
    expect(getComputedStyle(textarea).resize).toBe('vertical');
    textarea.value = '# Draft'; textarea.dispatchEvent(new Event('input'));
    const preview = query<HTMLButtonElement>('[data-markdown-preview]');
    expect(preview?.getAttribute('aria-pressed')).toBe('false');
    preview.click(); fixture.detectChanges();
    expect(preview.getAttribute('aria-pressed')).toBe('true');
    expect(query('textarea')).toBeNull();
    expect(query('h3')?.textContent).toBe('Draft');
    preview.click(); fixture.detectChanges(); await fixture.whenStable();
    const returned = query<HTMLTextAreaElement>('textarea');
    expect(returned.value).toBe('# Draft');
    expect(document.activeElement).toBe(returned);
    fixture.componentRef.setInput('initialSource', '# Another writer'); fixture.detectChanges();
    expect(returned.value).toBe('# Draft');
  });
  it('pending blocks input, preview, Save and Cancel without native disabling', () => {
    const { fixture, query } = render();
    const save = vi.fn(); const cancel = vi.fn();
    fixture.componentInstance.saveRequested.subscribe(save);
    fixture.componentInstance.cancelRequested.subscribe(cancel);
    fixture.componentRef.setInput('pending', true); fixture.detectChanges();
    const textarea = query<HTMLTextAreaElement>('textarea');
    expect(textarea.readOnly).toBe(true);
    textarea.value = '# During pending'; textarea.dispatchEvent(new Event('input'));
    for (const selector of ['[data-markdown-preview]', '[data-markdown-save]', '[data-markdown-cancel]']) {
      const button = query<HTMLButtonElement>(selector);
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-disabled')).toBe('true'); button.click();
    }
    fixture.detectChanges();
    expect(query('textarea')).not.toBeNull();
    expect(save).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
    fixture.componentRef.setInput('pending', false); fixture.detectChanges();
    query<HTMLButtonElement>('[data-markdown-save]').click();
    expect(save).toHaveBeenCalledExactlyOnceWith('# Original');
  });
});
