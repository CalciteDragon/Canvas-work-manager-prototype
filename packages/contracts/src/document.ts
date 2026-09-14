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
import { UndoRecordSchema } from './undo';

/**
 * The version of the `.prototype/data.json` shape below. §14's example shows `4`; this
 * was the prototype's first schema. 2 makes tasks and reflections name the section that
 * owns them. 3 splits projects into roots and sub-projects and gives every project pages that
 * own its sections. Bump it whenever a change would make an existing file wrong — a mismatch
 * is fatal rather than silently coerced, so a stale file fails at load instead of halfway
 * through a session.
 *
 * There is still no migration *runner*. Version 3 ships with one bounded converter,
 * `pnpm prototype:upgrade`, because by then a real file was worth keeping (§14). It is a
 * one-off, not a chain: the next cutover writes its own or resets.
 *
 * `undoRecords` arrived inside version 3 with no bump: it is a defaulted collection, so an
 * existing file loads with every other collection unchanged and nothing it held becomes wrong.
 * An older build (this schema is not strict) strips the collection on its next commit — undo
 * history is lost, user data is not. See docs/decisions/2026-09-section-removal-undo-records.md.
 */
export const SCHEMA_VERSION = 3;

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
   * Scoped, expiring inverses of section removals — never inside `activityEvents`. Defaulted,
   * so a version-3 file written before Undo existed parses to `[]`.
   */
  undoRecords: z.array(UndoRecordSchema).default(() => []),
});
export type PrototypeDocument = z.infer<typeof PrototypeDocumentSchema>;
