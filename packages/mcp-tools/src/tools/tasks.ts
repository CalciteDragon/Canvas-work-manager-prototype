import { CreateTaskInputSchema, TaskIdSchema, TaskQuerySchema, UpdateTaskInputSchema } from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * §54's task tools. `complete_task` and `update_task` both exist because §54 lists both —
 * §56 wants to measure which one agents reach for, and that experiment needs both present.
 */
export const taskTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_tasks',
    description:
      'List tasks, optionally filtered by project, parent task, status, priority, due-date bounds, or a text search over titles and descriptions.',
    permission: 'tasks.read',
    // Passed through whole: `TaskQuery` has no workspace member, because a task is scoped
    // by the project it lives in.
    inputSchema: TaskQuerySchema,
    execute: (input, { actor, services }) => services.tasks.list(actor, input),
  }),
  defineTool({
    name: 'get_task',
    description: 'Read one task by id, including its status, priority, estimate, start and due dates.',
    permission: 'tasks.read',
    inputSchema: z.object({ taskId: TaskIdSchema }),
    execute: ({ taskId }, { actor, services }) => services.tasks.get(actor, taskId),
  }),
  defineTool({
    name: 'create_task',
    description:
      'Create a task in a project. Without a sectionId or pageId it lands in a task list on the project’s canonical canvas — a root’s Home, a sub-project’s sole work canvas — and one is created if there is none. Name a pageId to place it on a particular page of a root, which is refused if that page does not hold task lists. Name a sectionId to choose the exact container, which must agree with any pageId given. Name a parent task to create a subtask, which lives in the same project and is rendered by its parent’s section.',
    permission: 'tasks.write',
    inputSchema: CreateTaskInputSchema,
    execute: (input, { actor, services }) => services.tasks.create(actor, input),
  }),
  defineTool({
    name: 'update_task',
    description: 'Change a task’s title, description, status, priority, estimate, parent or dates. Omitted fields are left alone; null clears one.',
    permission: 'tasks.write',
    inputSchema: UpdateTaskInputSchema.extend({ taskId: TaskIdSchema }),
    execute: ({ taskId, ...input }, { actor, services }) => services.tasks.update(actor, taskId, input),
  }),
  defineTool({
    name: 'complete_task',
    description: 'Mark a task done, stamping the time it was completed. Completing an already-done task changes nothing.',
    permission: 'tasks.write',
    inputSchema: z.object({ taskId: TaskIdSchema }),
    execute: ({ taskId }, { actor, services }) => services.tasks.complete(actor, taskId),
  }),
];
