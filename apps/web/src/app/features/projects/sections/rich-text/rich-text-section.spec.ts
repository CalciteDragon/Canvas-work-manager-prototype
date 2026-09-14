import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, SectionConfigSchema, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { RichTextConfigSchema, createRichTextConfig, richTextDefaultConfig } from './rich-text-config';
import { RichTextSection } from './rich-text-section';

const AT = '2026-08-27T16:00:00.000Z';

const section = (config: unknown, title?: string): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-a',
    projectId: 'project-a',
    pageId: 'page-project-a',
    type: 'rich-text',
    title,
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config,
    createdAt: AT,
    updatedAt: AT,
  });

const render = (config: unknown, title?: string, readOnly = false) => {
  const onConfigChange = vi.fn<(config: SectionConfig) => void>();
  const fixture = TestBed.createComponent(RichTextSection);
  fixture.componentRef.setInput('section', section(config, title));
  fixture.componentRef.setInput('onConfigChange', onConfigChange);
  const onProjectDataChange = vi.fn();
  fixture.componentRef.setInput('onProjectDataChange', onProjectDataChange);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.detectChanges();
  const textarea = fixture.nativeElement.querySelector('[data-rich-text-body]') as HTMLTextAreaElement;
  return { fixture, textarea, onConfigChange, onProjectDataChange };
};

describe('RichTextSection (§30)', () => {
  it('renders the text its config carries', () => {
    const { textarea } = render({ text: 'Launch week notes' });

    expect(textarea.value).toBe('Launch week notes');
  });

  it('lets wrapped content determine the editor height instead of exposing vertical resizing', () => {
    const { textarea } = render({ text: 'A note that wraps as the section becomes narrower.' });

    expect(getComputedStyle(textarea).resize).toBe('none');
  });

  it('sizes the editor to its content in script rather than relying on field-sizing', async () => {
    const observed: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { observed.push(callback); }
      observe(): void {}
      disconnect = disconnect;
    });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const flushFrames = () => frames.splice(0).forEach((callback) => callback(0));
    try {
      const { fixture, textarea } = render({ text: 'Short' });
      // jsdom has no layout, so the geometry the fit reads is supplied: 2px of border.
      let contentHeight = 120;
      Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => contentHeight });
      Object.defineProperty(textarea, 'offsetHeight', { configurable: true, get: () => 102 });
      Object.defineProperty(textarea, 'clientHeight', { configurable: true, get: () => 100 });
      let width = 400;
      Object.defineProperty(textarea, 'clientWidth', { configurable: true, get: () => width });

      expect(getComputedStyle(textarea).getPropertyValue('field-sizing')).toBe('');
      textarea.value = 'Longer text that wraps onto more lines';
      textarea.dispatchEvent(new Event('input'));
      expect(textarea.style.height).toBe('122px');

      // Narrowing the section (a flow resize) wraps the text further without any input event.
      contentHeight = 200;
      width = 200;
      observed[0]!([], {} as ResizeObserver);
      // Refitted on the next frame, never inside the observer callback.
      expect(textarea.style.height).toBe('122px');
      flushFrames();
      expect(textarea.style.height).toBe('202px');

      // A height-only notification — including the one this fit itself causes — changes nothing.
      contentHeight = 999;
      observed[0]!([], {} as ResizeObserver);
      flushFrames();
      expect(textarea.style.height).toBe('202px');

      fixture.destroy();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not report project data changes for section-local text', () => {
    const { textarea, onProjectDataChange } = render({ text: 'before' });
    textarea.value = 'after'; textarea.dispatchEvent(new Event('blur'));
    expect(onProjectDataChange).not.toHaveBeenCalled();
  });

  it('saves on blur, and not on every keystroke', () => {
    const { textarea, onConfigChange } = render({ text: 'before' });

    textarea.value = 'after';
    textarea.dispatchEvent(new Event('input'));
    expect(onConfigChange).not.toHaveBeenCalled();

    textarea.dispatchEvent(new Event('blur'));

    // Replaced whole, matching `UpdateSectionInput.config`.
    expect(onConfigChange).toHaveBeenCalledWith({ text: 'after' });
  });

  it('does not save when the text is unchanged', () => {
    const { textarea, onConfigChange } = render({ text: 'same' });

    textarea.dispatchEvent(new Event('blur'));

    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('keeps source notes readable without saving a read-only edit', () => {
    const { textarea, onConfigChange } = render({ text: 'source notes' }, undefined, true);

    expect(textarea.readOnly).toBe(true);
    textarea.value = 'attempted source edit';
    textarea.dispatchEvent(new Event('blur'));

    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('renders an empty editor rather than nothing when the config is not its shape', () => {
    // `data.json` is hand-editable, and a section can predate a key. A malformed config
    // must not take the canvas down with it.
    const { textarea } = render({ notText: 42 });

    expect(textarea.value).toBe('');
  });

  it('labels the editor with the section’s resolved name, named or not', () => {
    // The fourth surface that used to answer "what is this section called" its own way —
    // it said "Notes for this section" where the frame two lines above said "Rich Text".
    expect(render({ text: '' }, 'Kickoff').textarea.getAttribute('aria-label')).toBe('Notes for Kickoff');
    expect(render({ text: '' }).textarea.getAttribute('aria-label')).toBe('Notes for Rich Text');
  });

  it('createDefaultConfig() parses against this section’s own schema and the storage shape', () => {
    // The round trip lives here rather than in `registry.spec.ts`: keeping it there would
    // make that file import every section folder, so adding a type would touch three places
    // instead of two — the §30 claim the registry exists to prove.
    expect(() => RichTextConfigSchema.parse(createRichTextConfig())).not.toThrow();
    expect(() => SectionConfigSchema.parse(richTextDefaultConfig())).not.toThrow();
  });
});
