import { CreateTaskInputSchema, TaskIdSchema, TaskQuerySchema, UpdateTaskInputSchema } from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * §54's task tools. `complete_task` and `update_task` both exist because §54 lists both —
 * §56 wants to measure which one agents reach for, and that experiment needs both present.
 *
 * Since Slice 36 every write here answers `{ task, operation }`: the row, and the receipt its
 * owner's Undo history recorded — `null` when normalization made the call a no-op. That is a wire
 * change for existing clients, and it is what lets a connection holding only `tasks.write` undo its
 * own work without ever reading a history.
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
      'Create a task in a project. Returns { task, operation } — the created task and its Undo receipt. Without a sectionId or pageId it lands in a task list on the project’s canonical canvas — a root’s Home, a sub-project’s sole work canvas — and one is created if there is none, in which case undoing this one action removes the task and that container together. Name a pageId to place it on a particular page of a root, which is refused if that page does not hold task lists. Name a sectionId to choose the exact container, which must agree with any pageId given. Name a parent task to create a subtask, which lives in the same project and is rendered by its parent’s section.',
    permission: 'tasks.write',
    inputSchema: CreateTaskInputSchema,
    execute: (input, { actor, services }) => services.tasks.create(actor, input),
  }),
  defineTool({
    name: 'update_task',
    description:
      'Change a task’s title, description, status, priority, estimate, parent, section or dates. Omitted fields are left alone; null clears one. Returns { task, operation }: the updated task and its Undo receipt, or a null operation when nothing actually changed. Undo restores only the fields this call changed, so another writer’s edit to a different field survives; a move takes the whole subtree and reverses as one.',
    permission: 'tasks.write',
    inputSchema: UpdateTaskInputSchema.extend({ taskId: TaskIdSchema }),
    execute: ({ taskId, ...input }, { actor, services }) => services.tasks.update(actor, taskId, input),
  }),
  defineTool({
    name: 'complete_task',
    description:
      'Mark a task done, stamping the time it was completed. Returns { task, operation }; completing an already-done task changes nothing and answers a null operation. Undo reopens it and clears the completion time together.',
    permission: 'tasks.write',
    inputSchema: z.object({ taskId: TaskIdSchema }),
    execute: ({ taskId }, { actor, services }) => services.tasks.complete(actor, taskId),
  }),
  defineTool({
    name: 'archive_task',
    description:
      'Archive a task and the live descendants beneath it, recording exact cascade markers so one restore can undo only this operation. Returns { task, operation }; archiving an already-archived task answers a null operation. Undo brings back exactly the rows this call archived and leaves a descendant that was already archived alone.',
    permission: 'tasks.write',
    inputSchema: z.object({ taskId: TaskIdSchema }),
    execute: ({ taskId }, { actor, services }) => services.tasks.archive(actor, taskId),
  }),
  defineTool({
    name: 'restore_task',
    description:
      'Restore an archived task and exactly the descendants archived with it. Returns { task, operation }; a live task answers a null operation. This works whether or not the archive is still undoable and needs no receipt, and it records an action of its own, so it can be undone in turn. Refused when an archived section, project or task ancestor must be restored first.',
    permission: 'tasks.write',
    inputSchema: z.object({ taskId: TaskIdSchema }),
    execute: ({ taskId }, { actor, services }) => services.tasks.restore(actor, taskId),
  }),
];
