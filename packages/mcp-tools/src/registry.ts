import type { ActorContext } from '@cwm/domain';
import { UnknownToolError } from './errors';
import type { WorkManagerServices, WorkManagerTool } from './tool';
import { projectPageTools } from './tools/project-pages';
import { projectTools } from './tools/projects';
import { reflectionTools } from './tools/reflections';
import { sectionTools } from './tools/sections';
import { shortcutTools } from './tools/shortcuts';
import { taskTools } from './tools/tasks';
import { undoTools } from './tools/undo';
import { workspaceTools } from './tools/workspace';

/**
 * §54's tool set, in the registry's stable order. §54 names the shortcut tools without
 * ordering them, so their position here is this slice's choice. Exported so Slice 15's
 * `tools/list` test can assert the protocol response against the same list this registry test
 * asserts — one source of truth for "which tools exist", across a transport boundary that does
 * not exist yet.
 */
export const SPEC_TOOL_NAMES = [
  'list_projects',
  'get_project',
  'create_project',
  'update_project',
  'archive_project',
  'restore_project',
  'list_project_pages',
  'set_project_page_enabled',
  'get_project_todos',
  'get_project_archive',
  'get_project_journal',
  'list_tasks',
  'get_task',
  'create_task',
  'update_task',
  'complete_task',
  'archive_task',
  'restore_task',
  'list_reflections',
  'add_reflection',
  'archive_reflection',
  'restore_reflection',
  'list_sections',
  'create_section',
  'update_section',
  'remove_section',
  'restore_section',
  'undo_operation',
  'list_section_shortcuts',
  'add_section_shortcut',
  'remove_section_shortcut',
  'search_workspace',
  'get_upcoming_work',
  'get_dashboard_context',
] as const;

export interface ToolRegistry {
  list(): readonly WorkManagerTool[];
  find(name: string): WorkManagerTool | undefined;
  /** Validates the input against the tool's schema, then runs it. Errors propagate unmapped. */
  call(name: string, input: unknown, actor: ActorContext): Promise<unknown>;
}

/**
 * §55's registry, and the whole of this slice's public surface.
 *
 * **It knows nothing about MCP.** No protocol version, no SDK, no transport — which is what
 * lets Slice 15 change the plumbing without touching a tool, and what lets these tools be
 * tested in-process (§60) with no socket.
 *
 * **It does not check permissions.** Each tool *declares* the grant it needs, for
 * `tools/list` and for a human reading the file, but the throw comes from `assertPermitted`
 * inside the domain service — the same check the web API goes through (§53). A second check
 * here would be a second source of truth, and the first one to drift would be the one no
 * test covers. `contract.test.ts` pins the declaration to the enforcement from both sides
 * instead.
 */
export const createToolRegistry = (services: WorkManagerServices): ToolRegistry => {
  const tools: readonly WorkManagerTool[] = [
    ...projectTools,
    ...projectPageTools,
    ...taskTools,
    ...reflectionTools,
    ...sectionTools,
    ...undoTools,
    ...shortcutTools,
    ...workspaceTools,
  ];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    list: () => tools,
    find: (name) => byName.get(name),
    call: async (name, input, actor) => {
      const tool = byName.get(name);
      if (tool === undefined) throw new UnknownToolError(name);
      // A `ZodError` from here is the caller's mistake and travels unchanged: Slice 15's
      // transport is where an error becomes a status, exactly as `api/errors.ts` is for HTTP.
      return tool.execute(tool.inputSchema.parse(input), { actor, services });
    },
  };
};
