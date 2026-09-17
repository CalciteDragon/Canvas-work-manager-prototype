import { z } from 'zod';
import { ActivityEventSchema } from './activity';
import { AgentConnectionSchema } from './agent';
import { MilestoneSchema } from './milestone';
import { ProjectSchema } from './project';
import { ProjectPageSchema } from './project-page';
import { ReflectionSchema } from './reflection';
import { ProjectSectionSchema } from './section';
import { SectionShortcutSchema } from './section-shortcut';
import { TaskSchema } from './task';
import { UserSchema, WorkspaceSchema } from './user';
import { OperationActionSchema, OperationHistorySchema } from './operation-history';

/**
 * The version of the `.prototype/data.json` shape below. §14's example shows `4`; this
 * was the prototype's first schema. 2 makes tasks and reflections name the section that
 * owns them. 3 splits projects into roots and sub-projects and gives every project pages that
 * own its sections. 4 replaces version 3's single-use Undo records with per-actor operation
 * histories and gives every section an `archiveGeneration`. Bump it whenever a change would make
 * an existing file wrong — a mismatch is fatal rather than silently coerced, so a stale file
 * fails at load instead of halfway through a session.
 *
 * There is still no migration *runner* or registry. `pnpm prototype:upgrade` runs two explicit
 * converters in a fixed order — version 2 → 3 (`upgradeProjectPages`, frozen at its version-3
 * output) and version 3 → 4 (`upgradeOperationHistory`) — and validates the version-4 result
 * before writing a byte (docs/decisions/2026-09-schema-version-4-conversion.md).
 */
export const SCHEMA_VERSION = 4;

/**
 * §14's document. Not strict: an unknown top-level key in a hand-edited file is stripped
 * rather than fatal. Referential integrity between collections is not checked here — the
 * store owns that.
 */
export const PrototypeDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  users: z.array(UserSchema),
  workspaces: z.array(WorkspaceSchema),
  projects: z.array(ProjectSchema),
  projectPages: z.array(ProjectPageSchema),
  sections: z.array(ProjectSectionSchema),
  /**
   * §27's shortcut placements. The version-3 cutover kept this collection empty so the feature
   * could arrive without a second destructive load break; Slice 25.4 now writes placements here.
   */
  sectionShortcuts: z.array(SectionShortcutSchema),
  tasks: z.array(TaskSchema),
  milestones: z.array(MilestoneSchema),
  reflections: z.array(ReflectionSchema),
  activityEvents: z.array(ActivityEventSchema),
  agentConnections: z.array(AgentConnectionSchema),
  /**
   * Per-actor, per-project Undo/Redo cursors and the typed actions they step through — never
   * inside `activityEvents`. Defaulted, so a hand-written document with no history parses to
   * empty stacks; the version-4 converter and every seed write both collections explicitly.
   */
  operationHistories: z.array(OperationHistorySchema).default(() => []),
  operationActions: z.array(OperationActionSchema).default(() => []),
});
export type PrototypeDocument = z.infer<typeof PrototypeDocumentSchema>;
