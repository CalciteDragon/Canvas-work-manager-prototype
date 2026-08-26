import { describe, expect, it } from 'vitest';
import { ProjectSectionSchema, SectionColumnSpanSchema } from './section';

const section = {
  id: 'section-1',
  projectId: 'project-a',
  type: 'task_list',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('ProjectSectionSchema', () => {
  it('accepts a half-width section with a frame title', () => {
    const parsed = ProjectSectionSchema.parse({ ...section, columnSpan: 6, title: 'This week' });
    expect(parsed).toMatchObject({ columnSpan: 6, title: 'This week' });
  });

  it('keeps config opaque — the registry owns its shape (§29)', () => {
    const parsed = ProjectSectionSchema.parse({
      ...section,
      config: { statusFilter: ['todo'], showCompleted: false },
    });
    expect(parsed.config).toEqual({ statusFilter: ['todo'], showCompleted: false });
  });

  it('rejects a column span outside the §27 presets', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, columnSpan: 5 }).success).toBe(false);
    expect(SectionColumnSpanSchema.safeParse(3).success).toBe(false);
    expect([...SectionColumnSpanSchema.values]).toEqual([12, 8, 6, 4]);
  });

  it('rejects an empty section type', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, type: '' }).success).toBe(false);
  });

  it('rejects a position that is negative or fractional', () => {
    expect(ProjectSectionSchema.safeParse({ ...section, position: -1 }).success).toBe(false);
    expect(ProjectSectionSchema.safeParse({ ...section, position: 1.5 }).success).toBe(false);
  });
});
