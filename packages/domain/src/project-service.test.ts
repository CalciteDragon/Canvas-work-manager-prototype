import { ProjectSchema, isSubproject, type CreateProjectInput, type CreateSubprojectInput, type ProjectId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';

const NOW = '2026-08-24T16:00:00.000Z';

type CreateOverrides = Partial<CreateSubprojectInput>;

/**
 * A root unless a test says otherwise. `kind` is required on the input (§26), and typing the
 * overrides as the sub-project branch is what lets a caller pass `parentProjectId` — the
 * default `{}` inferred as `{}` and could carry neither.
 */
const create = (harness: ReturnType<typeof buildHarness>, overrides: CreateOverrides = {}) =>
  harness.projectService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId,
    name: 'Work Manager',
    // A parent is what makes something a unit of work rather than a workspace (§26), so the
    // helper derives the discriminator and the cases below stay about what they were about.
    kind: overrides.parentProjectId === undefined ? 'root' : 'subproject',
    ...overrides,
  } as CreateProjectInput);

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

    await expect(create(harness, { parentProjectId: 'project-nope' as ProjectId })).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    await expect(create(harness, { parentProjectId: THEIRS })).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('requires a manual value when created in manual mode', async () => {
    const harness = buildHarness();

    await expect(create(harness, { progressFormula: 'manual' })).rejects.toBeInstanceOf(DomainRuleError);
    expect(await harness.projectService.list(harness.actor)).toHaveLength(1);
  });
});

