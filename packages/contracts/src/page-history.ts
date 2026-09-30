import { z } from 'zod';
import { ProjectIdSchema, ProjectPageIdSchema } from './ids';
import { ProjectPageKindSchema, ProjectPageSchema } from './project-page';

/**
 * **The two optional-page operation payloads** (Slice 38, main §§26, 31): the captured footprint
 * of one committed `ProjectPageService.setEnabled` write, held by an operation-history action.
 *
 * §26 gives a root three optional tabs and creates each one's record on its **first enable**
 * (docs/decisions/2026-09-optional-pages-are-created-on-first-enable.md), so a toggle is one of
 * exactly two operations and never a third: the enable that created the record is a `page.add`,
 * whose inverse deletes the record it made, and every later change of the boolean is a
 * `page.update`, whose inverse writes the boolean back and touches nothing else.
 *
 * Both payloads are confined to the three optional kinds. Home and a sub-project's work canvas
 * are structural records `validateDocumentIntegrity` requires — `setEnabled` refuses them — so a
 * payload that could name one would describe a write no service can perform and an inverse that
 * would leave the document invalid.
 */

/**
 * The kinds a toggle may name: §26's optional three, and only those. Narrower than
 * `NAVIGABLE_PAGE_KINDS`, which includes the Home page a root always has and can never disable.
 */
export const OPTIONAL_PAGE_KINDS = ['todos', 'archive', 'reflections'] as const;

export const OptionalProjectPageKindSchema = z.enum(OPTIONAL_PAGE_KINDS);
export type OptionalProjectPageKind = z.infer<typeof OptionalProjectPageKindSchema>;

export const isOptionalPageKind = (kind: z.infer<typeof ProjectPageKindSchema>): kind is OptionalProjectPageKind =>
  (OPTIONAL_PAGE_KINDS as readonly string[]).includes(kind);

/**
 * `page.add`: the record the first enable created, exactly as it was inserted.
 *
 * The whole page is captured rather than its kind and owner alone, because Redo recreates it with
 * the **same id and `createdAt`** — a reference that survived the round trip must still resolve,
 * and a page that came back with a new id would be a second page rather than the same one
 * returning. A created page is always enabled: the insert is what the enable *is*.
 */
export const PageAddOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('page.add'),
    /** The canonical optional page after insert, complete, so Redo recreates the same record. */
    page: ProjectPageSchema,
  })
  .superRefine((operation, ctx) => {
    if (!isOptionalPageKind(operation.page.kind)) {
      ctx.addIssue({ code: 'custom', path: ['page', 'kind'], message: 'only an optional page is created by an enable' });
    }
    if (!operation.page.enabled) {
      ctx.addIssue({ code: 'custom', path: ['page', 'enabled'], message: 'a created page was enabled by the write that created it' });
    }
  });
export type PageAddOperation = z.infer<typeof PageAddOperationSchema>;

/**
 * `page.update`: one committed change of the boolean, and nothing else.
 *
 * `kind` is optional because it is redundant evidence rather than identity — the page id is the
 * subject — but carrying it lets a refusal sentence and an Activity line name the tab without a
 * repository read, and lets the executor notice a page whose kind is no longer the one recorded.
 *
 * The booleans must differ: a toggle set to where it already is records nothing at all, so a
 * payload with equal values would describe a write that did not happen.
 */
export const PageUpdateOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('page.update'),
    /** The root project whose history owns this action. */
    projectId: ProjectIdSchema,
    pageId: ProjectPageIdSchema,
    kind: OptionalProjectPageKindSchema.optional(),
    before: z.boolean(),
    after: z.boolean(),
  })
  .superRefine((operation, ctx) => {
    if (operation.before === operation.after) {
      ctx.addIssue({ code: 'custom', path: ['after'], message: 'a recorded toggle actually changed the boolean' });
    }
  });
export type PageUpdateOperation = z.infer<typeof PageUpdateOperationSchema>;

/** Every optional-page operation a history action can hold. */
export const PageUndoOperationSchema = z.discriminatedUnion('type', [PageAddOperationSchema, PageUpdateOperationSchema]);
export type PageUndoOperation = z.infer<typeof PageUndoOperationSchema>;

/**
 * Every page transition names its owning root, its subject and the tab that changed, so a caller
 * can reconcile navigation without re-reading the page list first.
 *
 * The canonical `page` record appears only when one exists afterwards. Undo of an add deletes the
 * record, and returning a snapshot of a deleted page would read as a claim that it is still
 * stored — the same rule `shortcut.add`'s Undo result follows.
 */
const pageResult = {
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
  kind: OptionalProjectPageKindSchema,
};

/** Undo of a first enable: the record is gone, so there is no page to return. */
export const PageAddUndoResultSchema = z.object({
  ...pageResult,
  operation: z.literal('page.add'),
  outcome: z.literal('removed'),
});
export type PageAddUndoResult = z.infer<typeof PageAddUndoResultSchema>;

/** Redo of a first enable: the same page id, enabled again. */
export const PageAddRedoResultSchema = z.object({
  ...pageResult,
  operation: z.literal('page.add'),
  outcome: z.literal('reapplied'),
  page: ProjectPageSchema,
});
export type PageAddRedoResult = z.infer<typeof PageAddRedoResultSchema>;

/** Either direction of a boolean change: the page as this direction left it, content untouched. */
const updateResult = <O extends string>(outcome: O) =>
  z.object({
    ...pageResult,
    operation: z.literal('page.update'),
    outcome: z.literal(outcome),
    page: ProjectPageSchema,
  });

export const PageUpdateUndoResultSchema = updateResult('restored');
export type PageUpdateUndoResult = z.infer<typeof PageUpdateUndoResultSchema>;
export const PageUpdateRedoResultSchema = updateResult('reapplied');
export type PageUpdateRedoResult = z.infer<typeof PageUpdateRedoResultSchema>;

/** The two page members of `UndoResultSchema`, in operation order. */
export const PAGE_UNDO_RESULT_SCHEMAS = [PageAddUndoResultSchema, PageUpdateUndoResultSchema] as const;

/** The two page members of `RedoResultSchema`, in the same order. */
export const PAGE_REDO_RESULT_SCHEMAS = [PageAddRedoResultSchema, PageUpdateRedoResultSchema] as const;
