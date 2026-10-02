import { SectionConfigSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { MarkdownConfigSchema, createMarkdownConfig, markdownDefaultConfig, readMarkdownConfig } from './markdown-config';

describe('Markdown config (§14, §29)', () => {
  it('reads three states', () => {
    expect(readMarkdownConfig({})).toEqual({ state: 'empty' });
    expect(readMarkdownConfig({ markdown: 'x' })).toEqual({ state: 'ok', markdown: 'x' });
    for (const config of [{ markdown: 1 }, { markdown: 'x', extra: 1 }, { text: 'x' }, null, []]) {
      expect(readMarkdownConfig(config)).toEqual({ state: 'unreadable' });
    }
    expect(MarkdownConfigSchema.parse(createMarkdownConfig())).toEqual({ markdown: '' });
    expect(SectionConfigSchema.parse(markdownDefaultConfig())).toEqual({ markdown: '' });
  });
});
