import { z } from 'zod';

/**
 * Ids are plain strings — the seeds use readable ones like `task-123` and `user-a`, and
 * a prototype gains nothing from uuid validation. The brand exists for the type system:
 * a `TaskId` cannot be passed where a `ProjectId` is expected.
 */
const brandedId = <Brand extends string>(brand: Brand) => z.string().min(1).brand(brand);

export const UserIdSchema = brandedId('UserId');
export const WorkspaceIdSchema = brandedId('WorkspaceId');
export const ProjectIdSchema = brandedId('ProjectId');
export const ProjectPageIdSchema = brandedId('ProjectPageId');
export const SectionIdSchema = brandedId('SectionId');
export const SectionShortcutIdSchema = brandedId('SectionShortcutId');
export const TaskIdSchema = brandedId('TaskId');
export const MilestoneIdSchema = brandedId('MilestoneId');
export const ReflectionIdSchema = brandedId('ReflectionId');
export const ActivityEventIdSchema = brandedId('ActivityEventId');
export const AgentConnectionIdSchema = brandedId('AgentConnectionId');

export type UserId = z.infer<typeof UserIdSchema>;
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type ProjectPageId = z.infer<typeof ProjectPageIdSchema>;
export type SectionId = z.infer<typeof SectionIdSchema>;
export type SectionShortcutId = z.infer<typeof SectionShortcutIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type MilestoneId = z.infer<typeof MilestoneIdSchema>;
export type ReflectionId = z.infer<typeof ReflectionIdSchema>;
export type ActivityEventId = z.infer<typeof ActivityEventIdSchema>;
export type AgentConnectionId = z.infer<typeof AgentConnectionIdSchema>;
