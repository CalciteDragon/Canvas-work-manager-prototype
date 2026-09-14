import {
  ActivityQuerySchema,
  AgentConnectionIdSchema,
  DashboardQuerySchema,
  CreateProjectInputSchema,
  CreateReflectionInputSchema,
  CreateSectionInputSchema,
  CreateSectionShortcutInputSchema,
  CreateTaskInputSchema,
  MoveSectionInputSchema,
  MoveSectionShortcutInputSchema,
  ReflectionQuerySchema,
  SectionQuerySchema,
  RemoveSectionInputSchema,
  ProjectIdSchema,
  ProjectPageKindSchema,
  ProjectQuerySchema,
  ReflectionIdSchema,
  SectionIdSchema,
  SectionShortcutIdSchema,
  SectionShortcutQuerySchema,
  ShortcutSourceQuerySchema,
  SetProjectPageEnabledInputSchema,
  TaskIdSchema,
  TaskQuerySchema,
  UpdateAgentPermissionsInputSchema,
  UpdateProjectInputSchema,
  UpdateReflectionInputSchema,
  UpdateSectionInputSchema,
  UpdateSectionShortcutInputSchema,
  UndoRecordIdSchema,
  UpdateTaskInputSchema,
} from '@cwm/contracts';
import type { ActivityService, AgentConnectionService, DashboardService, ProgressService, ProjectArchiveService, ProjectJournalService, ProjectPageService, ProjectService, ProjectTodosService, ReflectionService, SectionService, SectionShortcutService, TaskService, TimelineService, UndoService } from '@cwm/domain';
import type { DataStore } from '@cwm/repositories';
import { resolveActor, resolveIdentityUser } from './context.ts';
import type { PrototypeAgentAuthenticator } from '../auth/prototype-agent-authenticator.ts';
import type { RouteRequest, RouteResult, RouteTable } from '../router.ts';

export interface ApiDependencies {
  store: DataStore;
  projects: ProjectService;
  /** §26's pages, listed and toggled through their own routes below. */
  pages: ProjectPageService;
  tasks: TaskService;
  sections: SectionService;
  shortcuts: SectionShortcutService;
  activity: ActivityService;
  progress: ProgressService;
  timeline: TimelineService;
  /** §34's chronology. Its own service because it reads two categories and grants both (§54). */
  todos: ProjectTodosService;
  /** §31's whole-tree archive projection; it reads all three content categories. */
  archive: ProjectArchiveService;
  /** §36's root-wide reflection feed and completed-work picker. */
  journal: ProjectJournalService;
  reflections: ReflectionService;
  dashboard: DashboardService;
  agents: AgentConnectionService;
  /** Receipt-based Undo; its refusals ride the 409 envelope with `UndoRefusalDetails`. */
  undo: UndoService;
  /**
   * §51's bearer tokens. Optional so `createApiRouteTable` and the concurrency tests keep
   * their one-argument form — without it every request is a persona request, which is
   * exactly what those callers mean.
   */
  authenticator?: PrototypeAgentAuthenticator;
}

const ok = (body: unknown): RouteResult => ({ status: 200, contentType: 'application/json', body });
const created = (body: unknown): RouteResult => ({ status: 201, contentType: 'application/json', body });
/**
 * For the operations that answer nothing worth reading. Section removal is no longer one of them:
 * its DELETE answers 200 with the archived section and its Undo receipt.
 */
const noContent = (): RouteResult => ({ status: 204, contentType: 'application/json', body: undefined });

/**
 * Query strings are all strings, so the contract schemas need the shapes they expect:
 * `status=todo&status=done` and `status=todo,done` both mean the same two values, and a
 * numeric `limit` has to stop being a string before Zod sees it.
 */
const queryObject = (
  query: URLSearchParams,
  arrays: string[],
  numbers: string[] = [],
  booleans: string[] = [],
): Record<string, unknown> => {
  const parsed: Record<string, unknown> = {};
  for (const key of new Set(query.keys())) {
    const raw = query.getAll(key);
    // Comma-splitting is only for the enum-array filters. Applying it to every value
    // would silently truncate `?search=design,copy` to `design` — titles have commas.
    if (arrays.includes(key)) parsed[key] = raw.flatMap((value) => value.split(','));
    else if (numbers.includes(key)) parsed[key] = Number(raw[0]);
    else if (booleans.includes(key)) parsed[key] = raw[0] === 'true';
    else parsed[key] = raw[0];
  }
  return parsed;
};

/** The project in a shortcut route is already in the path; only its destination page travels. */
const shortcutPageQuery = (query: URLSearchParams): Record<string, unknown> => ({
  ...(query.get('pageId') === null ? {} : { pageId: query.get('pageId') }),
});

