import {
  PrototypeDocumentSchema,
  type AgentConnectionId,
  type AgentPermission,
  type ProjectId,
  type ProjectPageId,
  type SectionId,
  type SectionShortcutId,
  type TaskId,
  type UserId,
  type WorkspaceId,
} from '@cwm/contracts';
import {
  ActivityService,
  DashboardService,
  ProjectPageService,
  ProjectService,
  ProjectTodosService,
  PrototypeAIProvider,
  PrototypeClock,
  ReflectionService,
  SectionService,
  SectionShortcutService,
  TaskService,
  WorkspaceService,
  type ActorContext,
  type IdGenerator,
} from '@cwm/domain';
import { buildSeed, PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonProjectPageRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
  JsonSectionShortcutRepository,
  JsonTaskRepository,
  JsonUserRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { createToolRegistry } from '../src/registry';

/** Counts persists, so a read tool can be asserted to have written nothing. */
export class CountingDataStore extends InMemoryDataStore {
  persistCalls = 0;

  override async persist(): Promise<void> {
    await super.persist();
    this.persistCalls += 1;
  }
}

/** Deterministic ids, so a test can name the entity a call is about to create. */
export class CountingIdGenerator implements IdGenerator {
  private counts = new Map<string, number>();

  next(prefix: string): string {
    const count = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, count);
    return `${prefix}-${count}`;
  }
}

/** The `agent-heavy` seed's workspace (§16), and the ids these tests name. */
export const PROJECT = 'project-work-manager' as ProjectId;
export const OPS_PROJECT = 'project-agent-ops' as ProjectId;
/** Open, not-yet-done, and therefore actually completable — unlike `task-agent-deployment`. */
export const OPEN_TASK = 'task-agent-schema' as TaskId;
/** The task list that owns `PROJECT`'s work, and a view beside it that owns nothing. */
export const TASK_CONTAINER = 'section-project-work-manager-tasks' as SectionId;
export const VIEW_SECTION = 'section-project-work-manager-activity' as SectionId;
export const SHORTCUT_DESTINATION_PAGE = 'page-project-work-manager' as ProjectPageId;
export const SHORTCUT_SOURCE_PROJECT = 'project-agent-kitchen' as ProjectId;
export const SHORTCUT_SOURCE_PAGE = 'page-project-agent-kitchen' as ProjectPageId;
export const SHORTCUT_SOURCE_SECTION = 'section-project-agent-kitchen-tasks' as SectionId;
export const SEEDED_SHORTCUT = 'shortcut-project-agent-kitchen' as SectionShortcutId;

/**
 * A project in **another persona's** workspace.
 *
 * Every project the seeds build is hard-coded to the demo workspace, so without this there
 * is no foreign id to name and the "a foreign id is not found, not forbidden" test would
 * quietly exercise the missing-id branch instead. A merely empty foreign workspace proves
 * nothing.
 */
export const FOREIGN_PROJECT = 'project-theirs' as ProjectId;

