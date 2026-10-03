import { SectionConfigSchema } from '@cwm/contracts';
import { z } from 'zod';

/** Config shape owned by this section folder. */
export const MarkdownConfigSchema = z.object({ markdown: z.string() });
export type MarkdownConfig = z.infer<typeof MarkdownConfigSchema>;
/** The source of a newly created section. */
export const createMarkdownConfig = (): MarkdownConfig => ({ markdown: '' });
/** Verify the default against the shared opaque storage shape. */
export const markdownDefaultConfig = () => SectionConfigSchema.parse(createMarkdownConfig());
/**
 * Distinguish absent content from unreadable content without changing stored data. An unreadable
 * config still carries its `markdown` when that key holds a string, so prose stored beside keys
 * Markdown does not own — converted Rich Text `{ text, ...extras }` (Slice 63) — stays visible.
 */
export const readMarkdownConfig = (config: unknown):
  { state: 'empty' } | { state: 'ok'; markdown: string } | { state: 'unreadable'; markdown?: string } => {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return { state: 'unreadable' };
  const keys = Object.keys(config);
  if (keys.length === 0) return { state: 'empty' };
  const parsed = MarkdownConfigSchema.safeParse(config);
  if (!parsed.success) return { state: 'unreadable' };
  return keys.length === 1 ? { state: 'ok', markdown: parsed.data.markdown } : { state: 'unreadable', markdown: parsed.data.markdown };
};
