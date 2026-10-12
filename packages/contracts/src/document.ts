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
 * The version of the `.prototype/data.json` shape below. 1 was the prototype's first schema.
 * 2 makes tasks and reflections name the section that owns them. 3 splits projects into roots and
 * sub-projects and gives every project pages that own its sections. 4 replaces version 3's
 * single-use Undo records with per-actor operation histories and gives every section an
 * `archiveGeneration`. 5 makes every activity event carry the captured identity of its target, so
 * an audit line survives the Undo that deletes the row it describes. 6 retires the Rich Text section:
 * every Rich Text section and every history copy of one becomes Markdown. Bump it whenever a change
 * would make an existing file wrong — a mismatch is fatal rather than silently coerced, so a stale
 * file fails at load instead of halfway through a session.
 *
 * Versions 2–5 are no longer readable. Local prototype data is disposable: reset or reseed an
 * incompatible file; no converter or migration preserves it
 * (docs/decisions/2026-10-prototype-data-is-disposable.md).
 */
export const SCHEMA_VERSION = 6;

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
   * empty stacks; every seed writes both collections explicitly.
   */
  operationHistories: z.array(OperationHistorySchema).default(() => []),
  operationActions: z.array(OperationActionSchema).default(() => []),
});
export type PrototypeDocument = z.infer<typeof PrototypeDocumentSchema>;
