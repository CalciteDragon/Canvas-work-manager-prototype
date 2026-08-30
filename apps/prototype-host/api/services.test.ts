import { PrototypeAIProvider } from '@cwm/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryDataStore, JsonActivityRepository, JsonAgentConnectionRepository, JsonMilestoneRepository, JsonProjectRepository, JsonReflectionRepository, JsonSectionRepository, JsonTaskRepository, JsonUserRepository, unitOfWorkFor } from '@cwm/repositories';
import { buildSeed } from '@cwm/prototype-data';
import type { LiveEvent, TaskId, UserId, WorkspaceId } from '@cwm/contracts';
import type { ActorContext } from '@cwm/domain';
import { LiveEventHub } from '../events/hub.ts';
import { RealAIProvider } from './real-ai-provider.ts';
import { aiProviderFor, createApi } from './services.ts';
import type { Persistence } from '../persistence/store.ts';

const context = {
  generatedAt: '2026-08-24T16:00:00.000Z',
  dueTodayCount: 0,
  overdueCount: 0,
  inProgressCount: 0,
  upcomingCount: 0,
  upcomingDays: 7,
  completedRecentlyCount: 0,
  recentDays: 7,
  activeProjectCount: 0,
};

describe('aiProviderFor (§44)', () => {
  it('defaults to the prototype provider when the variable is unset or anything but "real"', () => {
    expect(aiProviderFor(undefined)).toBeInstanceOf(PrototypeAIProvider);
    expect(aiProviderFor('mock')).toBeInstanceOf(PrototypeAIProvider);
    expect(aiProviderFor('Real')).toBeInstanceOf(PrototypeAIProvider);
  });

  it('selects the real adapter only for an exact "real"', () => {
    expect(aiProviderFor('real')).toBeInstanceOf(RealAIProvider);
  });

  it('needs no API key in the default mode', async () => {
    expect((await aiProviderFor(undefined).generateDailyDigest(context)).source).toBe('prototype');
  });

  it('fails loudly rather than silently falling back when the real adapter is selected', async () => {
    await expect(aiProviderFor('real').generateDailyDigest(context)).rejects.toThrow(/not implemented/);
  });
});

/**
 * The §62 wiring, not the hub: that `createApi` hands the services a unit of work the hub
 * is watching, and leaves `Persistence.unitOfWork` alone so the seed swap stays out of it.
 */
describe('createApi and the live event hub (§62)', () => {
  const inMemoryPersistence = (): Persistence => {
    const store = new InMemoryDataStore(buildSeed('agent-heavy'));
    return {
      path: ':memory:',
      store,
      projects: new JsonProjectRepository(store),
      sections: new JsonSectionRepository(store),
      tasks: new JsonTaskRepository(store),
      milestones: new JsonMilestoneRepository(store),
      reflections: new JsonReflectionRepository(store),
      activities: new JsonActivityRepository(store),
      agents: new JsonAgentConnectionRepository(store),
      users: new JsonUserRepository(store),
      unitOfWork: unitOfWorkFor(store),
    };
  };

  const actor: ActorContext = {
    actor: 'user',
    workspaceId: 'workspace-demo' as WorkspaceId,
    userId: 'user-demo' as UserId,
  };

  it('publishes a service mutation through the injected hub', async () => {
    const events = new LiveEventHub();
    const received: LiveEvent[] = [];
    events.subscribe((event) => void received.push(event));
    const api = createApi(inMemoryPersistence(), { events });

    await api.tasks.complete(actor, 'task-agent-schema' as TaskId);

    expect(received.map(({ type }) => type)).toEqual(['task.completed']);
  });

  it('leaves the persistence layer’s own unit of work unwrapped', () => {
    const persistence = inMemoryPersistence();
    const original = persistence.unitOfWork;

    createApi(persistence, { events: new LiveEventHub() });

    // `PrototypeRuntime`'s seed swap runs through this one and announces itself from the
    // route table; routing it through the hub would emit a workspace frame for a rig change.
    expect(persistence.unitOfWork).toBe(original);
  });
});
