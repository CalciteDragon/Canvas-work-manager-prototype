import type { Project, ProjectId } from '@cwm/contracts';
import type { ProjectRepository } from '@cwm/repositories';
import { DomainRuleError } from './errors';

/**
 * **Archiving reaches down, and comes down only with what was named.**
 *
 * §31: *"A project whose own status is `archived` hides its live contents from ordinary reads
 * too."* Archiving a project takes down the live workstreams the caller named (Slice 80), and the
 * walk stops at anything already archived, so an older document or fixture can still hold a live
 * sub-project underneath an archived ancestor, and every ordinary read has to agree about what that means. Before this module four
 * read models each had their own answer and three of them had none.
 *
 * Pure functions over a `Project[]`, plus one assertion over a `ProjectRepository`. Neither is
 * a domain-service edge, so the acyclic service graph (§12) is untouched and any caller with
 * the projects in hand can share the rule rather than restate it.
 */

/** The questions the read models actually ask. Three, because they are three different rules. */
export interface ArchivedAncestry {
  /** Archived in its own right. */
  isArchived(id: ProjectId): boolean;
  /** Has an archived ancestor — regardless of its own status. */
  hasArchivedAncestor(id: ProjectId): boolean;
  /**
   * **Live underneath something archived**, and nothing else — `hasArchivedAncestor && !isArchived`.
   *
   * Deliberately narrow. A project archived in its own right is *not* hidden by this: it is
   * already excluded wherever a caller filters `status`, it is what `status: ['archived']` asks
   * for. Widening `isHidden` to cover it would erase archived projects from that query;
   * Archive and workspace Settings apply their own recovery eligibility.
   */
  isHidden(id: ProjectId): boolean;
}

/**
 * Build the ancestry over **the complete workspace project set**, before any query, status or
 * kind filter.
 *
 * This is the one way to get it wrong, and it fails silently: handed an array that has already
 * dropped archived projects, the archived ancestors are not in it, so `hasArchivedAncestor` is
 * false for everything and the filter quietly does nothing. Callers read the workspace once for
 * this and apply their own filters to the result.
 */
export const archivedAncestry = (projects: readonly Project[]): ArchivedAncestry => {
  const byId = new Map<ProjectId, Project>(projects.map((project) => [project.id, project]));
  const archivedAncestorCache = new Map<ProjectId, boolean>();

  const isArchived = (id: ProjectId): boolean => byId.get(id)?.status === 'archived';

  const hasArchivedAncestor = (id: ProjectId): boolean => {
    const cached = archivedAncestorCache.get(id);
    if (cached !== undefined) return cached;

    // The visited set is not belt-and-braces, for the reason `ProjectService` states at its own
    // walk: a hand-edited document (§14) can contain a cycle, and this runs on read paths that
    // must answer rather than hang.
    //
    // **Each query walks its own chain**, and only its own answer is remembered. An earlier
    // version shared one walk's result with every project it passed through, which is sound on a
    // tree and wrong on a cycle, where "has an archived ancestor" stops being a property of the
    // chain and becomes relative to where the walk began: with `a → b → a` and `a` archived, `a`
    // has no archived ancestor and `b` does, so neither project's answer is the other's. It made
    // the ancestry give different answers for the same project depending on which was asked
    // about first, and disagree with `assertProjectWritable`, which walks afresh every time.
    // A walk per query is O(depth) over a document already in memory (§14, §71).
    const seen = new Set<ProjectId>([id]);
    let ancestorId = byId.get(id)?.parentProjectId;
    let found = false;
    while (ancestorId !== undefined && !seen.has(ancestorId)) {
      if (isArchived(ancestorId)) {
        found = true;
        break;
      }
      seen.add(ancestorId);
      ancestorId = byId.get(ancestorId)?.parentProjectId;
    }

    archivedAncestorCache.set(id, found);
    return found;
  };

  return {
    isArchived,
    hasArchivedAncestor,
    isHidden: (id) => !isArchived(id) && hasArchivedAncestor(id),
  };
};

/**
 * **What a group archive of `id` must name** (Slice 80, §31): its whole live subtree, depth first,
 * at any depth. The walk stops at an archived node, which is untouched along with anything beneath
 * it, because that was put away separately. A completed workstream is live here: only `archived`
 * stops it. Takes the complete workspace set, as `archivedAncestry` does, and carries a visited set
 * because a hand-edited document can contain a cycle.
 */
export const liveSubtree = (projects: readonly Project[], id: ProjectId): Project[] => {
  const seen = new Set<ProjectId>([id]);
  const live: Project[] = [];
  const visit = (parentId: ProjectId): void => {
    for (const project of projects) {
      if (project.parentProjectId !== parentId || seen.has(project.id)) continue;
      seen.add(project.id);
      if (project.status === 'archived') continue;
      live.push(project);
      visit(project.id);
    }
  };
  visit(id);
  return live;
};