export const buildHarness = () => {
  const document = buildSeed('agent-heavy');
  document.projects.push(
    PrototypeDocumentSchema.shape.projects.element.parse({
      id: FOREIGN_PROJECT,
      workspaceId: PERSONAS[1]!.workspace.id,
      kind: 'root',
      name: 'Their project',
      status: 'active',
      projectLayoutMode: 'flow',
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    }),
  );

  // Its canonical page, in the same push: a project without one does not validate (§26).
  document.projectPages.push(
    PrototypeDocumentSchema.shape.projectPages.element.parse({
      id: `page-${FOREIGN_PROJECT}`,
      projectId: FOREIGN_PROJECT,
      kind: 'home',
      enabled: true,
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    }),
  );

  document.projects.push(
    PrototypeDocumentSchema.shape.projects.element.parse({
      id: SHORTCUT_SOURCE_PROJECT,
      workspaceId: PERSONAS[0]!.workspace.id,
      kind: 'subproject',
      parentProjectId: PROJECT,
      name: 'Kitchen',
      status: 'active',
      projectLayoutMode: 'flow',
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    }),
  );
  document.projectPages.push(
    PrototypeDocumentSchema.shape.projectPages.element.parse({
      id: SHORTCUT_SOURCE_PAGE,
      projectId: SHORTCUT_SOURCE_PROJECT,
      kind: 'work',
      enabled: true,
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    }),
  );
  document.sections.push(
    PrototypeDocumentSchema.shape.sections.element.parse({
      id: SHORTCUT_SOURCE_SECTION,
      projectId: SHORTCUT_SOURCE_PROJECT,
      pageId: SHORTCUT_SOURCE_PAGE,
      type: 'task-list',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: {},
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    }),
  );
  document.sectionShortcuts.push(
    PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
      id: SEEDED_SHORTCUT,
      pageId: SHORTCUT_DESTINATION_PAGE,
      sourceSectionId: SHORTCUT_SOURCE_SECTION,
      position: 3,
      columnSpan: 12,
      collapsed: false,
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    }),
  );

  const store = new CountingDataStore(PrototypeDocumentSchema.parse(document));
  const clock = new PrototypeClock(new Date(SEED_NOW));
  const ids = new CountingIdGenerator();
  const unitOfWork = unitOfWorkFor(store);
  const projects = new JsonProjectRepository(store);
  const pages = new JsonProjectPageRepository(store);
  const tasks = new JsonTaskRepository(store);
  const reflections = new JsonReflectionRepository(store);
  const sections = new JsonSectionRepository(store);
  const shortcuts = new JsonSectionShortcutRepository(store);
  const activities = new JsonActivityRepository(store);
  const agents = new JsonAgentConnectionRepository(store);
  const users = new JsonUserRepository(store);
  const milestones = new JsonMilestoneRepository(store);
  const activity = new ActivityService({
    activities,
    projects,
    agents,
    users,
    tasks,
    milestones,
    reflections,
    clock,
    ids,
  });

  const sectionService = new SectionService({ sections, shortcuts, pages, projects, tasks, reflections, activity, clock, ids, unitOfWork });
  const sectionShortcutService = new SectionShortcutService({ shortcuts, sections, pages, projects, activity, clock, ids, unitOfWork });

  const services = {
    sections: sectionService,
    shortcuts: sectionShortcutService,
    projects: new ProjectService({ projects, pages, activity, clock, ids, unitOfWork }),
    pages: new ProjectPageService({ pages, projects, activity, clock, ids, unitOfWork }),
    todos: new ProjectTodosService({ projects, tasks, sections, pages }),
    tasks: new TaskService({ tasks, projects, sections: sectionService, activity, clock, ids, unitOfWork }),
    reflections: new ReflectionService({ reflections, projects, sections: sectionService, activity, clock, ids, unitOfWork }),
    dashboard: new DashboardService({ projects, tasks, activity, clock, ai: new PrototypeAIProvider() }),
    workspace: new WorkspaceService({ projects, tasks, reflections, clock }),
  };

  return { store, clock, activity, services, registry: createToolRegistry(services) };
};

/**
 * The connection §57's own example names. `activity.test.ts` asserts `actorName: "Claude"`,
 * which is resolved from this record rather than from anything the test says.
 */
export const CONNECTION = 'agent-claude' as AgentConnectionId;

/** An agent with exactly the grant a test hands it, and no more. Defaults to nothing. */
export const agent = (permissions: readonly AgentPermission[] = []): ActorContext => ({
  actor: 'agent',
  workspaceId: PERSONAS[0]!.workspace.id as WorkspaceId,
  userId: PERSONAS[0]!.user.id as UserId,
  agentConnectionId: CONNECTION,
  permissions,
});

/** The person who owns the workspace. Needed to read the activity feed back. */
export const user = (): ActorContext => ({
  actor: 'user',
  workspaceId: PERSONAS[0]!.workspace.id as WorkspaceId,
  userId: PERSONAS[0]!.user.id as UserId,
});
