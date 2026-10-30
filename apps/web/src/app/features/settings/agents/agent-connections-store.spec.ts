import { TestBed } from '@angular/core/testing';
import { AgentConnectionSchema, type AgentConnection } from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { AgentConnectionsStore } from './agent-connections-store';

const claude: AgentConnection = AgentConnectionSchema.parse({ id: 'agent-claude', userId: 'user-demo', name: 'Claude',
  permissions: ['projects.read'], revoked: false, createdAt: '2026-08-01T16:00:00.000Z' });

const setup = (options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = { agentConnections: [claude] }) => {
  const gateway = new FakeWorkManagerGateway(options);
  TestBed.configureTestingModule({ providers: [AgentConnectionsStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
  return { store: TestBed.inject(AgentConnectionsStore), gateway };
};

afterEach(() => TestBed.resetTestingModule());

describe('AgentConnectionsStore (§53, Slice 78)', () => {
  it('holds a failed list read as a Failure, keeps it while Try again reads, and clears it on success', async () => {
    const { store, gateway } = setup({ agentConnections: [claude], failOn: { 'agents.list': new GatewayError('unreachable', 0, 'host offline') } });
    await store.load();
    expect(store.error()).toEqual({ sentence: 'Couldn’t reach your workspace, so your agent connections didn’t load.', reason: 'host offline' });
    expect(store.connections()).toEqual([]);

    gateway.options.failOn = {};
    let answer!: (value: AgentConnection[]) => void;
    vi.spyOn(gateway.agents, 'list').mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const retrying = store.load();
    expect(store.loading()).toBe(true);
    expect(store.error()?.reason).toBe('host offline');
    answer([claude]);
    await retrying;
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.connections()).toEqual([claude]);
  });

  it('keeps a Revoke failure apart from the read: no read failure, and the list stays', async () => {
    const { store } = setup({ agentConnections: [claude], failOn: { 'agents.revoke': new GatewayError('conflict', 409, 'already revoked elsewhere') } });
    await store.load();
    expect(await store.revoke(claude.id)).toBe(false);
    expect(store.revokeError()).toBe('already revoked elsewhere');
    expect(store.error()).toBeNull();
    expect(store.connections()).toEqual([claude]);
  });
});
