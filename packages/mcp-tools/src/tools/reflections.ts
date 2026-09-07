import { CreateReflectionInputSchema, ProjectIdSchema, ReflectionIdSchema } from '@cwm/contracts';
import { z } from 'zod';
import { defineTool, type WorkManagerTool } from '../tool';

/** §54's reflection tools. §41 makes a reflection a note against a project, newest first. */
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
      'Add a reflection to a project: a body, and optionally a title and the prompt it answers. It lands in a reflections container on the project’s canonical canvas unless a pageId or sectionId says otherwise; a root with its Reflections page enabled can take one there directly.',
    permission: 'reflections.write',
    inputSchema: CreateReflectionInputSchema,
    execute: (input, { actor, services }) => services.reflections.create(actor, input),
  }),
  defineTool({
    name: 'archive_reflection',
    description: 'Archive a reflection without deleting it. It remains recoverable from the project Archive projection.',
    permission: 'reflections.write',
    inputSchema: z.object({ reflectionId: ReflectionIdSchema }),
    execute: ({ reflectionId }, { actor, services }) => services.reflections.archive(actor, reflectionId),
  }),
  defineTool({
    name: 'restore_reflection',
    description: 'Restore an archived reflection when its owning project and section are live.',
    permission: 'reflections.write',
    inputSchema: z.object({ reflectionId: ReflectionIdSchema }),
    execute: ({ reflectionId }, { actor, services }) => services.reflections.restore(actor, reflectionId),
  }),
];
