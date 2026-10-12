import { describe, expect, it } from 'vitest';
import { captureActivityIdentities } from './activity-identity';

type Row = Record<string, unknown>;

/** Minimal seed collections exercise capture independently of schema versions or legacy fixtures. */
const seed = (): Row => ({
  projects: [
    { id: 'root', workspaceId: 'workspace' },
    { id: 'child', workspaceId: 'workspace', parentProjectId: 'root' },
  ],
  tasks: [{ id: 'task', projectId: 'child', title: 'Choose finishes' }],
  reflections: [{ id: 'reflection', projectId: 'root' }],
  users: [{ id: 'user', workspaceId: 'workspace' }],
  agentConnections: [{ id: 'agent', userId: 'user', name: 'Assistant' }],
  activityEvents: [
    { id: 'root-event', workspaceId: 'workspace', entityType: 'project', entityId: 'root' },
    { id: 'task-event', workspaceId: 'workspace', entityType: 'task', entityId: 'task', projectId: 'child' },
    { id: 'reflection-event', workspaceId: 'workspace', entityType: 'reflection', entityId: 'reflection' },
    { id: 'agent-event', workspaceId: 'workspace', entityType: 'agent_connection', entityId: 'agent' },
  ],
});

const event = (source: Row, id: string) => (source['activityEvents'] as Row[]).find((row) => row['id'] === id)!;

describe('seed Activity identity capture', () => {
  it('captures the root itself and a nested target’s owning root', () => {
    const { activityEvents, backfilled } = captureActivityIdentities(seed());
    expect(backfilled).toBe(4);
    expect(activityEvents[0]).toMatchObject({ projectId: 'root', context: { projectId: 'root', rootProjectId: 'root' } });
    expect(activityEvents[1]).toMatchObject({ context: { targetKind: 'task', targetId: 'task', targetLabel: 'Choose finishes', projectId: 'child', rootProjectId: 'root' } });
  });

  it('omits project and root for agent events', () => {
    const captured = captureActivityIdentities(seed()).activityEvents[3]!;
    expect(captured).not.toHaveProperty('projectId');
    expect(captured['context']).toEqual({ targetKind: 'agent_connection', targetId: 'agent', targetLabel: 'Assistant' });
  });

  it('gives a titleless reflection a stable readable fallback', () => {
    expect(captureActivityIdentities(seed()).activityEvents[2]).toMatchObject({ context: { targetLabel: 'Untitled reflection' } });
  });

  it('refuses an event whose target does not exist', () => {
    const source = seed();
    event(source, 'task-event')['entityId'] = 'missing';
    expect(() => captureActivityIdentities(source)).toThrow(/does not exist/);
  });

  it('refuses an event naming a different project from its target', () => {
    const source = seed();
    event(source, 'task-event')['projectId'] = 'root';
    expect(() => captureActivityIdentities(source)).toThrow(/different from its target/);
  });

  it('refuses a target in another workspace', () => {
    const source = seed();
    (source['projects'] as Row[])[1]!['workspaceId'] = 'other';
    expect(() => captureActivityIdentities(source)).toThrow(/another workspace/);
  });

  it('refuses an agent connection claiming a project', () => {
    const source = seed();
    event(source, 'agent-event')['projectId'] = 'root';
    expect(() => captureActivityIdentities(source)).toThrow(/belongs to no project/);
  });

  it('refuses an event without a target', () => {
    const source = seed();
    delete event(source, 'task-event')['entityId'];
    expect(() => captureActivityIdentities(source)).toThrow(/has no target/);
  });
});
