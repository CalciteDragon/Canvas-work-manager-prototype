import { CreateReflectionInputSchema, ProjectIdSchema, ReflectionIdSchema } from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * §54's reflection tools. §41 makes a reflection a note against a project, newest first.
 *
 * Since Slice 36 every write here answers `{ reflection, operation }` — the row and its Undo
 * receipt, `null` on a no-op. There is deliberately **no** `update_reflection` tool: §54 does not
 * list one, and reflection editing stays an HTTP and gateway surface, exercised through history by
 * an action the domain recorded rather than by a tool this slice invented. `registry.test.ts` keeps
 * that absence a checked property rather than a note.
 */
export const reflectionTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'list_reflections',
    description: 'List a project’s reflections — the written notes kept against it — newest first.',
    permission: 'reflections.read',
    inputSchema: z.object({ projectId: ProjectIdSchema }),
    // `ReflectionService.list` takes the bare id, not a query object.
    execute: ({ projectId }, { actor, services }) => services.reflections.list(actor, projectId),
  }),
  defineTool({
    name: 'add_reflection',
    description:
      'Add a reflection to a project: a body, and optionally a title, the prompt it answers, and a subject naming completed work in the same root tree. Returns { reflection, operation } — the created reflection and its Undo receipt. A subject must be a currently completed task or sub-project, and the link is retained if that work is later reopened or archived. It lands in a reflections container on the project’s canonical canvas unless a pageId or sectionId says otherwise, and one is created if there is none, in which case undoing this one action removes the reflection and that container together; a root with its Reflections page enabled can take one there directly.',
    permission: 'reflections.write',
    inputSchema: CreateReflectionInputSchema,
    execute: (input, { actor, services }) => services.reflections.create(actor, input),
  }),
  defineTool({
    name: 'archive_reflection',
    description:
      'Archive a reflection without deleting it. Returns { reflection, operation }; an already-archived reflection answers a null operation. It remains recoverable from the project Archive projection, and the archive itself can be undone.',
    permission: 'reflections.write',
    inputSchema: z.object({ reflectionId: ReflectionIdSchema }),
    execute: ({ reflectionId }, { actor, services }) => services.reflections.archive(actor, reflectionId),
  }),
  defineTool({
    name: 'restore_reflection',
    description:
      'Restore an archived reflection when its owning project and section are live. Returns { reflection, operation }; a live reflection answers a null operation. This needs no receipt and works after the archive is no longer undoable, and it records an action of its own so it can be undone in turn.',
    permission: 'reflections.write',
    inputSchema: z.object({ reflectionId: ReflectionIdSchema }),
    execute: ({ reflectionId }, { actor, services }) => services.reflections.restore(actor, reflectionId),
  }),
];
