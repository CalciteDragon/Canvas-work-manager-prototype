import { ProjectSchema, type ProjectId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';

const NOW = '2026-08-24T16:00:00.000Z';

const create = (harness: ReturnType<typeof buildHarness>, overrides = {}) =>
  harness.projectService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId,
    name: 'Work Manager',
    ...overrides,
  });

describe('ProjectService.create', () => {
  it('creates in the actor’s workspace with clock timestamps', async () => {
    const harness = buildHarness();

    const project = await create(harness);

    expect(() => ProjectSchema.parse(project)).not.toThrow();
    expect(project).toMatchObject({
      id: 'project-1',
      workspaceId: harness.actor.workspaceId,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('rejects a create naming another workspace', async () => {
    const harness = buildHarness();

    await expect(create(harness, { workspaceId: harness.other.workspaceId })).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('nests under a parent in the same workspace', async () => {
    const harness = buildHarness();

    const child = await create(harness, { name: 'Sub', parentProjectId: MINE });

    expect(child.parentProjectId).toBe(MINE);
  });

  it('rejects a parent that does not exist or belongs to another workspace', async () => {
    const harness = buildHarness();

    await expect(create(harness, { parentProjectId: 'project-nope' })).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(create(harness, { parentProjectId: THEIRS })).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('ProjectService nesting rules', () => {
  it('rejects a project as its own parent', async () => {
    const harness = buildHarness();

    await expect(
      harness.projectService.update(harness.actor, MINE, { parentProjectId: MINE }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('rejects a parent that would create a cycle', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });
    const grandchild = await create(harness, { name: 'Grandchild', parentProjectId: child.id });

    // Making the root a child of its own grandchild closes the loop.
    await expect(
      harness.projectService.update(harness.actor, MINE, { parentProjectId: grandchild.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('ProjectService.archive', () => {
  it('sets status archived and records project.archived', async () => {
    const harness = buildHarness();

    const archived = await harness.projectService.archive(harness.actor, MINE);

    expect(archived.status).toBe('archived');
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({
      action: 'project.archived',
      entityId: MINE,
    });
  });

  it('refuses while a child is active, and allows it once the child is archived', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });

    await expect(harness.projectService.archive(harness.actor, MINE)).rejects.toBeInstanceOf(DomainRuleError);

    await harness.projectService.archive(harness.actor, child.id);
    expect((await harness.projectService.archive(harness.actor, MINE)).status).toBe('archived');
  });

  it('applies the same rule through PATCH, and emits project.archived rather than project.updated', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });

    // The exposed route is PATCH, so a rule only archive() enforced would be decorative.
    await expect(
      harness.projectService.update(harness.actor, MINE, { status: 'archived' }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    await harness.projectService.archive(harness.actor, child.id);
    await harness.projectService.update(harness.actor, MINE, { status: 'archived' });

    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ action: 'project.archived' });
  });

  it('is idempotent', async () => {
    const harness = buildHarness();
    const archived = await harness.projectService.archive(harness.actor, MINE);

    expect(await harness.projectService.archive(harness.actor, MINE)).toEqual(archived);
  });
});

describe('ProjectService scoping', () => {
  it('ignores a workspaceId query naming another workspace', async () => {
    const harness = buildHarness();

    const listed = await harness.projectService.list(harness.actor, { workspaceId: harness.other.workspaceId });

    expect(listed.map((project) => project.id)).toEqual([MINE]);
  });

  it('treats another workspace’s project as missing on get and update', async () => {
    const harness = buildHarness();

    await expect(harness.projectService.get(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      harness.projectService.update(harness.actor, THEIRS, { name: 'Mine now' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('raises EntityNotFoundError for an unknown id', async () => {
    const harness = buildHarness();

    await expect(harness.projectService.get(harness.actor, 'project-nope' as ProjectId)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });
});

describe('ProjectService.update', () => {
  it('clears a nullable field on null and leaves it alone when omitted', async () => {
    const harness = buildHarness();
    const project = await create(harness, { description: 'Original' });

    expect((await harness.projectService.update(harness.actor, project.id, { name: 'Renamed' })).description).toBe(
      'Original',
    );
    expect(
      (await harness.projectService.update(harness.actor, project.id, { description: null })).description,
    ).toBeUndefined();
  });

  it('records project.updated for an ordinary edit', async () => {
    const harness = buildHarness();

    await harness.projectService.update(harness.actor, MINE, { name: 'Renamed' });

    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({
      action: 'project.updated',
      summary: 'Updated "Renamed"',
    });
  });
});