/**
 * §61's routes, plus three the slice earns: `POST /api/tasks/:id/complete` from the
 * slice's own build list, `GET /api/tasks/:id` and `POST /api/tasks/:id/archive` because
 * §9's `TaskGateway` pins both and the services already exist, and `GET /api/activity`
 * because §57's events are otherwise invisible without opening the JSON file.
 *
 * §61 calls these examples, not final production routes — their job is to exercise the
 * gateway boundary realistically.
 */
export const createApiRoutes = (dependencies: ApiDependencies): RouteTable => {
  const { store, projects, pages, tasks, sections, shortcuts, activity, progress, timeline, todos, archive, journal, reflections, dashboard, agents, undo, authenticator } =
    dependencies;
  // Async now: an agent request has to resolve its token against the live connection
  // before the handler runs, because that read is what carries the permission set (§51).
  const actorFor = (request: RouteRequest) => resolveActor(store.snapshot(), request, authenticator);
  const projectId = (request: RouteRequest) => ProjectIdSchema.parse(request.params['id']);
  const taskId = (request: RouteRequest) => TaskIdSchema.parse(request.params['id']);
  const sectionId = (request: RouteRequest) => SectionIdSchema.parse(request.params['id']);
  const shortcutId = (request: RouteRequest) => SectionShortcutIdSchema.parse(request.params['id']);
  const sectionProjectId = (request: RouteRequest) => ProjectIdSchema.parse(request.params['projectId']);
  const reflectionId = (request: RouteRequest) => ReflectionIdSchema.parse(request.params['id']);
  const connectionId = (request: RouteRequest) => AgentConnectionIdSchema.parse(request.params['id']);

  return {
    // §18's identity, composed rather than stored: there is no workspace repository, and
    // `resolveActor` above already reads the same snapshot.
    'GET /api/me': async (request) => {
      const document = store.snapshot();
      // Through the authenticator too: a token-only request must answer as the connection's
      // owner, not as `document.users[0]`.
      const user = await resolveIdentityUser(document, request, authenticator);
      const workspace = document.workspaces.find(({ id }) => id === user.workspaceId);
      // The store validates referential integrity at load, so a missing workspace here is
      // the host being broken rather than a caller mistake.
      if (workspace === undefined) throw new Error(`user "${user.id}" has no workspace`);
      return ok({ user, workspace });
    },

    'GET /api/projects': async (request) =>
      ok(
        await projects.list(
          await actorFor(request),
          ProjectQuerySchema.parse(queryObject(request.query, ['status'])),
        ),
      ),

    'POST /api/projects': async (request) =>
      created(await projects.create(await actorFor(request), CreateProjectInputSchema.parse(request.body))),

    'GET /api/projects/:id': async (request) => ok(await projects.get(await actorFor(request), projectId(request))),

    'PATCH /api/projects/:id': async (request) =>
      ok(
        await projects.update(
          await actorFor(request),
          projectId(request),
          UpdateProjectInputSchema.parse(request.body),
        ),
      ),

    // §26's pages. Nested under the project on both verbs: a page only exists as one
    // project's, and the toggle is addressed by *kind* rather than by page id because the
    // first enable is what creates the record — there is no id yet to name.
    'GET /api/projects/:projectId/pages': async (request) =>
      ok(await pages.list(await actorFor(request), sectionProjectId(request))),

    'PATCH /api/projects/:projectId/pages/:kind': async (request) =>
      ok(
        await pages.setEnabled(
          await actorFor(request),
          sectionProjectId(request),
          // The path wins: spread **first**, then the kind, or a body naming a different kind
          // would toggle a page other than the one addressed.
          SetProjectPageEnabledInputSchema.parse({
            ...(request.body as Record<string, unknown>),
            kind: ProjectPageKindSchema.parse(request.params['kind']),
          }),
        ),
      ),

    'GET /api/projects/:id/progress': async (request) =>
      ok(await progress.calculate(await actorFor(request), projectId(request))),

    'GET /api/projects/:id/timeline': async (request) =>
      ok(await timeline.derive(await actorFor(request), projectId(request))),

    // §34's Todos. The root is the path and nothing else: a projection that could be widened
    // from the query string would be a second way to say which tree it is about.
    'GET /api/projects/:id/todos': async (request) =>
      ok(await todos.derive(await actorFor(request), projectId(request))),

    // §31's Archive is a root-wide projection and remains readable when its optional page is
    // disabled or the root itself is archived.
    'GET /api/projects/:id/archive': async (request) =>
      ok(await archive.derive(await actorFor(request), projectId(request))),

    'GET /api/projects/:id/journal': async (request) =>
      ok(await journal.journal(await actorFor(request), projectId(request))),

    'GET /api/projects/:id/completed-work': async (request) =>
      ok(await journal.completedWork(await actorFor(request), projectId(request))),

    'GET /api/reflections': async (request) => {
      // A reflections section renders what it owns, so the list narrows to one container
      // when the caller names one. The project stays required: it is what scopes the read,
      // and it comes from the parsed query rather than the filters passed on, so a stray
      // `projectId` cannot travel inside the options object and restate the scope.
      const query = ReflectionQuerySchema.parse(queryObject(request.query, [], [], ['includeArchived']));
      return ok(
        await reflections.list(
          await actorFor(request),
          ProjectIdSchema.parse(request.query.get('projectId')),
          { sectionId: query.sectionId, includeArchived: query.includeArchived },
        ),
      );
    },

    'POST /api/reflections/:id/archive': async (request) =>
      ok(await reflections.archive(await actorFor(request), reflectionId(request))),

    'POST /api/reflections/:id/restore': async (request) =>
      ok(await reflections.restore(await actorFor(request), reflectionId(request))),

    'POST /api/reflections': async (request) =>
      created(await reflections.create(await actorFor(request), CreateReflectionInputSchema.parse(request.body))),

    'PATCH /api/reflections/:id': async (request) =>
      ok(
        await reflections.update(
          await actorFor(request),
          reflectionId(request),
          UpdateReflectionInputSchema.parse(request.body),
        ),
      ),

    // §31's frame affordances. Sections are nested under their project on read and create
    // — a section only exists on one project's canvas — and addressed directly for the
    // rest, because the frame has the id and nothing else needs re-stating.
    'GET /api/projects/:projectId/sections': async (request) => {
      // The root Archive projection is the one caller that asks for archived sections, and a page
      // read is the one that narrows to a canvas. Only those two are **forwarded**: the path
      // already fixed the project, and a query `projectId` must not redirect it.
      //
      // `includeArchived` is named in `queryObject`'s boolean list because `"true"` has to stop
      // being a string; `pageId` needs no coercion and rides the default branch. What matters
      // is the forwarded object below — a value parsed and then not forwarded is a filter the
      // caller sent and the answer silently ignored.
      const query = SectionQuerySchema.parse(queryObject(request.query, [], [], ['includeArchived']));
      return ok(
        await sections.list(await actorFor(request), sectionProjectId(request), {
          pageId: query.pageId,
          includeArchived: query.includeArchived,
        }),
      );
    },

    'POST /api/projects/:projectId/sections': async (request) =>
      created(
        await sections.add(
          await actorFor(request),
          sectionProjectId(request),
          CreateSectionInputSchema.parse(request.body),
        ),
      ),

    'PATCH /api/sections/:id': async (request) =>
      ok(
        await sections.update(
          await actorFor(request),
          sectionId(request),
          UpdateSectionInputSchema.parse(request.body),
        ),
      ),

    // Reordering renumbers every sibling, so it is its own route rather than a `position`
    // field on PATCH — the response describes one section, but the write touched more.
    'POST /api/sections/:id/move': async (request) =>
      ok(
        await sections.move(
          await actorFor(request),
          sectionId(request),
          MoveSectionInputSchema.parse(request.body).position,
        ),
      ),

    'POST /api/sections/:id/duplicate': async (request) =>
      created(await sections.duplicate(await actorFor(request), sectionId(request))),

    // Archive Restore for the DELETE below: durable, receipt-free and appended. Receipt-based Undo,
    // which returns a section between its old neighbours, is `POST /api/undo/:id`. A row that
    // came down with a section returns through either. Idempotent, so a retry cannot move the canvas.
    'POST /api/sections/:id/restore': async (request) =>
      ok(await sections.restoreSection(await actorFor(request), sectionId(request))),

    // The policy rides on the query string, not a body: a DELETE with a body is awkward
    // through `fetch` and every client here already builds query strings. Removing a
    // container that still holds **live** rows without one answers 409 naming the count,
    // which is what lets the canvas offer cascade or reassign rather than guess. Removing
    // a section that is already archived answers 409 too — the record still exists, so
    // this is a rule error rather than the 404 a hard delete used to give.
    //
    // A successful removal answers 200 with `SectionRemovalResult`: the archived section and the
    // Undo receipt for it. A refusal issues no receipt.
    'DELETE /api/sections/:id': async (request) =>
      ok(
        await sections.remove(
          await actorFor(request),
          sectionId(request),
          RemoveSectionInputSchema.parse(queryObject(request.query, [])),
        ),
      ),

    // Receipt-based Undo. Only the actor that made the operation finds its record (404
    // otherwise); consumed, expired, conflicting, blocked and unavailable are 409s whose
    // `details` parse as `UndoRefusalDetails`; a connection without `projects.write` is a 403.
    'POST /api/undo/:id': async (request) =>
      ok(await undo.undo(await actorFor(request), UndoRecordIdSchema.parse(request.params['id']))),

    // §27's layout-only references. The domain resolves source identity and availability;
    // these routes never read or return the source's row collection.
    'GET /api/projects/:projectId/shortcuts': async (request) =>
      ok(
        await shortcuts.list(
          await actorFor(request),
          sectionProjectId(request),
          SectionShortcutQuerySchema.parse(shortcutPageQuery(request.query)),
        ),
      ),

    'GET /api/projects/:projectId/shortcut-sources': async (request) =>
      ok(
        await shortcuts.listSources(
          await actorFor(request),
          sectionProjectId(request),
          ShortcutSourceQuerySchema.parse(shortcutPageQuery(request.query)),
        ),
      ),

    'POST /api/projects/:projectId/shortcuts': async (request) =>
      created(
        await shortcuts.create(
          await actorFor(request),
          sectionProjectId(request),
          CreateSectionShortcutInputSchema.parse(request.body),
        ),
      ),

    'PATCH /api/shortcuts/:id': async (request) =>
      ok(
        await shortcuts.update(
          await actorFor(request),
          shortcutId(request),
          UpdateSectionShortcutInputSchema.parse(request.body),
        ),
      ),

    'POST /api/shortcuts/:id/move': async (request) =>
      ok(
        await shortcuts.move(
          await actorFor(request),
          shortcutId(request),
          MoveSectionShortcutInputSchema.parse(request.body),
        ),
      ),

    'DELETE /api/shortcuts/:id': async (request) => {
      await shortcuts.remove(await actorFor(request), shortcutId(request));
      return noContent();
    },

    'GET /api/tasks': async (request) =>
      ok(
        await tasks.list(
          await actorFor(request),
          TaskQuerySchema.parse(queryObject(request.query, ['status', 'priority'], [], ['includeArchived'])),
        ),
      ),

    'POST /api/tasks': async (request) =>
      created(await tasks.create(await actorFor(request), CreateTaskInputSchema.parse(request.body))),

    'GET /api/tasks/:id': async (request) => ok(await tasks.get(await actorFor(request), taskId(request))),

    'PATCH /api/tasks/:id': async (request) =>
      ok(await tasks.update(await actorFor(request), taskId(request), UpdateTaskInputSchema.parse(request.body))),

    // No body: `curl -X POST` sends none, and there is nothing to say beyond the id.
    'POST /api/tasks/:id/complete': async (request) => ok(await tasks.complete(await actorFor(request), taskId(request))),

    'POST /api/tasks/:id/archive': async (request) => ok(await tasks.archive(await actorFor(request), taskId(request))),

    'POST /api/tasks/:id/restore': async (request) => ok(await tasks.restore(await actorFor(request), taskId(request))),

    // §24's dashboard is derived, not stored, so it is one read with two configurable
    // ranges rather than a widget-shaped endpoint per tile — the widgets overlap, and one
    // derivation over one clock reading is what keeps them agreeing with each other.
    'GET /api/dashboard': async (request) =>
      ok(
        await dashboard.load(
          await actorFor(request),
          DashboardQuerySchema.parse(queryObject(request.query, [], ['upcomingDays', 'recentDays'])),
        ),
      ),

    // §52's connections and §53's controls over them. Agent-actor calls are refused in the
    // domain, not here: a connection that could edit connections could grant itself the
    // permission it was just denied.
    'GET /api/agent-connections': async (request) => ok(await agents.list(await actorFor(request))),

    'PATCH /api/agent-connections/:id': async (request) =>
      ok(
        await agents.updatePermissions(
          await actorFor(request),
          connectionId(request),
          UpdateAgentPermissionsInputSchema.parse(request.body).permissions,
        ),
      ),

    // Its own route rather than a `revoked` field on PATCH: §53 draws it as a button apart
    // from the grid, and it is the one change the grid cannot express.
    'POST /api/agent-connections/:id/revoke': async (request) =>
      ok(await agents.revoke(await actorFor(request), connectionId(request))),

    'GET /api/activity': async (request) =>
      ok(await activity.list(await actorFor(request), ActivityQuerySchema.parse(queryObject(request.query, [], ['limit'])))),
  };
};
