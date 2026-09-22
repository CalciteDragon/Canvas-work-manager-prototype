import { z } from 'zod';
import { ActivityActionSchema, ActivityEntityTypeSchema } from './activity';
import { ProjectIdSchema } from './ids';

/**
 * §62's live-update frame, as it travels over `GET /prototype/events`.
 *
 * `type` and `entityId` are the spec's own two fields, verbatim. The other two exist
 * because §62 also says "the frontend then refreshes **relevant** state": without
 * `projectId` an open project page would have to refetch on every workspace mutation,
 * which is the full-app reload the slice rules out.
 *
 * `entityType` is a convenience, **not** a reliable router. `SectionService` deliberately
 * records section mutations as `entityType: 'project'` carrying the *project's* id
 * (docs/decisions/2026-08-section-activity-targets-the-project.md), so a
 * `project.section_added` frame names no section. Clients route on `type` and `projectId`.
 *
 * Notably absent: `workspaceId`. The stream is filtered by persona on the host, so a tab is
 * never handed another workspace's ids — see `LivePublication` in `@cwm/domain`, which is
 * where the workspace travels.
 *
 * `type` reuses `ActivityActionSchema` because a live frame is the announcement of the §57
 * activity event that was just written; two definitions of `entity.verb` would be exactly
 * the parallel type §11 forbids.
 */
export const LiveEventSchema = z.object({
  type: ActivityActionSchema,
  entityType: ActivityEntityTypeSchema.optional(),
  entityId: z.string().min(1),
  projectId: ProjectIdSchema.optional(),
  /**
   * The **root** of the tree `projectId` sits in, when the change has one (§26).
   *
   * A root's aggregate pages — Todos and Archive (§31, §34) — project rows that live anywhere
   * beneath it, so a task written three sub-projects down changes what they render while
   * `projectId` names a project those pages are not open on. Without this a client would either
   * refetch on every frame or miss the update; with it, "does this frame concern the root I am
   * showing?" is one comparison.
   *
   * Equal to `projectId` when the change is on a root itself. Optional for the same reason
   * `projectId` is: a frame about an agent connection belongs to no project at all.
   */
  rootProjectId: ProjectIdSchema.optional(),
});
export type LiveEvent = z.infer<typeof LiveEventSchema>;

/**
 * **The frames that say a project record changed** (Slice 39) — its fields, status or parent,
 * rather than anything on its canvas: the ordinary update and archive, and the Undo and Redo of an
 * update, an archive or a reactivation. Held here, beside the frame, so the domain can prove it emits
 * exactly this vocabulary and the browser can route on it without restating it.
 *
 * `project.created` is deliberately absent: a create already names its own root, and it cannot take
 * a sub-project away from another one.
 */
export const PROJECT_RECORD_EVENT_TYPES = [
  'project.updated',
  'project.archived',
  'project.update_undone',
  'project.update_redone',
  'project.archive_undone',
  'project.archive_redone',
  'project.reactivation_undone',
  'project.reactivation_redone',
] as const;

/**
 * Whether `event` is about a project record, anywhere in the workspace
 * (docs/decisions/2026-09-project-update-operation-history.md).
 *
 * A cross-root reparent — forward, Undo or Redo — publishes **one** frame, naming the root the
 * sub-project is under *now*. The root it left is not in that frame at all, yet its tree, Todos,
 * Archive and Reflections all lose a sub-project, so an open root aggregate re-reads on any record
 * frame rather than only its own root's. The stream is already filtered to the persona's workspace.
 */
export const isProjectRecordEvent = (event: LiveEvent): boolean =>
  event.entityType === 'project' && (PROJECT_RECORD_EVENT_TYPES as readonly string[]).includes(event.type);
