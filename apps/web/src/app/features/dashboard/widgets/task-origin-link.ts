import type { TodoTaskOrigin } from '@cwm/contracts';

/**
 * The route to a task's owner (Slice 79): a work unit's canvas is the project route, any other
 * page its page route. Today and the digest's overdue list link through this one rule.
 */
export const taskOriginRoute = (origin: TodoTaskOrigin): string[] =>
  origin.pageKind === 'work' ? ['/projects', origin.projectId] : ['/projects', origin.projectId, 'pages', origin.pageKind];

/** The fragment that lands the owner page on the task's section. */
export const taskOriginFragment = (origin: TodoTaskOrigin): string => `section-${origin.sectionId}`;
