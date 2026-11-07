import { describe, expect, it } from 'vitest';
import { ProjectWriteResultSchema } from './project-write-result';

const project = {
  id: 'project-kitchen', workspaceId: 'workspace-1', kind: 'root', name: 'Kitchen', status: 'archived',
  projectLayoutMode: 'flow', createdAt: '2026-09-22T10:00:00.000Z', updatedAt: '2026-09-22T10:00:00.000Z',
};
const cabinets = { ...project, id: 'project-cabinets', kind: 'subproject', parentProjectId: 'project-kitchen', name: 'Cabinets' };

describe('ProjectWriteResultSchema (Slice 80, R6)', () => {
  it('parses with cascaded absent, as a write with no group answers', () => {
    expect(ProjectWriteResultSchema.parse({ project, operation: null })).not.toHaveProperty('cascaded');
  });

  it('carries the workstreams this write changed', () => {
    expect(ProjectWriteResultSchema.parse({ project, operation: null, cascaded: [cabinets] }).cascaded?.[0]?.id).toBe('project-cabinets');
  });

  it('present is non-empty, and an extra field still refuses', () => {
    expect(ProjectWriteResultSchema.safeParse({ project, operation: null, cascaded: [] }).success).toBe(false);
    expect(ProjectWriteResultSchema.safeParse({ project, operation: null, extra: true }).success).toBe(false);
  });
});
