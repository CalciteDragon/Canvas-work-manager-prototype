import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, type SectionConfig } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownSectionBody } from './markdown-section-body';
import type { Failure } from '../../../../shared/feedback/failure';

const NOT_SAVED: Failure = { sentence: 'Couldn’t save “Kickoff”. Try again.', reason: 'host stopped' };

const section = (config: unknown = { markdown: '# Plan' }) => ProjectSectionSchema.parse({
  id: 'section-a', projectId: 'project-a', pageId: 'page-a', type: 'markdown', title: 'Kickoff',
  config, position: 0, columnSpan: 12, collapsed: false,
  createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z',
});

const render = (config: unknown = { markdown: '# Plan' }, readOnly = false, result: Promise<Failure | null> = Promise.resolve(null)) => {
  const fixture = TestBed.createComponent(MarkdownSectionBody);
  const save = vi.fn<(config: SectionConfig) => Promise<Failure | null>>(() => result);
  fixture.componentRef.setInput('section', section(config));
  fixture.componentRef.setInput('save', save);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.detectChanges();
  const query = <T extends HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);
  const settle = async () => {
    // Angular stability does not track the supplied callback's arbitrary promise.
    await Promise.resolve(); fixture.detectChanges(); await fixture.whenStable();
  };
  const click = async (selector: string) => {
    query<HTMLButtonElement>(selector).click(); await settle();
  };
  const type = (draft: string) => {
    const source = query<HTMLTextAreaElement>('[data-markdown-source]');
    source.value = draft; source.dispatchEvent(new Event('input')); fixture.detectChanges();
  };
  const update = (config: SectionConfig) => {
    fixture.componentRef.setInput('section', section(config)); fixture.detectChanges();
  };
  return { fixture, save, query, click, type, update, settle };
};

