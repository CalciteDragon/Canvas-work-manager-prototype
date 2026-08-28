import {
  ActivityQuerySchema,
  CreateProjectInputSchema,
  CreateReflectionInputSchema,
  CreateSectionInputSchema,
  CreateTaskInputSchema,
  MoveSectionInputSchema,
  ProjectIdSchema,
  ProjectQuerySchema,
  ReflectionIdSchema,
  SectionIdSchema,
  TaskIdSchema,
  TaskQuerySchema,
  UpdateProjectInputSchema,
  UpdateReflectionInputSchema,
  UpdateSectionInputSchema,
  UpdateTaskInputSchema,
} from '@cwm/contracts';
import type { ActivityService, ProgressService, ProjectService, ReflectionService, SectionService, TaskService, TimelineService } from '@cwm/domain';
import type { DataStore } from '@cwm/repositories';
import { resolveActor, resolveUser } from './context.ts';
import type { RouteRequest, RouteResult, RouteTable } from '../router.ts';

export interface ApiDependencies {
  store: DataStore;
  projects: ProjectService;
  tasks: TaskService;
  sections: SectionService;
  activity: ActivityService;
  progress: ProgressService;
  timeline: TimelineService;
  reflections: ReflectionService;
}

const ok = (body: unknown): RouteResult => ({ status: 200, contentType: 'application/json', body });
const created = (body: unknown): RouteResult => ({ status: 201, contentType: 'application/json', body });
/** A removed section has nothing left to describe, so the response carries no body. */
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
  const { store, projects, tasks, sections, activity, progress, timeline, reflections } = dependencies;
  const actorFor = (request: RouteRequest) => resolveActor(store.snapshot(), request);
  const projectId = (request: RouteRequest) => ProjectIdSchema.parse(request.params['id']);
  const taskId = (request: RouteRequest) => TaskIdSchema.parse(request.params['id']);
  const sectionId = (request: RouteRequest) => SectionIdSchema.parse(request.params['id']);
  const sectionProjectId = (request: RouteRequest) => ProjectIdSchema.parse(request.params['projectId']);
  const reflectionId = (request: RouteRequest) => ReflectionIdSchema.parse(request.params['id']);

  return {
    // §18's identity, composed rather than stored: there is no workspace repository, and
    // `resolveActor` above already reads the same snapshot.
    'GET /api/me': async (request) => {
      const document = store.snapshot();
      const user = resolveUser(document, request);
      const workspace = document.workspaces.find(({ id }) => id === user.workspaceId);
      // The store validates referential integrity at load, so a missing workspace here is
      // the host being broken rather than a caller mistake.
      if (workspace === undefined) throw new Error(`user "${user.id}" has no workspace`);
      return ok({ user, workspace });
    },

    'GET /api/projects': async (request) =>
      ok(
        await projects.list(
          actorFor(request),
          ProjectQuerySchema.parse(queryObject(request.query, ['status'])),
        ),
      ),

    'POST /api/projects': async (request) =>
      created(await projects.create(actorFor(request), CreateProjectInputSchema.parse(request.body))),

    'GET /api/projects/:id': async (request) => ok(await projects.get(actorFor(request), projectId(request))),

    'PATCH /api/projects/:id': async (request) =>
      ok(
        await projects.update(
          actorFor(request),
          projectId(request),
          UpdateProjectInputSchema.parse(request.body),
        ),
      ),

    'GET /api/projects/:id/progress': async (request) =>
      ok(await progress.calculate(actorFor(request), projectId(request))),

    'GET /api/projects/:id/timeline': async (request) =>
      ok(await timeline.derive(actorFor(request), projectId(request))),

    'GET /api/reflections': async (request) =>
      ok(await reflections.list(actorFor(request), ProjectIdSchema.parse(request.query.get('projectId')))),

    'POST /api/reflections': async (request) =>
      created(await reflections.create(actorFor(request), CreateReflectionInputSchema.parse(request.body))),

    'PATCH /api/reflections/:id': async (request) =>
      ok(
        await reflections.update(
          actorFor(request),
          reflectionId(request),
          UpdateReflectionInputSchema.parse(request.body),
        ),
      ),

    // §31's frame affordances. Sections are nested under their project on read and create
    // — a section only exists on one project's canvas — and addressed directly for the
    // rest, because the frame has the id and nothing else needs re-stating.
    'GET /api/projects/:projectId/sections': async (request) =>
      ok(await sections.list(actorFor(request), sectionProjectId(request))),

    'POST /api/projects/:projectId/sections': async (request) =>
      created(
        await sections.add(
          actorFor(request),
          sectionProjectId(request),
          CreateSectionInputSchema.parse(request.body),
        ),
      ),

    'PATCH /api/sections/:id': async (request) =>
      ok(
        await sections.update(
          actorFor(request),
          sectionId(request),
          UpdateSectionInputSchema.parse(request.body),
        ),
      ),

    // Reordering renumbers every sibling, so it is its own route rather than a `position`
    // field on PATCH — the response describes one section, but the write touched more.
    'POST /api/sections/:id/move': async (request) =>
      ok(
        await sections.move(
          actorFor(request),
          sectionId(request),
          MoveSectionInputSchema.parse(request.body).position,
        ),
      ),

    'POST /api/sections/:id/duplicate': async (request) =>
      created(await sections.duplicate(actorFor(request), sectionId(request))),

    'DELETE /api/sections/:id': async (request) => {
      await sections.remove(actorFor(request), sectionId(request));
      return noContent();
    },

    'GET /api/tasks': async (request) =>
      ok(
        await tasks.list(
          actorFor(request),
          TaskQuerySchema.parse(queryObject(request.query, ['status', 'priority'], [], ['includeArchived'])),
        ),
      ),

    'POST /api/tasks': async (request) =>
      created(await tasks.create(actorFor(request), CreateTaskInputSchema.parse(request.body))),

    'GET /api/tasks/:id': async (request) => ok(await tasks.get(actorFor(request), taskId(request))),

    'PATCH /api/tasks/:id': async (request) =>
      ok(await tasks.update(actorFor(request), taskId(request), UpdateTaskInputSchema.parse(request.body))),

    // No body: `curl -X POST` sends none, and there is nothing to say beyond the id.
    'POST /api/tasks/:id/complete': async (request) => ok(await tasks.complete(actorFor(request), taskId(request))),

    'POST /api/tasks/:id/archive': async (request) => ok(await tasks.archive(actorFor(request), taskId(request))),

    'GET /api/activity': async (request) =>
      ok(await activity.list(actorFor(request), ActivityQuerySchema.parse(queryObject(request.query, [], ['limit'])))),
  };
};
