import { DashboardQuerySchema, SearchWorkspaceQuerySchema, UpcomingWorkQuerySchema } from '@cwm/contracts';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * §54's three workspace-wide reads, all backed by `workspace.read`.
 *
 * That grant is a **superset**: what comes back includes project and task content in
 * aggregate, and — since this slice — reflection titles too. §53's grid labels it honestly
 * rather than implying it is narrower than it is.
 */
export const workspaceTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'search_workspace',
    description:
      'Search projects, tasks and reflections at once by a text fragment. Returns one ranked-by-kind list of hits, each saying which project it belongs to.',
    permission: 'workspace.read',
    inputSchema: SearchWorkspaceQuerySchema,
    execute: (input, { actor, services }) => services.workspace.search(actor, input),
  }),
  defineTool({
    name: 'get_upcoming_work',
    description:
      'What is due soon: overdue tasks, and tasks due within the next few calendar days including today. Use this to answer “what should be worked on next?”.',
    permission: 'workspace.read',
    inputSchema: UpcomingWorkQuerySchema,
    execute: (input, { actor, services }) => services.workspace.upcomingWork(actor, input),
  }),
  defineTool({
    name: 'get_dashboard_context',
    description:
      'The whole daily picture: today’s and overdue work, what is in progress, upcoming tasks, active projects, recent progress, and the daily digest.',
    permission: 'workspace.read',
    inputSchema: DashboardQuerySchema,
    execute: (input, { actor, services }) => services.dashboard.load(actor, input),
  }),
];
