import { SectionConfigSchema } from '@cwm/contracts';
import { z } from 'zod';

/**
 * This section's own config, parsed here and nowhere else. §29 hands
 * `createDefaultConfig()` to the definition and §30 wants a new section type to stay inside
 * its folder, so `packages/contracts` knows only that a config is an object — never which
 * keys this one has.
 */
export const RichTextConfigSchema = z.object({
  text: z.string(),
});
export type RichTextConfig = z.infer<typeof RichTextConfigSchema>;

export const createRichTextConfig = (): RichTextConfig => ({ text: '' });

/**
 * A section whose config is malformed still renders. The data file is hand-editable (§14)
 * and an older section may predate a key, so an unreadable config falls back to the default
 * rather than blanking the canvas.
 */
export const readRichTextConfig = (config: unknown): RichTextConfig => {
  const parsed = RichTextConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : createRichTextConfig();
};

/** Narrows the default to the shared storage shape, failing loudly if it ever drifts. */
export const richTextDefaultConfig = () => SectionConfigSchema.parse(createRichTextConfig());
