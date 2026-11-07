import { ProjectSchema, isSubproject, type CreateProjectInput, type CreateSubprojectInput, type ProjectId, type ProjectPageId, type SectionId, type SectionShortcutId } from '@cwm/contracts';
import { buildSeed } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';
import { liveSubtree } from './project-visibility';

const NOW = '2026-08-24T16:00:00.000Z';

type CreateOverrides = Partial<CreateSubprojectInput>;

/**
 * A root unless a test says otherwise. `kind` is required on the input (§26), and typing the
 * overrides as the sub-project branch is what lets a caller pass `parentProjectId` — the
 * default `{}` inferred as `{}` and could carry neither.
 */
const createWrite = (harness: ReturnType<typeof buildHarness>, overrides: CreateOverrides = {}) =>
  harness.projectWriteService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId,
    name: 'Work Manager',
    // A parent is what makes something a unit of work rather than a workspace (§26), so the
    // helper derives the discriminator and the cases below stay about what they were about.
    kind: overrides.parentProjectId === undefined ? 'root' : 'subproject',
    ...overrides,
  } as CreateProjectInput);
const create = async (harness: ReturnType<typeof buildHarness>, overrides: CreateOverrides = {}) =>
  (await createWrite(harness, overrides)).project;

describe('ProjectService.create', () => {
  it('creates in the actor’s workspace with clock timestamps', async () => {
    const harness = buildHarness();

    const write = await createWrite(harness);
    const project = write.project;

    expect(() => ProjectSchema.parse(project)).not.toThrow();
    expect(project).toMatchObject({
      id: 'project-1',
      workspaceId: harness.actor.workspaceId,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(write.operation).toMatchObject({ operation: 'project.add', label: 'Created "Work Manager"' });
    const action = await harness.operationActions.find(write.operation!.actionId);
    expect(action).toMatchObject({ order: 1, state: 'applied', operation: {
      version: 1, type: 'project.add', project,
      page: { projectId: project.id, kind: 'home', enabled: true },
    } });
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

  it('records a sub-project in its own history rather than its parent’s', async () => {
    const harness = buildHarness();

    const write = await harness.projectWriteService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Own history',
    });
    const history = await harness.operationHistories.find(write.operation!.historyId);
    const [action] = await harness.operationActions.list({ historyId: write.operation!.historyId });

    expect(history).toMatchObject({ projectId: write.project.id, workspaceId: harness.actor.workspaceId });
    expect(write.operation).toMatchObject({ operation: 'project.add', label: 'Created "Own history"', revision: 1 });
    expect(action?.operation).toMatchObject({ type: 'project.add', project: { id: write.project.id }, page: { projectId: write.project.id, kind: 'work' } });
    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).historyId).toBeNull();
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

    await expect(harness.projectService.archive(harness.actor, MINE)).rejects.toThrow(`project "${MINE}" still has active workstreams`);

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

/**
 * `nested-projects`' shape on the harness: MINE → Kitchen (Active) → Cabinets (On hold); MINE →
 * Garden (Completed); MINE → Legacy (archived, unmarked) → Shelving (live, hidden: the trap state).
 */
const group = async (harness: ReturnType<typeof buildHarness>) => {
  const kitchen = await create(harness, { name: 'Kitchen', parentProjectId: MINE, status: 'active' });
  const cabinets = await create(harness, { name: 'Cabinets', parentProjectId: kitchen.id, status: 'on_hold' });
  const garden = (await harness.projectWriteService.update(harness.actor, (await create(harness, { name: 'Garden', parentProjectId: MINE })).id, { status: 'completed' })).project;
  const legacy = await create(harness, { name: 'Legacy', parentProjectId: MINE });
  const shelving = await create(harness, { name: 'Shelving', parentProjectId: legacy.id, status: 'active' });
  await harness.projectWriteService.archive(harness.actor, shelving.id);
  await harness.projectWriteService.archive(harness.actor, legacy.id);
  await harness.projects.update({ ...(await harness.projects.find(shelving.id))!, status: 'active' });
  return { kitchen, cabinets, garden, legacy, shelving, ids: [kitchen.id, cabinets.id, garden.id] };
};
const stored = async (harness: ReturnType<typeof buildHarness>, id: ProjectId) => (await harness.projects.find(id))!;
const documentOf = (harness: ReturnType<typeof buildHarness>) => JSON.stringify(harness.store.snapshot());

describe('ProjectService group archive (Slice 80, R1–R3, R7)', () => {
  it('archiving with the whole live subtree named marks each at its recorded status, as one action and one Activity line', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden, ids } = await group(harness);
    const lines = (await harness.activity.list(harness.actor)).length;

    const write = await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: ids });

    expect(write.project.status).toBe('archived');
    expect(write.cascaded?.map((project) => project.id)).toEqual(ids);
    expect(await stored(harness, kitchen.id)).toMatchObject({ status: 'archived', archivedWithProject: { projectId: MINE, status: 'active' } });
    expect(await stored(harness, cabinets.id)).toMatchObject({ status: 'archived', archivedWithProject: { projectId: MINE, status: 'on_hold' } });
    expect(await stored(harness, garden.id)).toMatchObject({ status: 'archived', archivedWithProject: { projectId: MINE, status: 'completed', completedAt: garden.completedAt } });
    expect(await stored(harness, garden.id)).not.toHaveProperty('completedAt');
    expect(write.operation).toMatchObject({ operation: 'project.archive', label: 'Archived "Project project-mine" and 3 workstreams' });
    expect(await harness.operationActions.find(write.operation!.actionId)).toMatchObject({ operation: { workstreams: [
      { projectId: kitchen.id, status: 'active' }, { projectId: cabinets.id, status: 'on_hold' }, { projectId: garden.id, status: 'completed', completedAt: garden.completedAt },
    ] } });
    const activity = await harness.activity.list(harness.actor);
    expect(activity).toHaveLength(lines + 1);
    expect(activity[0]).toMatchObject({ action: 'project.archived', entityId: MINE, summary: 'Archived "Project project-mine" and 3 workstreams' });
    expect((await harness.operationHistoryService.summary(harness.actor, kitchen.id)).undo?.label).toBe('Created "Kitchen"');
  });

  it('says one workstream in the singular, and a plain archive records no group', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden } = await group(harness);
    const one = await harness.projectWriteService.archive(harness.actor, kitchen.id, { archiveWorkstreamIds: [cabinets.id] });
    expect(one.operation?.label).toBe('Archived "Kitchen" and 1 workstream');

    const plain = await harness.projectWriteService.archive(harness.actor, garden.id);
    expect(plain.operation?.label).toBe('Archived "Garden"');
    expect(plain).not.toHaveProperty('cascaded');
    expect((await harness.operationActions.find(plain.operation!.actionId))?.operation).not.toHaveProperty('workstreams');
  });

  it('the walk stops at an archived node: a live project hidden under it is neither named nor changed', async () => {
    const harness = buildHarness();
    const { legacy, shelving, ids } = await group(harness);
    const before = [await stored(harness, legacy.id), await stored(harness, shelving.id)];

    await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: ids });

    expect([await stored(harness, legacy.id), await stored(harness, shelving.id)]).toEqual(before);
    await expect(harness.projectWriteService.archive(harness.actor, (await create(harness, { name: 'Other' })).id, { archiveWorkstreamIds: [shelving.id] }))
      .rejects.toThrow('is not a live workstream under it');
  });

  it.each([
    ['no ids at all', (_ids: ProjectId[]) => undefined],
    ['an empty list', (_ids: ProjectId[]) => []],
    ['a partial list', (ids: ProjectId[]) => ids.slice(0, 1)],
  ])('with %s, refuses naming every live workstream and its id, and writes nothing', async (_name, list) => {
    const harness = buildHarness();
    const { ids } = await group(harness);
    const before = documentOf(harness);

    const refusal = harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: list(ids) });

    await expect(refusal).rejects.toBeInstanceOf(DomainRuleError);
    await expect(refusal).rejects.toThrow(`project "${MINE}" still has active workstreams: "Kitchen" [${ids[0]}], "Cabinets" [${ids[1]}], "Garden" [${ids[2]}]`);
    expect(documentOf(harness)).toEqual(before);
  });

  it('a foreign and a nonexistent id refuse with identical text, and write nothing', async () => {
    const harness = buildHarness();
    const { ids } = await group(harness);
    const before = documentOf(harness);
    const text = (id: string) => `project "${MINE}" cannot archive "${id}": it is not a live workstream under it`;

    await expect(harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: [...ids, THEIRS] })).rejects.toThrow(text(THEIRS));
    await expect(harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: [...ids, 'project-nope' as ProjectId] })).rejects.toThrow(text('project-nope'));
    expect(documentOf(harness)).toEqual(before);
  });

  it('a partial list that also holds a stranger still names every live workstream, so one retry can succeed', async () => {
    const harness = buildHarness();
    const { ids } = await group(harness);

    const refusal = harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: [ids[0]!, 'project-nope' as ProjectId] });

    await expect(refusal).rejects.toThrow(`its live workstreams are "Kitchen" [${ids[0]}], "Cabinets" [${ids[1]}], "Garden" [${ids[2]}]`);
  });

  it('holds through update as through archive: PATCH without ids refuses, with them commits', async () => {
    const harness = buildHarness();
    const { ids, kitchen } = await group(harness);

    await expect(harness.projectWriteService.update(harness.actor, MINE, { status: 'archived' })).rejects.toThrow('still has active workstreams');
    const write = await harness.projectWriteService.update(harness.actor, MINE, { status: 'archived', archiveWorkstreamIds: ids });

    expect(write.cascaded?.map((project) => project.id)).toEqual(ids);
    expect(await stored(harness, kitchen.id)).toMatchObject({ archivedWithProject: { projectId: MINE } });
  });

  it('the input on anything but an archive transition refuses; an empty list is absent', async () => {
    const harness = buildHarness();
    const { ids } = await group(harness);

    await expect(harness.projectWriteService.update(harness.actor, MINE, { name: 'x', archiveWorkstreamIds: ids })).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.projectWriteService.update(harness.actor, MINE, { status: 'on_hold', archiveWorkstreamIds: ids })).rejects.toBeInstanceOf(DomainRuleError);
    expect((await harness.projectWriteService.update(harness.actor, MINE, { name: 'x', archiveWorkstreamIds: [] })).project.name).toBe('x');
  });

  it('on an already archived project the list is ignored: a retry is the no-op it needs, and a rename still renames', async () => {
    const harness = buildHarness();
    const { ids } = await group(harness);
    await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: ids });
    const before = documentOf(harness);

    const retry = await harness.projectWriteService.update(harness.actor, MINE, { status: 'archived', archiveWorkstreamIds: ids });
    const retried = await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: ids });
    expect(retry.operation).toBeNull();
    expect(retried.operation).toBeNull();
    expect(retry).not.toHaveProperty('cascaded');
    expect(documentOf(harness)).toEqual(before);

    const renamed = await harness.projectWriteService.update(harness.actor, MINE, { status: 'archived', archiveWorkstreamIds: ids, name: 'Renamed' });
    expect(renamed.project.name).toBe('Renamed');
    expect(renamed.operation?.operation).toBe('project.update');
  });

  it('an actor without projects.write is forbidden; with it alone a group archive needs no read grant', async () => {
    const harness = buildHarness();
    const { ids } = await group(harness);

    await expect(harness.projectWriteService.archive(agentActorFor(0, ['projects.read', 'tasks.write']), MINE, { archiveWorkstreamIds: ids })).rejects.toBeInstanceOf(PermissionDeniedError);
    const write = await harness.projectWriteService.archive(agentActorFor(0, ['projects.write']), MINE, { archiveWorkstreamIds: ids });
    expect(write.cascaded).toHaveLength(3);
  });

  it('a cycle in a hand-built project list terminates the walk', () => {
    const base = { workspaceId: 'w', name: 'x', status: 'active', projectLayoutMode: 'flow', progressFormula: 'count', createdAt: NOW, updatedAt: NOW };
    const a = { ...base, id: 'a', kind: 'subproject', parentProjectId: 'b' };
    const b = { ...base, id: 'b', kind: 'subproject', parentProjectId: 'a' };
    expect(liveSubtree([a, b] as never, 'a' as ProjectId).map((project) => project.id)).toEqual(['b']);
  });

  it('archives and moves in one call', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden } = await group(harness);

    const write = await harness.projectWriteService.update(harness.actor, kitchen.id, { status: 'archived', parentProjectId: garden.id, archiveWorkstreamIds: [cabinets.id] });

    expect(write.project.parentProjectId).toBe(garden.id);
    expect(await stored(harness, cabinets.id)).toMatchObject({ archivedWithProject: { projectId: kitchen.id } });
  });

  it('a move of the owner carries its group, and the marker invariant holds at commit', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden } = await group(harness);
    await harness.projectWriteService.archive(harness.actor, kitchen.id, { archiveWorkstreamIds: [cabinets.id] });

    const moved = await harness.projectWriteService.update(harness.actor, kitchen.id, { parentProjectId: garden.id });

    expect(moved.project.parentProjectId).toBe(garden.id);
    expect((await stored(harness, cabinets.id)).parentProjectId).toBe(kitchen.id);
    expect(await stored(harness, cabinets.id)).toMatchObject({ archivedWithProject: { projectId: kitchen.id } });
  });
});

