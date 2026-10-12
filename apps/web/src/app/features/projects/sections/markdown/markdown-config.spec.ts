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

  it('an unreadable config carries no prose, whatever it holds (Slice 64)', () => {
    // No write can store Markdown beside another key any more, and the converter drops extras, so
    // only a hand edit reaches this; it is shown as unreadable, nothing more.
    for (const config of [{ markdown: 'Kept', extra: 'kept' }, { markdown: '', extra: 1 }, { markdown: 1, extra: 1 }]) {
      expect(readMarkdownConfig(config)).toEqual({ state: 'unreadable' });
    }
  });

  it('uses the contracts schema, which takes no key beside markdown', () => {
    expect(MarkdownConfigSchema.safeParse({ markdown: 'x', extra: 1 }).success).toBe(false);
  });
});
