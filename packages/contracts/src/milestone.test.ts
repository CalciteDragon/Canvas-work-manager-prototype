import { describe, expect, it } from 'vitest';
import { MilestoneSchema, MilestoneStatusSchema } from './milestone';

const milestone = {
  id: 'milestone-1',
  projectId: 'project-a',
  title: 'Beta cut',
  status: 'upcoming',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('MilestoneSchema', () => {
  it('accepts the §35 properties', () => {
    const parsed = MilestoneSchema.parse({
      ...milestone,
      description: 'Feature freeze',
      targetDate: '2026-09-15',
      status: 'achieved',
    });
    expect(parsed).toMatchObject({ targetDate: '2026-09-15', status: 'achieved' });
  });

  it('accepts a milestone with no target date yet', () => {
    expect(MilestoneSchema.parse(milestone).targetDate).toBeUndefined();
  });

  it('rejects an unknown status and an empty title', () => {
    expect(MilestoneSchema.safeParse({ ...milestone, status: 'slipped' }).success).toBe(false);
    expect(MilestoneSchema.safeParse({ ...milestone, title: '' }).success).toBe(false);
  });
});

describe('MilestoneStatusSchema', () => {
  it('names the prototype starting set', () => {
    expect(MilestoneStatusSchema.options).toEqual(['upcoming', 'achieved', 'missed']);
  });
});
