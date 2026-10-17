import { afterEach, describe, expect, it } from 'vitest';
import { LiftFocus } from './lift-focus';

afterEach(() => document.body.replaceChildren());

describe('LiftFocus', () => {
  it('returns to the recorded opener and uses the fallback if it has gone', () => {
    const opener = document.createElement('button');
    const fallback = document.createElement('button');
    const lift = document.createElement('section');
    lift.tabIndex = -1;
    document.body.append(opener, fallback, lift);
    const focus = new LiftFocus(opener, () => fallback);
    focus.enter(lift);
    focus.restore(lift);
    expect(document.activeElement).toBe(opener);
    opener.remove();
    focus.enter(lift);
    focus.restore(lift);
    expect(document.activeElement).toBe(fallback);
  });

  it('leaves focus moved elsewhere alone', () => {
    const opener = document.createElement('button');
    const outside = document.createElement('button');
    const lift = document.createElement('section');
    document.body.append(opener, outside, lift);
    outside.focus();
    new LiftFocus(opener, () => null).restore(lift);
    expect(document.activeElement).toBe(outside);
  });
});
