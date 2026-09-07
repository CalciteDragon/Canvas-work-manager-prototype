import type { AgentPermission } from '@cwm/contracts';
import type {
  ActorContext,
  DashboardService,
  ProjectPageService,
  ProjectService,
  ProjectTodosService,
  ReflectionService,
  SectionService,
  SectionShortcutService,
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
  /** §26's pages: which a root has, and which of the optional three are switched on. */
  pages: ProjectPageService;
  /** §34's chronology across a root's whole tree. A read of two categories, never an owner. */
  todos: ProjectTodosService;
  tasks: TaskService;
  reflections: ReflectionService;
  /** §31's frame affordances, and the containers that own tasks and reflections. */
  sections: SectionService;
  /** §27's layout-only references; tools never reach a repository or source rows. */
  shortcuts: SectionShortcutService;
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
  /**
   * The **other** grants this tool needs, for the derived pages §54 describes: *"a derived page
   * that combines categories requires the grant for each category it returns, and denies rather
   * than returning a partial answer."*
   *
   * Optional and additive rather than a replacement for `permission`, so every existing tool,
   * its metadata and its transport payload are unchanged. `requiredPermissions` below is what
   * discovery and the contract suite read — nothing should assemble the list a second time.
   */
  additionalPermissions?: readonly AgentPermission[];
  inputSchema: TSchema;
  execute(input: z.output<TSchema>, context: ToolContext): Promise<unknown>;
}

/**
 * Every grant a tool needs, declared first and in a stable order. Still only a *declaration*:
 * `assertPermitted` inside the domain service remains the one enforcement (§53).
 */
export const requiredPermissions = (tool: WorkManagerTool): readonly AgentPermission[] => [
  tool.permission,
  ...(tool.additionalPermissions ?? []),
];

/** Keeps each tool's `execute` typed against its own schema while the registry holds a flat list. */
export const defineTool = <TSchema extends ZodType>(tool: WorkManagerTool<TSchema>): WorkManagerTool =>
  tool as WorkManagerTool;
