import { PrototypeDocumentSchema, SCHEMA_VERSION, type AgentConnection, type AgentConnectionId, type AgentPermission, type Project, type ProjectId, type ProjectSection, type PrototypeDocument, type SectionId, type SectionRemovalUndoResult, type UserId, type WorkspaceId } from '@cwm/contracts';
import { PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore, JsonActivityRepository, JsonAgentConnectionRepository, JsonMilestoneRepository, JsonProjectPageRepository, JsonProjectRepository, JsonReflectionRepository, JsonSectionRepository, JsonSectionShortcutRepository, JsonTaskRepository, JsonUndoRecordRepository, JsonUserRepository, unitOfWorkFor } from '@cwm/repositories';
import type { ActorContext } from '../src/actor';
import { PrototypeClock } from '../src/clock';
import type { IdGenerator } from '../src/ids';
import { ActivityService } from '../src/activity-service';
import type { LiveEventPublisher } from '../src/live-events';
import { AgentConnectionService } from '../src/agent-connection-service';
import { DashboardService } from '../src/dashboard-service';
import { PrototypeAIProvider } from '../src/prototype-ai-provider';
import { ProjectPageService } from '../src/project-page-service';
import { ProjectService } from '../src/project-service';
import { ProjectJournalService } from '../src/project-journal-service';
import { ProgressService } from '../src/progress-service';
import { ReflectionService } from '../src/reflection-service';
import { SectionService } from '../src/section-service';
import { SectionShortcutService } from '../src/section-shortcut-service';
import { TaskService } from '../src/task-service';
import { TimelineService } from '../src/timeline-service';
import { RepositoryUndoRecorder, type UndoRecorder } from '../src/undo-recorder';
import { UndoService } from '../src/undo-service';
import { WorkspaceService } from '../src/workspace-service';

/** `data-store.test.ts`'s tracking store is test-local; several tests here count persists. */
export class CountingDataStore extends InMemoryDataStore {
  persistCalls = 0;
  /** Set to make the next commits fail at persistence — the rollback seam after every write ran. */
  persistFailure: Error | undefined;

  override async persist(): Promise<void> {
    if (this.persistFailure !== undefined) throw this.persistFailure;
    await super.persist();
    this.persistCalls += 1;
  }
}

/** Deterministic ids, so an assertion can name the entity a call is about to create. */
export class CountingIdGenerator implements IdGenerator {
  private counts = new Map<string, number>();

  next(prefix: string): string {
    const count = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, count);
    return `${prefix}-${count}`;
  }
}

const CREATED_AT = '2026-08-01T16:00:00.000Z';

