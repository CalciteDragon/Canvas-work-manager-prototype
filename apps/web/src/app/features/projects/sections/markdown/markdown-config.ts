import { MarkdownConfigSchema, SectionConfigSchema, type MarkdownConfig } from '@cwm/contracts';

/**
 * Config shape owned by this section and declared in contracts, where the domain enforces it on
 * every write (Slice 64, docs/decisions/2026-10-section-config-validated-on-write.md).
 */
export { MarkdownConfigSchema, type MarkdownConfig };
/** The source of a newly created section. */
export const createMarkdownConfig = (): MarkdownConfig => ({ markdown: '' });
/** Verify the default against the shared opaque storage shape. */
export const markdownDefaultConfig = () => SectionConfigSchema.parse(createMarkdownConfig());
/**
 * Distinguish absent content from unreadable content without changing stored data. No write can
 * store anything but `{}` or `{ markdown }`, so unreadable config comes only from a hand edit or
 * from history replaying state recorded before Slice 64, and is shown as unreadable, nothing more.
 */
export const readMarkdownConfig = (config: unknown):
  { state: 'empty' } | { state: 'ok'; markdown: string } | { state: 'unreadable' } => {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return { state: 'unreadable' };
  if (Object.keys(config).length === 0) return { state: 'empty' };
  const parsed = MarkdownConfigSchema.safeParse(config);
  return parsed.success ? { state: 'ok', markdown: parsed.data.markdown } : { state: 'unreadable' };
};
