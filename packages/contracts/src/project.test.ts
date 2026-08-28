import { describe, expect, it } from 'vitest';
import { ProgressFormulaSchema, ProjectLayoutModeSchema, ProjectSchema, ProjectStatusSchema } from './project';

const project = {
  id: 'project-a',
  workspaceId: 'workspace-a',
  name: 'Work Manager',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('ProjectSchema', () => {
  it('accepts a root project', () => {
    expect(ProjectSchema.parse(project).parentProjectId).toBeUndefined();
  });

  it('accepts a child project with the §26 header fields', () => {
    const child = ProjectSchema.parse({
      ...project,
      id: 'project-b',
      parentProjectId: 'project-a',
      description: 'The nested one',
      icon: '🚀',
      targetDate: '2026-09-30',
      projectLayoutMode: 'grid',
    });
    expect(child).toMatchObject({ parentProjectId: 'project-a', targetDate: '2026-09-30' });
  });

  it('rejects a target date carrying a time — target dates are calendar days', () => {
    expect(ProjectSchema.safeParse({ ...project, targetDate: '2026-09-30T00:00:00.000Z' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(ProjectSchema.safeParse({ ...project, status: 'paused' }).success).toBe(false);
  });

  it('rejects a layout mode that is not one of the two being compared (§28)', () => {
    expect(ProjectSchema.safeParse({ ...project, projectLayoutMode: 'kanban' }).success).toBe(false);
  });

  it('accepts canonical per-project progress settings and bounds manual progress', () => {
    expect(ProjectSchema.parse({ ...project, progressFormula: 'weighted' }).progressFormula).toBe('weighted');
    expect(ProjectSchema.parse({ ...project, progressFormula: 'manual', manualProgress: 42 }).manualProgress).toBe(42);
    expect(ProjectSchema.safeParse({ ...project, manualProgress: 101 }).success).toBe(false);
  });
});

describe('project enums', () => {
  it('names the prototype starting statuses and the two §28 layout modes', () => {
    expect(ProjectStatusSchema.options).toEqual(['planning', 'active', 'on_hold', 'completed', 'archived']);
    expect(ProjectLayoutModeSchema.options).toEqual(['flow', 'grid']);
    expect(ProgressFormulaSchema.options).toEqual(['count', 'weighted', 'manual']);
  });
});
