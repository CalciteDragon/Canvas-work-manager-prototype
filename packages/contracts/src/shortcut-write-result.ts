import { z } from 'zod';
import { ProjectIdSchema, ProjectPageIdSchema, SectionShortcutIdSchema } from './ids';
import { OperationReceiptSchema } from './operation-receipt';
import { ResolvedSectionShortcutSchema } from './section-shortcut';

/**
 * **What a committed shortcut write answers** (Slice 37, §§27, 31). Kept beside
 * `row-write-result.ts` and away from `shortcut-history.ts` for the same reason: a browser
 * validating a response should not bundle the inverse-operation graph to do it.
 *
 * A create always carries its receipt. An update or a move carries `null` when the gesture
 * changed nothing — the same value, or a clamped position that was already the current one —
 * because a no-op records no action and must not look like one that did.
 */
export const SectionShortcutAddResultSchema = z.object({
  shortcut: ResolvedSectionShortcutSchema,
  operation: OperationReceiptSchema,
});
export type SectionShortcutAddResult = z.infer<typeof SectionShortcutAddResultSchema>;

export const SectionShortcutWriteResultSchema = z.object({
  shortcut: ResolvedSectionShortcutSchema,
  operation: OperationReceiptSchema.nullable(),
});
export type SectionShortcutWriteResult = z.infer<typeof SectionShortcutWriteResultSchema>;

/**
 * A removal has no placement left to return, so it names the one it deleted and where it was.
 * The receipt is required: removing a stored placement always writes, so there is no no-op to
 * report, and claiming a live `shortcut` here would be a snapshot that reads as current.
 */
export const SectionShortcutRemovalResultSchema = z.object({
  shortcutId: SectionShortcutIdSchema,
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
  operation: OperationReceiptSchema,
});
export type SectionShortcutRemovalResult = z.infer<typeof SectionShortcutRemovalResultSchema>;
