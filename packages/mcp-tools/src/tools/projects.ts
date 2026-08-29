import { CreateProjectInputSchema, ProjectIdSchema, ProjectQuerySchema, UpdateProjectInputSchema } from '@cwm/contracts';
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
    description: 'Read one project by id, including its status, target date, description and progress settings.',
    permission: 'projects.read',
    inputSchema: z.object({ projectId: ProjectIdSchema }),
    execute: ({ projectId }, { actor, services }) => services.projects.get(actor, projectId),
  }),
  defineTool({
    name: 'create_project',
    description: 'Create a project. It is created in the connection owner’s workspace; sub-projects are made by naming a parent.',
    permission: 'projects.write',
    inputSchema: CreateProjectInputSchema.omit({ workspaceId: true }),
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
