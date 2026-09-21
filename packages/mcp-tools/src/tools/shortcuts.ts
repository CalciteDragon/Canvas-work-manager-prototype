import {
  CreateSectionShortcutInputSchema,
  ProjectIdSchema,
  SectionShortcutIdSchema,
  SectionShortcutQuerySchema,
} from '@cwm/contracts';
import { defineTool, type WorkManagerTool } from '../tool';
import { z } from 'zod';

/** §27's reference placements. The source remains canonical; these tools never copy rows. */
export const shortcutTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_section_shortcuts',
    description:
      'List the section references placed on a root project’s Home page, in their combined canvas order. Each result identifies the canonical source project, page, section and breadcrumb, plus whether the source is available, archived or hidden by an archived project. A shortcut is a reference, not a copy: this read returns no source rows, and reading tasks still requires tasks.read.',
    permission: 'projects.read',
    inputSchema: SectionShortcutQuerySchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...query }, { actor, services }) => services.shortcuts.list(actor, projectId, query),
  }),
  defineTool({
    name: 'add_section_shortcut',
    description:
      'Place a read-only reference to a canonical section on a root project’s Home page at the optional zero-based position in the combined section and shortcut order. Clamp positions past the end; if omitted, append. The source must be another page in the same root tree or a sub-project at any depth, and the placement stores only source identity and local layout. No task or reflection rows are copied, and the source’s grants are not widened. The result is { shortcut, operation }, where operation is the receipt undo_operation accepts for 24 hours; it is recorded in the destination root project’s history, never the source project’s.',
    permission: 'projects.write',
    inputSchema: CreateSectionShortcutInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...input }, { actor, services }) => services.shortcuts.create(actor, projectId, input),
  }),
  defineTool({
    name: 'remove_section_shortcut',
    description:
      'Remove a section reference from its destination Home page. This deletes only the layout placement; the canonical source section and every row it owns remain unchanged. The result is { shortcutId, projectId, pageId, operation }: there is no placement left to return, and operation is the receipt undo_operation accepts to put the same placement back between the same neighbours.',
    permission: 'projects.write',
    inputSchema: z.object({ shortcutId: SectionShortcutIdSchema }),
    execute: ({ shortcutId }, { actor, services }) => services.shortcuts.remove(actor, shortcutId),
  }),
];
