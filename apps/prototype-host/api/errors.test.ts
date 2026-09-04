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

/**
 * A rule error can now carry a payload the *caller* acts on rather than only reads — the
 * non-empty section refusal, whose count the canvas composes its own question from. This is
 * the one place a domain record becomes a wire envelope.
 */
describe('toErrorResult, on a rule error that carries details (§31)', () => {
  it('forwards a typed refusal beside the sentence', () => {
    const result = toErrorResult(
      new DomainRuleError('section "section-1" still holds 3 tasks', {
        reason: 'section_not_empty',
        liveRowCount: 3,
      }),
    );

    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: 'rule_violation',
      message: 'section "section-1" still holds 3 tasks',
      details: { reason: 'section_not_empty', liveRowCount: 3 },
    });
  });

  it('omits the key entirely when a rule error carries none', () => {
    // Absent, not `undefined`. `JSON.stringify` drops an undefined value, so a leaked key is
    // invisible here and visible only to a client parsing the body.
    const result = toErrorResult(new DomainRuleError('nope'));

    expect(result.body).toEqual({ error: 'rule_violation', message: 'nope' });
    expect(Object.hasOwn(result.body as object, 'details')).toBe(false);
  });
});
