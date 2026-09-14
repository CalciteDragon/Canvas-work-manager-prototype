import { z } from 'zod';
import { AgentPermissionSchema } from './agent';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema, TaskIdSchema } from './ids';
import { ProjectPageKindSchema } from './project-page';
import { ProjectStatusSchema, RootProjectSchema, SubprojectSchema } from './project';
import { OwnedDataKindSchema, ProjectSectionSchema } from './section';
import { ReflectionSchema } from './reflection';
import { TaskSchema } from './task';

/** §31's root-wide query. Archive is a projection, not a persisted collection. */
export const ProjectArchiveQuerySchema = z.object({ projectId: ProjectIdSchema });
export type ProjectArchiveQuery = z.infer<typeof ProjectArchiveQuerySchema>;

/** Root first, item owner last. URLs stay in Angular, not in the shared read model. */
export const ArchiveBreadcrumbStepSchema = z.object({
  projectId: ProjectIdSchema,
  name: z.string().min(1),
});
export type ArchiveBreadcrumbStep = z.infer<typeof ArchiveBreadcrumbStepSchema>;

/** The canonical page and container where an item actually lives. */
export const ProjectArchiveOriginSchema = z.object({
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
  pageKind: ProjectPageKindSchema,
  pageEnabled: z.boolean(),
  breadcrumb: z.array(ArchiveBreadcrumbStepSchema).min(1),
  sectionId: SectionIdSchema.optional(),
  sectionName: z.string().min(1).optional(),
});
export type ProjectArchiveOrigin = z.infer<typeof ProjectArchiveOriginSchema>;

/** Why an item is in Archive, kept separate from whether it can be restored now. */
export const ProjectArchiveCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('own') }),
  z.object({ kind: z.literal('section-cascade'), sectionId: SectionIdSchema }),
  z.object({ kind: z.literal('task-cascade'), taskId: TaskIdSchema }),
  z.object({ kind: z.literal('hidden-by-project'), projectId: ProjectIdSchema }),
]);
export type ProjectArchiveCause = z.infer<typeof ProjectArchiveCauseSchema>;

/** A typed target makes the guidance actionable without inventing transport URLs. */
export const ProjectArchiveBlockerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project'), projectId: ProjectIdSchema, name: z.string().min(1) }),
  z.object({ kind: z.literal('section'), sectionId: SectionIdSchema, name: z.string().min(1) }),
  z.object({ kind: z.literal('task'), taskId: TaskIdSchema, name: z.string().min(1) }),
]);
export type ProjectArchiveBlocker = z.infer<typeof ProjectArchiveBlockerSchema>;

const archiveOperationSchema = z.enum([
  'restore_project',
  'restore_section',
  'restore_task',
  'restore_reflection',
]);

/** Structural eligibility, not an authorization bypass; the write still checks the actor. */
export const ProjectArchiveRestorationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ready'),
    operation: archiveOperationSchema,
    permission: AgentPermissionSchema,
  }),
  z.object({ kind: z.literal('blocked'), blocker: ProjectArchiveBlockerSchema }),
  z.strictObject({ kind: z.literal('not-archived'), blocker: ProjectArchiveBlockerSchema }),
]);
export type ProjectArchiveRestoration = z.infer<typeof ProjectArchiveRestorationSchema>;

const archiveItemFields = {
  origin: ProjectArchiveOriginSchema,
  cause: ProjectArchiveCauseSchema,
  restoration: ProjectArchiveRestorationSchema,
};

export const ProjectArchiveSubprojectItemSchema = z.object({
  kind: z.literal('subproject'),
  project: SubprojectSchema,
  ...archiveItemFields,
});
export type ProjectArchiveSubprojectItem = z.infer<typeof ProjectArchiveSubprojectItemSchema>;

/**
 * What a section entry is in Archive *for*, from the domain's recovery policy. `contentCount`
 * is every row still assigned to the container, archived or not, counted once; it is not a
 * promise that restoring the section revives them — `cascadeCount` is that, exactly.
 * `separateRestoreCount` is how many Restore calls the archived rows need beyond the section's
 * own: independently archived rows, not counting cascade members or subtasks that come back
 * with an archived parent in the same container.
 * `unknown` is a conservative keep: a type or config the policy cannot read as empty.
 * See docs/decisions/2026-09-content-oriented-archive-policy.md.
 */
export const ProjectArchiveSectionRecoverySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('owned-content'),
      ownedData: OwnedDataKindSchema,
      contentCount: z.number().int().positive(),
      separateRestoreCount: z.number().int().nonnegative(),
    })
    .refine(({ contentCount, separateRestoreCount }) => separateRestoreCount <= contentCount, {
      message: 'separateRestoreCount cannot exceed contentCount',
    }),
  z.object({ kind: z.literal('config') }),
  z.object({ kind: z.literal('unknown') }),
]);
export type ProjectArchiveSectionRecovery = z.infer<typeof ProjectArchiveSectionRecoverySchema>;

export const ProjectArchiveSectionItemSchema = z.object({
  kind: z.literal('section'),
  section: ProjectSectionSchema,
  /** Present only for a container: the rows whose `archivedWithSectionId` names this section. */
  cascadeCount: z.number().int().nonnegative().optional(),
  /**
   * Optional so older fixtures still parse; `ProjectArchiveService` emits it on every section
   * entry it projects, and projects only sections with something to recover.
   */
  recovery: ProjectArchiveSectionRecoverySchema.optional(),
  ...archiveItemFields,
});
export type ProjectArchiveSectionItem = z.infer<typeof ProjectArchiveSectionItemSchema>;

export const ProjectArchiveTaskItemSchema = z.object({
  kind: z.literal('task'),
  task: TaskSchema,
  ...archiveItemFields,
});
export type ProjectArchiveTaskItem = z.infer<typeof ProjectArchiveTaskItemSchema>;

export const ProjectArchiveReflectionItemSchema = z.object({
  kind: z.literal('reflection'),
  reflection: ReflectionSchema,
  ...archiveItemFields,
});
export type ProjectArchiveReflectionItem = z.infer<typeof ProjectArchiveReflectionItemSchema>;

export const ProjectArchiveItemSchema = z.discriminatedUnion('kind', [
  ProjectArchiveSubprojectItemSchema,
  ProjectArchiveSectionItemSchema,
  ProjectArchiveTaskItemSchema,
  ProjectArchiveReflectionItemSchema,
]);
export type ProjectArchiveItem = z.infer<typeof ProjectArchiveItemSchema>;

/** The root is context, not a fifth item: its header already owns reactivation. */
export const ProjectArchiveResultSchema = z.object({
  projectId: ProjectIdSchema,
  root: RootProjectSchema,
  items: z.array(ProjectArchiveItemSchema),
});
export type ProjectArchiveResult = z.infer<typeof ProjectArchiveResultSchema>;

/** Explicit status selection is required; Archive never guesses a prior project status. */
export const ProjectRestoreStatusSchema = ProjectStatusSchema.exclude(['archived']);
export type ProjectRestoreStatus = z.infer<typeof ProjectRestoreStatusSchema>;

export const RestoreProjectInputSchema = z.object({ status: ProjectRestoreStatusSchema });
export type RestoreProjectInput = z.infer<typeof RestoreProjectInputSchema>;

// Names used at the UI/MCP seam remain explicit aliases rather than parallel schemas.
export const ArchiveCauseSchema = ProjectArchiveCauseSchema;
export const ArchiveOriginSchema = ProjectArchiveOriginSchema;
export const ArchiveRestorationSchema = ProjectArchiveRestorationSchema;
