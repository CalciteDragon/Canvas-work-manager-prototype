import { SectionConfigSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { MarkdownConfigSchema, createMarkdownConfig, markdownDefaultConfig, readMarkdownConfig } from './markdown-config';

describe('Markdown config (§14, §29)', () => {
  it('reads three states', () => {
    expect(readMarkdownConfig({})).toEqual({ state: 'empty' });
    expect(readMarkdownConfig({ markdown: 'x' })).toEqual({ state: 'ok', markdown: 'x' });
    for (const config of [{ markdown: 1 }, { text: 'x' }, { text: 5 }, null, []]) {
      expect(readMarkdownConfig(config)).toEqual({ state: 'unreadable' });
    }
    expect(MarkdownConfigSchema.parse(createMarkdownConfig())).toEqual({ markdown: '' });
    expect(SectionConfigSchema.parse(markdownDefaultConfig())).toEqual({ markdown: '' });
  });

  it('an unreadable config carries its markdown exactly when that key holds a string (Slice 63)', () => {
    // Converted Rich Text `{ text, ...extras }` keeps its extras beside the encoded prose; the
    // prose stays visible even though the config is not Markdown's to edit.
    expect(readMarkdownConfig({ markdown: 'Kept\\.', extra: 'kept' })).toEqual({ state: 'unreadable', markdown: 'Kept\\.' });
    expect(readMarkdownConfig({ markdown: '', extra: 1 })).toEqual({ state: 'unreadable', markdown: '' });
    expect(readMarkdownConfig({ markdown: 1, extra: 1 })).toEqual({ state: 'unreadable' });
    expect(readMarkdownConfig({ text: 'x', extra: 1 })).toEqual({ state: 'unreadable' });
  });
});
