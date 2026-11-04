import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownSourceEditor } from './markdown-source-editor';

const render = (initialDraft: string | null = null) => {
  const fixture = TestBed.createComponent(MarkdownSourceEditor);
  fixture.componentRef.setInput('initialSource', '# Original');
  fixture.componentRef.setInput('initialDraft', initialDraft);
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
    // Slice 79 (W4-031): the rendered draft says what it is, not only through aria-pressed.
    const caption = query('[data-markdown-preview-caption]');
    expect(caption.textContent?.trim()).toBe('Unsaved preview');
    expect(caption.compareDocumentPosition(query('app-markdown-renderer')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(query('h3')?.textContent).toBe('Draft');
    preview.click(); fixture.detectChanges(); await fixture.whenStable();
    const returned = query<HTMLTextAreaElement>('textarea');
    expect(returned.value).toBe('# Draft');
    expect(document.activeElement).toBe(returned);
    expect(query('[data-markdown-preview-caption]')).toBeNull();
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
  // Slice 79 (L3-012): a kept draft comes back with a way to drop it; the body owns the store.
  it('an offered draft opens with the note and Discard draft', () => {
    const { fixture, query } = render('# Kept');
    expect(query<HTMLTextAreaElement>('[data-markdown-source]').value).toBe('# Kept');
    const restored = query('[data-markdown-restored]');
    expect(restored.getAttribute('role')).toBe('status');
    expect(restored.textContent).toContain('Your unsaved draft is back.');
    const discard = vi.fn();
    fixture.componentInstance.discardRequested.subscribe(discard);
    const button = query<HTMLButtonElement>('[data-markdown-discard]');
    expect(button.textContent?.trim()).toBe('Discard draft');
    button.click();
    expect(discard).toHaveBeenCalledOnce();
  });
  it('a fresh editor offers nothing, and Cancel carries the draft', () => {
    const { query, fixture } = render();
    expect(query('[data-markdown-restored]')).toBeNull(); expect(query('[data-markdown-discard]')).toBeNull();
    const cancel = vi.fn(); fixture.componentInstance.cancelRequested.subscribe(cancel);
    const textarea = query<HTMLTextAreaElement>('textarea');
    textarea.value = '# Changed'; textarea.dispatchEvent(new Event('input'));
    query<HTMLButtonElement>('[data-markdown-cancel]').click();
    expect(cancel).toHaveBeenCalledExactlyOnceWith('# Changed');
  });
  it('Save is the only primary button, with a draft offered or in Preview', () => {
    const { fixture } = render('# Kept');
    const primaries = () => [...fixture.nativeElement.querySelectorAll('.button--primary')] as HTMLElement[];
    expect(primaries().map((button) => button.hasAttribute('data-markdown-save'))).toEqual([true]);
    fixture.nativeElement.querySelector('[data-markdown-preview]').click(); fixture.detectChanges();
    expect(primaries().map((button) => button.hasAttribute('data-markdown-save'))).toEqual([true]);
  });
});