describe('ProjectService nesting rules', () => {
  /**
   * Every case here reparents a **sub-project**. A root has no parent to change (§26) and is
   * refused before the ancestor walk is reached, so staging these on a root would prove the
   * kind guard twice over and the cycle rules not at all.
   */
  it('rejects a project as its own parent', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });

    await expect(
      harness.projectService.update(harness.actor, child.id, { parentProjectId: child.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('rejects a parent that would create a cycle', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });
    const grandchild = await create(harness, { name: 'Grandchild', parentProjectId: child.id });

    // Making the child a child of its own grandchild closes the loop.
    await expect(
      harness.projectService.update(harness.actor, child.id, { parentProjectId: grandchild.id }),
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
  it('persists the canonical progress formula and manual value', async () => {
    const harness = buildHarness();

    expect(
      await harness.projectService.update(harness.actor, MINE, {
        progressFormula: 'manual',
        manualProgress: 37,
      }),
    ).toMatchObject({ progressFormula: 'manual', manualProgress: 37 });
  });

  it('requires a manual value before entering manual mode', async () => {
    const harness = buildHarness();

    await expect(
      harness.projectService.update(harness.actor, MINE, { progressFormula: 'manual' }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
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

describe('ProjectService cycle walk termination', () => {
  it('terminates on a document that already contains a cycle', async () => {
    const harness = buildHarness();
    const a = await create(harness, { name: 'A', parentProjectId: MINE });
    const b = await create(harness, { name: 'B', parentProjectId: a.id });
    const outsider = await create(harness, { name: 'C', parentProjectId: MINE });

    // Forge the cycle behind the service's back, the way a hand-edited data file would.
    // Without a visited set the ancestor walk spins on resolved microtasks, which starves
    // the event loop rather than merely hanging one request.
    // Narrowed rather than cast: only a sub-project has a parent to forge, which is now a
    // fact the type system knows and this fixture has to satisfy.
    if (!isSubproject(a)) throw new Error('fixture A should be a sub-project');
    await harness.projects.update({ ...a, parentProjectId: b.id });

    // Reparenting a project *into* the loop is what makes the walk enter it. Reparenting one
    // of the two looped projects would not: its stored parent already equals the requested
    // one, and the service skips the check when the parent is unchanged.
    await expect(
      Promise.race([
        harness.projectService.update(harness.actor, outsider.id, { parentProjectId: a.id }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('walk did not terminate')), 1000)),
      ]),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('ProjectService permissions (§51, §53)', () => {
  it('refuses a read from an agent without projects.read', async () => {
    const harness = buildHarness();

    await expect(harness.projectService.list(agentActorFor(0, ['tasks.read']))).rejects.toThrow(PermissionDeniedError);
    await expect(harness.projectService.get(agentActorFor(0, ['tasks.read']), MINE)).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('refuses a write from an agent granted only reads', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.read']);

    await expect(
      harness.projectService.create(agent, { workspaceId: harness.actor.workspaceId, kind: 'root', name: 'New' }),
    ).rejects.toThrow('connection "agent-claude" is missing permission "projects.write"');
    await expect(harness.projectService.update(agent, MINE, { name: 'Renamed' })).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('lets an agent with projects.write archive without also holding projects.read', async () => {
    const harness = buildHarness();

    const archived = await harness.projectService.archive(agentActorFor(0, ['projects.write']), MINE);

    expect(archived.status).toBe('archived');
  });
});

/**
 * §26's structural rules, at the layer that has to hold them for every caller: HTTP, MCP and
 * the canvas all come through `ProjectService`.
 */
describe('ProjectService owner kinds and pages', () => {
  it('creates a root with exactly one enabled Home page', async () => {
    const harness = buildHarness();

    const project = await create(harness);

    expect(project.kind).toBe('root');
    expect(await harness.pages.list({ projectId: project.id })).toEqual([
      expect.objectContaining({ projectId: project.id, kind: 'home', enabled: true }),
    ]);
  });

  it('creates a sub-project with one work canvas and no tabs', async () => {
    const harness = buildHarness();
    const root = await create(harness);

    const child = await create(harness, { name: 'Work unit', parentProjectId: root.id });

    expect(child).toMatchObject({ kind: 'subproject', parentProjectId: root.id });
    expect(await harness.pages.list({ projectId: child.id })).toEqual([
      expect.objectContaining({ kind: 'work', enabled: true }),
    ]);
  });

  /**
   * The owner and its page are one write. Without the shared unit of work a failed page
   * insert would leave a project with nowhere to put a section — a state
   * `validateDocumentIntegrity` rejects, so every later commit in the session would fail.
   *
   * Forced by pre-inserting the page id the create is about to derive, so the repository
   * raises a conflict from inside the unit.
   */
  it('leaves no orphan project when its page cannot be written', async () => {
    const harness = buildHarness();
    await harness.pages.insert({
      id: 'projectPage-1' as Parameters<typeof harness.pages.insert>[0]['id'],
      projectId: MINE,
      kind: 'todos',
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(create(harness)).rejects.toThrow();

    expect(await harness.projects.find('project-1' as ProjectId)).toBeNull();
  });

  it('refuses a sub-project under an archived parent', async () => {
    const harness = buildHarness();
    const root = await create(harness);
    await harness.projectService.archive(harness.actor, root.id);

    await expect(create(harness, { name: 'Too late', parentProjectId: root.id })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
  });

  /**
   * Demotion — giving a root a parent — is the only half of kind-change the service can be
   * *asked* to do. Promotion was closed one layer earlier: `UpdateProjectInputSchema` dropped
   * `parentProjectId`'s nullability, so "clear the parent" is not an input that exists, and
   * `inputs.test.ts` is where that half is proven.
   */
  it('refuses to give a root a parent, which would change its kind', async () => {
    const harness = buildHarness();
    const root = await create(harness);
    const child = await create(harness, { name: 'Child', parentProjectId: root.id });

    await expect(
      harness.projectService.update(harness.actor, root.id, { parentProjectId: child.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  /** §45: the timestamp comes from the injected clock, and reopening does not leave it behind. */
  it('stamps completedAt on completion and clears it on reopening', async () => {
    const harness = buildHarness();
    const project = await create(harness);

    const completed = await harness.projectService.update(harness.actor, project.id, { status: 'completed' });
    expect(completed.completedAt).toBe(NOW);

    const reopened = await harness.projectService.update(harness.actor, project.id, { status: 'active' });
    expect(reopened.completedAt).toBeUndefined();
  });

  /**
   * `projects.write` alone still creates. The page insert is a write the service does on its
   * own behalf, so it must not start demanding a read grant the actor was never given.
   */
  it('creates for an agent granted projects.write alone', async () => {
    const harness = buildHarness();

    const project = await harness.projectService.create(agentActorFor(0, ['projects.write']), {
      workspaceId: harness.actor.workspaceId,
      kind: 'root',
      name: 'Agent root',
    });

    expect(await harness.pages.list({ projectId: project.id })).toHaveLength(1);
  });
});

describe('ProjectService write results and history (Slice 39, §31)', () => {
  it('answers one receipt per changed update and archive, and a null receipt for a no-op', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });

    const renamed = await harness.projectWriteService.update(harness.actor, child.id, { name: 'Renamed', targetDate: '2026-10-01' });
    expect(renamed.project).toMatchObject({ id: child.id, name: 'Renamed', targetDate: '2026-10-01' });
    expect(renamed.operation).toMatchObject({ operation: 'project.update', label: 'Updated "Renamed"', revision: 1 });

    const archived = await harness.projectWriteService.archive(harness.actor, child.id);
    expect(archived.operation).toMatchObject({ operation: 'project.archive', historyId: renamed.operation!.historyId, revision: 2 });

    expect((await harness.projectWriteService.archive(harness.actor, child.id)).operation).toBeNull();
    expect((await harness.projectWriteService.update(harness.actor, child.id, { name: 'Renamed' })).operation).toBeNull();
    expect(await harness.operationActions.list({ historyId: renamed.operation!.historyId })).toHaveLength(2);
  });

  it('records a PATCH that changes status and other fields as one action and one activity event', async () => {
    const harness = buildHarness();
    const before = (await harness.activity.list(harness.actor)).length;

    const result = await harness.projectWriteService.update(harness.actor, MINE, { status: 'completed', name: 'Done' });

    expect(result.operation).toMatchObject({ operation: 'project.update', label: 'Completed "Done"' });
    expect(await harness.operationActions.list({ historyId: result.operation!.historyId })).toHaveLength(1);
    expect(await harness.activity.list(harness.actor)).toHaveLength(before + 1);
  });

  it('records an agent’s write in its own history, never the person’s', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.write']);

    const { operation } = await harness.projectWriteService.update(agent, MINE, { icon: '🤖' });

    expect((await harness.operationHistories.find(operation!.historyId))).toMatchObject({ actor: 'agent', projectId: MINE });
    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).historyId).toBeNull();
  });

  it('leaves no project change, action or activity behind when persistence fails', async () => {
    const harness = buildHarness();
    const before = JSON.stringify(harness.store.snapshot());
    harness.store.persistFailure = new Error('disk full');

    await expect(harness.projectWriteService.update(harness.actor, MINE, { name: 'Lost' })).rejects.toThrow('disk full');
    harness.store.persistFailure = undefined;

    expect(JSON.stringify(harness.store.snapshot())).toEqual(before);
  });

  it('keeps create answering the bare project, with nothing recorded', async () => {
    const harness = buildHarness();

    const project = await create(harness);

    expect(project).not.toHaveProperty('operation');
    expect(harness.store.snapshot().operationActions).toEqual([]);
  });
});
