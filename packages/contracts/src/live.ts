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
