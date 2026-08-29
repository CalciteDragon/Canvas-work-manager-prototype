import { PrototypeDocumentSchema, SCHEMA_VERSION, type AgentConnection, type AgentConnectionId, type AgentPermission, type Project, type ProjectId, type PrototypeDocument, type UserId, type WorkspaceId } from '@cwm/contracts';
import { PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore, JsonActivityRepository, JsonAgentConnectionRepository, JsonMilestoneRepository, JsonProjectRepository, JsonReflectionRepository, JsonSectionRepository, JsonTaskRepository, JsonUserRepository, unitOfWorkFor } from '@cwm/repositories';
import type { ActorContext } from '../src/actor';
import { PrototypeClock } from '../src/clock';
import type { IdGenerator } from '../src/ids';
import { ActivityService } from '../src/activity-service';
import { AgentConnectionService } from '../src/agent-connection-service';
import { DashboardService } from '../src/dashboard-service';
import { PrototypeAIProvider } from '../src/prototype-ai-provider';
import { ProjectService } from '../src/project-service';
import { ProgressService } from '../src/progress-service';
import { ReflectionService } from '../src/reflection-service';
import { SectionService } from '../src/section-service';
import { TaskService } from '../src/task-service';
import { TimelineService } from '../src/timeline-service';

/** `data-store.test.ts`'s tracking store is test-local; several tests here count persists. */
export class CountingDataStore extends InMemoryDataStore {
  persistCalls = 0;

  override async persist(): Promise<void> {
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
    name: `Project ${id}`,
    status: 'active',
    projectLayoutMode: 'flow',
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
    sections: [],
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

export const buildHarness = (document: PrototypeDocument = twoPersonaDocument()) => {
  const store = new CountingDataStore(document);
  const clock = new PrototypeClock(new Date(SEED_NOW));
  const ids = new CountingIdGenerator();
  const unitOfWork = unitOfWorkFor(store);
  const projects = new JsonProjectRepository(store);
  const sections = new JsonSectionRepository(store);
  const tasks = new JsonTaskRepository(store);
  const milestones = new JsonMilestoneRepository(store);
  const reflections = new JsonReflectionRepository(store);
  const activities = new JsonActivityRepository(store);
  const agents = new JsonAgentConnectionRepository(store);
  const users = new JsonUserRepository(store);
  const activity = new ActivityService({ activities, projects, agents, users, tasks, milestones, reflections, clock, ids });

  return {
    store,
    clock,
    ids,
    projects,
    sections,
    tasks,
    milestones,
    reflections,
    activities,
    agents,
    users,
    activity,
    actor: actorFor(0),
    other: actorFor(1),
    projectService: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    taskService: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
    progressService: new ProgressService({ projects, tasks }),
    dashboardService: new DashboardService({ projects, tasks, activity, clock, ai: new PrototypeAIProvider() }),
    agentService: new AgentConnectionService({ agents, activity, clock, unitOfWork }),
    timelineService: new TimelineService({ projects, tasks, milestones }),
    reflectionService: new ReflectionService({ reflections, projects, activity, clock, ids, unitOfWork }),
    sectionService: new SectionService({ sections, projects, activity, clock, ids, unitOfWork }),
  };
};
