import { describe, expect, it } from 'vitest';
import { buildHarness, MINE, THEIRS } from '../test/test-support';
import { EntityNotFoundError } from './errors';

describe('ProgressService', () => {
  it('distinguishes no tasks from zero completion', async () => {
    const harness = buildHarness();
    expect((await harness.progressService.calculate(harness.actor, MINE)).percentage).toBeNull();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Open' });
    expect(await harness.progressService.calculate(harness.actor, MINE)).toMatchObject({ percentage: 0, completed: 0, total: 1 });
  });

  it('counts all unarchived tasks including cancelled', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Done', status: 'done' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Cancelled', status: 'cancelled' });
    expect(await harness.progressService.calculate(harness.actor, MINE)).toMatchObject({ percentage: 50, completed: 1, total: 2 });
  });

  it('weights estimates and falls back to one for unestimated tasks', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { progressFormula: 'weighted' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Big', status: 'done', estimate: 3 });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Small' });
    expect(await harness.progressService.calculate(harness.actor, MINE)).toMatchObject({ formula: 'weighted', percentage: 75, completed: 3, total: 4 });
  });

  it('uses the canonical manual project value and hides foreign projects', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { progressFormula: 'manual', manualProgress: 42 });
    expect(await harness.progressService.calculate(harness.actor, MINE)).toMatchObject({ formula: 'manual', percentage: 42 });
    await expect(harness.progressService.calculate(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
