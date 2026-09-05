import {
  CreateRootProjectInputSchema,
  CreateSubprojectInputSchema,
  ProjectIdSchema,
  ProjectQuerySchema,
  UpdateProjectInputSchema,
} from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/** §54's project tools. Every one of them goes through `ProjectService` (§8, §12). */
export const projectTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_projects',
    description:
      'List the projects in this workspace, optionally filtered by parent project, status, or a text search over names and descriptions.',
    permission: 'projects.read',
    // No `workspaceId`: `ProjectService.list` applies the actor's own workspace last, so
    // the field could only ever be ignored or wrong.
    inputSchema: ProjectQuerySchema.omit({ workspaceId: true }),
    execute: (input, { actor, services }) => services.projects.list(actor, input),
  }),
  defineTool({
    name: 'get_project',
    description:
      'Read one project by id, including its kind — "root" for a workspace, "subproject" for a unit of work — its status, target date, description, completion time and progress settings.',
    permission: 'projects.read',
    inputSchema: z.object({ projectId: ProjectIdSchema }),
    execute: ({ projectId }, { actor, services }) => services.projects.get(actor, projectId),
  }),
  defineTool({
    name: 'create_project',
    description:
      'Create a project in the connection owner’s workspace. Two kinds exist: kind "root" is a workspace and takes no parent — it starts with a Home page and can enable Todos, Archive and Reflections through set_project_page_enabled; kind "subproject" is a unit of work with exactly one work canvas and no pages to configure, and requires parentProjectId, which may itself be a sub-project at any depth. Neither kind converts into the other. A root naming a parent, or a sub-project without one, is rejected rather than reinterpreted.',
    permission: 'projects.write',
    // Each branch omits `workspaceId` separately: `.omit()` is an object operation and the
    // union has no single object to take it from. Rebuilding the union here rather than
    // widening the contract keeps the discriminator required, which is what stops an agent
    // creating the wrong kind of thing by leaving a field out.
    inputSchema: z.discriminatedUnion('kind', [
      CreateRootProjectInputSchema.omit({ workspaceId: true }),
      CreateSubprojectInputSchema.omit({ workspaceId: true }),
    ]),
    // The workspace is the actor's, injected rather than accepted. The service rejects a
    // foreign one anyway, and an agent has no way to know its own workspace id — asking it
    // for one would be asking it to guess.
    execute: (input, { actor, services }) =>
      services.projects.create(actor, { ...input, workspaceId: actor.workspaceId }),
  }),
  defineTool({
    name: 'update_project',
    description: 'Change a project’s name, description, icon, status, target date, layout or progress settings. Omitted fields are left alone; null clears one.',
    permission: 'projects.write',
    inputSchema: UpdateProjectInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...input }, { actor, services }) => services.projects.update(actor, projectId, input),
  }),
];