/** A workstream as `ownerId`'s group archive leaves it: archived, remembering what it was. */
export const markArchivedWith = (project: Project, ownerId: ProjectId): Project => {
  const { completedAt, ...rest } = project;
  return {
    ...rest,
    status: 'archived',
    archivedWithProject: { projectId: ownerId, status: project.status, ...(completedAt === undefined ? {} : { completedAt }) },
  } as Project;
};

/** A marked workstream as its owner's restore leaves it: exactly what its marker recorded. */
export const reviveFromMarker = (project: Project): Project => {
  const { archivedWithProject: marker, completedAt: _completedAt, ...rest } = project;
  if (marker === undefined) throw new TypeError(`project "${project.id}" has no archived-with marker`);
  return { ...rest, status: marker.status, ...(marker.completedAt === undefined ? {} : { completedAt: marker.completedAt }) } as Project;
};

/** The words a label and an Activity line add for a group: ` and 3 workstreams`, nothing for none. */
export const groupWords = (count: number): string =>
  count === 0 ? '' : ` and ${count} workstream${count === 1 ? '' : 's'}`;

/**
 * **The write freeze, one project or one ancestor deep.**
 *
 * `TaskService`, `ReflectionService` and `SectionService` each carried an identical private
 * `assertProjectActive` that looked at the named project only, so a write to a live
 * sub-project under an archived root succeeded — work coming back into something someone had
 * put away, which is exactly what the freeze exists to stop.
 *
 * A missing project is *not* this function's error to raise: every caller has already resolved
 * visibility, and answering "not found" from a freeze check would give one operation two
 * different not-found paths.
 *
 * Takes the repository rather than a service so it stays callable from inside a write that has
 * only its own grant — a `tasks.write` agent must not need `projects.read` to be told no.
 */
export const assertProjectWritable = async (projects: ProjectRepository, projectId: ProjectId): Promise<void> => {
  const project = await projects.find(projectId);
  if (project === null) return;
  // A marked project cannot reactivate alone (Slice 80, R5), so the remedy names its owner.
  if (project.archivedWithProject !== undefined) {
    const owner = project.archivedWithProject.projectId;
    throw new DomainRuleError(`project "${projectId}" was archived with "${owner}"; restore "${owner}" to bring it back`);
  }
  // The message the three services already produced, kept verbatim: the remedy is the same one.
  if (project.status === 'archived') {
    throw new DomainRuleError(`project "${projectId}" is archived; reactivate it first`);
  }

  const seen = new Set<ProjectId>([projectId]);
  let ancestorId = project.parentProjectId;
  while (ancestorId !== undefined && !seen.has(ancestorId)) {
    const ancestor = await projects.find(ancestorId);
    if (ancestor === null) return;
    if (ancestor.status === 'archived') {
      // Names the ancestor, because the project the caller wrote to is not the one to reactivate.
      throw new DomainRuleError(
        `project "${projectId}" is inside archived project "${ancestorId}"; reactivate that first`,
      );
    }
    seen.add(ancestorId);
    ancestorId = ancestor.parentProjectId;
  }
};

/**
 * The same freeze as `assertProjectWritable`, answered rather than thrown: the **highest**
 * archived project on the chain from `projectId` up — itself included — or `undefined` when
 * nothing blocks a write. a history transition reports it as `history_blocked`, whose details need an id, not a
 * sentence. Highest, because reactivating anything below it still leaves the tree frozen.
 */
export const findHighestWriteBlocker = async (
  projects: ProjectRepository,
  projectId: ProjectId,
): Promise<ProjectId | undefined> => {
  let blocker: ProjectId | undefined;
  const seen = new Set<ProjectId>();
  let current = await projects.find(projectId);
  while (current !== null && !seen.has(current.id)) {
    if (current.status === 'archived') blocker = current.id;
    seen.add(current.id);
    current = current.parentProjectId === undefined ? null : await projects.find(current.parentProjectId);
  }
  return blocker;
};

/**
 * The workspace's projects **as if `rootId` were restored**: the same records, with that project's
 * status read as live and every project marked with it at its recorded status, in memory only
 * (Slice 79, Q7; Slice 80, R8).
 *
 * An archived root's derived reads answer no rows (§31) but say how many a restore would bring
 * back; running the ordinary derivation over this view is how they count them without a second
 * copy of the visibility rule. Nothing is written, and work archived in its own right stays
 * archived here, exactly as a restore would leave it.
 */
export function asRestored(projects: readonly Project[], rootId: ProjectId): Project[] {
  return projects.map((project) => {
    if (project.id === rootId) return { ...project, status: 'active' } as Project;
    return project.archivedWithProject?.projectId === rootId ? reviveFromMarker(project) : project;
  });
}

/** How many projects a restore of `ownerId` brings back with it, or `undefined` for none (R8). */
export const cascadeCountOf = (projects: readonly Project[], ownerId: ProjectId): number | undefined => {
  const count = projects.filter((project) => project.archivedWithProject?.projectId === ownerId).length;
  return count === 0 ? undefined : count;
};
