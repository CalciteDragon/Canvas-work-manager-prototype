import { describe, expect, it, vi } from 'vitest';
import type { SectionId } from '@cwm/contracts';
import { TaskDrawerCoordinator } from './task-drawer-coordinator';

describe('TaskDrawerCoordinator', () => {
  it('clears the previous list when a different list selects a task', () => {
    const coordinator = new TaskDrawerCoordinator();
    const closeA = vi.fn();
    const releaseA = coordinator.select('section-a' as SectionId, closeA);
    expect(coordinator.open()).toBe(true);
    const releaseB = coordinator.select('section-b' as SectionId, vi.fn());
    expect(closeA).toHaveBeenCalledOnce();
    releaseA();
    expect(coordinator.open()).toBe(true);
    releaseB();
    expect(coordinator.open()).toBe(false);
  });

  it('allows switching tasks within a list without closing its selection', () => {
    const coordinator = new TaskDrawerCoordinator();
    const close = vi.fn();
    coordinator.select('section-a' as SectionId, close);
    coordinator.select('section-a' as SectionId, close);
    expect(close).not.toHaveBeenCalled();
    expect(coordinator.open()).toBe(true);
  });
});
