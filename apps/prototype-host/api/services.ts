import { ActivityService, DashboardService, ProgressService, PrototypeAIProvider, PrototypeIdGenerator, ProjectService, ReflectionService, SectionService, SimulatedClock, TaskService, TimelineService } from '@cwm/domain';
import type { AIProvider } from '@cwm/domain';
import { RealAIProvider } from './real-ai-provider.ts';
import type { Persistence } from '../persistence/store.ts';
import { createApiRoutes, type ApiDependencies } from './routes.ts';

/**
 * Wires the domain once at startup. The host is the only place that knows the `Clock` is
 * a `SimulatedClock` — the services only see the interface (§45). Slice 12's dev panel is
 * what will expose its `setNow`, so a developer can sit the workspace on a Friday
 * afternoon or the day before a deadline.
 */
/**
 * §44's switch, read in exactly one place. Anything other than `real` is `mock`, so an
 * unset variable, a typo, and a fresh checkout all behave the same way: no API key, no
 * network, no cost (§43).
 */
export const aiProviderFor = (mode: string | undefined): AIProvider =>
  mode === 'real' ? new RealAIProvider() : new PrototypeAIProvider();

export const createApi = (persistence: Persistence): ApiDependencies => {
  const clock = new SimulatedClock();
  const ids = new PrototypeIdGenerator();
  const { store, projects, sections, tasks, milestones, reflections, activities, unitOfWork } = persistence;
  const activity = new ActivityService({ activities, clock, ids });
  const ai = aiProviderFor(process.env['PROTOTYPE_AI_PROVIDER']);

  return {
    store,
    activity,
    projects: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
    sections: new SectionService({ sections, projects, activity, clock, ids, unitOfWork }),
    progress: new ProgressService({ projects, tasks }),
    timeline: new TimelineService({ projects, tasks, milestones }),
    reflections: new ReflectionService({ reflections, projects, activity, clock, ids, unitOfWork }),
    dashboard: new DashboardService({ projects, tasks, clock, ai }),
  };
};

export const createApiRouteTable = (persistence: Persistence) => createApiRoutes(createApi(persistence));
