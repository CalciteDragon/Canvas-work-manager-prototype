import { PrototypeDocumentSchema, type Project, type ProjectId, type ProjectStatus } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { DomainRuleError } from './errors';
import { archivedAncestry, assertProjectWritable } from './project-visibility';

const AT = '2026-08-01T16:00:00.000Z';

const project = (id: string, status: ProjectStatus, parentProjectId?: string): Project =>
  PrototypeDocumentSchema.shape.projects.element.parse({
    id,
    workspaceId: 'workspace-1',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name: id,
    status,
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const id = (value: string) => value as ProjectId;

/** root(archived) → child(archived) → grandchild(active). The state a reactivation produces. */
const archivedRootTree = (): Project[] => [
  project('root', 'archived'),
  project('child', 'archived', 'root'),
  project('grandchild', 'active', 'child'),
];

/** root(active) → child(archived) → grandchild(active). An archived *intermediate* ancestor. */
const archivedMiddleTree = (): Project[] => [
  project('root', 'active'),
  project('child', 'archived', 'root'),
  project('grandchild', 'active', 'child'),
];

const repositoryOf = (projects: Project[]) => ({
  find: async (lookup: ProjectId) => projects.find(({ id: value }) => value === lookup) ?? null,
  list: async () => projects,
  insert: async () => undefined,
  update: async () => undefined,
});

describe('archivedAncestry', () => {
  it('separates archived in its own right from live underneath something archived', () => {
    const ancestry = archivedAncestry(archivedRootTree());

    expect(ancestry.isArchived(id('root'))).toBe(true);
    expect(ancestry.isArchived(id('grandchild'))).toBe(false);
    expect(ancestry.hasArchivedAncestor(id('grandchild'))).toBe(true);
    expect(ancestry.isHidden(id('grandchild'))).toBe(true);
  });

  /**
   * The distinction the whole module rests on. An archived project stays visible to the reads
   * that name it — §31 keeps its own page rendering — so `isHidden` must be false for it even
   * though its ancestor is archived too.
   */
  it('does not hide a project that is archived in its own right', () => {
    const ancestry = archivedAncestry(archivedRootTree());

    expect(ancestry.hasArchivedAncestor(id('child'))).toBe(true);
    expect(ancestry.isHidden(id('child'))).toBe(false);
    expect(ancestry.isHidden(id('root'))).toBe(false);
  });

  it('finds an archived ancestor in the middle of a live tree', () => {
    const ancestry = archivedAncestry(archivedMiddleTree());

    expect(ancestry.isHidden(id('grandchild'))).toBe(true);
    expect(ancestry.isHidden(id('root'))).toBe(false);
  });

  it('leaves an entirely live tree alone', () => {
    const ancestry = archivedAncestry([
      project('root', 'active'),
      project('child', 'active', 'root'),
      project('grandchild', 'active', 'child'),
    ]);

    for (const value of ['root', 'child', 'grandchild']) expect(ancestry.isHidden(id(value))).toBe(false);
  });

  /**
   * A cycle is unreachable through the services and rejected at load, but a hand-edited
   * `data.json` (§14) is free to contain one, and this runs on read paths that must answer.
   */
  it('terminates on a cyclic parent chain instead of hanging', () => {
    const cyclic = [project('a', 'active', 'b'), project('b', 'active', 'a')];

    const ancestry = archivedAncestry(cyclic);

    expect(ancestry.isHidden(id('a'))).toBe(false);
    expect(ancestry.hasArchivedAncestor(id('b'))).toBe(false);
  });

  it('answers false for a project the set does not contain', () => {
    const ancestry = archivedAncestry(archivedRootTree());

    expect(ancestry.isArchived(id('nobody'))).toBe(false);
    expect(ancestry.isHidden(id('nobody'))).toBe(false);
  });

  /**
   * The one way to hold this wrong, and it fails silently: filter the archived projects out
   * first and the ancestors are no longer there to be found.
   */
  it('needs the unfiltered set — a pre-filtered one silently finds nothing', () => {
    const preFiltered = archivedRootTree().filter(({ status }) => status !== 'archived');

    expect(archivedAncestry(preFiltered).isHidden(id('grandchild'))).toBe(false);
  });
});

describe('assertProjectWritable', () => {
  it('allows a write to a live project in a live tree', async () => {
    await expect(
      assertProjectWritable(repositoryOf([project('root', 'active')]), id('root')),
    ).resolves.toBeUndefined();
  });

  it('refuses a write to an archived project, with the message the services already gave', async () => {
    await expect(
      assertProjectWritable(repositoryOf([project('root', 'archived')]), id('root')),
    ).rejects.toThrow(/project "root" is archived; reactivate it first/);
  });

  it('refuses a write beneath an archived ancestor, naming the ancestor to reactivate', async () => {
    const failure = assertProjectWritable(repositoryOf(archivedMiddleTree()), id('grandchild'));

    await expect(failure).rejects.toBeInstanceOf(DomainRuleError);
    await expect(failure).rejects.toThrow(/inside archived project "child"; reactivate that first/);
  });

  it('stays quiet about a project it cannot find — that is the caller’s not-found to raise', async () => {
    await expect(assertProjectWritable(repositoryOf([]), id('gone'))).resolves.toBeUndefined();
  });

  it('terminates on a cyclic parent chain', async () => {
    const cyclic = [project('a', 'active', 'b'), project('b', 'active', 'a')];

    await expect(assertProjectWritable(repositoryOf(cyclic), id('a'))).resolves.toBeUndefined();
  });
});
