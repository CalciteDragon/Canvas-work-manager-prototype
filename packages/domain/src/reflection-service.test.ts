import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { EntityNotFoundError, PermissionDeniedError } from './errors';

describe('ReflectionService', () => {
  it('creates body-only and prompted/titled reflections, newest first', async () => {
    const harness = buildHarness();
    const first = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'First' });
    harness.clock.setNow(new Date('2026-08-25T16:00:00.000Z'));
    const second = await harness.reflectionService.create(harness.actor, { projectId: MINE, title: 'Checkpoint', body: 'Second', prompt: 'What changed?' });
    expect((await harness.reflectionService.list(harness.actor, MINE)).map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(second).toMatchObject({ title: 'Checkpoint', prompt: 'What changed?' });
  });

  it('edits title/body, preserves createdAt, and updates through Clock', async () => {
    const harness = buildHarness();
    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, title: 'Old', body: 'Before' });
    harness.clock.setNow(new Date('2026-08-25T16:00:00.000Z'));
    const updated = await harness.reflectionService.update(harness.actor, reflection.id, { title: null, body: 'After' });
    expect(updated.title).toBeUndefined();
    expect(updated.createdAt).toBe(reflection.createdAt);
    expect(updated.updatedAt).toBe('2026-08-25T16:00:00.000Z');
  });

  it('records activity atomically and hides foreign data', async () => {
    const harness = buildHarness();
    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'Visible' });
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ action: 'reflection.added', entityId: reflection.id });
    await expect(harness.reflectionService.create(harness.actor, { projectId: THEIRS, body: 'No' })).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.reflectionService.list(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('ReflectionService permissions (§51, §53)', () => {
  it('refuses a read without reflections.read and a write without reflections.write', async () => {
    const harness = buildHarness();

    await expect(harness.reflectionService.list(agentActorFor(0, ['reflections.write']), MINE)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(
      harness.reflectionService.create(agentActorFor(0, ['reflections.read']), { projectId: MINE, body: 'No' }),
    ).rejects.toThrow('connection "agent-claude" is missing permission "reflections.write"');
  });
});
