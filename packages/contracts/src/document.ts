import { z } from 'zod';
import { ActivityEventSchema } from './activity';
import { AgentConnectionSchema } from './agent';
import { MilestoneSchema } from './milestone';
import { ProjectSchema } from './project';
import { ReflectionSchema } from './reflection';
import { ProjectSectionSchema } from './section';
import { TaskSchema } from './task';
import { UserSchema, WorkspaceSchema } from './user';

/**
 * The version of the `.prototype/data.json` shape below. §14's example shows `4`; this
 * was the prototype's first schema. 2 makes tasks and reflections name the section that
 * owns them. Bump it whenever a change would make an existing file wrong — a mismatch is
 * fatal rather than silently coerced, so a stale file fails at load instead of halfway
 * through a session. There is no migration runner: `pnpm prototype:reset` rebuilds.
 */
export const SCHEMA_VERSION = 2;

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
  sections: z.array(ProjectSectionSchema),
  tasks: z.array(TaskSchema),
  milestones: z.array(MilestoneSchema),
  reflections: z.array(ReflectionSchema),
  activityEvents: z.array(ActivityEventSchema),
  agentConnections: z.array(AgentConnectionSchema),
});
export type PrototypeDocument = z.infer<typeof PrototypeDocumentSchema>;
