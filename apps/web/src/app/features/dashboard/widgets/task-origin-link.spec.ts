import { TodoTaskOriginSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { taskOriginFragment, taskOriginRoute } from './task-origin-link';

const origin = (pageKind: string) => TodoTaskOriginSchema.parse({
  projectId: 'project-1', pageId: 'page-1', pageKind, sectionId: 'section-tasks', sectionName: 'Tasks',
  breadcrumb: [{ projectId: 'project-1', name: 'Website launch' }],
});

// Slice 79 (W4-028): Today and the digest open a task's owner section by one rule.
describe('task origin link', () => {
  it('opens a work unit’s canvas at the project route', () => {
    expect(taskOriginRoute(origin('work'))).toEqual(['/projects', 'project-1']);
  });

  it('opens any other page at its page route', () => {
    expect(taskOriginRoute(origin('home'))).toEqual(['/projects', 'project-1', 'pages', 'home']);
  });

  it('lands on the owner section', () => {
    expect(taskOriginFragment(origin('home'))).toBe('section-section-tasks');
  });
});
