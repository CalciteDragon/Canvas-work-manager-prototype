import { PrototypeDocumentSchema, SCHEMA_VERSION, type Project, type ProjectId, type PrototypeDocument, type UserId, type WorkspaceId } from '@cwm/contracts';
import { PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore, JsonActivityRepository, JsonProjectRepository, JsonSectionRepository, JsonTaskRepository, unitOfWorkFor } from '@cwm/repositories';
import type { ActorContext } from '../src/actor';
import { PrototypeClock } from '../src/clock';
import type { IdGenerator } from '../src/ids';
import { ActivityService } from '../src/activity-service';
import { ProjectService } from '../src/project-service';
import { SectionService } from '../src/section-service';
import { TaskService } from '../src/task-service';

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

/**
 * Two populated personas (§17). Every scoping test needs a real foreign workspace to fail
 * against — one that is merely empty proves nothing.
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
    agentConnections: [],
  });

export const MINE = 'project-mine' as ProjectId;
export const THEIRS = 'project-theirs' as ProjectId;

export const actorFor = (index: 0 | 1): ActorContext => ({
  actor: 'user',
  workspaceId: PERSONAS[index]!.workspace.id as WorkspaceId,
  userId: PERSONAS[index]!.user.id as UserId,
});

export const buildHarness = (document: PrototypeDocument = twoPersonaDocument()) => {
  const store = new CountingDataStore(document);
  const clock = new PrototypeClock(new Date(SEED_NOW));
  const ids = new CountingIdGenerator();
  const unitOfWork = unitOfWorkFor(store);
  const projects = new JsonProjectRepository(store);
  const sections = new JsonSectionRepository(store);
  const tasks = new JsonTaskRepository(store);
  const activities = new JsonActivityRepository(store);
  const activity = new ActivityService({ activities, clock, ids });

  return {
    store,
    clock,
    ids,
    projects,
    sections,
    tasks,
    activities,
    activity,
    actor: actorFor(0),
    other: actorFor(1),
    projectService: new ProjectService({ projects, activity, clock, ids, unitOfWork }),
    taskService: new TaskService({ tasks, projects, activity, clock, ids, unitOfWork }),
    sectionService: new SectionService({ sections, projects, activity, clock, ids, unitOfWork }),
  };
};
