import {
  ProjectSectionSchema,
  SectionIdSchema,
  type CreateSectionInput,
  type ProjectId,
  type ProjectSection,
  type SectionId,
  type UpdateSectionInput,
} from '@cwm/contracts';
import type { ProjectRepository, SectionRepository, UnitOfWork } from '@cwm/repositories';
import { assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';

export interface SectionServiceDependencies {
  sections: SectionRepository;
  projects: ProjectRepository;
  activity: ActivityService;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

/** `null` clears and `undefined` leaves alone — §11's `dueAt` example is the pattern. */
const apply = <T extends object>(section: T, key: keyof T, value: unknown): void => {
  if (value === undefined) return;
  if (value === null) delete section[key];
  else section[key] = value as T[keyof T];
};

/**
 * §57's verbs for section work, spelled `entity.verb` against the entity the event
 * actually names — the **project**. See `record` below for why that is not a free choice.
 */
type SectionAction =
  | 'project.section_added'
  | 'project.section_updated'
  | 'project.section_moved'
  | 'project.section_removed';

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

/**
 * §31's frame affordances, as domain operations: add, update (title/size/collapse/config),
 * move, duplicate, remove. Positions are kept dense — §29 gives the canvas an ordered list,
 * not a sparse one, and a gap has no meaning any renderer could use.
 */
export class SectionService {
  constructor(private readonly dependencies: SectionServiceDependencies) {}

  async get(actor: ActorContext, id: SectionId): Promise<ProjectSection> {
    const section = await this.dependencies.sections.find(id);
    if (section === null) throw new EntityNotFoundError('section', id);
    // A section in a foreign workspace is "not found": 409 would confirm it exists.
    if (!(await this.isProjectVisible(actor, section.projectId))) throw new EntityNotFoundError('section', id);
    return section;
  }

  async list(actor: ActorContext, projectId: ProjectId): Promise<ProjectSection[]> {
    await this.assertProjectVisible(actor, projectId);
    return this.ordered(projectId);
  }

  async add(actor: ActorContext, projectId: ProjectId, input: CreateSectionInput): Promise<ProjectSection> {
    assertValidActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      await this.assertProjectVisible(actor, projectId);
      const siblings = await this.ordered(projectId);

      const now = this.dependencies.clock.now().toISOString();
      const section = ProjectSectionSchema.parse({
        id: SectionIdSchema.parse(this.dependencies.ids.next('section')),
        projectId,
        type: input.type,
        title: input.title,
        position: siblings.length,
        // §27's presets. Full width until something asks otherwise — the grid that makes a
        // narrower span visible does not exist until Slice 9.
        columnSpan: input.columnSpan ?? 12,
        collapsed: false,
        // The registry and its `createDefaultConfig` (§29) live in Angular and carry a
        // `Type<unknown>`, so the domain cannot reach them. An unconfigured section gets an
        // empty object rather than a guess at the definition's shape.
        config: input.config ?? {},
        createdAt: now,
        updatedAt: now,
      });

      await this.dependencies.sections.insert(section);
      await this.record(actor, section, 'project.section_added', 'Added');
      return section;
    });
  }

  async update(actor: ActorContext, id: SectionId, input: UpdateSectionInput): Promise<ProjectSection> {
    assertValidActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      const next = { ...current };
      apply(next, 'title', input.title);
      apply(next, 'columnSpan', input.columnSpan);
      apply(next, 'collapsed', input.collapsed);
      // Replaced whole rather than merged: the section definition owns the keys (§29), so
      // nothing here can decide which of them a partial write meant to keep.
      apply(next, 'config', input.config);

      return this.commit(actor, current, next, 'project.section_updated', 'Updated');
    });
  }

  /**
   * Reorders within the project and renumbers every sibling. This is why moving is its own
   * operation rather than a `position` field on `update`: one section's new position is
   * every other section's new position too.
   */
  async move(actor: ActorContext, id: SectionId, position: number): Promise<ProjectSection> {
    assertValidActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      const siblings = await this.ordered(current.projectId);
      const without = siblings.filter((section) => section.id !== id);
      // Clamped, not rejected: a caller that asks for "last" by overshooting means last.
      const target = Math.min(Math.max(position, 0), without.length);
      without.splice(target, 0, current);

      await this.renumber(without);
      const moved = await this.get(actor, id);
      if (moved.position === current.position) return current;
      await this.record(actor, moved, 'project.section_moved', 'Moved');
      return moved;
    });
  }

  /** §31's duplicate: the same type and a copy of the config, directly below the original. */
  async duplicate(actor: ActorContext, id: SectionId): Promise<ProjectSection> {
    assertValidActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      const siblings = await this.ordered(current.projectId);

      const now = this.dependencies.clock.now().toISOString();
      const copy = ProjectSectionSchema.parse({
        ...current,
        id: SectionIdSchema.parse(this.dependencies.ids.next('section')),
        position: current.position + 1,
        // Detached, or editing the copy would silently edit the original.
        config: structuredClone(current.config),
        createdAt: now,
        updatedAt: now,
      });

      await this.dependencies.sections.insert(copy);
      // Indexed by where the original actually sits, not by its `position`. The two agree
      // only while the stored positions are dense, and a hand-edited `data.json` (§14) is
      // free not to be — a project numbered 0, 5, 7 would splice past the end and drop the
      // pair below its siblings.
      const index = siblings.findIndex((section) => section.id === id);
      const reordered = [...siblings.filter((section) => section.id !== id)];
      reordered.splice(index, 0, current, copy);
      await this.renumber(reordered);

      await this.record(actor, copy, 'project.section_added', 'Duplicated');
      return this.get(actor, copy.id);
    });
  }

  /**
   * A hard delete, and deliberately not idempotent — unlike `TaskService.archive`, there is
   * no state left behind to be idempotent about. Removing an absent section is a caller
   * mistake worth reporting.
   */
  async remove(actor: ActorContext, id: SectionId): Promise<void> {
    assertValidActor(actor);

    await this.dependencies.unitOfWork.run(async () => {
      const current = await this.get(actor, id);
      await this.dependencies.sections.remove(id);
      await this.renumber((await this.ordered(current.projectId)).filter((section) => section.id !== id));
      await this.record(actor, current, 'project.section_removed', 'Removed');
    });
  }

  private async commit(
    actor: ActorContext,
    current: ProjectSection,
    next: ProjectSection,
    action: SectionAction,
    verb: string,
  ): Promise<ProjectSection> {
    // A no-op write records nothing, matching `TaskService` and `ProjectService`.
    if (JSON.stringify({ ...next, updatedAt: current.updatedAt }) === JSON.stringify(current)) return current;

    const updated = ProjectSectionSchema.parse({ ...next, updatedAt: this.dependencies.clock.now().toISOString() });
    await this.dependencies.sections.update(updated);
    await this.record(actor, updated, action, verb);
    return updated;
  }

  /**
   * **The event names the project, not the section.** `validateDocumentIntegrity` resolves
   * every activity event's target at the close of every unit of work and again on load, so
   * an event whose `entityType` is `'section'` keeps its section alive forever: removing it
   * would fail that check, rolling back the very unit of work doing the removing, and any
   * earlier event for it would fail every subsequent boot. Naming the project keeps the
   * mutation attributable (§57) without a dangling reference and without deleting history.
   *
   * A consequence worth stating rather than discovering: `ActivityEntityType`'s `'section'`
   * member and the matching branch of `validateDocumentIntegrity` are now unreachable from
   * this service. Both stay — MCP writes and hand-edited fixtures can still produce them,
   * and that branch is the reason this decision exists.
   *
   * See docs/decisions/2026-08-section-activity-targets-the-project.md.
   */
  private async record(
    actor: ActorContext,
    section: ProjectSection,
    action: SectionAction,
    verb: string,
  ): Promise<void> {
    await this.dependencies.activity.record(actor, {
      action,
      entityType: 'project',
      entityId: section.projectId,
      projectId: section.projectId,
      summary: `${verb} the ${section.title ?? section.type} section`,
    });
  }

  /** Writes `0..n-1` over the given order, touching only the sections that actually move. */
  private async renumber(sections: ProjectSection[]): Promise<void> {
    const now = this.dependencies.clock.now().toISOString();
    for (const [position, section] of sections.entries()) {
      if (section.position === position) continue;
      await this.dependencies.sections.update(
        ProjectSectionSchema.parse({ ...section, position, updatedAt: now }),
      );
    }
  }

  private async ordered(projectId: ProjectId): Promise<ProjectSection[]> {
    return (await this.dependencies.sections.list({ projectId })).sort(byPosition);
  }

  private async isProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<boolean> {
    const project = await this.dependencies.projects.find(projectId);
    return project !== null && project.workspaceId === actor.workspaceId;
  }

  private async assertProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<void> {
    if (!(await this.isProjectVisible(actor, projectId))) throw new EntityNotFoundError('project', projectId);
  }
}
