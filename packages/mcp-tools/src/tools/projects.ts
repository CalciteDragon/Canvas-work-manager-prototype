import {
  CreateRootProjectInputSchema,
  CreateSubprojectInputSchema,
  ProjectIdSchema,
  ProjectQuerySchema,
  RestoreProjectInputSchema,
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
    name: 'list_archived_projects',
    description: 'List archived root projects and workstreams in this workspace whose ancestors are live and which can be restored now. Requires projects.read. Restore with an explicit non-archived status using restore_project. cascadeCount, when present, is how many workstreams were archived with that project and come back with it; they are not listed themselves. A descendant archived separately appears after its parent returns.',
    permission: 'projects.read',
    inputSchema: z.object({}),
    execute: (_input, { actor, services }) => services.archivedProjects.list(actor),
  }),
  defineTool({
    name: 'get_project',
    description:
      'Read one project by id, including its kind — kind "root" is a workspace, kind "subproject" is a workstream — its status, target date, description, completion time and progress settings.',
    permission: 'projects.read',
    inputSchema: z.object({ projectId: ProjectIdSchema }),
    execute: ({ projectId }, { actor, services }) => services.projects.get(actor, projectId),
  }),
  defineTool({
    name: 'create_project',
    description:
      'Create a project in the connection owner’s workspace. Answers { project, operation }; operation is the project.add receipt in the new project’s own history. Two kinds exist: kind "root" is a workspace and takes no parent — it starts with a Home page and can enable Todos, Archive and Reflections through set_project_page_enabled; kind "subproject" is a workstream with exactly one work canvas and no pages to configure, and requires parentProjectId, which may itself be a workstream at any depth. Neither kind converts into the other. A root naming a parent, or a workstream without one, is rejected rather than reinterpreted.',
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
    description:
      'Change a project’s name, description, icon, status, target date, parent (a workstream only), layout or progress settings. Omitted fields are left alone; null clears one. When the status enters archived, a project with live workstreams needs archiveWorkstreamIds, naming every one of them, as archive_project describes; the input is refused on any other write. Answers { project, operation, cascaded? }: operation is a receipt for one undoable action in this project’s own history — project.archive when the status entered archived, project.reactivate when it left it, project.update otherwise — or null when nothing changed; cascaded is the workstreams that moved with it, absent when none. A workstream archived with its owner cannot change status or parent until the owner is restored. Reverse it through undo_operation with projects.write.',
    permission: 'projects.write',
    inputSchema: UpdateProjectInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...input }, { actor, services }) => services.projects.update(actor, projectId, input),
  }),
  defineTool({
    name: 'archive_project',
    description:
      'Archive a project. This is reversible and hides the project and its descendants from ordinary live reads. A project with live workstreams, at any depth, refuses unless archiveWorkstreamIds names every one of them exactly; the refusal lists each name and id, so a second call can name them deliberately. Those workstreams are then archived with it, as one undoable step, and come back when it is restored. Work archived separately is not named and stays as it is. Answers { project, operation, cascaded? }: a project.archive receipt, or null when the project was already archived, and the workstreams archived with it, absent when none. undo_operation can reverse it while the project is still archived.',
    permission: 'projects.write',
    inputSchema: z.object({ projectId: ProjectIdSchema, archiveWorkstreamIds: z.array(ProjectIdSchema).optional() }),
    execute: ({ projectId, archiveWorkstreamIds }, { actor, services }) =>
      services.projects.archive(actor, projectId, archiveWorkstreamIds === undefined ? {} : { archiveWorkstreamIds }),
  }),
  defineTool({
    name: 'restore_project',
    description:
      'Restore an archived project with the explicit non-archived status supplied by the caller. Restoration never guesses the project’s prior status. Workstreams archived with it come back too, each at the status it recorded, not the one supplied here; a descendant archived separately stays archived. Answers { project, operation, cascaded? }: a project.reactivate receipt when the project left archived, a project.update receipt if it was not archived and only its status changed, or null when it already had that status, and the workstreams that came back, absent when none. It needs no receipt to call, however long ago the project was archived.',
    permission: 'projects.write',
    inputSchema: RestoreProjectInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, status }, { actor, services }) => services.projects.update(actor, projectId, { status }),
  }),
];
