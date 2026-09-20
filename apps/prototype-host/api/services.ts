import { ActivityService, AgentConnectionService, DashboardService, OperationHistoryService, ProgressService, ProjectArchiveService, ProjectJournalService, ProjectTodosService, PrototypeAIProvider, PrototypeIdGenerator, ProjectPageService, ProjectService, ReflectionService, RepositoryOperationRecorder, SectionService, SectionShortcutService, SimulatedClock, TaskService, TimelineService, WorkspaceService } from '@cwm/domain';
import type { AIProvider } from '@cwm/domain';
import { PrototypeAgentAuthenticator } from '../auth/prototype-agent-authenticator.ts';
import { LiveEventHub } from '../events/hub.ts';
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
  /** §62's fan-out. Injected by tests that want to watch it; built here otherwise. */
  events?: LiveEventHub;
}

export interface HostServices extends ApiDependencies {
  /** Slice 15's MCP registry uses this; REST routes deliberately do not. */
  workspace: WorkspaceService;
  /** §62's stream, for `main.ts` to mount and for `/prototype/*` to broadcast on. */
  events: LiveEventHub;
}

export const createApi = (persistence: Persistence, options: CreateApiOptions = {}): HostServices => {
  const clock = options.clock ?? new SimulatedClock();
  const ids = new PrototypeIdGenerator();
  const { store, projects, pages, sections, shortcuts, tasks, milestones, reflections, activities, agents, users, operationHistories, operationActions } = persistence;

  // §62. The wrapped unit of work is built **locally** and handed to the services;
  // `persistence.unitOfWork` is left alone, because `PrototypeRuntime`'s seed swap runs
  // through it and announces itself from the route table instead.
  const events = options.events ?? new LiveEventHub();
  const unitOfWork = events.wrapUnitOfWork(persistence.unitOfWork);
  const activity = new ActivityService({ activities, projects, agents, users, tasks, milestones, reflections, clock, ids, events });
  const connections = new AgentConnectionService({ agents, activity, clock, unitOfWork });
  const ai = options.ai ?? aiProviderFor(process.env['PROTOTYPE_AI_PROVIDER']);

  // Built ahead of the table: task and reflection writes resolve their container through
  // it, so it has to exist before they do.
  // A section write records its history action in its own unit; the same hub-wrapped unit carries
  // each Undo/Redo transition, so both publish only their one activity frame, after commit.
  const history = new RepositoryOperationRecorder({ histories: operationHistories, actions: operationActions, clock, ids });
  const sectionService = new SectionService({ sections, shortcuts, pages, projects, tasks, reflections, activity, history, clock, ids, unitOfWork });
  const sectionShortcutService = new SectionShortcutService({ shortcuts, sections, pages, projects, activity, clock, ids, unitOfWork });

  return {
    store,
    events,
    activity,
    projects: new ProjectService({ projects, pages, activity, clock, ids, unitOfWork }),
    pages: new ProjectPageService({ pages, projects, activity, clock, ids, unitOfWork }),
    tasks: new TaskService({ tasks, projects, sections: sectionService, activity, history, clock, ids, unitOfWork }),
    sections: sectionService,
    shortcuts: sectionShortcutService,
    progress: new ProgressService({ projects, tasks }),
    timeline: new TimelineService({ projects, tasks, milestones }),
    todos: new ProjectTodosService({ projects, tasks, sections, pages }),
    archive: new ProjectArchiveService({ projects, pages, sections, tasks, reflections }),
    journal: new ProjectJournalService({ projects, pages, sections, tasks, reflections }),
    reflections: new ReflectionService({ reflections, projects, tasks, sections: sectionService, activity, history, clock, ids, unitOfWork }),
    dashboard: new DashboardService({ projects, tasks, activity, clock, ai }),
    workspace: new WorkspaceService({ projects, tasks, reflections, clock }),
    history: new OperationHistoryService({ histories: operationHistories, actions: operationActions, sections, shortcuts, pages, projects, tasks, reflections, activity, clock, unitOfWork }),
    agents: connections,
    // §51's tokens only work on localhost — `main.ts` binds to 127.0.0.1 for this reason.
    authenticator: new PrototypeAgentAuthenticator({ agents, users, connections }),
  };
};

export const createApiRouteTable = (persistence: Persistence) => createApiRoutes(createApi(persistence));
