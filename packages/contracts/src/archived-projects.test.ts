import { describe, expect, it } from 'vitest';
import { ArchivedProjectsResultSchema } from './archived-projects';

const project = {
  id: 'project-root', workspaceId: 'workspace-demo', kind: 'root', name: 'Root',
  status: 'archived', projectLayoutMode: 'flow',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('ArchivedProjectsResultSchema', () => {
  it('accepts an archived project with a canonical breadcrumb', () => {
    expect(ArchivedProjectsResultSchema.safeParse({ items: [{ project, breadcrumb: [{ projectId: project.id, name: project.name }] }] }).success).toBe(true);
  });

  it('carries cascadeCount when there is a group, and parses without it (Slice 80, R8)', () => {
    const breadcrumb = [{ projectId: project.id, name: project.name }];
    expect(ArchivedProjectsResultSchema.parse({ items: [{ project, breadcrumb, cascadeCount: 3 }] }).items[0]?.cascadeCount).toBe(3);
    expect(ArchivedProjectsResultSchema.parse({ items: [{ project, breadcrumb }] }).items[0]).not.toHaveProperty('cascadeCount');
    expect(ArchivedProjectsResultSchema.safeParse({ items: [{ project, breadcrumb, cascadeCount: 0 }] }).success).toBe(false);
  });

  it('rejects a live project', () => {
    expect(ArchivedProjectsResultSchema.safeParse({ items: [{ project: { ...project, status: 'active' }, breadcrumb: [{ projectId: project.id, name: project.name }] }] }).success).toBe(false);
  });
});
