import type { AgentPermission } from '@cwm/contracts';
import type {
  ActorContext,
  DashboardService,
  ProjectService,
  ReflectionService,
  SectionService,
  TaskService,
  WorkspaceService,
} from '@cwm/domain';
import type { z, ZodType } from 'zod';

/**
 * Everything a tool is allowed to reach: **domain services, and nothing else**.
 *
 * No unit of work, no clock, no seed, and above all no repository — a tool that could read
 * storage directly would be a second place where workspace scoping and §53's permission
 * checks have to be remembered, and the second place is always the one that forgets.
 * `import-lint.test.ts` enforces this mechanically rather than by good intentions.
 */
export interface WorkManagerServices {
  projects: ProjectService;
  tasks: TaskService;
  reflections: ReflectionService;
  /** §31's frame affordances, and the containers that own tasks and reflections. */
  sections: SectionService;
  dashboard: DashboardService;
  workspace: WorkspaceService;
}

/**
 * What §55 calls `AgentContext`. It **is** `ActorContext` — the type Slice 13 already
 * defined and every domain service already takes — plus the services, which are closed
 * over per registry rather than per call. §11 allows exactly one definition of a shape, and
 * a parallel `AgentContext` would be a second one that drifted the first time an actor
 * gained a field.
 */
export interface ToolContext {
  actor: ActorContext;
  services: WorkManagerServices;
}

/**
 * §55's reusable definition, generic in its schema so `execute` receives **parsed** input.
 *
 * §55 writes `execute(input: unknown, …)`, but the registry parses before it delegates; a
 * tool re-parsing its own input would be the second validation §11 exists to prevent, and
 * `unknown` would force every tool to do exactly that.
 */
export interface WorkManagerTool<TSchema extends ZodType = ZodType> {
  name: string;
  /** Written for an agent choosing between tools, not for a changelog. */
  description: string;
  /** The grant this tool needs. Declared here for `tools/list`; **enforced in the domain**. */
  permission: AgentPermission;
  inputSchema: TSchema;
  execute(input: z.output<TSchema>, context: ToolContext): Promise<unknown>;
}

/** Keeps each tool's `execute` typed against its own schema while the registry holds a flat list. */
export const defineTool = <TSchema extends ZodType>(tool: WorkManagerTool<TSchema>): WorkManagerTool =>
  tool as WorkManagerTool;
