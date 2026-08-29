import { ActivityService, AgentConnectionService, DashboardService, ProgressService, PrototypeAIProvider, PrototypeIdGenerator, ProjectService, ReflectionService, SectionService, SimulatedClock, TaskService, TimelineService } from '@cwm/domain';
import type { AIProvider } from '@cwm/domain';
import { PrototypeAgentAuthenticator } from '../auth/prototype-agent-authenticator.ts';
import { RealAIProvider } from './real-ai-provider.ts';
import type { Persistence } from '../persistence/store.ts';
import { createApiRoutes, type ApiDependencies } from './routes.ts';

/**
 * §44's switch, read in exactly one place. Anything other than `real` is `mock`, so an
 * unset variable, a typo, and a fresh checkout all behave the same way: no API key, no
 * network, no cost (§43).
 */
export const aiProviderFor = (mode: string | undefined): AIProvider =>
  mode === 'real' ? new RealAIProvider() : new PrototypeAIProvider();

/**
 * Wires the domain once at startup. The host is the only place that knows the `Clock` is
 * a `SimulatedClock` — the services only see the interface (§45).
 *
 * `options` is how Slice 12's development panel reaches in: `main.ts` passes the very
 * `SimulatedClock` and `SwitchableAIProvider` instances the services are wired with, so
 * moving the date or swapping the provider takes effect on the next request with nothing
 * re-created. Both default, so every other caller — `createApiRouteTable` below, and
 * `concurrency.test.ts` — is unchanged.
 */
export interface CreateApiOptions {
  clock?: SimulatedClock;
  ai?: AIProvider;
}

export const createApi = (persistence: Persistence, options: CreateApiOptions = {}): ApiDependencies => {
  const clock = options.clock ?? new SimulatedClock();
  const ids = new PrototypeIdGenerator();
  const { store, projects, sections, tasks, milestones, reflections, activities, agents, users, unitOfWork } =
    persistence;
  const activity = new ActivityService({ activities, projects, agents, users, tasks, milestones, reflections, clock, ids });
  const connections = new AgentConnectionService({ agents, activity, clock, unitOfWork });
  const ai = options.ai ?? aiProviderFor(process.env['PROTOTYPE_AI_PROVIDER']);

  return {
    store,
    activity,
    projects: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
    sections: new SectionService({ sections, projects, activity, clock, ids, unitOfWork }),
    progress: new ProgressService({ projects, tasks }),
    timeline: new TimelineService({ projects, tasks, milestones }),
    reflections: new ReflectionService({ reflections, projects, activity, clock, ids, unitOfWork }),
    dashboard: new DashboardService({ projects, tasks, activity, clock, ai }),
    agents: connections,
    // §51's tokens only work on localhost — `main.ts` binds to 127.0.0.1 for this reason.
    authenticator: new PrototypeAgentAuthenticator({ agents, users, connections }),
  };
};

export const createApiRouteTable = (persistence: Persistence) => createApiRoutes(createApi(persistence));
