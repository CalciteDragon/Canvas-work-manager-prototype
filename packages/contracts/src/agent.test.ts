import { describe, expect, it } from 'vitest';
import { AgentConnectionSchema, AgentPermissionSchema } from './agent';

// §52's example, plus the timestamps the store needs.
const connection = {
  id: 'agent-1',
  userId: 'user-a',
  name: 'Claude',
  permissions: ['projects.read', 'tasks.read', 'tasks.write'],
  revoked: false,
  createdAt: '2026-08-26T10:00:00.000Z',
};

describe('AgentConnectionSchema', () => {
  it('accepts §52 example connection', () => {
    expect(AgentConnectionSchema.parse(connection).permissions).toEqual([
      'projects.read',
      'tasks.read',
      'tasks.write',
    ]);
  });

  it('accepts a last-used timestamp (§53 shows one) and a revoked connection', () => {
    const parsed = AgentConnectionSchema.parse({
      ...connection,
      revoked: true,
      lastUsedAt: '2026-08-26T11:28:00.000Z',
    });
    expect(parsed).toMatchObject({ revoked: true, lastUsedAt: '2026-08-26T11:28:00.000Z' });
  });

  it('accepts a connection with no permissions at all', () => {
    expect(AgentConnectionSchema.parse({ ...connection, permissions: [] }).permissions).toEqual([]);
  });

  it('rejects a permission that no tool family grants', () => {
    expect(AgentConnectionSchema.safeParse({ ...connection, permissions: ['tasks.delete'] }).success).toBe(false);
  });
});

describe('AgentPermissionSchema', () => {
  it('covers every §54 tool family, and the five §53 shows', () => {
    expect(AgentPermissionSchema.options).toEqual([
      'projects.read',
      'projects.write',
      'tasks.read',
      'tasks.write',
      'reflections.read',
      'reflections.write',
      'workspace.read',
    ]);
  });
});
