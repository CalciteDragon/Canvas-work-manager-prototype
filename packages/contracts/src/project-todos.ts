import { z } from 'zod';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema } from './ids';
import { SubprojectSchema } from './project';
import { ProjectPageKindSchema } from './project-page';
import { TaskSchema } from './task';

/**
 * §34's chronology, as the one shape the HTTP route, the MCP tool and the page all read.
 *
 * A Todos result is **transient**: it carries the canonical `Task` and `Subproject` records
 * themselves, not copies with a Todos flavour, because §34's page "is a derived chronological
 * projection, not another owner of rows". Nothing here is stored — there is no Todos
 * collection, and enabling the page creates a page record and no content.
 */
export const ProjectTodosQuerySchema = z.object({ projectId: ProjectIdSchema });
export type ProjectTodosQuery = z.infer<typeof ProjectTodosQuerySchema>;

/** One step of §34's origin breadcrumb: root first, the row's owner last. */
export const TodoBreadcrumbStepSchema = z.object({
  projectId: ProjectIdSchema,
  name: z.string().min(1),
});
export type TodoBreadcrumbStep = z.infer<typeof TodoBreadcrumbStepSchema>;

/**
 * Where a row actually lives — §27's ownership chain, resolved once by the query so no reader
 * has to join it back together.
 *
 * **Ids and names, never routes.** A URL is an Angular concern; a domain result that carried
 * one would make the route table a contract three packages depend on.
 */
const originFields = {
  /** The row's canonical owner: the root itself, or the descendant work unit that holds it. */
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
  pageKind: ProjectPageKindSchema,
  /** Root → owner, always at least the owner itself. */
  breadcrumb: z.array(TodoBreadcrumbStepSchema).min(1),
};

export const TodoTaskOriginSchema = z.object({
  ...originFields,
  /** A task always has a container (§33), so the link can name the section it opens at. */
  sectionId: SectionIdSchema,
  /** Resolved through `nameOf`, so the page says what the canvas says. */
  sectionName: z.string().min(1),
});
export type TodoTaskOrigin = z.infer<typeof TodoTaskOriginSchema>;

export const TodoSubprojectOriginSchema = z.object(originFields);
export type TodoSubprojectOrigin = z.infer<typeof TodoSubprojectOriginSchema>;

/**
 * §34's two row kinds. Discriminated, because they carry different records and different
 * origins: a work unit has a canvas rather than a container, and a reader that had to guess
 * which fields were present would be the second definition §11 forbids.
 */
export const ProjectTodoItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), task: TaskSchema, origin: TodoTaskOriginSchema }),
  z.object({ kind: z.literal('subproject'), project: SubprojectSchema, origin: TodoSubprojectOriginSchema }),
]);
export type ProjectTodoItem = z.infer<typeof ProjectTodoItemSchema>;

export const ProjectTodosResultSchema = z.object({
  projectId: ProjectIdSchema,
  /** In §34's order: due date ascending, undated last, ties by kind then id. */
  items: z.array(ProjectTodoItemSchema),
});
export type ProjectTodosResult = z.infer<typeof ProjectTodosResultSchema>;
