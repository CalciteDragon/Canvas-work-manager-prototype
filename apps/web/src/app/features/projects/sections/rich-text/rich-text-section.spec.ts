import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, SectionConfigSchema, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { RichTextConfigSchema, createRichTextConfig, richTextDefaultConfig } from './rich-text-config';
import { RichTextSection } from './rich-text-section';

const AT = '2026-08-27T16:00:00.000Z';

const section = (config: unknown): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-a',
    projectId: 'project-a',
    type: 'rich-text',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config,
    createdAt: AT,
    updatedAt: AT,
  });

const render = (config: unknown) => {
  const onConfigChange = vi.fn<(config: SectionConfig) => void>();
  const fixture = TestBed.createComponent(RichTextSection);
  fixture.componentRef.setInput('section', section(config));
  fixture.componentRef.setInput('onConfigChange', onConfigChange);
  fixture.detectChanges();
  const textarea = fixture.nativeElement.querySelector('[data-rich-text-body]') as HTMLTextAreaElement;
  return { fixture, textarea, onConfigChange };
};

describe('RichTextSection (§30)', () => {
  it('renders the text its config carries', () => {
    const { textarea } = render({ text: 'Launch week notes' });

    expect(textarea.value).toBe('Launch week notes');
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

  it('renders an empty editor rather than nothing when the config is not its shape', () => {
    // `data.json` is hand-editable, and a section can predate a key. A malformed config
    // must not take the canvas down with it.
    const { textarea } = render({ notText: 42 });

    expect(textarea.value).toBe('');
  });

  it('createDefaultConfig() parses against this section’s own schema and the storage shape', () => {
    // The round trip lives here rather than in `registry.spec.ts`: keeping it there would
    // make that file import every section folder, so adding a type would touch three places
    // instead of two — the §30 claim the registry exists to prove.
    expect(() => RichTextConfigSchema.parse(createRichTextConfig())).not.toThrow();
    expect(() => SectionConfigSchema.parse(richTextDefaultConfig())).not.toThrow();
  });
});
