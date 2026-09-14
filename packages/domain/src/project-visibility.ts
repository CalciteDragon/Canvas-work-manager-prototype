import type { Project, ProjectId } from '@cwm/contracts';
import type { ProjectRepository } from '@cwm/repositories';
import { DomainRuleError } from './errors';

/**
 * **Archiving reaches down, even though it does not cascade.**
 *
 * §31: *"A project whose own status is `archived` hides its live contents from ordinary reads
 * too."* Archiving a project does not archive anything beneath it — that would archive work the
 * caller never named — so a live sub-project can end up underneath an archived ancestor, and
 * every ordinary read has to agree about what that means. Before this module four read models
 * each had their own answer and three of them had none.
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
   * for, and it is what an archived project's own page renders. Widening `isHidden` to cover it
   * would blank the Sub-Projects section of the very project someone is looking at.
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
 * nothing blocks a write. Undo reports it as `undo_blocked`, whose details need an id, not a
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
