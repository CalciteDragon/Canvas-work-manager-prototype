import {
  CreateSectionInputSchema,
  ProjectIdSchema,
  SectionQuerySchema,
  RemoveSectionInputSchema,
  SectionIdSchema,
  MoveSectionInputSchema,
  UpdateSectionInputSchema,
} from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * Section tools (§29, §31), under `projects.write` — the grant that already governs the
 * canvas. Without them an agent can write all three layers' worth of data and none of the
 * layout, which is the gap docs/decisions/2026-09-sections-own-their-data.md closes.
 *
 * Removal can delete disposable views and empty containers, while content-bearing sections
 * stay recoverable in Archive. A container still holding live rows takes a policy rather than
 * a confirmation: it owns them, so the service refuses to guess between archiving them with it
 * and moving them elsewhere first.
 *
 * Archive and restore are separate canonical operations so an agent can undo the same
 * operation the person sees in Archive. `list_sections` remains live-only — the agent's
 * canvas is the person's canvas.
 */
export const sectionTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_sections',
    description:
      'List a project’s canvas sections in the order they are laid out, grouped by the page each sits on. Name a pageId to read one page. Container sections (task-list, reflections) own the rows they render; view sections (progress, timeline, recent-activity, sub-projects) render data they do not own. Removed sections do not appear here; content-bearing sections remain recoverable in Archive, while disposable views may be deleted.',
    permission: 'projects.read',
    inputSchema: SectionQuerySchema.pick({ pageId: true }).extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...query }, { actor, services }) => services.sections.list(actor, projectId, query),
  }),
  defineTool({
    name: 'create_section',
    description:
      'Add a section at the optional zero-based position in the page’s combined section and shortcut order. Clamp positions past the end; if omitted, append. Give a section type such as task-list, reflections, rich-text, progress or timeline. Without a pageId it lands on the project’s canonical canvas — a root’s Home, a sub-project’s sole work canvas. With one, it lands there, provided that page holds that kind of section: Home and a work canvas take every type, a Reflections page takes only a reflections container, and Todos and Archive hold none because they project rows they do not own. A disabled page takes nothing new. The result is { section, undo }, where undo is a receipt for undo_operation and section is the created section.',
    permission: 'projects.write',
    inputSchema: CreateSectionInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...input }, { actor, services }) => services.sections.add(actor, projectId, input),
  }),
  defineTool({
    name: 'move_section',
    description:
      'Move a live section to a zero-based position in its page’s combined section and shortcut order. Positions past the end clamp to the end; a true no-op returns the current section with undo: null. A completed move returns { section, undo }, where undo is a receipt for undo_operation and restores the section between the recorded neighbours if they still survive.',
    permission: 'projects.write',
    inputSchema: MoveSectionInputSchema.extend({ sectionId: SectionIdSchema }),
    execute: ({ sectionId, position }, { actor, services }) => services.sections.move(actor, sectionId, position),
  }),
  defineTool({
    name: 'update_section',
    description:
      'Change a section’s frame title, width, collapsed state or config. Omitted fields are left alone; a null title falls back to the type’s default. A changed write returns { section, undo }, where undo is a receipt for undo_operation; an unchanged write returns undo: null.',
    permission: 'projects.write',
    inputSchema: UpdateSectionInputSchema.extend({ sectionId: SectionIdSchema }),
    execute: ({ sectionId, ...input }, { actor, services }) => services.sections.update(actor, sectionId, input),
  }),
  defineTool({
    name: 'remove_section',
    description:
      'Remove a section from a project’s canvas. Disposable views, empty containers and empty rich-text sections are deleted; sections that hold content remain recoverable in Archive. A container still holding live rows needs a policy: "cascade" archives those rows with the section, or "reassign" moves them to another live container of the same type named by reassignToSectionId. A view, an empty container, and a container holding only archived rows need no policy. The result is { section, undo }: section is the final archived-shaped removal result, even when the stored section was deleted; undo is a receipt whose undoId undo_operation accepts for 24 hours, restoring the section between the same neighbours and restoring exactly the rows this removal changed. If a removal response is lost, repeat remove_section on the same section from the same connection to recover its outstanding undoId and expiresAt; the repeat does not write again.',
    permission: 'projects.write',
    inputSchema: RemoveSectionInputSchema.extend({ sectionId: SectionIdSchema }),
    // The final archived-shaped result and Undo receipt, so the agent can hold the `undoId`
    // rather than infer it. Returned directly by the service: a second `get` would
    // demand `projects.read`, which this tool does not require.
    execute: ({ sectionId, ...input }, { actor, services }) => services.sections.remove(actor, sectionId, input),
  }),
  defineTool({
    name: 'restore_section',
    description:
      'Restore an archived section with the tasks or reflections that were archived with it. The operation is refused when the owning project is archived, and it never revives rows archived independently.',
    permission: 'projects.write',
    inputSchema: z.object({ sectionId: SectionIdSchema }),
    execute: ({ sectionId }, { actor, services }) => services.sections.restoreSection(actor, sectionId),
  }),
];
