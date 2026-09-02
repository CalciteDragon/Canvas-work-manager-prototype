import {
  ProjectSectionSchema,
  ReflectionSchema,
  SectionIdSchema,
  TaskSchema,
  containerTypeFor,
  ownedKindOf,
  type CreateSectionInput,
  type OwnedDataKind,
  type ProjectId,
  type ProjectSection,
  type Reflection,
  type RemoveSectionInput,
  type SectionId,
  type Task,
  type UpdateSectionInput,
} from '@cwm/contracts';
import type {
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  TaskRepository,
  UnitOfWork,
} from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';

export interface SectionServiceDependencies {
  sections: SectionRepository;
  projects: ProjectRepository;
  /** Containers own rows, so removing one has to reach the collections it owns. */
  tasks: TaskRepository;
  reflections: ReflectionRepository;
  activity: ActivityService;
  clock: Clock;
  ids: IdGenerator;
  unitOfWork: UnitOfWork;
}

/** A row of an owned kind: everything this service needs to archive or repoint one. */
type OwnedRow = Task | Reflection;

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
    assertPermitted(actor, 'projects.read');
    return this.require(actor, id);
  }

  /** The unchecked lookup the write paths use — see `ProjectService.require`. */
  private async require(actor: ActorContext, id: SectionId): Promise<ProjectSection> {
    const section = await this.dependencies.sections.find(id);
    if (section === null) throw new EntityNotFoundError('section', id);
    // A section in a foreign workspace is "not found": 409 would confirm it exists.
    if (!(await this.isProjectVisible(actor, section.projectId))) throw new EntityNotFoundError('section', id);
    return section;
  }

  async list(actor: ActorContext, projectId: ProjectId): Promise<ProjectSection[]> {
    assertPermitted(actor, 'projects.read');
    await this.assertProjectVisible(actor, projectId);
    return this.ordered(projectId);
  }

  async add(actor: ActorContext, projectId: ProjectId, input: CreateSectionInput): Promise<ProjectSection> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(() => this.addWithin(actor, projectId, input));
  }

  /**
   * `add` without the permission check or a unit of work of its own. `runUnitOfWork` does
   * not re-enter -- a nested call throws `UnitOfWorkInProgressError` -- so
   * `resolveContainer`, which runs inside the caller's transaction, needs a door into the
   * same body. Keeping it here is what makes a default layout the *existing* behaviour
   * reached differently rather than a second code path: positioning, the empty config and
   * `project.section_added` all stay on one path.
   */
  private async addWithin(
    actor: ActorContext,
    projectId: ProjectId,
    input: CreateSectionInput,
  ): Promise<ProjectSection> {
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
  }

  /**
   * The container a row goes to when the caller names none: the project's first container
   * of the matching type, and otherwise a new one added through the same operation the Add
   * Section button calls, at the end of the canvas with an ordinary activity event behind
   * it.
   *
   * Call it from inside an open unit of work -- it writes, and it does not open one.
   *
   * No `projects.write` check: this is a section a *row* write needs on its own behalf, the
   * same reasoning `TaskService.require` uses for the lookups inside its own writes. An
   * agent granted `tasks.write` alone must be able to create a task, and a task nothing
   * renders is the defect this whole change exists to close.
   */
  async resolveContainer(actor: ActorContext, projectId: ProjectId, owned: OwnedDataKind): Promise<ProjectSection> {
    const existing = (await this.ordered(projectId)).find((section) => ownedKindOf(section.type) === owned);
    return existing ?? this.addWithin(actor, projectId, { type: containerTypeFor(owned) });
  }

  /**
   * **The invariant, in one place: a row's section must belong to the row's project, and
   * must be a container of the row's kind.** Both `TaskService` and `ReflectionService`
   * come through here on every create and every move.
   *
   * Unchecked for the same reason `resolveContainer` is -- the caller has already been
   * checked for the write it is actually doing.
   */
  async requireContainer(
    actor: ActorContext,
    projectId: ProjectId,
    sectionId: SectionId,
    owned: OwnedDataKind,
  ): Promise<ProjectSection> {
    const section = await this.require(actor, sectionId);
    if (section.projectId !== projectId) {
      throw new DomainRuleError('a row must live in a section of its own project');
    }
    if (ownedKindOf(section.type) !== owned) {
      throw new DomainRuleError(`section "${sectionId}" does not hold ${owned}`);
    }
    return section;
  }

  async update(actor: ActorContext, id: SectionId, input: UpdateSectionInput): Promise<ProjectSection> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
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
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      const siblings = await this.ordered(current.projectId);
      const without = siblings.filter((section) => section.id !== id);
      // Clamped, not rejected: a caller that asks for "last" by overshooting means last.
      const target = Math.min(Math.max(position, 0), without.length);
      without.splice(target, 0, current);

      await this.renumber(without);
      const moved = await this.require(actor, id);
      if (moved.position === current.position) return current;
      await this.record(actor, moved, 'project.section_moved', 'Moved');
      return moved;
    });
  }

  /** §31's duplicate: the same type and a copy of the config, directly below the original. */
  async duplicate(actor: ActorContext, id: SectionId): Promise<ProjectSection> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
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
      return this.require(actor, copy.id);
    });
  }

  /**
   * A hard delete, and deliberately not idempotent — unlike `TaskService.archive`, there is
   * no state left behind to be idempotent about. Removing an absent section is a caller
   * mistake worth reporting.
   *
   * Removal follows ownership, and only ownership. A **view** touches no data whatever the
   * policy says. A **container** takes its rows with it: empty, it goes without ceremony;
   * holding rows, it needs a policy, and without one this raises with the count so the
   * caller can offer the choice rather than guess on the user's behalf.
   */
  async remove(actor: ActorContext, id: SectionId, input: RemoveSectionInput = {}): Promise<void> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    await this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      const owned = ownedKindOf(current.type);
      if (owned !== undefined) await this.settleRows(actor, current, owned, input);
      await this.dependencies.sections.remove(id);
      await this.renumber((await this.ordered(current.projectId)).filter((section) => section.id !== id));
      await this.record(actor, current, 'project.section_removed', 'Removed');
    });
  }

  /**
   * Cascade or reassign, decided against the rows that are still *live*: an archived row is
   * already unrendered, so it neither forces a policy nor needs archiving twice. Reassign
   * still repoints the archived ones, because unarchiving a row into a section that no
   * longer exists would be the worse outcome.
   */
  private async settleRows(
    actor: ActorContext,
    section: ProjectSection,
    owned: OwnedDataKind,
    input: RemoveSectionInput,
  ): Promise<void> {
    const rows = await this.rowsOf(section.id, owned);
    const live = rows.filter((row) => row.archivedAt === undefined);
    if (live.length === 0) return;

    if (input.policy === undefined) {
      throw new DomainRuleError(
        `section "${section.id}" still holds ${live.length} ${owned}; removing it needs a policy of "cascade" or "reassign"`,
      );
    }

    if (input.policy === 'cascade') {
      const archivedAt = this.dependencies.clock.now().toISOString();
      for (const row of live) await this.writeRow(owned, { ...row, archivedAt });
      return;
    }

    if (input.reassignToSectionId === undefined) {
      throw new DomainRuleError('reassigning rows needs a reassignToSectionId');
    }
    if (input.reassignToSectionId === section.id) {
      throw new DomainRuleError('a section cannot take over its own rows');
    }
    const target = await this.require(actor, input.reassignToSectionId);
    if (target.projectId !== section.projectId) {
      throw new DomainRuleError('rows can only be reassigned within their own project');
    }
    if (target.type !== section.type) {
      throw new DomainRuleError(`rows can only be reassigned to another ${section.type} section`);
    }
    for (const row of rows) await this.writeRow(owned, { ...row, sectionId: target.id });
  }

  private async rowsOf(sectionId: SectionId, owned: OwnedDataKind): Promise<OwnedRow[]> {
    return owned === 'tasks'
      ? this.dependencies.tasks.list({ sectionId, includeArchived: true })
      : this.dependencies.reflections.list({ sectionId, includeArchived: true });
  }

  /**
   * Rows are written through the schema rather than through the owning service: this is one
   * step of a removal the caller has already been permitted for, and routing it back through
   * `TaskService` would make `SectionService` depend on the services that depend on it.
   * `updatedAt` moves, so a live client sees the row change.
   */
  private async writeRow(owned: OwnedDataKind, row: OwnedRow): Promise<void> {
    const updatedAt = this.dependencies.clock.now().toISOString();
    if (owned === 'tasks') await this.dependencies.tasks.update(TaskSchema.parse({ ...row, updatedAt }));
    else await this.dependencies.reflections.update(ReflectionSchema.parse({ ...row, updatedAt }));
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
