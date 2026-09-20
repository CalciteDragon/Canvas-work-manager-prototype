import {
  historyToolPermission,
  OPERATION_FAMILY_PERMISSION,
  type AgentPermission,
  type ToolPermission,
} from '@cwm/contracts';
import type {
  ActorContext,
  DashboardService,
  ProjectPageService,
  ProjectArchiveService,
  ProjectJournalService,
  ProjectService,
  ProjectTodosService,
  ReflectionService,
  SectionService,
  SectionShortcutService,
  TaskService,
  OperationHistoryService,
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
  /** §31's whole-tree Archive projection. */
  archive: ProjectArchiveService;
  /** §36's root-wide reflections journal. */
  journal: ProjectJournalService;
  tasks: TaskService;
  reflections: ReflectionService;
  /** §31's frame affordances, and the containers that own tasks and reflections. */
  sections: SectionService;
  /** §27's layout-only references; tools never reach a repository or source rows. */
  shortcuts: SectionShortcutService;
  dashboard: DashboardService;
  workspace: WorkspaceService;
  /** Per-actor, per-project Undo and Redo over the section, task and reflection operations that record history. */
  history: OperationHistoryService;
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
  /**
   * The grant this tool needs, when that does not depend on its input. Declared here for
   * `tools/list`; **enforced in the domain**. Exactly one of `permission` and `permissionsByFamily`
   * is set — `toolPermission` below is what reads them, and it fails on a tool that sets both or
   * neither.
   */
  permission?: AgentPermission;
  /**
   * The **other** grants this tool needs, for the derived pages §54 describes: *"a derived page
   * that combines categories requires the grant for each category it returns, and denies rather
   * than returning a partial answer."*
   *
   * Optional and additive rather than a replacement for `permission`, so every existing tool,
   * its metadata and its transport payload are unchanged. `toolPermission` below is what
   * discovery and the contract suite read — nothing should assemble the list a second time.
   */
  additionalPermissions?: readonly AgentPermission[];
  /**
   * **The grant depends on the stored operation's family, not on the input** — `undo_operation` and
   * `redo_operation`, and nothing else (docs/decisions/2026-09-operation-family-permissions.md).
   *
   * Set it to `true` to publish the namespaced family map. A singular grant would have to name one
   * of three, and a conjunctive list would claim all three are needed; both would be false, so
   * these two tools publish neither. The domain reads the family from the action it is about to
   * run, so a tool never inspects a repository to find out which grant applies.
   */
  permissionsByFamily?: true;
  inputSchema: TSchema;
  execute(input: z.output<TSchema>, context: ToolContext): Promise<unknown>;
}

/**
 * What a tool declares about its grants, as one discriminated value — the shape
 * `packages/contracts/src/tool-permissions.ts` defines and both this package's contract suite and
 * the host's discovery tests assert. Still only a *declaration*: `assertPermitted` inside the domain
 * service remains the one enforcement (§53).
 */
export const toolPermission = (tool: WorkManagerTool): ToolPermission => {
  if (tool.permissionsByFamily === true) {
    if (tool.permission !== undefined || tool.additionalPermissions !== undefined) {
      throw new TypeError(`tool "${tool.name}" declares both a static grant and a family map`);
    }
    return historyToolPermission();
  }
  if (tool.permission === undefined) throw new TypeError(`tool "${tool.name}" declares no grant`);
  return {
    kind: 'static',
    permission: tool.permission,
    permissions: [tool.permission, ...(tool.additionalPermissions ?? [])],
  };
};

/**
 * Every grant a tool needs, in a stable order. For a family tool that is all three family grants,
 * which is what a *coverage* check wants — "is every grant this tool can require declared?" — and
 * never what a caller must hold, which is one of them.
 */
export const requiredPermissions = (tool: WorkManagerTool): readonly AgentPermission[] => {
  const declaration = toolPermission(tool);
  return declaration.kind === 'static' ? declaration.permissions : Object.values(OPERATION_FAMILY_PERMISSION);
};

/** Keeps each tool's `execute` typed against its own schema while the registry holds a flat list. */
export const defineTool = <TSchema extends ZodType>(tool: WorkManagerTool<TSchema>): WorkManagerTool =>
  tool as WorkManagerTool;
