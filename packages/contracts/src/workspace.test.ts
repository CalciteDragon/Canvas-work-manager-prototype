import { describe, expect, it } from 'vitest';
import {
  SearchWorkspaceQuerySchema,
  SearchWorkspaceResultSchema,
  UpcomingWorkQuerySchema,
  UpcomingWorkResultSchema,
} from './workspace';

describe('SearchWorkspaceQuerySchema', () => {
  it('defaults the limit and requires a non-empty query', () => {
    expect(SearchWorkspaceQuerySchema.parse({ query: 'retries' }).limit).toBe(20);
    expect(SearchWorkspaceQuerySchema.safeParse({ query: '' }).success).toBe(false);
    expect(SearchWorkspaceQuerySchema.safeParse({ query: 'x', limit: 0 }).success).toBe(false);
    expect(SearchWorkspaceQuerySchema.safeParse({ query: 'x', limit: 51 }).success).toBe(false);
  });
});

describe('SearchWorkspaceResultSchema', () => {
  it('carries one flat list of hits across the three kinds §40 searches', () => {
    const result = SearchWorkspaceResultSchema.parse({
      query: 'retries',
      hits: [
        { kind: 'project', id: 'project-work-manager', title: 'Work Manager', status: 'active' },
        {
          kind: 'task',
          id: 'task-agent-retries',
          title: 'Add retry budget',
          projectId: 'project-work-manager',
          projectName: 'Work Manager',
          status: 'in_progress',
          dueAt: '2026-08-25T23:00:00.000Z',
        },
        { kind: 'reflection', id: 'reflection-agent-scope', projectId: 'project-agent-ops', projectName: 'Agent operations' },
      ],
    });
    expect(result.hits).toHaveLength(3);
  });

  it('allows a hit with no title, because a reflection need not have one', () => {
    expect(SearchWorkspaceResultSchema.safeParse({ query: 'x', hits: [{ kind: 'reflection', id: 'reflection-1' }] }).success).toBe(true);
  });

  it('accepts a project status and a task status, but not a third vocabulary', () => {
    const hit = (status: string) => SearchWorkspaceResultSchema.safeParse({ query: 'x', hits: [{ kind: 'task', id: 't', status }] }).success;
    expect(hit('on_hold')).toBe(true);
    expect(hit('blocked')).toBe(true);
    expect(hit('nearly')).toBe(false);
  });

  it('rejects an unknown hit kind', () => {
    expect(SearchWorkspaceResultSchema.safeParse({ query: 'x', hits: [{ kind: 'milestone', id: 'm' }] }).success).toBe(false);
  });
});

describe('UpcomingWorkQuerySchema', () => {
  it('defaults to a week and bounds both members', () => {
    expect(UpcomingWorkQuerySchema.parse({})).toEqual({ days: 7, limit: 50 });
    expect(UpcomingWorkQuerySchema.safeParse({ days: 0 }).success).toBe(false);
    expect(UpcomingWorkQuerySchema.safeParse({ days: 91 }).success).toBe(false);
    expect(UpcomingWorkQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});

describe('UpcomingWorkResultSchema', () => {
  it('reuses the dashboard row rather than declaring a second one', () => {
    const row = {
      id: 'task-agent-triage',
      projectId: 'project-work-manager',
      projectName: 'Work Manager',
      title: 'Triage the overnight agent errors',
      status: 'blocked',
      priority: 'medium',
      dueAt: '2026-08-23T23:00:00.000Z',
      overdue: true,
    };
    const result = UpcomingWorkResultSchema.parse({
      days: 7,
      throughDate: '2026-08-30',
      overdue: [row],
      upcoming: [],
    });
    expect(result.overdue[0]?.overdue).toBe(true);
  });
});
