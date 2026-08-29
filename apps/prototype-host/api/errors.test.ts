import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from '@cwm/domain';
import { describe, expect, it } from 'vitest';
import { AgentAuthenticationError } from '../auth/prototype-agent-authenticator.ts';
import { toErrorResult } from './errors.ts';

/**
 * The two statuses Slice 13 adds. They are tested directly because the distinction is the
 * whole product point of §53: 401 means *this token is not a connection*, 403 means *this
 * connection was not given that* — and only the second is something a checkbox can fix.
 */
describe('toErrorResult, on the agent failures (§§51, 53)', () => {
  it('answers 401 for a token that names no usable connection', () => {
    const result = toErrorResult(new AgentAuthenticationError());

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ error: 'unauthorized' });
  });

  it('answers 403 naming the permission, because the fix is a checkbox', () => {
    const result = toErrorResult(new PermissionDeniedError('agent-claude', 'tasks.write'));

    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: 'permission_denied',
      message: 'connection "agent-claude" is missing permission "tasks.write"',
    });
  });

  it('keeps the older mappings — a denial must not become a 409 or a 404', () => {
    expect(toErrorResult(new DomainRuleError('nope')).status).toBe(409);
    expect(toErrorResult(new EntityNotFoundError('task', 'task-1')).status).toBe(404);
  });
});
