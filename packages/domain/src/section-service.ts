import {
  canonicalPageKindFor,
  pageAcceptsSectionType,
  pageAcceptsSections,
  ProjectSectionSchema,
  SectionIdSchema,
  containerTypeFor,
  nameOf,
  normaliseSectionTitle,
  ownedKindOf,
  type CreateSectionInput,
  type OwnedDataKind,
  type ProjectId,
  type ProjectSection,
  type RemoveSectionInput,
  type SectionId,
  type SectionQuery,
  type SectionRemovalRefusalDetails,
  type SectionRemovalResult,
  type ProjectPage,
  type ProjectPageId,
  type UpdateSectionInput,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
  UnitOfWork,
} from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';
import type { IdGenerator } from './ids';
import { assertProjectWritable } from './project-visibility';
import { rowsOf, writeRow, type OwnedRow } from './owned-rows';
import { listPlacements, renumberPlacements, snapshotPlacement, type PagePlacement } from './page-placements';
import { captureSectionRemoval, NOTHING_SETTLED, rowChangeOf, type SettledRows } from './section-removal-undo';
import type { UndoRecorder } from './undo-recorder';

export interface SectionServiceDependencies {
  sections: SectionRepository;
  /** §27: section writes share one dense order with Home shortcut placements. */
  shortcuts: SectionShortcutRepository;
  projects: ProjectRepository;
  /** §27: a section belongs to a page, so adding one has to resolve or check that page. */
  pages: ProjectPageRepository;
  /** Containers own rows, so removing one has to reach the collections it owns. */
  tasks: TaskRepository;
  reflections: ReflectionRepository;
  activity: ActivityService;
  /**
   * Makes a removal undoable. An interface over one repository that never opens a unit, used
   * the way `activity.record` is — the one new kind of edge Undo adds, and acyclic: the recorder
   * depends on nothing here, and `UndoService` composes no section service.
   */
  undo: UndoRecorder;
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
  // Removal archives, so nothing produces this any more. It stays in the union for the
  // events already written into `data.json` (§14) — history is not rewritten.
  | 'project.section_removed'
  | 'project.section_archived'
  | 'project.section_restored';

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

/**
 * Position, then id. Positions are dense per page (§27) and every read below is scoped to one
 * page, so the id is a tie-break for archived rows — which keep a stale position — rather than
 * for two live siblings.
 */
const byPositionThenId = (a: ProjectSection, b: ProjectSection): number =>
  a.position === b.position ? a.id.localeCompare(b.id) : a.position - b.position;

/**
 * An archived section is off the canvas, and there is no edit to make on one that restoring
 * first would not allow — including a `config` replacement, which would overwrite the very
 * prose archiving a view exists to keep.
 */
const assertLive = (section: ProjectSection): void => {
  if (section.archivedAt !== undefined) {
    throw new DomainRuleError(`section "${section.id}" is archived; restore it before changing it`);
  }
};

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

  /**
   * The unchecked lookup a *row* write needs on its own behalf, for the reason
   * `resolveContainer` and `requireContainer` are unchecked: an agent granted `tasks.write`
   * alone must be able to archive and restore a task, and `get` would demand `projects.read`
   * from inside that write. It deliberately answers archived sections — a row restore has to
   * be able to see that its container has left the canvas.
   */
  async requireWithin(actor: ActorContext, id: SectionId): Promise<ProjectSection> {
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

  /**
   * **One page's canvas**, live-only by default. `{ includeArchived: true }` is the one read
   * that sees archived sections — the root Archive projection — and it returns both states ordered by
   * position then id, deterministic for transport; an archived section keeps a stale position,
   * so the region applies its own timestamp order after selecting.
   */
  async list(
    actor: ActorContext,
    projectId: ProjectId,
    query: Omit<SectionQuery, 'projectId'> = {},
  ): Promise<ProjectSection[]> {
    assertPermitted(actor, 'projects.read');
    await this.assertProjectVisible(actor, projectId);
    // **A canvas is a page** (§27), so this answers one — the page named, or the project's
    // canonical one. A project-wide read would put the Reflections page's container on Home and
    // its archived sections in Home's Archive projection, which is what running the feature
    // actually showed; and it was reachable the moment an optional page could be enabled.
    //
    // Resolved, not merely filtered: a stale or foreign page answers not-found rather than an
    // empty array that reads as "this page is empty" — the rule `TaskService.list` applies to
    // `parentTaskId`. No capability or enabled check: reading a disabled page is exactly what
    // §27 permits, and Todos and Archive simply hold nothing to return.
    const page = await this.resolveCanvasPage(projectId, query.pageId);
    if (query.includeArchived !== true) return this.orderedOnPage(page.id);
    return (await this.dependencies.sections.list({ includeArchived: true, pageId: page.id })).sort(
      byPositionThenId,
    );
  }

  async add(actor: ActorContext, projectId: ProjectId, input: CreateSectionInput): Promise<ProjectSection> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(() => this.addWithin(actor, projectId, input));
  }

