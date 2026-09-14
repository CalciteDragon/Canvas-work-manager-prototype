import {
  CreateSectionInputSchema,
  ProjectIdSchema,
  SectionQuerySchema,
  RemoveSectionInputSchema,
  SectionIdSchema,
  UpdateSectionInputSchema,
} from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * Section tools (§29, §31), under `projects.write` — the grant that already governs the
 * canvas. Without them an agent can write all three layers' worth of data and none of the
 * layout, which is the gap docs/decisions/2026-09-sections-own-their-data.md closes.
 *
 * Removal archives rather than deletes, so it is undoable. A container still holding live
 * rows takes a policy rather than a confirmation: it owns them, so the service refuses to
 * guess between archiving them with it and moving them elsewhere first.
 *
 * Archive and restore are separate canonical operations so an agent can undo the same
 * operation the person sees in Archive. `list_sections` remains live-only — the agent's
 * canvas is the person's canvas.
 */
export const sectionTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_sections',
    description:
      'List a project’s canvas sections in the order they are laid out, grouped by the page each sits on. Name a pageId to read one page. Container sections (task-list, reflections) own the rows they render; view sections (progress, timeline, recent-activity, sub-projects) render data they do not own. Removed sections are archived rather than deleted and do not appear here.',
    permission: 'projects.read',
    inputSchema: SectionQuerySchema.pick({ pageId: true }).extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...query }, { actor, services }) => services.sections.list(actor, projectId, query),
  }),
  defineTool({
    name: 'create_section',
    description:
      'Add a section at the optional zero-based position in the page’s combined section and shortcut order. Clamp positions past the end; if omitted, append. Give a section type such as task-list, reflections, rich-text, progress or timeline. Without a pageId it lands on the project’s canonical canvas — a root’s Home, a sub-project’s sole work canvas. With one, it lands there, provided that page holds that kind of section: Home and a work canvas take every type, a Reflections page takes only a reflections container, and Todos and Archive hold none because they project rows they do not own. A disabled page takes nothing new.',
    permission: 'projects.write',
    inputSchema: CreateSectionInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...input }, { actor, services }) => services.sections.add(actor, projectId, input),
  }),
  defineTool({
    name: 'update_section',
    description:
      'Change a section’s frame title, width, collapsed state or config. Omitted fields are left alone; a null title falls back to the type’s default.',
    permission: 'projects.write',
    inputSchema: UpdateSectionInputSchema.extend({ sectionId: SectionIdSchema }),
    execute: ({ sectionId, ...input }, { actor, services }) => services.sections.update(actor, sectionId, input),
  }),
  defineTool({
    name: 'remove_section',
    description:
      'Remove a section from a project’s canvas. This archives the section rather than deleting it, so it can be restored with everything it took down. A container still holding live rows needs a policy: "cascade" archives those rows with the section, or "reassign" moves them to another live container of the same type named by reassignToSectionId. A view, an empty container, and a container holding only archived rows need no policy. Removing a section that is already archived is refused.',
    permission: 'projects.write',
    inputSchema: RemoveSectionInputSchema.extend({ sectionId: SectionIdSchema }),
    // The archived section itself, so the agent can see `archivedAt` and know the operation
    // is undoable rather than inferring it from a bare id. Returned directly by the service:
    // a second `get` would demand `projects.read`, which this tool does not require.
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
