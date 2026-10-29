import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { readFailure, writeFailure } from './failure';

const REASON = 'Task "task-kitchen-1" was not found (404).';

describe('failure (Slice 78, §24, §63)', () => {
  it('gives each read code its product sentence', () => {
    expect(readFailure(new GatewayError('not_found', 404, REASON), 'this task list'))
      .toEqual({ sentence: 'This task list isn’t available.', reason: REASON });
    expect(readFailure(new GatewayError('unreachable', 0, 'fetch failed'), 'your projects'))
      .toEqual({ sentence: 'Couldn’t reach your workspace, so your projects didn’t load.', reason: 'fetch failed' });
    expect(readFailure(new GatewayError('internal_error', 500, 'boom'), 'this project'))
      .toEqual({ sentence: 'Couldn’t load this project.', reason: 'boom' });
  });

  it('keeps the reason, a quoted id and the status out of every sentence', () => {
    for (const code of ['not_found', 'unreachable', 'internal_error', 'invalid_response', 'rule_violation'] as const) {
      const { sentence } = readFailure(new GatewayError(code, 404, REASON), 'this journal');
      expect(sentence).not.toContain(REASON);
      expect(sentence).not.toMatch(/task-kitchen-1|404|"/);
    }
    const write = writeFailure(new GatewayError('rule_violation', 409, REASON), 'Couldn’t complete “Order tiles”. Try again.');
    expect(write).toEqual({ sentence: 'Couldn’t complete “Order tiles”. Try again.', reason: REASON });
  });

  it('reads code and message structurally, from an object with only those', () => {
    expect(readFailure({ code: 'not_found', message: 'gone' }, 'this journal'))
      .toEqual({ sentence: 'This journal isn’t available.', reason: 'gone' });
    expect(writeFailure({ code: 'conflict', message: 'stale' }, 'Couldn’t save.')).toEqual({ sentence: 'Couldn’t save.', reason: 'stale' });
  });

  it('gives a non-error the generic sentence and String(error) as its reason', () => {
    expect(readFailure('socket hang up', 'Home')).toEqual({ sentence: 'Couldn’t load Home.', reason: 'socket hang up' });
    expect(readFailure(undefined, 'Home')).toEqual({ sentence: 'Couldn’t load Home.', reason: 'undefined' });
    expect(readFailure({ code: 42 }, 'Home')).toEqual({ sentence: 'Couldn’t load Home.', reason: '[object Object]' });
  });

});
