import {
  CreateSectionInputSchema,
  ProjectIdSchema,
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
 * There is no archive or restore tool: §54 lists none, and an agent has no undo surface to
 * build one for. `list_sections` is live-only for the same reason — the agent's canvas is
 * the person's canvas.
 */
export const sectionTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_sections',
    description:
      'List a project’s canvas sections in the order they are laid out. Container sections (task-list, reflections) own the rows they render; view sections (progress, timeline, recent-activity, sub-projects) render data they do not own. Removed sections are archived rather than deleted and do not appear here.',
    permission: 'projects.read',
    inputSchema: z.object({ projectId: ProjectIdSchema }),
    execute: ({ projectId }, { actor, services }) => services.sections.list(actor, projectId),
  }),
  defineTool({
    name: 'create_section',
    description:
      'Add a section to the end of a project’s canvas, given a section type such as task-list, reflections, rich-text, progress or timeline.',
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
];