const project = (id: string, workspaceId: unknown): Project =>
  PrototypeDocumentSchema.shape.projects.element.parse({
    id,
    workspaceId,
    kind: 'root',
    name: `Project ${id}`,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

/**
 * Every project has a canonical page from the moment it exists (§26), so a fixture project
 * comes with one. The id follows the project's, which is what lets a test name a page it did
 * not create.
 */
const homePage = (projectId: string) =>
  PrototypeDocumentSchema.shape.projectPages.element.parse({
    id: `page-${projectId}`,
    projectId,
    kind: 'home',
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

const agentConnection = (id: string, name: string, userId: unknown, permissions: AgentPermission[]): AgentConnection =>
  PrototypeDocumentSchema.shape.agentConnections.element.parse({
    id,
    userId,
    name,
    permissions,
    revoked: false,
    createdAt: CREATED_AT,
  });

/**
 * Two populated personas (§17). Every scoping test needs a real foreign workspace to fail
 * against — one that is merely empty proves nothing.
 *
 * The connections follow the same rule: `agent-theirs` belongs to the *other* persona, so
 * "another person's connection is not found" is a claim with something behind it.
 */
export const twoPersonaDocument = (): PrototypeDocument =>
  PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: PERSONAS.slice(0, 2).map((persona) => persona.user),
    workspaces: PERSONAS.slice(0, 2).map((persona) => persona.workspace),
    projects: [project('project-mine', PERSONAS[0]!.workspace.id), project('project-theirs', PERSONAS[1]!.workspace.id)],
    projectPages: [homePage('project-mine'), homePage('project-theirs')],
    sections: [],
    sectionShortcuts: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [
      agentConnection('agent-claude', 'Claude', PERSONAS[0]!.user.id, ['projects.read', 'tasks.read', 'tasks.write']),
      agentConnection('agent-cursor', 'Cursor', PERSONAS[0]!.user.id, ['projects.read', 'tasks.read']),
      agentConnection('agent-theirs', 'Their agent', PERSONAS[1]!.user.id, ['tasks.read']),
    ],
  });

/**
 * A container written straight to the repository, so a test can start from a project that
 * already has a canvas without the `project.section_added` event that `SectionService.add`
 * would record. Tests about *what a mutation records* need the setup to record nothing.
 */
export const seedContainer = async (
  harness: { sections: { insert(section: ProjectSection): Promise<void> } },
  projectId: ProjectId,
  type = 'task-list',
): Promise<SectionId> => {
  const id = `section-${projectId}-${type}` as SectionId;
  await harness.sections.insert(
    PrototypeDocumentSchema.shape.sections.element.parse({
      id,
      projectId,
      pageId: `page-${projectId}`,
      type,
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: {},
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    }),
  );
  return id;
};

export const MINE = 'project-mine' as ProjectId;
export const THEIRS = 'project-theirs' as ProjectId;

export const actorFor = (index: 0 | 1): ActorContext => ({
  actor: 'user',
  workspaceId: PERSONAS[index]!.workspace.id as WorkspaceId,
  userId: PERSONAS[index]!.user.id as UserId,
});

/**
 * An agent acting in a persona's workspace with exactly the grant a test hands it (§51).
 * Defaults to *nothing*, so a test that forgets to say what the agent may do finds out.
 */
export const agentActorFor = (index: 0 | 1, permissions: AgentPermission[] = []): ActorContext => ({
  actor: 'agent',
  workspaceId: PERSONAS[index]!.workspace.id as WorkspaceId,
  agentConnectionId: (index === 0 ? 'agent-claude' : 'agent-theirs') as AgentConnectionId,
  permissions,
});

export interface HarnessOptions {
  /** §62's publisher, when a test wants to observe the live frames a mutation emits. */
  events?: LiveEventPublisher;
  /** Replaces the Undo recorder `SectionService` records through — the recorder-failure seam. */
  recorder?: (real: UndoRecorder) => UndoRecorder;
  /** Replaces the counting id generator, for tests where id order must not match insertion order. */
  ids?: IdGenerator;
}

export const buildHarness = (document: PrototypeDocument = twoPersonaDocument(), options: HarnessOptions = {}) => {
  const store = new CountingDataStore(document);
  const clock = new PrototypeClock(new Date(SEED_NOW));
  const ids = options.ids ?? new CountingIdGenerator();
  const unitOfWork = unitOfWorkFor(store);
  const projects = new JsonProjectRepository(store);
  const pages = new JsonProjectPageRepository(store);
  const sections = new JsonSectionRepository(store);
  const shortcuts = new JsonSectionShortcutRepository(store);
  const tasks = new JsonTaskRepository(store);
  const milestones = new JsonMilestoneRepository(store);
  const reflections = new JsonReflectionRepository(store);
  const activities = new JsonActivityRepository(store);
  const agents = new JsonAgentConnectionRepository(store);
  const users = new JsonUserRepository(store);
  const undoRecords = new JsonUndoRecordRepository(store);
  const activity = new ActivityService({ activities, projects, agents, users, tasks, milestones, reflections, clock, ids, events: options.events });

  // Built ahead of the object literal: task and reflection writes resolve their container
  // through it, so it has to exist before they do.
  const realRecorder = new RepositoryUndoRecorder({ undoRecords, clock, ids });
  const undoRecorder = options.recorder?.(realRecorder) ?? realRecorder;
  const sectionService = new SectionService({ sections, shortcuts, pages, projects, tasks, reflections, activity, undo: undoRecorder, clock, ids, unitOfWork });
  const sectionShortcutService = new SectionShortcutService({ shortcuts, sections, pages, projects, activity, clock, ids, unitOfWork });
  /**
   * The pre-Slice-32 domain tests use the section itself as the return value. Keep that small
   * fixture convention isolated while production callers exercise the typed write envelopes
   * through `sectionWriteService`; this prevents hundreds of archive/ownership assertions from
   * obscuring the new receipt-focused tests.
   */
  const legacySectionService = Object.create(sectionService) as Omit<SectionService, 'add' | 'update' | 'move'> & {
    add: (...args: Parameters<SectionService['add']>) => Promise<ProjectSection>;
    update: (...args: Parameters<SectionService['update']>) => Promise<ProjectSection>;
    move: (...args: Parameters<SectionService['move']>) => Promise<ProjectSection>;
  };
  legacySectionService.add = async (...args) => (await sectionService.add(...args)).section;
  legacySectionService.update = async (...args) => (await sectionService.update(...args)).section;
  legacySectionService.move = async (...args) => (await sectionService.move(...args)).section;

  const undoService = new UndoService({ undoRecords, sections, shortcuts, pages, projects, tasks, reflections, activity, clock, unitOfWork });
  /** See `legacySectionService`: existing removal tests only exercise the removal result shape. */
  const legacyUndoService = Object.create(undoService) as Omit<UndoService, 'undo'> & {
    undo: (...args: Parameters<UndoService['undo']>) => Promise<SectionRemovalUndoResult>;
  };
  legacyUndoService.undo = async (...args) => (await undoService.undo(...args)) as SectionRemovalUndoResult;

  return {
    store,
    clock,
    ids,
    projects,
    pages,
    sections,
    shortcuts,
    tasks,
    milestones,
    reflections,
    activities,
    agents,
    users,
    undoRecords,
    undoRecorder,
    activity,
    actor: actorFor(0),
    other: actorFor(1),
    projectService: new ProjectService({ projects, pages, activity, clock, ids, unitOfWork }),
    projectPageService: new ProjectPageService({ pages, projects, activity, clock, ids, unitOfWork }),
    taskService: new TaskService({ tasks, projects, sections: sectionService, activity, clock, ids, unitOfWork }),
    progressService: new ProgressService({ projects, tasks }),
    dashboardService: new DashboardService({ projects, tasks, activity, clock, ai: new PrototypeAIProvider() }),
    agentService: new AgentConnectionService({ agents, activity, clock, unitOfWork }),
    timelineService: new TimelineService({ projects, tasks, milestones }),
    reflectionService: new ReflectionService({ reflections, projects, tasks, sections: sectionService, activity, clock, ids, unitOfWork }),
    projectJournalService: new ProjectJournalService({ projects, pages, sections, tasks, reflections }),
    sectionService: legacySectionService,
    sectionShortcutService,
    workspaceService: new WorkspaceService({ projects, tasks, reflections, clock }),
    undoService: legacyUndoService,
    sectionWriteService: sectionService,
    undoServiceWithEdits: undoService,
  };
};