  /**
   * `add` without the permission check or a unit of work of its own — the door
   * `resolveContainer` needs, since it runs inside the caller's transaction.
   *
   * (An earlier version of this comment said `runUnitOfWork` "does not re-enter -- a nested
   * call throws `UnitOfWorkInProgressError`". That is true of `DataStore.runUnitOfWork` and
   * **not** of the `UnitOfWork` the services actually hold: `unitOfWorkFor` deliberately
   * *joins* a nested call on the same async stack, because queueing it would deadlock. The
   * door below is justified by the permission check, not by a transaction constraint.) Keeping it here is what makes a default layout the *existing* behaviour
   * reached differently rather than a second code path: positioning, the empty config and
   * `project.section_added` all stay on one path.
   */
  private async addWithin(
    actor: ActorContext,
    projectId: ProjectId,
    input: CreateSectionInput,
  ): Promise<ProjectSection> {
    await this.assertProjectVisible(actor, projectId);
    // Ordered before the page resolution below, so an archived project still refuses with
    // "reactivate it first" rather than with whatever its pages happen to look like.
    await this.assertProjectWritable(projectId);
    const page = await this.resolvePage(projectId, input.pageId, input.type);
    const siblings = await this.placementsOnPage(page.id);
    const position = Math.min(Math.max(input.position ?? siblings.length, 0), siblings.length);

    const now = this.dependencies.clock.now().toISOString();
    const section = ProjectSectionSchema.parse({
      id: SectionIdSchema.parse(this.dependencies.ids.next('section')),
      projectId,
      pageId: page.id,
      type: input.type,
      // Normalised here as well as in `SectionTitleSchema`: this package is a public API,
      // and a caller that did not traverse a write input must not store `"  "` as a name.
      title: normaliseSectionTitle(input.title),
      position,
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
    const ordered = [...siblings];
    ordered.splice(position, 0, { kind: 'section', value: section });
    await renumberPlacements(this.dependencies, this.dependencies.clock, ordered);
    await this.record(actor, section, 'project.section_added', 'Added');
    return section;
  }

  /**
   * **§27's "where a write lands when nobody said", in one place.** The page the caller named,
   * or the project's canonical page when it named none — a root's Home, a sub-project's sole
   * canvas. Returns the record rather than the id, because every caller that named a page also
   * has to know whether it is switched on.
   *
   * A named page must exist, belong to this project, accept sections at all, accept *this kind*
   * of section, and be enabled. The first two are a **not-found**: a page in someone else's
   * project is not a refusal to confirm the id with, which is the rule `require` follows for a
   * foreign section. The other three are rule errors — the caller may see the page, it just may
   * not put that there — and each says which of the three it is, because they are three
   * different repairs.
   *
   * The type check runs on the canonical branch too, where it is inert today: Home and a work
   * canvas take every registered type (§30). Applied uniformly rather than only where it can
   * currently fire, so one function answers "which page, and may this go there" — and a
   * canonical kind that is *not* universal would be caught rather than waved through.
   */
  private async resolvePage(
    projectId: ProjectId,
    pageId: ProjectPageId | undefined,
    type: string,
  ): Promise<ProjectPage> {
    const page = await this.resolveCanvasPage(projectId, pageId);
    this.assertPageTakes(page, type);
    return page;
  }

  /**
   * Which page — the one named, or the project's canonical one — with no question yet of what
   * may go on it. `list` stops here because a read has nothing to place; `resolvePage` continues.
   */
  private async resolveCanvasPage(projectId: ProjectId, pageId: ProjectPageId | undefined): Promise<ProjectPage> {
    if (pageId !== undefined) return this.requirePageOf(projectId, pageId);

    const project = await this.dependencies.projects.find(projectId);
    if (project === null) throw new EntityNotFoundError('project', projectId);
    const canonical = (await this.dependencies.pages.list({ projectId, kind: canonicalPageKindFor(project.kind) }))[0];
    // Unreachable while every project is created with its page in the same unit of work,
    // and cheaper to state than to let a caller discover as a schema failure.
    if (canonical === undefined) throw new DomainRuleError(`project "${projectId}" has no canvas`);
    return canonical;
  }

  /** The page lookup that only answers for *this* project. See `resolvePage` for the not-found. */
  private async requirePageOf(projectId: ProjectId, pageId: ProjectPageId): Promise<ProjectPage> {
    const page = await this.dependencies.pages.find(pageId);
    if (page === null || page.projectId !== projectId) throw new EntityNotFoundError('projectPage', pageId);
    return page;
  }

  /**
   * §30's capability, plus §27's *"a write never lands on a disabled page. Silent placement
   * somewhere invisible is worse than a refusal."*
   *
   * The disabled rule is about **placement**, not about the caller's choice of identifier and
   * not about reading: §27 also says a source on a disabled page is still a valid source, so a
   * section already there keeps being read, edited, reordered, removed and restored. What is
   * refused is putting something new there.
   */
  private assertPageTakes(page: ProjectPage, type: string): void {
    if (!pageAcceptsSections(page.kind)) throw new DomainRuleError(`a ${page.kind} page does not hold sections`);
    if (!pageAcceptsSectionType(page.kind, type)) {
      throw new DomainRuleError(`a ${page.kind} page does not hold ${type} sections`);
    }
    if (!page.enabled) throw new DomainRuleError(`page "${page.id}" is disabled; enable it before adding to it`);
  }

  /**
   * The disabled-page refusal for a destination named by its *section* rather than by its page.
   *
   * Public, because the two subtask paths in `TaskService` are placements that name neither a
   * page nor a section — they inherit the parent's — so they cannot reach the rule through
   * `requireContainer` and have to ask for it. Unchecked, like every other door a row write
   * uses on its own behalf.
   */
  async assertWritablePage(section: ProjectSection): Promise<void> {
    const page = await this.dependencies.pages.find(section.pageId);
    if (page !== null && !page.enabled) {
      throw new DomainRuleError(`page "${page.id}" is disabled; enable it before adding to it`);
    }
  }

  /**
   * The container a row goes to when the caller names none: the first container of the matching
   * type **on the resolved page**, and otherwise a new one added there through the same
   * operation the Add Section button calls, at the end of that page with an ordinary activity
   * event behind it.
   *
   * The page is resolved **once** and passed into `addWithin`. Searching one page and creating
   * on another would be two independent answers to the question this slice exists to make
   * unambiguous — they agree only while a project has a single section-bearing page.
   *
   * Call it from inside an open unit of work -- it writes, and it does not open one.
   *
   * No `projects.write` check: this is a section a *row* write needs on its own behalf, the
   * same reasoning `TaskService.require` uses for the lookups inside its own writes. An
   * agent granted `tasks.write` alone must be able to create a task, and a task nothing
   * renders is the defect this whole change exists to close.
   */
  async resolveContainer(
    actor: ActorContext,
    projectId: ProjectId,
    owned: OwnedDataKind,
    pageId?: ProjectPageId,
  ): Promise<ProjectSection> {
    const type = containerTypeFor(owned);
    const page = await this.resolvePage(projectId, pageId, type);
    // `orderedOnPage` is live-only, so an archived container is skipped and a new one is added
    // rather than revived: a removed section comes back through restore, never through a
    // row write that happened to need somewhere to go.
    const existing = (await this.orderedOnPage(page.id)).find((section) => ownedKindOf(section.type) === owned);
    return existing ?? this.addWithin(actor, projectId, { type, pageId: page.id });
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
    // An archived container is off the canvas; a row created or moved into one would be
    // live inside it, which document integrity rejects. Refuse here, as a rule error.
    assertLive(section);
    // §27's disabled-page rule reaches a destination named by its section too — otherwise the
    // refusal would depend on which identifier the caller happened to use for the same place.
    await this.assertWritablePage(section);
    return section;
  }

  async update(actor: ActorContext, id: SectionId, input: UpdateSectionInput): Promise<ProjectSection> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      assertLive(current);
      await this.assertProjectWritable(current.projectId);
      const next = { ...current };
      // A blank name means the same thing `null` does — fall back to the derived default —
      // so the two do not have to be told apart by every caller upstream.
      apply(next, 'title', input.title === undefined ? undefined : (normaliseSectionTitle(input.title) ?? null));
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
      assertLive(current);
      await this.assertProjectWritable(current.projectId);
      // Within the section's **page**: reordering one page must not renumber another (§27).
      const siblings = await this.placementsOnPage(current.pageId);
      const without = siblings.filter((placement) => !(placement.kind === 'section' && placement.value.id === id));
      // Clamped, not rejected: a caller that asks for "last" by overshooting means last.
      const target = Math.min(Math.max(position, 0), without.length);
      without.splice(target, 0, { kind: 'section', value: current });

      await renumberPlacements(this.dependencies, this.dependencies.clock, without, { kind: 'section', id });
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
      assertLive(current);
      await this.assertProjectWritable(current.projectId);
      // Duplicating creates a section, so it is placement: refused on a disabled page like
      // every other create, even though the original is already sitting there.
      await this.assertWritablePage(current);
      const siblings = await this.placementsOnPage(current.pageId);

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
      const index = siblings.findIndex((placement) => placement.kind === 'section' && placement.value.id === id);
      const reordered: PagePlacement[] = siblings.filter(
        (placement) => !(placement.kind === 'section' && placement.value.id === id),
      );
      reordered.splice(index, 0, { kind: 'section', value: current }, { kind: 'section', value: copy });
      await renumberPlacements(this.dependencies, this.dependencies.clock, reordered);

      await this.record(actor, copy, 'project.section_added', 'Duplicated');
      return this.require(actor, copy.id);
    });
  }

  /**
   * §31's remove: **it archives, on every branch, and nothing is deleted.** A view archives
   * with its `config` — a Notes section's prose lives nowhere else — and so does an empty
   * container, and so does one holding only already-archived rows, which is the case the
   * old hard delete left dangling with no policy able to reach it.
   *
   * A container holding **live** rows still needs a policy, because the question is what
   * should happen to the *rows*: `cascade` archives them with the section and stamps each
   * with `archivedWithSectionId`; `reassign` moves them to another live container of the
   * same type and archives the emptied section, marking nothing — the rows left under their
   * own policy, so they are not "archived with" anything.
   *
   * Every branch keeps a tombstone; whether Archive *lists* it is a projection question
   * (`sectionRecoveryOf`), so a removed disposable view is retained but not shown.
   *
   * Deliberately **not** idempotent: an already-archived section is refused rather than
   * archived twice. Removing something already removed is not a second archive, and a silent
   * success would write a second activity event. Permanent deletion is the operation that
   * case really wants, and it is deferred
   * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md).
   *
   * Allowed inside an archived project, unlike every other section write: the freeze stops
   * work coming *back* into a project someone has put away, not someone tidying one. It still
   * returns a receipt, which Undo answers `undo_blocked` until the project is reactivated.
   *
   * **Every successful removal returns one Undo receipt**, recorded in this unit beside the
   * canonical writes: the pre-removal section, its placement between neighbours, and exactly the
   * rows `settleRows` wrote. A refusal records nothing. The receipt is real only once the unit
   * commits, which is when `unitOfWork.run` resolves **for a top-level call** — `unitOfWorkFor`
   * joins a nested call, so a composer that nests this inside its own unit must not hand the
   * receipt on before that unit commits (nothing nests it today).
   */
  async remove(actor: ActorContext, id: SectionId, input: RemoveSectionInput = {}): Promise<SectionRemovalResult> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      if (current.archivedAt !== undefined) {
        throw new DomainRuleError(`section "${id}" is already archived`);
      }
      const owned = ownedKindOf(current.type);
      const archivedAt = this.dependencies.clock.now().toISOString();
      // `settleRows` runs its refusals first and writes rows only, never a placement.
      const settled =
        owned === undefined ? NOTHING_SETTLED : await this.settleRows(actor, current, owned, input, archivedAt);
      // Before the section archives or the page renumbers: the placement Undo returns to is the one
      // the canvas showed.
      const placement = snapshotPlacement(await this.placementsOnPage(current.pageId), { kind: 'section', id });

      const archived = ProjectSectionSchema.parse({
        ...current,
        archivedAt,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      await this.dependencies.sections.update(archived);
      // Archived first, then renumber: `orderedOnPage` is live-only, so the surviving siblings
      // close to the same dense sequence deleting produced. The archived section keeps its
      // now-stale position — uniqueness is a property of the live page, and
      // `restoreSection` overwrites the value when it appends.
      await renumberPlacements(
        this.dependencies,
        this.dependencies.clock,
        await this.placementsOnPage(current.pageId),
      );
      await this.record(actor, archived, 'project.section_archived', 'Archived');
      const undo = await this.dependencies.undo.record(actor, {
        projectId: current.projectId,
        label: `Removed the ${nameOf(current)} section`,
        operation: captureSectionRemoval({ section: current, placement, settled, postSectionArchivedAt: archivedAt }),
      });
      return { section: archived, undo };
    });
  }

  /**
   * **Archive Restore** for `remove`, and the **only** way an archived section — or a row that
   * came down with one — comes back. Under `projects.write`, like every other section write.
   * It is not receipt-based Undo (`UndoService`): it needs no receipt and never expires, but it
   * reverses the archive rather than the removal's placement, and it consumes no Undo record.
   *
   * It restores exactly what the removal took: the section, and the rows whose
   * `archivedWithSectionId` names it. A row archived on its own beforehand carries no marker
   * and stays archived, which is what makes this an exact restore rather than a bulk
   * unarchive.
   *
   * The section returns at the **end** of the canvas, where `addWithin` puts a new one: its
   * old index needs positions the canvas has since reused.
   *
   * Refused while the project is archived — the freeze the write policy states, protecting
   * HTTP, MCP and stale clients. It is escapable rather than a trap: `ProjectService.update`
   * still accepts a status change away from `archived`.
   */
  async restoreSection(actor: ActorContext, id: SectionId): Promise<ProjectSection> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      // Idempotent, so the public restore route cannot turn a retry into a canvas move: no
      // reposition, no timestamps, no row writes, no activity.
      if (current.archivedAt === undefined) return current;
      await this.assertProjectWritable(current.projectId);

      // Back onto its own page, at that page's end. Recovery, so no disabled-page refusal: the
      // section is returning to where it already lived (§31 — recovery is never behind a toggle).
      const live = await this.placementsOnPage(current.pageId);
      const restored = ProjectSectionSchema.parse({
        ...current,
        archivedAt: undefined,
        position: live.length,
        updatedAt: this.dependencies.clock.now().toISOString(),
      });
      delete (restored as { archivedAt?: string }).archivedAt;
      await this.dependencies.sections.update(restored);

      const owned = ownedKindOf(current.type);
      if (owned !== undefined) {
        for (const row of await rowsOf(this.dependencies, current.id, owned)) {
          if (row.archivedWithSectionId !== current.id) continue;
          const next = { ...row };
          delete next.archivedAt;
          delete next.archivedWithSectionId;
          await this.writeRow(owned, next);
        }
      }

      await this.record(actor, restored, 'project.section_restored', 'Restored');
      return restored;
    });
  }

  /**
   * Cascade or reassign, decided against the rows that are still *live*: an archived row is
   * already unrendered, so it neither forces a policy nor needs archiving twice. Reassign
   * still repoints the archived ones — they keep a live container to come back to, and
   * their `archivedWithTaskId` groups move whole, because a subtask shares its parent's
   * section.
   *
   * No live rows means no question to ask, so the section archives with no policy. That is
   * the second dangle the hard delete produced and no policy ever reached: a container
   * holding only archived rows was deleted out from under them.
   *
   * Returns what it **applied**, for the Undo record: `none` when nothing was live whatever the
   * caller sent — a `reassign` with no target succeeds here — and every row it wrote.
   */
  private async settleRows(
    actor: ActorContext,
    section: ProjectSection,
    owned: OwnedDataKind,
    input: RemoveSectionInput,
    archivedAt: string,
  ): Promise<SettledRows> {
    const rows = await rowsOf(this.dependencies, section.id, owned);
    const live = rows.filter((row) => row.archivedAt === undefined);
    if (live.length === 0) return NOTHING_SETTLED;

    if (input.policy === undefined) {
      // The sentence stays for MCP and `curl` callers, who have no UI to compose one. The
      // details are what let a UI ask its own question — see `SectionRemovalRefusalDetails`.
      throw new DomainRuleError(
        `section "${section.id}" still holds ${live.length} ${owned}; removing it needs a policy of "cascade" or "reassign"`,
        { reason: 'section_not_empty', liveRowCount: live.length } satisfies SectionRemovalRefusalDetails,
      );
    }

    if (input.policy === 'cascade') {
      // The marker is what makes the cascade reversible: `restoreSection` brings back
      // exactly the rows naming this section, and nothing else it happened to hold.
      const changes = [];
      for (const row of live) {
        const next = { ...row, archivedAt, archivedWithSectionId: section.id };
        changes.push(rowChangeOf(owned, row, next));
        await this.writeRow(owned, next);
      }
      return { appliedPolicy: 'cascade', rows: changes };
    }

    if (input.reassignToSectionId === undefined) {
      throw new DomainRuleError('reassigning rows needs a reassignToSectionId');
    }
    if (input.reassignToSectionId === section.id) {
      throw new DomainRuleError('a section cannot take over its own rows');
    }
    const target = await this.require(actor, input.reassignToSectionId);
    // `require` is the unchecked lookup, so it finds archived sections deliberately —
    // without this, reassign would move live rows into a container that has left the canvas.
    assertLive(target);
    if (target.projectId !== section.projectId) {
      throw new DomainRuleError('rows can only be reassigned within their own project');
    }
    if (target.type !== section.type) {
      throw new DomainRuleError(`rows can only be reassigned to another ${section.type} section`);
    }
    // Deliberately **no** page-equality rule: §31 says "another container of the same type" and
    // states no page constraint, and both containers render what they hold — see
    // docs/decisions/2026-09-reassign-may-cross-pages.md. The destination still has to be
    // somewhere a write may land, which is the one page rule that applies.
    await this.assertWritablePage(target);
    const changes = [];
    for (const row of rows) {
      const next = { ...row, sectionId: target.id };
      changes.push(rowChangeOf(owned, row, next));
      await this.writeRow(owned, next);
    }
    return { appliedPolicy: 'reassign', reassignToSectionId: target.id, rows: changes };
  }

  /** See `owned-rows.ts` for why rows are written through the schema, not their service. */
  private async writeRow(owned: OwnedDataKind, row: OwnedRow): Promise<void> {
    await writeRow(this.dependencies, this.dependencies.clock, owned, row);
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
      // `nameOf`, so the hand-read log line in `data.json` (§14) says what the canvas says.
      // Frozen at write time: renaming a section later does not rewrite its history.
      summary: `${verb} the ${nameOf(section)} section`,
    });
  }

  /**
   * **One page's live canvas** — the read every path that places or renumbers uses.
   *
   * The `pageId` is required rather than optional on purpose. Positions are dense per page and
   * nothing validates that at load, so a call that forgot the argument would renumber across
   * pages and corrupt an ordering with nothing to catch it.
   */
  private async orderedOnPage(pageId: ProjectPageId): Promise<ProjectSection[]> {
    return (await this.dependencies.sections.list({ pageId })).sort(byPosition);
  }

  private async placementsOnPage(pageId: ProjectPageId): Promise<PagePlacement[]> {
    return listPlacements(this.dependencies, pageId);
  }

  private async isProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<boolean> {
    const project = await this.dependencies.projects.find(projectId);
    return project !== null && project.workspaceId === actor.workspaceId;
  }

  private async assertProjectVisible(actor: ActorContext, projectId: ProjectId): Promise<void> {
    if (!(await this.isProjectVisible(actor, projectId))) throw new EntityNotFoundError('project', projectId);
  }

  /**
   * A project archives by `status`, not by workspace, so `assertProjectVisible` cannot see
   * it. Work does not come *back* into a project someone has put away: adding, editing,
   * moving, duplicating and restoring are refused. Removing is not — see `remove`.
   *
   * **Or into one whose ancestor is archived.** Archiving does not cascade (§31), so a live
   * sub-project can sit under an archived root, and a freeze that looked only at the named
   * project would let work in through the side door. `project-visibility.ts` states that walk
   * once, for the three services that each carried a copy of the shallow version.
   */
  private async assertProjectWritable(projectId: ProjectId): Promise<void> {
    await assertProjectWritable(this.dependencies.projects, projectId);
  }
}
