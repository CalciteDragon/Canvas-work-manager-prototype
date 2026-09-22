import { ProjectArchiveQuerySchema, ProjectJournalQuerySchema, ProjectTodosQuerySchema, SetProjectPageEnabledInputSchema, ProjectIdSchema } from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * §54's page surface: *"Pages get their own small surface — listing a root's pages, toggling an
 * optional one, and querying the derived Todos, Archive and Reflections projections."*
 *
 * The page reads here. Archive and Reflections are projections of rows rather than page-owned
 * canvases, so they remain queryable even when their optional pages are disabled.
 *
 * `get_project_todos` is the first tool that needs the read-permission composition §54 describes
 * — "a derived page that combines categories requires the grant for each category it returns,
 * and denies rather than returning a partial answer" — so it declares `tasks.read` beside
 * `projects.read` and the domain refuses outright without either.
 *
 * They live in their own file rather than in `projects.ts` because the capability distinction is
 * the point: a page is a property of a **root**, and a sub-project has none. An agent reading
 * `create_project`'s two branches and then this file learns that in the order it needs it.
 *
 * Under the same `projects.read`/`projects.write` grants as the canvas: §53's grid has no
 * "layout" permission separate from "project", and inventing one here would be a second
 * permission model for the same thing.
 */
export const projectPageTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_project_pages',
    description:
      'List the pages a project owns. A root project has Home — always present, always enabled — plus whichever of Todos, Archive and Reflections have been turned on, each with its enabled state; a disabled page keeps everything on it and is simply not navigation. A sub-project has exactly one work canvas, which is not a tab and cannot be configured.',
    permission: 'projects.read',
    inputSchema: z.object({ projectId: ProjectIdSchema }),
    execute: ({ projectId }, { actor, services }) => services.pages.list(actor, projectId),
  }),
  defineTool({
    name: 'set_project_page_enabled',
    description:
      'Turn one of a root project’s optional pages — todos, archive or reflections — on or off. Enabling a page for the first time creates it; disabling one is nondestructive, keeping its sections, their layout and every reference to it, and changes only whether it is navigation. Home cannot be disabled, and a sub-project has no pages to configure. Answers the confirmed page and an operation receipt: the first enable records page.add, whose Undo removes that page again — only while it is unchanged and nothing on it references it — and whose Redo brings the same page id back; a later change of the switch records page.update, which reverses the switch alone. A call that asks for the state the page is already in changes nothing and answers a null receipt. Reverse either through undo_operation with projects.write; a toggle still works while the project is archived, but reversing one through history does not.',
    permission: 'projects.write',
    inputSchema: SetProjectPageEnabledInputSchema.extend({ projectId: ProjectIdSchema }),
    execute: ({ projectId, ...input }, { actor, services }) => services.pages.setEnabled(actor, projectId, input),
  }),
  defineTool({
    name: 'get_project_todos',
    description:
      'The chronology of everything under one root project: its own tasks plus every descendant unit of work and every descendant task, ordered by due date, undated last, ties broken by kind then id. A unit of work’s date-only due date sorts at the end of that UTC day. Rows keep their status and stay on the list once finished — done and cancelled alike — while archived rows, archived containers and anything beneath an archived project are excluded. Each row carries the canonical project, page and container that owns it, so completing it there and completing it here are the same operation. Reading it needs both projects.read and tasks.read, and is refused rather than answered in part; it neither creates the Todos page nor depends on it being switched on.',
    permission: 'projects.read',
    additionalPermissions: ['tasks.read'],
    inputSchema: ProjectTodosQuerySchema,
    execute: ({ projectId }, { actor, services }) => services.todos.derive(actor, projectId),
  }),
  defineTool({
    name: 'get_project_archive',
    description:
      'Read every archived row and every live row hidden beneath an archived project in one root project: sub-projects, sections, tasks and reflections, with the page and container each came from, why it is present, and whether the canonical restore operation is ready or blocked. Sections are listed only when they hold something to recover — rows still assigned to a Task List or Reflections container (owned-content, with contentCount of all its rows, cascadeCount of exactly the rows restore_section brings back, and separateRestoreCount of the restore_task or restore_reflection calls its other archived rows still need — subtasks return with their parent), Rich Text prose (config), or a type or config it cannot read as empty (unknown); removed Progress, Timeline, Recent Activity and Sub-Projects views, blank or unconfigured Rich Text, and emptied containers stay retained but unlisted. An archived container (restoration ready or blocked) with separateRestoreCount above 0 is the first step for those rows: restore_section, then restore each row entry that becomes ready. A live container hidden beneath an archived project (restoration not-archived) needs no restore — reactivate the project its blocker names. It reads projects, tasks and reflections together and refuses rather than returning a partial answer. It does not depend on the Archive page being enabled.',
    permission: 'projects.read',
    additionalPermissions: ['tasks.read', 'reflections.read'],
    inputSchema: ProjectArchiveQuerySchema,
    execute: ({ projectId }, { actor, services }) => services.archive.derive(actor, projectId),
  }),
  defineTool({
    name: 'get_project_journal',
    description:
      'Read the Reflections journal for one root project: reflections from its Home, its Reflections page container and every descendant work canvas, newest first. Each entry keeps its canonical owner and, when linked, the current status of the completed task or sub-project it is about; subjectless journal entries remain ordinary entries. It reads projects, tasks and reflections together and refuses rather than returning a partial answer. It does not depend on the Reflections page being enabled. Use the completed-work picker in the app to choose an eligible subject; this tool writes a reflection through add_reflection.',
    permission: 'projects.read',
    additionalPermissions: ['tasks.read', 'reflections.read'],
    inputSchema: ProjectJournalQuerySchema,
    execute: ({ projectId }, { actor, services }) => services.journal.journal(actor, projectId),
  }),
];
