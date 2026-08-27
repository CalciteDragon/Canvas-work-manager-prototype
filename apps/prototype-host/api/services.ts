import { ActivityService, PrototypeClock, PrototypeIdGenerator, ProjectService, TaskService } from '@cwm/domain';
import type { Persistence } from '../persistence/store.ts';
import { createApiRoutes, type ApiDependencies } from './routes.ts';

/**
 * Wires the domain once at startup. The host is the only place that knows a `Clock` is a
 * `PrototypeClock` reading real time — the services only see the interface (§45). Slice
 * 12's dev panel is what will make this clock settable from the UI.
 */
export const createApi = (persistence: Persistence): ApiDependencies => {
  const clock = new PrototypeClock(new Date());
  const ids = new PrototypeIdGenerator();
  const { store, projects, tasks, activities, unitOfWork } = persistence;
  const activity = new ActivityService({ activities, clock, ids });

  return {
    store,
    activity,
    projects: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
  };
};

export const createApiRouteTable = (persistence: Persistence) => createApiRoutes(createApi(persistence));
