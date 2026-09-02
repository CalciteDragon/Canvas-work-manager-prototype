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
 * Removal takes a policy rather than a confirmation: a container owns its rows, so the
 * service refuses to guess between archiving them and moving them elsewhere.
 */
export const sectionTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_sections',
    description:
      'List a project’s canvas sections in the order they are laid out. Container sections (task-list, reflections) own the rows they render; view sections (progress, timeline, recent-activity, sub-projects) render data they do not own.',
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
      'Remove a section. A view section takes nothing with it. A container still holding rows needs a policy: "cascade" archives them, or "reassign" moves them to another container of the same type named by reassignToSectionId.',
    permission: 'projects.write',
    inputSchema: RemoveSectionInputSchema.extend({ sectionId: SectionIdSchema }),
    execute: async ({ sectionId, ...input }, { actor, services }) => {
      await services.sections.remove(actor, sectionId, input);
      // The section is gone, so there is nothing to echo; the id is what the caller can act on.
      return { removed: sectionId };
    },
  }),
];
