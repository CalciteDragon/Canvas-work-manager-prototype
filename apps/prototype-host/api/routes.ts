import {
  ActivityQuerySchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  ProjectIdSchema,
  ProjectQuerySchema,
  TaskIdSchema,
  TaskQuerySchema,
  UpdateProjectInputSchema,
  UpdateTaskInputSchema,
} from '@cwm/contracts';
import type { ActivityService, ProjectService, TaskService } from '@cwm/domain';
import type { DataStore } from '@cwm/repositories';
import { resolveActor } from './context.ts';
import type { RouteRequest, RouteResult, RouteTable } from '../router.ts';

export interface ApiDependencies {
  store: DataStore;
  projects: ProjectService;
  tasks: TaskService;
  activity: ActivityService;
}

const ok = (body: unknown): RouteResult => ({ status: 200, contentType: 'application/json', body });
const created = (body: unknown): RouteResult => ({ status: 201, contentType: 'application/json', body });

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
  const { store, projects, tasks, activity } = dependencies;
  const actorFor = (request: RouteRequest) => resolveActor(store.snapshot(), request);
  const projectId = (request: RouteRequest) => ProjectIdSchema.parse(request.params['id']);
  const taskId = (request: RouteRequest) => TaskIdSchema.parse(request.params['id']);

  return {
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
