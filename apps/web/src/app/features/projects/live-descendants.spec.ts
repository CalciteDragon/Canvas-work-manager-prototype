import { signal } from '@angular/core';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { liveDescendantIds, liveDescendantsOf } from './live-descendants';
import type { WorkTreeNode } from './project-workspace-store';

const AT = '2026-10-16T10:00:00.000Z';
const project = (id: string, name: string, status: Project['status'] = 'active'): Project => ProjectSchema.parse({
  id, workspaceId: 'workspace-demo', kind: 'subproject', parentProjectId: 'project-root', name, status,
  projectLayoutMode: 'flow', createdAt: AT, updatedAt: AT,
});
const ROOT = ProjectSchema.parse({ id: 'project-root', workspaceId: 'workspace-demo', kind: 'root', name: 'Home', status: 'active', projectLayoutMode: 'flow', createdAt: AT, updatedAt: AT });
const KITCHEN = project('project-kitchen', 'Kitchen');
const CABINETS = project('project-cabinets', 'Cabinets', 'on_hold');
const GARDEN = project('project-garden', 'Garden', 'completed');
const tree = (): WorkTreeNode[] => [
  { project: KITCHEN, children: [{ project: CABINETS, children: [] }] },
  { project: GARDEN, children: [] },
];
const store = (routed: Project | null, nodes: WorkTreeNode[] = tree()) => ({
  project: signal(routed).asReadonly(),
  root: signal(ROOT).asReadonly(),
  subprojectTree: signal(nodes).asReadonly(),
}) as unknown as Parameters<typeof liveDescendantsOf>[0];

describe('liveDescendantsOf (Slice 80, R10)', () => {
  it('walks a root’s whole tree depth first, keeping the depth, with a completed workstream counted', () => {
    const nodes = liveDescendantsOf(store(ROOT));

    expect(nodes.map(({ project: { name } }) => name)).toEqual(['Kitchen', 'Garden']);
    expect(nodes[0]!.children.map(({ project: { name } }) => name)).toEqual(['Cabinets']);
    expect(liveDescendantIds(nodes)).toEqual(['project-kitchen', 'project-cabinets', 'project-garden']);
  });

  it('gives a workstream its own subtree, and a leaf none', () => {
    expect(liveDescendantIds(liveDescendantsOf(store(KITCHEN)))).toEqual(['project-cabinets']);
    expect(liveDescendantsOf(store(CABINETS))).toEqual([]);
  });

  it('answers none when the tree cannot say, so the domain decides', () => {
    expect(liveDescendantsOf(store(null))).toEqual([]);
    expect(liveDescendantsOf(store(KITCHEN, []))).toEqual([]);
  });

  it('stops at anything archived, and everything beneath it', () => {
    const nodes = liveDescendantsOf(store(ROOT, [{ project: { ...KITCHEN, status: 'archived' }, children: [{ project: CABINETS, children: [] }] }, { project: GARDEN, children: [] }]));

    expect(liveDescendantIds(nodes)).toEqual(['project-garden']);
  });
});