describe('MarkdownSectionBody', () => {
  it('Edit opens the source with focus', async () => {
    const { query, click } = render();
    expect(query('[data-markdown-edit]')?.getAttribute('aria-label')).toBe('Edit Markdown for Kickoff');
    await click('[data-markdown-edit]');
    const source = query<HTMLTextAreaElement>('[data-markdown-source]');
    expect(source.value).toBe('# Plan'); expect(document.activeElement).toBe(source);
  });
  it('Save writes the whole config once and closes', async () => {
    const { fixture, save, query, click, type } = render();
    await click('[data-markdown-edit]'); type('# Written'); await click('[data-markdown-save]');
    expect(save).toHaveBeenCalledExactlyOnceWith({ markdown: '# Written' });
    expect(query('app-markdown-source-editor')).toBeNull();
    expect(document.activeElement).toBe(query('[data-markdown-edit]'));
    expect(fixture.componentInstance.pending()).toBe(false);
  });
  it('unchanged Save and Cancel write nothing', async () => {
    const { save, query, click, type } = render();
    await click('[data-markdown-edit]'); await click('[data-markdown-save]');
    expect(document.activeElement).toBe(query('[data-markdown-edit]'));
    await click('[data-markdown-edit]'); type('# Cancelled'); await click('[data-markdown-cancel]');
    expect(save).not.toHaveBeenCalled(); expect(document.activeElement).toBe(query('[data-markdown-edit]'));
  });
  it('a reopened editor starts from stored source', async () => {
    const { query, click, type, update } = render();
    await click('[data-markdown-edit]'); type('# Cancelled'); await click('[data-markdown-cancel]');
    update({ markdown: '# Current' }); await click('[data-markdown-edit]');
    expect(query<HTMLTextAreaElement>('[data-markdown-source]').value).toBe('# Current');
  });
  // Slice 78 (L4-018): one message, on the editor — the save's sentence as an inline alert, the
  // reason under a closed Details, the source described by the sentence alone.
  it('failed Save keeps the draft and says why once, on the editor', async () => {
    const { query, click, type } = render(undefined, false, Promise.resolve(NOT_SAVED));
    await click('[data-markdown-edit]'); type('# Unsaved'); await click('[data-markdown-save]');
    const source = query<HTMLTextAreaElement>('[data-markdown-source]');
    expect(source.value).toBe('# Unsaved');
    const failed = query('[data-markdown-failed]');
    const sentence = failed.querySelector<HTMLElement>('[data-failure-sentence]')!;
    expect(sentence.textContent?.trim()).toBe('Couldn’t save “Kickoff”. Try again.');
    expect(sentence.getAttribute('role')).toBe('alert');
    expect(failed.querySelector('details')?.open).toBe(false);
    expect(failed.querySelector('details')?.textContent).toContain('host stopped');
    expect(document.getElementById(source.getAttribute('aria-describedby')!)).toBe(sentence);
    expect(query('[data-markdown-changed-elsewhere]')).toBeNull();
  });
  it('a thrown Save says the section’s sentence with the reason under Details', async () => {
    const { query, click, type, save } = render();
    save.mockImplementation(() => Promise.reject(new Error('socket closed')));
    await click('[data-markdown-edit]'); type('# Unsaved'); await click('[data-markdown-save]');
    expect(query('[data-markdown-failed] [data-failure-sentence]').textContent?.trim()).toBe('Couldn’t save “Kickoff”. Try again.');
    expect(query('[data-markdown-failed] details').textContent).toContain('socket closed');
  });
  it('Cancel after a failed Save leaves no alert behind', async () => {
    const { query, click, type } = render(undefined, false, Promise.resolve(NOT_SAVED));
    await click('[data-markdown-edit]'); type('# Unsaved'); await click('[data-markdown-save]');
    expect(query('[data-markdown-failed]')).not.toBeNull();
    await click('[data-markdown-cancel]');
    expect(query('app-markdown-source-editor')).toBeNull();
    expect(query('[data-markdown-failed]')).toBeNull(); expect(query('[role="alert"]')).toBeNull();
  });
  it('pending Save cannot be repeated', async () => {
    let resolve!: (result: Failure | null) => void;
    const result = new Promise<Failure | null>((done) => { resolve = done; });
    const { fixture, save, query, click, type } = render(undefined, false, result);
    await click('[data-markdown-edit]'); type('# Waiting'); await click('[data-markdown-save]');
    expect(query<HTMLTextAreaElement>('[data-markdown-source]').readOnly).toBe(true);
    for (const selector of ['[data-markdown-save]', '[data-markdown-cancel]']) {
      expect(query<HTMLButtonElement>(selector).disabled).toBe(false);
      expect(query(selector).getAttribute('aria-disabled')).toBe('true');
    }
    await click('[data-markdown-save]'); await click('[data-markdown-cancel]');
    expect(save).toHaveBeenCalledTimes(1); expect(query('app-markdown-source-editor')).not.toBeNull();
    resolve(NOT_SAVED); await fixture.whenStable();
  });
  it('a section update does not erase the draft', async () => {
    const { query, click, type, update } = render();
    await click('[data-markdown-edit]'); type('# My draft'); update({ markdown: '# Someone else' });
    expect(query<HTMLTextAreaElement>('[data-markdown-source]').value).toBe('# My draft');
    expect(query('[data-markdown-changed-elsewhere]').getAttribute('role')).toBe('status');
    expect(query('[data-markdown-changed-elsewhere]').textContent).toContain('Saving replaces it.');
  });
  it('an update during a refused pending Save announces once it settles', async () => {
    let resolve!: (result: Failure | null) => void;
    const result = new Promise<Failure | null>((done) => { resolve = done; });
    const { query, click, type, update, settle } = render(undefined, false, result);
    await click('[data-markdown-edit]'); type('# Mine'); await click('[data-markdown-save]');
    update({ markdown: '# Other' }); expect(query('[data-markdown-changed-elsewhere]')).toBeNull();
    resolve(NOT_SAVED); await settle();
    expect(query('[data-markdown-changed-elsewhere]')).not.toBeNull();
    expect(query<HTMLTextAreaElement>('[data-markdown-source]').value).toBe('# Mine');
  });
  it('own successful Save never shows the changed-elsewhere notice', async () => {
    let resolve!: (result: Failure | null) => void;
    const result = new Promise<Failure | null>((done) => { resolve = done; });
    const { fixture, query, click, type, update } = render(undefined, false, result);
    await click('[data-markdown-edit]'); type('# Mine');
    const saving = fixture.componentInstance.saveDraft('# Mine'); fixture.detectChanges();
    update({ markdown: '# Mine' }); expect(query('[data-markdown-changed-elsewhere]')).toBeNull();
    resolve(null); await saving;
    // First possible render after settlement, before stability or a later frame.
    fixture.detectChanges(); expect(query('[data-markdown-changed-elsewhere]')).toBeNull();
    expect(fixture.componentInstance.editing()).toBe(false); expect(fixture.componentInstance.pending()).toBe(false);
  });
  it('late answer after destroy is ignored', async () => {
    let resolve!: (result: Failure | null) => void;
    const result = new Promise<Failure | null>((done) => { resolve = done; });
    const { fixture, click, type } = render(undefined, false, result);
    await click('[data-markdown-edit]'); type('# Mine');
    const saving = fixture.componentInstance.saveDraft('# Mine'); fixture.destroy(); resolve(null);
    await expect(saving).resolves.toBeUndefined();
    expect(fixture.componentInstance.editing()).toBe(true); expect(fixture.componentInstance.pending()).toBe(true);
  });
  it('read-only renders without Edit', () => {
    const { query, save } = render(undefined, true);
    expect(query('h3').textContent).toBe('Plan'); expect(query('[data-markdown-edit]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it('unreadable config is shown, not overwritten', () => {
    const { fixture, query, save } = render({ text: 'keep me' });
    expect(fixture.nativeElement.textContent).toContain("This section's stored content isn't Markdown source, so it can't be edited here.");
    expect(query('[data-markdown-edit]')).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
  it.each([false, true])('unreadable config shows only the note, never the prose beside its extra key (read-only: %s; Slice 64)', (readOnly) => {
    const { fixture, query, save } = render({ markdown: 'Autumn planting only\\.', extra: 'kept' }, readOnly);
    expect(query('[data-markdown-unreadable]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Autumn planting only');
    expect(query('app-markdown-renderer')).toBeNull();
    expect(query('[data-markdown-edit]')).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
  it('a foreign config arriving mid-draft is preserved and Save is blocked', async () => {
    const { fixture, query, save, click, type, update } = render();
    await click('[data-markdown-edit]'); type('# My draft'); update({ markdown: '# Changed', extra: 'keep this' });
    expect(query<HTMLTextAreaElement>('textarea').value).toBe('# My draft');
    expect(query('[data-markdown-save]').getAttribute('aria-disabled')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain("can't be edited here.");
    await click('[data-markdown-save]'); await fixture.componentInstance.saveDraft('# Mine');
    expect(save).not.toHaveBeenCalled(); await click('[data-markdown-cancel]');
    expect(query('app-markdown-source-editor')).toBeNull();
  });
  it('read-only arriving mid-draft blocks Save and permits Cancel', async () => {
    const { fixture, query, save, click, type } = render();
    await click('[data-markdown-edit]'); type('# My draft');
    fixture.componentRef.setInput('readOnly', true); fixture.detectChanges();
    expect(query('[data-markdown-save]').getAttribute('aria-disabled')).toBe('true');
    await click('[data-markdown-save]'); expect(save).not.toHaveBeenCalled();
    await click('[data-markdown-cancel]'); expect(query('app-markdown-source-editor')).toBeNull();
  });
  it('empty source keeps Edit available and Escape does not discard a draft', async () => {
    const { fixture, query, click, type, save } = render({});
    expect(fixture.nativeElement.textContent).toContain('No notes yet.');
    await click('[data-markdown-edit]'); type('Keep me');
    query('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(query<HTMLTextAreaElement>('textarea').value).toBe('Keep me'); expect(save).not.toHaveBeenCalled();
  });
});