describe('ProjectService restore of a group (Slice 80, R4, R5, R7)', () => {
  it('restore revives exactly the marked, each to its recorded status and completion time, clearing markers; one archived alone stays', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden, legacy, ids } = await group(harness);
    await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: ids });
    const legacyBefore = await stored(harness, legacy.id);
    const lines = (await harness.activity.list(harness.actor)).length;

    const write = await harness.projectWriteService.update(harness.actor, MINE, { status: 'on_hold' });

    expect(write.cascaded?.map((project) => project.id)).toEqual(ids);
    expect(write.project.status).toBe('on_hold');
    const kitchenNow = await stored(harness, kitchen.id);
    expect(kitchenNow.status).toBe('active');
    expect(kitchenNow).not.toHaveProperty('archivedWithProject');
    expect((await stored(harness, cabinets.id)).status).toBe('on_hold');
    expect(await stored(harness, garden.id)).toMatchObject({ status: 'completed', completedAt: garden.completedAt });
    expect(await stored(harness, legacy.id)).toEqual(legacyBefore);
    expect(write.operation).toMatchObject({ operation: 'project.reactivate', label: 'Reactivated "Project project-mine" and 3 workstreams' });
    const activity = await harness.activity.list(harness.actor);
    expect(activity).toHaveLength(lines + 1);
    expect(activity[0]).toMatchObject({ action: 'project.updated', summary: 'Reactivated "Project project-mine" and 3 workstreams' });
  });

  it('a restore with no group keeps its old line and answers no cascaded', async () => {
    const harness = buildHarness();
    await harness.projectWriteService.archive(harness.actor, MINE);
    const write = await harness.projectWriteService.update(harness.actor, MINE, { status: 'active' });

    expect(write).not.toHaveProperty('cascaded');
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ summary: 'Updated "Project project-mine"' });
  });

  it('a restore under an archived ancestor refuses and keeps every marker', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden } = await group(harness);
    await harness.projectWriteService.archive(harness.actor, kitchen.id, { archiveWorkstreamIds: [cabinets.id] });
    await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: [garden.id] });
    const before = documentOf(harness);

    await expect(harness.projectWriteService.update(harness.actor, kitchen.id, { status: 'active' })).rejects.toThrow(`project "${MINE}" is archived and cannot take new work`);

    expect(documentOf(harness)).toEqual(before);
    expect(await stored(harness, kitchen.id)).toMatchObject({ status: 'archived' });
    expect(await stored(harness, kitchen.id)).not.toHaveProperty('archivedWithProject');
  });

  it('a marked project refuses a status change, a reparent and both in one call, naming the owner; a rename succeeds', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden } = await group(harness);
    await harness.projectWriteService.archive(harness.actor, kitchen.id, { archiveWorkstreamIds: [cabinets.id] });
    const before = documentOf(harness);
    const text = `project "${cabinets.id}" was archived with "${kitchen.id}"; restore "${kitchen.id}" to bring it back`;

    await expect(harness.projectWriteService.update(harness.actor, cabinets.id, { status: 'active' })).rejects.toThrow(text);
    await expect(harness.projectWriteService.update(harness.actor, cabinets.id, { parentProjectId: garden.id })).rejects.toThrow(text);
    await expect(harness.projectWriteService.update(harness.actor, cabinets.id, { status: 'active', parentProjectId: garden.id })).rejects.toThrow(text);
    expect(documentOf(harness)).toEqual(before);

    expect((await harness.projectWriteService.update(harness.actor, cabinets.id, { name: 'Doors' })).project.name).toBe('Doors');
    const again = await harness.projectWriteService.update(harness.actor, cabinets.id, { status: 'archived', parentProjectId: kitchen.id });
    expect(again.operation).toBeNull();
  });

  it('an unmarked archived project can still reactivate and move in one call', async () => {
    const harness = buildHarness();
    const { legacy, garden, shelving } = await group(harness);
    await harness.projects.update({ ...(await stored(harness, shelving.id)), status: 'archived' });

    const moved = await harness.projectWriteService.update(harness.actor, shelving.id, { status: 'active', parentProjectId: garden.id });

    expect(moved.project).toMatchObject({ status: 'active', parentProjectId: garden.id });
    expect((await stored(harness, legacy.id)).status).toBe('archived');
  });

  it('nested owners: Home’s restore leaves Kitchen listed as archived with its own group', async () => {
    const harness = buildHarness();
    const { kitchen, cabinets, garden } = await group(harness);
    await harness.projectWriteService.archive(harness.actor, kitchen.id, { archiveWorkstreamIds: [cabinets.id] });
    await harness.projectWriteService.archive(harness.actor, MINE, { archiveWorkstreamIds: [garden.id] });

    await harness.projectWriteService.update(harness.actor, MINE, { status: 'active' });

    expect((await stored(harness, garden.id)).status).toBe('completed');
    expect((await stored(harness, kitchen.id)).status).toBe('archived');
    expect(await stored(harness, cabinets.id)).toMatchObject({ archivedWithProject: { projectId: kitchen.id } });
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

describe('ProjectService write results and history (Slices 39 and 42, §31)', () => {
  it('answers one receipt per changed update and archive, and a null receipt for a no-op', async () => {
    const harness = buildHarness();
    const child = await create(harness, { name: 'Child', parentProjectId: MINE });

    const renamed = await harness.projectWriteService.update(harness.actor, child.id, { name: 'Renamed', targetDate: '2026-10-01' });
    expect(renamed.project).toMatchObject({ id: child.id, name: 'Renamed', targetDate: '2026-10-01' });
    expect(renamed.operation).toMatchObject({ operation: 'project.update', label: 'Edited "Renamed"', revision: 2 });

    const archived = await harness.projectWriteService.archive(harness.actor, child.id);
    expect(archived.operation).toMatchObject({ operation: 'project.archive', historyId: renamed.operation!.historyId, revision: 3 });

    expect((await harness.projectWriteService.archive(harness.actor, child.id)).operation).toBeNull();
    expect((await harness.projectWriteService.update(harness.actor, child.id, { name: 'Renamed' })).operation).toBeNull();
    expect(await harness.operationActions.list({ historyId: renamed.operation!.historyId })).toHaveLength(3);
  });

  it('records a PATCH that changes status and other fields as one action and one activity event', async () => {
    const harness = buildHarness();
    const before = (await harness.activity.list(harness.actor)).length;

    const result = await harness.projectWriteService.update(harness.actor, MINE, { status: 'completed', name: 'Done' });

    // Two user-facing edits in one PATCH: the label says Edited rather than naming one of them.
    expect(result.operation).toMatchObject({ operation: 'project.update', label: 'Edited "Done"' });
    expect(await harness.operationActions.list({ historyId: result.operation!.historyId })).toHaveLength(1);
    expect(await harness.activity.list(harness.actor)).toHaveLength(before + 1);
  });

  it('names the new parent in a reparent’s label, and leaves the archive label alone (Slice 41)', async () => {
    const harness = buildHarness();
    const other = await harness.projectService.create(harness.actor, { workspaceId: harness.actor.workspaceId, kind: 'root', name: 'Garden' });
    const child = await create(harness, { name: 'Shed', parentProjectId: MINE });

    const moved = await harness.projectWriteService.update(harness.actor, child.id, { parentProjectId: other.id });
    expect(moved.operation).toMatchObject({ operation: 'project.update', label: 'Moved "Shed" under Garden' });
    expect((await harness.projectWriteService.archive(harness.actor, child.id)).operation).toMatchObject({ label: 'Archived "Shed"' });
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

  it('rolls back the project, page, Activity and creation action when persistence fails', async () => {
    const harness = buildHarness();
    const before = JSON.stringify(harness.store.snapshot());
    harness.store.persistFailure = new Error('disk full');

    await expect(createWrite(harness)).rejects.toThrow('disk full');
    harness.store.persistFailure = undefined;

    expect(JSON.stringify(harness.store.snapshot())).toEqual(before);
  });
});

/**
 * A move to another root carries every section in the subtree with it, so an old-root Home shortcut
 * placing one of them would cross root trees — which commit-time integrity rejects as a defect, not a
 * refusal. The forward write refuses first, the same rule a reparent reversal applies (§§26, 27, 61).
 */
describe('ProjectService.update refuses a reparent that would carry a shortcut across roots', () => {
  const setUp = async () => {
    const harness = buildHarness();
    const other = await create(harness, { name: 'Other root' });
    const child = await create(harness, { name: 'Kitchen', parentProjectId: MINE });
    const grandchild = await create(harness, { name: 'Cabinets', parentProjectId: child.id });
    const staying = await create(harness, { name: 'Staying', parentProjectId: MINE });
    const home = (await harness.pages.list({ projectId: MINE })).find(({ kind }) => kind === 'home')!;
    return { harness, other, child, grandchild, staying, home };
  };
  const place = async (harness: ReturnType<typeof buildHarness>, projectId: ProjectId, pageId: ProjectPageId) => {
    const { section } = await harness.sectionWriteService.add(harness.actor, projectId, { type: 'markdown', title: 'Notes' });
    return (await harness.sectionShortcutWriteService.create(harness.actor, MINE, { pageId, sourceSectionId: section.id })).shortcut;
  };
  const written = (harness: ReturnType<typeof buildHarness>) => {
    const document = harness.store.snapshot();
    return JSON.stringify([document.projects, document.sectionShortcuts, document.operationActions, document.activityEvents]);
  };

  it('names the placement of a descendant’s section, writes nothing, then moves once it is removed', async () => {
    const { harness, other, child, grandchild, home } = await setUp();
    const shortcut = await place(harness, grandchild.id, home.id);
    const before = written(harness);

    const refusal = harness.projectWriteService.update(harness.actor, child.id, { parentProjectId: other.id });
    await expect(refusal).rejects.toBeInstanceOf(DomainRuleError);
    await expect(refusal).rejects.toThrow(shortcut.id);
    await expect(refusal).rejects.toThrow(/remove/);
    expect(written(harness)).toEqual(before);

    await harness.sectionShortcutWriteService.remove(harness.actor, shortcut.id);
    const moved = await harness.projectWriteService.update(harness.actor, child.id, { parentProjectId: other.id });
    expect(moved.project.parentProjectId).toBe(other.id);
  });

  it('names every carried placement, refuses a combined edit whole, and leaves the cycle refusal first', async () => {
    const { harness, other, child, grandchild, home } = await setUp();
    const first = await place(harness, child.id, home.id);
    const second = await place(harness, grandchild.id, home.id);
    const before = written(harness);

    const refusal = harness.projectWriteService.update(harness.actor, child.id, { name: 'Renamed', parentProjectId: other.id });
    await expect(refusal).rejects.toThrow(first.id);
    await expect(refusal).rejects.toThrow(second.id);
    expect(written(harness)).toEqual(before);

    // A destination inside the subject is a cycle before it is a move to anywhere.
    await expect(harness.projectWriteService.update(harness.actor, child.id, { parentProjectId: grandchild.id })).rejects.toThrow(/nested inside itself/);
  });

  it('allows a move within the root, and a cross-root move whose placements source work that stays', async () => {
    const { harness, other, child, staying, home } = await setUp();
    await place(harness, child.id, home.id);
    await place(harness, staying.id, home.id);

    // Same root: the placement stays inside one tree, so nothing crosses.
    expect((await harness.projectWriteService.update(harness.actor, child.id, { parentProjectId: staying.id })).project.parentProjectId).toBe(staying.id);
    await harness.projectWriteService.update(harness.actor, child.id, { parentProjectId: MINE });

    const mover = await create(harness, { name: 'Mover', parentProjectId: MINE });
    expect((await harness.projectWriteService.update(harness.actor, mover.id, { parentProjectId: other.id })).project.parentProjectId).toBe(other.id);
  });
});

/**
 * Slice 65: with Work canvases as destinations a placement has two ends that can each sit inside
 * the moving subtree. A cross-root move refuses each placement with **exactly one** end inside it;
 * one with both ends inside travels with the subtree and stays same-root.
 */
describe('ProjectService.update applies the one-end-inside rule to Work canvas placements (Slice 65)', () => {
  const KITCHEN = 'project-kitchen' as ProjectId;
  const GARDEN = 'project-garden' as ProjectId;
  const CABINETS = 'project-cabinets' as ProjectId;
  const GARDEN_BRIEF = 'section-project-garden-brief' as SectionId;

  const setUp = async () => {
    const harness = buildHarness(buildSeed('nested-projects'));
    const other = await create(harness, { name: 'Other root' });
    return { harness, other };
  };
  const placeOn = async (harness: ReturnType<typeof buildHarness>, projectId: ProjectId, sourceSectionId: SectionId) =>
    (await harness.sectionShortcutWriteService.create(harness.actor, projectId, { pageId: `page-${projectId}` as ProjectPageId, sourceSectionId })).shortcut;
  const cabinetsSection = async (harness: ReturnType<typeof buildHarness>) =>
    (await harness.sectionWriteService.add(harness.actor, CABINETS, { type: 'markdown', title: 'Hinges' })).section.id;
  const messageOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof DomainRuleError) return error.message;
      throw error;
    }
    throw new Error('expected a refusal');
  };

  it('S-dest: refuses moving a workstream whose Work places a section that stays behind, naming only that placement', async () => {
    const { harness, other } = await setUp();
    const shortcut = await placeOn(harness, CABINETS, GARDEN_BRIEF);
    const before = harness.store.snapshot();

    const message = await messageOf(harness.projectWriteService.update(harness.actor, CABINETS, { parentProjectId: other.id }));
    expect(message).toContain(shortcut.id);
    expect(message).not.toMatch(/shortcut-renovation/);
    // Slice 68: the refusal says where the placement sits and what it places, so it can be removed in one step.
    expect(message).toContain('on the Work page of "Cabinets", placing "Markdown" from "Garden"');
    expect(message).toContain('remove it from that page, then retry');
    expect(harness.store.snapshot()).toEqual(before);

    // Within the root nothing crosses, whichever end moves.
    expect((await harness.projectWriteService.update(harness.actor, CABINETS, { parentProjectId: GARDEN })).project.parentProjectId).toBe(GARDEN);
  });

  it('S-src: refuses moving a workstream whose section another Work canvas places, naming only that placement', async () => {
    const { harness, other } = await setUp();
    const shortcut = await placeOn(harness, GARDEN, await cabinetsSection(harness));

    const message = await messageOf(harness.projectWriteService.update(harness.actor, CABINETS, { parentProjectId: other.id }));
    expect(message).toContain(shortcut.id);
    expect(message).not.toMatch(/shortcut-renovation/);
    expect(message).toContain('on the Work page of "Garden", placing "Hinges" from "Cabinets"');
  });

  /** Slice 68: the seeded placements, described from the seed's own names. */
  const renovationHome = async (harness: ReturnType<typeof buildHarness>) =>
    (await harness.pages.list({ projectId: 'project-renovation' as ProjectId })).find(({ kind }) => kind === 'home')!;
  const SEEDED = ['shortcut-renovation-kitchen-tasks', 'shortcut-renovation-kitchen-reflections'];

  it('describes both seeded Home placements when Kitchen moves, with the plural repair', async () => {
    const { harness, other } = await setUp();

    const message = await messageOf(harness.projectWriteService.update(harness.actor, KITCHEN, { parentProjectId: other.id }));

    expect(message).toMatch(/^project "project-kitchen" cannot move to another root: shortcuts /);
    expect(message).toContain(`"${SEEDED[0]}" (on the Home page of "Home renovation", placing "Task List" from "Kitchen")`);
    expect(message).toContain(`"${SEEDED[1]}" (on the Home page of "Home renovation", placing "Reflections" from "Kitchen")`);
    expect(message).toContain('remove each from its page, then retry');
  });

  it('names all five carried placements, describes the first three, and writes nothing', async () => {
    const { harness, other } = await setUp();
    const home = await renovationHome(harness);
    const added: string[] = [];
    for (const title of ['Tiles', 'Lighting', 'Plumbing']) {
      const { section } = await harness.sectionWriteService.add(harness.actor, KITCHEN, { type: 'markdown', title });
      added.push((await harness.sectionShortcutWriteService.create(harness.actor, 'project-renovation' as ProjectId, { pageId: home.id, sourceSectionId: section.id })).shortcut.id);
    }
    const before = harness.store.snapshot();

    const message = await messageOf(harness.projectWriteService.update(harness.actor, KITCHEN, { parentProjectId: other.id }));

    for (const id of [...SEEDED, ...added]) expect(message).toContain(`"${id}"`);
    expect(message).toContain(`"${added[0]}" (on the Home page of "Home renovation", placing "Tiles" from "Kitchen")`);
    expect(message).not.toContain('placing "Lighting"');
    expect(message).not.toContain('placing "Plumbing"');
    expect(message).toContain(`and "${added[1]}", "${added[2]}" would cross root trees`);
    expect(harness.store.snapshot()).toEqual(before);
  });

  it('gives a projects.write-only actor the same described refusal (the accepted disclosure)', async () => {
    const { harness, other } = await setUp();
    await placeOn(harness, CABINETS, GARDEN_BRIEF);
    const writer = agentActorFor(0, ['projects.write']);

    const message = await messageOf(harness.projectWriteService.update(writer, CABINETS, { parentProjectId: other.id }));

    expect(message).toContain('on the Work page of "Cabinets", placing "Markdown" from "Garden"');
  });

  it('S-both: moves a workstream whose Work places a descendant section, and the placement stays valid', async () => {
    const { harness, other } = await setUp();
    for (const id of ['shortcut-renovation-kitchen-tasks', 'shortcut-renovation-kitchen-reflections']) {
      await harness.sectionShortcutWriteService.remove(harness.actor, id as SectionShortcutId);
    }
    const shortcut = await placeOn(harness, KITCHEN, await cabinetsSection(harness));

    const moved = await harness.projectWriteService.update(harness.actor, KITCHEN, { parentProjectId: other.id });

    expect(moved.project.parentProjectId).toBe(other.id);
    expect(await harness.sectionShortcutService.list(harness.actor, KITCHEN)).toEqual([
      expect.objectContaining({ id: shortcut.id, availability: 'available', breadcrumb: ['Other root', 'Kitchen', 'Cabinets'] }),
    ]);
  });
});
