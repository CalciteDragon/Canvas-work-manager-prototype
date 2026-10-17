import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { LiftStack } from './lift-stack';

describe('LiftStack', () => {
  it('closes A when B opens, and a stale release cannot remove B', () => {
    const stack = TestBed.inject(LiftStack);
    const closeA = vi.fn();
    const closeB = vi.fn();
    const releaseA = stack.open(closeA);
    stack.open(closeB);
    expect(closeA).toHaveBeenCalledOnce();
    releaseA();
    stack.open(vi.fn());
    expect(closeB).toHaveBeenCalledOnce();
  });
});
