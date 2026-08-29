import { CreateReflectionInputSchema, ProjectIdSchema } from '@cwm/contracts';
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
    description: 'Add a reflection to a project: a body, and optionally a title and the prompt it answers.',
    permission: 'reflections.write',
    inputSchema: CreateReflectionInputSchema,
    execute: (input, { actor, services }) => services.reflections.create(actor, input),
  }),
];
