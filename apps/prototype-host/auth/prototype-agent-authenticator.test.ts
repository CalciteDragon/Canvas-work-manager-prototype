import { PrototypeDocumentSchema, type AgentConnectionId } from '@cwm/contracts';
import { AgentConnectionService, PrototypeClock } from '@cwm/domain';
import { ActivityService, PrototypeIdGenerator } from '@cwm/domain';
import { PERSONAS, buildSeed } from '@cwm/prototype-data';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonTaskRepository,
  JsonUserRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import { AgentAuthenticationError, PrototypeAgentAuthenticator } from './prototype-agent-authenticator.ts';

const CLAUDE = 'agent-claude' as AgentConnectionId;
const NOW = new Date('2026-08-24T16:00:00.000Z');

const build = () => {
  const store = new InMemoryDataStore(PrototypeDocumentSchema.parse(buildSeed('agent-heavy')));
  const clock = new PrototypeClock(NOW);
  const agents = new JsonAgentConnectionRepository(store);
  const users = new JsonUserRepository(store);
  const projects = new JsonProjectRepository(store);
  const connections = new AgentConnectionService({
    agents,
    activity: new ActivityService({
      activities: new JsonActivityRepository(store),
      projects,
      agents,
      users,
      tasks: new JsonTaskRepository(store),
      milestones: new JsonMilestoneRepository(store),
      reflections: new JsonReflectionRepository(store),
      clock,
      ids: new PrototypeIdGenerator(),
    }),
    clock,
    unitOfWork: unitOfWorkFor(store),
  });

  return {
    store,
    clock,
    agents,
    connections,
    authenticator: new PrototypeAgentAuthenticator({ agents, users, connections }),
    owner: { actor: 'user' as const, workspaceId: PERSONAS[0]!.workspace.id as never, userId: PERSONAS[0]!.user.id as never },
  };
};

describe('PrototypeAgentAuthenticator (§51)', () => {
  it('resolves §51’s own token to a user, a connection and a permission set', async () => {
    const { authenticator } = build();

    const actor = await authenticator.authenticate('Bearer prototype-user-a-readwrite');

    expect(actor).toMatchObject({
      actor: 'agent',
      userId: 'user-demo',
      agentConnectionId: 'agent-claude',
      workspaceId: 'workspace-demo',
    });
    expect(actor?.permissions).toContain('tasks.write');
  });

  it('answers null for a request with no Authorization header — that is a persona request', async () => {
    const { authenticator } = build();

    expect(await authenticator.authenticate(undefined)).toBeNull();
    expect(await authenticator.authenticate('   ')).toBeNull();
  });

  it('refuses a scheme it does not implement rather than ignoring it', async () => {
    const { authenticator } = build();

    await expect(authenticator.authenticate('Basic prototype-user-a-readwrite')).rejects.toThrow(
      'only Bearer authorization is supported',
    );
  });

  it('refuses an unknown token', async () => {
    const { authenticator } = build();

    await expect(authenticator.authenticate('Bearer nonsense')).rejects.toThrow(AgentAuthenticationError);
  });

  it('refuses a revoked connection, however valid its token', async () => {
    const { authenticator } = build();

    await expect(authenticator.authenticate('Bearer prototype-user-a-revoked')).rejects.toThrow(
      AgentAuthenticationError,
    );
  });

  it('is case-insensitive about the scheme, because clients disagree about it', async () => {
    const { authenticator } = build();

    expect(await authenticator.authenticate('bearer prototype-user-a-readwrite')).not.toBeNull();
  });

  /**
   * §53's "Changes should immediately affect subsequent MCP tool calls" — the reason the
   * token is only a pointer and the connection is re-read every time.
   */
  it('sees a permission change between two calls, with nothing restarted', async () => {
    const { authenticator, connections, owner } = build();
    const before = await authenticator.authenticate('Bearer prototype-user-a-readwrite');
    expect(before?.permissions).toContain('tasks.write');

    await connections.updatePermissions(owner, CLAUDE, ['projects.read', 'tasks.read']);

    const after = await authenticator.authenticate('Bearer prototype-user-a-readwrite');
    expect(after?.permissions).not.toContain('tasks.write');
  });

  it('sees a revocation between two calls', async () => {
    const { authenticator, connections, owner } = build();
    await authenticator.authenticate('Bearer prototype-user-a-readwrite');

    await connections.revoke(owner, CLAUDE);

    await expect(authenticator.authenticate('Bearer prototype-user-a-readwrite')).rejects.toThrow(
      AgentAuthenticationError,
    );
  });

  it('stamps Last used from the simulated clock, not real time (§45)', async () => {
    const { authenticator, agents, clock } = build();

    await authenticator.authenticate('Bearer prototype-user-a-readwrite');

    expect((await agents.find(CLAUDE))?.lastUsedAt).toBe(clock.now().toISOString());
  });

  it('does not stamp a connection that failed to authenticate', async () => {
    const { authenticator, agents } = build();
    const before = (await agents.find('agent-old' as AgentConnectionId))?.lastUsedAt;

    await expect(authenticator.authenticate('Bearer prototype-user-a-revoked')).rejects.toThrow(
      AgentAuthenticationError,
    );

    expect((await agents.find('agent-old' as AgentConnectionId))?.lastUsedAt).toBe(before);
  });
});
