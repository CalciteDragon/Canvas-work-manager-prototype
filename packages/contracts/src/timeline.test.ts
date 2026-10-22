import { describe, expect, it } from 'vitest';
import { TimelineResultSchema } from './timeline';

describe('TimelineResultSchema', () => {
  it('represents markers, ranges, and visibly invalid source ranges', () => {
    const result = TimelineResultSchema.parse({ projectId: 'project-a', items: [
      { id: 'project-a', kind: 'project', title: 'Launch', startDate: '2026-09-30', endDate: '2026-09-30' },
      { id: 'task-a', kind: 'task', title: 'Prepare', startDate: '2026-09-01', endDate: '2026-09-05', invalidRange: true },
    ] });
    expect(result.items[1]?.invalidRange).toBe(true);
  });

  it('rejects unknown item kinds', () => {
    expect(TimelineResultSchema.safeParse({ projectId: 'project-a', items: [{ id: 'x', kind: 'event', title: 'No', startDate: '2026-09-01', endDate: '2026-09-01' }] }).success).toBe(false);
  });
});

it('carries optional owner links, with section identity only for task rows (§38)', () => {
  const item = { id: 'task-a', kind: 'task', title: 'Prepare', startDate: '2026-09-01', endDate: '2026-09-05' };
  const link = { projectId: 'project-a', pageKind: 'work', sectionId: 'section-a' };
  expect(TimelineResultSchema.parse({ projectId: 'project-a', items: [{ ...item, link }] }).items[0]).toHaveProperty('link', link);
  expect(TimelineResultSchema.safeParse({ projectId: 'project-a', items: [{ ...item, kind: 'sub-project', link }] }).success).toBe(false);
  expect(TimelineResultSchema.safeParse({ projectId: 'project-a', items: [item] }).success).toBe(true);
});
