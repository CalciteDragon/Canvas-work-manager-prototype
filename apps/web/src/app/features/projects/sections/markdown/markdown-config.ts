import { SectionConfigSchema } from '@cwm/contracts';
import { z } from 'zod';

/** Config shape owned by this section folder. */
export const MarkdownConfigSchema = z.object({ markdown: z.string() });
export type MarkdownConfig = z.infer<typeof MarkdownConfigSchema>;
/** The source of a newly created section. */
export const createMarkdownConfig = (): MarkdownConfig => ({ markdown: '' });
/** Verify the default against the shared opaque storage shape. */
export const markdownDefaultConfig = () => SectionConfigSchema.parse(createMarkdownConfig());
/** Distinguish absent content from unreadable content without changing stored data. */
export const readMarkdownConfig = (config: unknown):
  { state: 'empty' } | { state: 'ok'; markdown: string } | { state: 'unreadable' } => {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return { state: 'unreadable' };
  const keys = Object.keys(config);
  if (keys.length === 0) return { state: 'empty' };
  if (keys.length !== 1 || keys[0] !== 'markdown') return { state: 'unreadable' };
  const parsed = MarkdownConfigSchema.safeParse(config);
  return parsed.success ? { state: 'ok', markdown: parsed.data.markdown } : { state: 'unreadable' };
};
